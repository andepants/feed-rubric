import { loadSettings } from "./categories.js";
import {
  classifyPost,
  isConfidentYes,
  type PostState,
} from "./jev.js";
import type {
  ClassifyRequest,
  ClassifyResponse,
  ClassifyResult,
} from "./types.js";

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

async function readSessionCache(key: string): Promise<ClassifyResult | null> {
  const stored = await chrome.storage.session.get(CACHE_PREFIX + key);
  const entry = stored[CACHE_PREFIX + key] as ClassifyResult | undefined;
  return entry ?? null;
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

function evaluateScores(
  scores: Record<string, number>,
  enabledIds: Set<string>,
  threshold: number,
): ClassifyResult {
  const reasons: string[] = [];
  let hide = false;

  for (const [id, noul] of Object.entries(scores)) {
    if (!enabledIds.has(id)) continue;
    if (noul >= threshold && isConfidentYes(noul)) {
      hide = true;
      reasons.push(id);
    }
  }

  return { hide, reasons, scores };
}

function failOpen(error?: string): ClassifyResult {
  return { hide: false, reasons: [], scores: {}, error };
}

async function classifyWithFixture(
  fixtureScores: Record<string, number>,
  threshold: number,
  enabledIds: Set<string>,
): Promise<ClassifyResult> {
  return evaluateScores(fixtureScores, enabledIds, threshold);
}

async function handleClassify(req: ClassifyRequest): Promise<ClassifyResult> {
  const settings = await loadSettings();
  const enabled = settings.categories.filter((c) => c.enabled);
  const enabledIds = new Set(enabled.map((c) => c.id));

  const cached = await getCached(req.platform, req.postId);
  if (cached) {
    return { ...cached, cached: true };
  }

  if (req.fixtureScores && Object.keys(req.fixtureScores).length > 0) {
    const result = await classifyWithFixture(
      req.fixtureScores,
      settings.threshold,
      enabledIds,
    );
    await setCached(req.platform, req.postId, result);
    return result;
  }

  if (!settings.apiKey) {
    return failOpen("no_api_key");
  }

  if (isRateLimited()) {
    return { ...failOpen("rate_limited"), rateLimited: true };
  }

  const state: PostState = { author: req.author, text: req.text };

  try {
    recordCall();
    const response = await classifyPost(settings.apiKey, state, enabled);
    const scores: Record<string, number> = {};
    for (const [id, answer] of Object.entries(response.answers)) {
      if (answer?.type === "noul") {
        scores[id] = answer.noul;
      }
    }
    const result = evaluateScores(scores, enabledIds, settings.threshold);
    await setCached(req.platform, req.postId, result);
    return result;
  } catch (err) {
    console.warn("[feed-rubric] classify failed:", err);
    return failOpen(err instanceof Error ? err.message : "unknown_error");
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "classify") return false;

  handleClassify(message as ClassifyRequest)
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
