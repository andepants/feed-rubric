import { enabledCategoryIds, loadSettings } from "./categories.js";
import { isRecord } from "./guard.js";
import { classifyPost, type PostState } from "./jev.js";
import { LAST_ERROR_KEY, type LastError } from "./last-error.js";
import { evaluateScores, failOpen, parseScoreMap } from "./score.js";
import type {
  ClassifyRequest,
  ClassifyResponse,
  ClassifyResult,
  CacheClearedResponse,
} from "./types.js";
import { isClassifyRequest, isClearCacheRequest } from "./types.js";

const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60_000;
const CACHE_PREFIX = "feed-rubric:cache:";

const memoryCache = new Map<string, ClassifyResult>();
const callTimestamps: number[] = [];

function cacheKey(platform: string, postId: string): string {
  return `${platform}:${postId}`;
}

function isRateLimited(): boolean {
  const now = Date.now();
  while (callTimestamps.length > 0 && callTimestamps[0]! < now - RATE_WINDOW_MS) {
    callTimestamps.shift();
  }
  return callTimestamps.length >= RATE_LIMIT;
}

function recordCall(): void {
  callTimestamps.push(Date.now());
}

async function recordError(message: string): Promise<void> {
  const lastError: LastError = { message, at: Date.now() };
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

async function getCached(platform: string, postId: string): Promise<ClassifyResult | null> {
  const key = cacheKey(platform, postId);
  const mem = memoryCache.get(key);
  if (mem) return mem;
  const session = await readSessionCache(key);
  if (session) {
    memoryCache.set(key, session);
    return session;
  }
  return null;
}

async function setCached(
  platform: string,
  postId: string,
  result: ClassifyResult,
): Promise<void> {
  const key = cacheKey(platform, postId);
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

async function classifyWithFixture(
  fixtureScores: Record<string, number>,
  threshold: number,
  enabledIds: ReadonlySet<string>,
): Promise<ClassifyResult> {
  return evaluateScores({ scores: fixtureScores, enabledIds, threshold });
}

async function handleClassify(req: ClassifyRequest): Promise<ClassifyResult> {
  const settings = await loadSettings();
  const enabled = settings.categories.filter((c) => c.enabled);
  const enabledIds = enabledCategoryIds(settings.categories);

  const cached = await getCached(req.platform, req.postId);
  if (cached) {
    return { ...cached, cached: true };
  }

  const fixtureScores = parseScoreMap(req.fixtureScores);
  if (fixtureScores) {
    const result = await classifyWithFixture(
      fixtureScores,
      settings.threshold,
      enabledIds,
    );
    await setCached(req.platform, req.postId, result);
    return result;
  }

  if (!settings.apiKey) {
    await recordError("no_api_key");
    return failOpen("no_api_key");
  }

  if (isRateLimited()) {
    await recordError("rate_limited");
    return { ...failOpen("rate_limited"), rateLimited: true };
  }

  const state: PostState = { author: req.author, text: req.text };

  try {
    recordCall();
    const response = await classifyPost(settings.apiKey, state, enabled);
    const scores: Record<string, number> = {};
    for (const [id, answer] of Object.entries(response.answers)) {
      scores[id] = answer.noul;
    }
    const result = evaluateScores({ scores, enabledIds, threshold: settings.threshold });
    await setCached(req.platform, req.postId, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.warn("[feed-rubric] classify failed:", err);
    await recordError(message);
    return failOpen(message);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isClearCacheRequest(message)) {
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

  handleClassify(message)
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
        result: failOpen(err instanceof Error ? err.message : "unknown_error"),
      } satisfies ClassifyResponse);
    });

  return true;
});
