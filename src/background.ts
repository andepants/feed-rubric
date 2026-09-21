import { enabledCategoryIds, loadSettings } from "./categories.js";
import { cacheKey, settingsFingerprint } from "./cache-key.js";
import { planClassify } from "./classify-plan.js";
import { isRecord } from "./guard.js";
import { classifyPost, type PostState } from "./jev.js";
import { LAST_ERROR_KEY, type LastError } from "./last-error.js";
import {
  clampText,
  isValidPostId,
  MAX_AUTHOR_LENGTH,
  MAX_POST_TEXT_LENGTH,
  sanitizeErrorMessage,
} from "./limits.js";
import {
  isExtensionPageSender,
  isFixtureSender,
  isTrustedClassifySender,
} from "./messaging.js";
import { isRateLimited, RATE_LIMIT, RATE_WINDOW_MS, pruneTimestamps } from "./rate-limit.js";
import { evaluateScores, failOpen, parseScoreMap } from "./score.js";
import type {
  ClassifyRequest,
  ClassifyResponse,
  ClassifyResult,
  CacheClearedResponse,
} from "./types.js";
import { isClassifyRequest, isClearCacheRequest } from "./types.js";

const CACHE_PREFIX = "feed-rubric:cache:";

const memoryCache = new Map<string, ClassifyResult>();
let callTimestamps: number[] = [];

async function recordError(message: string): Promise<void> {
  const lastError: LastError = {
    message: sanitizeErrorMessage(message),
    at: Date.now(),
  };
  await chrome.storage.local.set({ [LAST_ERROR_KEY]: lastError });
}

async function readSessionCache(key: string): Promise<ClassifyResult | null> {
  const stored = await chrome.storage.session.get(CACHE_PREFIX + key);
  const entry = stored[CACHE_PREFIX + key];
  if (!isRecord(entry)) return null;
  if (typeof entry.hide !== "boolean") return null;
  if (!Array.isArray(entry.reasons)) return null;
  const scores = parseScoreMap(entry.scores);
  return {
    hide: entry.hide,
    reasons: entry.reasons.filter((r): r is string => typeof r === "string"),
    scores: scores ?? {},
    cached: true,
  };
}

async function writeSessionCache(key: string, result: ClassifyResult): Promise<void> {
  await chrome.storage.session.set({ [CACHE_PREFIX + key]: result });
}

async function getCached(key: string): Promise<ClassifyResult | null> {
  const mem = memoryCache.get(key);
  if (mem) return mem;
  const session = await readSessionCache(key);
  if (session) {
    memoryCache.set(key, session);
    return session;
  }
  return null;
}

async function setCached(key: string, result: ClassifyResult): Promise<void> {
  memoryCache.set(key, result);
  await writeSessionCache(key, result);
}

async function clearCache(): Promise<number> {
  const memory = memoryCache.size;
  memoryCache.clear();
  const all: Record<string, unknown> = await chrome.storage.session.get(null);
  const keys = Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX));
  if (keys.length > 0) {
    await chrome.storage.session.remove(keys);
  }
  return memory + keys.length;
}

function takeRateLimitSlot(now: number): boolean {
  callTimestamps = pruneTimestamps({
    timestamps: callTimestamps,
    now,
    windowMs: RATE_WINDOW_MS,
  });
  if (
    isRateLimited({
      timestamps: callTimestamps,
      now,
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
  ) {
    return false;
  }
  callTimestamps.push(now);
  return true;
}

function withDebug(result: ClassifyResult, debug: boolean): ClassifyResult {
  return { ...result, debug };
}

async function handleClassify(req: ClassifyRequest): Promise<ClassifyResult> {
  const settings = await loadSettings();
  const enabled = settings.categories.filter((c) => c.enabled);
  const enabledIds = enabledCategoryIds(settings.categories);
  const fingerprint = settingsFingerprint({
    threshold: settings.threshold,
    categories: settings.categories,
  });
  const key = cacheKey({
    platform: req.platform,
    postId: req.postId,
    fingerprint,
  });

  const cached = await getCached(key);
  const plan = planClassify({
    cached,
    fixtureScores: parseScoreMap(req.fixtureScores),
    allowFixture: req.allowFixture === true,
    allowApi: req.allowApi !== false,
    hasApiKey: settings.apiKey.length > 0,
    rateLimited: isRateLimited({
      timestamps: callTimestamps,
      now: Date.now(),
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    }),
    validPost: isValidPostId(req.postId),
  });

  switch (plan.kind) {
    case "cache":
      return withDebug({ ...plan.result, cached: true }, settings.debug);
    case "fixture": {
      const result = evaluateScores({
        scores: plan.scores,
        enabledIds,
        threshold: settings.threshold,
      });
      await setCached(key, result);
      return withDebug(result, settings.debug);
    }
    case "fail_open": {
      await recordError(plan.error);
      if (plan.error === "rate_limited") {
        return withDebug({ ...failOpen(plan.error), rateLimited: true }, settings.debug);
      }
      return withDebug(failOpen(plan.error), settings.debug);
    }
    case "api": {
      const state: PostState = {
        author: clampText(req.author, MAX_AUTHOR_LENGTH),
        text: clampText(req.text, MAX_POST_TEXT_LENGTH),
      };
      try {
        if (!takeRateLimitSlot(Date.now())) {
          await recordError("rate_limited");
          return withDebug({ ...failOpen("rate_limited"), rateLimited: true }, settings.debug);
        }
        const response = await classifyPost(settings.apiKey, state, enabled);
        const scores: Record<string, number> = {};
        for (const [id, answer] of Object.entries(response.answers)) {
          scores[id] = answer.noul;
        }
        const result = evaluateScores({
          scores,
          enabledIds,
          threshold: settings.threshold,
        });
        await setCached(key, result);
        return withDebug(result, settings.debug);
      } catch (err) {
        const message = sanitizeErrorMessage(
          err instanceof Error ? err.message : "unknown_error",
        );
        console.warn("[feed-rubric] classify failed:", message);
        await recordError(message);
        return withDebug(failOpen(message), settings.debug);
      }
    }
    default: {
      const _exhaustive: never = plan;
      return withDebug(failOpen(`unhandled_plan:${String(_exhaustive)}`), settings.debug);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const extensionId = chrome.runtime.id;

  if (isClearCacheRequest(message)) {
    if (!isExtensionPageSender(sender, extensionId)) {
      const response: CacheClearedResponse = { type: "cacheCleared", cleared: 0 };
      sendResponse(response);
      return false;
    }
    void clearCache()
      .then((cleared) => {
        const response: CacheClearedResponse = { type: "cacheCleared", cleared };
        sendResponse(response);
      })
      .catch(() => {
        const response: CacheClearedResponse = { type: "cacheCleared", cleared: 0 };
        sendResponse(response);
      });
    return true;
  }

  if (!isClassifyRequest(message)) return false;

  const trusted = isTrustedClassifySender(sender, extensionId);
  const fixtureSender = isFixtureSender(sender);
  const request: ClassifyRequest = {
    ...message,
    author: clampText(message.author, MAX_AUTHOR_LENGTH),
    text: clampText(message.text, MAX_POST_TEXT_LENGTH),
    fixtureScores: fixtureSender ? message.fixtureScores : undefined,
    allowFixture: fixtureSender,
    allowApi: trusted && !fixtureSender,
  };

  if (!trusted) {
    sendResponse({
      type: "classifyResult",
      postId: message.postId,
      result: failOpen("untrusted_sender"),
    } satisfies ClassifyResponse);
    return false;
  }

  handleClassify(request)
    .then((result) => {
      const response: ClassifyResponse = {
        type: "classifyResult",
        postId: message.postId,
        result,
      };
      sendResponse(response);
    })
    .catch((err) => {
      sendResponse({
        type: "classifyResult",
        postId: message.postId,
        result: failOpen(
          sanitizeErrorMessage(err instanceof Error ? err.message : "unknown_error"),
        ),
      } satisfies ClassifyResponse);
    });

  return true;
});
