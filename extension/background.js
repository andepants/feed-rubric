// src/categories.ts
var DEFAULT_THRESHOLD = 0.75;
var DEFAULT_CATEGORIES = [
  {
    id: "rage_bait",
    name: "Rage bait",
    enabled: true,
    instructions: "The post is written to provoke outrage, dunking, or quote-tweet pile-ons more than to inform. Sarcasm that is still a real argument is false."
  },
  {
    id: "crypto_promo",
    name: "Crypto promo",
    enabled: true,
    instructions: "The post promotes a token, exchange, wallet, or 'next 100x' scheme. News reporting about crypto policy is false."
  },
  {
    id: "unsolicited_politics",
    name: "Unsolicited politics",
    enabled: true,
    instructions: "The post is a partisan political argument or campaign message. Neutral news headlines are false."
  }
];
async function loadSettings() {
  const stored = await chrome.storage.local.get([
    "apiKey",
    "threshold",
    "categories",
    "debug"
  ]);
  return {
    apiKey: typeof stored.apiKey === "string" ? stored.apiKey : "",
    threshold: typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD,
    categories: Array.isArray(stored.categories) ? stored.categories : DEFAULT_CATEGORIES,
    debug: stored.debug === true
  };
}

// src/jev.ts
var JEV_MODEL = "jev-1.13.0";
var SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
var AMBIGUITY_MARGIN = 0.15;
function buildQuestions(categories) {
  const questions = {};
  for (const cat of categories) {
    if (!cat.enabled) continue;
    questions[cat.id] = {
      type: "noul",
      instructions: cat.instructions,
      criteria: {
        true: "The condition described in the instructions applies to this post.",
        false: "The condition does not apply."
      }
    };
  }
  return questions;
}
async function classifyPost(apiKey, state, categories) {
  const questions = buildQuestions(categories);
  if (Object.keys(questions).length === 0) {
    return { model: JEV_MODEL, answers: {} };
  }
  const res = await fetch(SYSTEMONE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ state, model: JEV_MODEL, questions })
  });
  if (!res.ok) {
    throw new Error(`Jev API ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}
function isConfidentYes(noul) {
  return Math.abs(noul - 0.5) > AMBIGUITY_MARGIN;
}

// src/background.ts
var RATE_LIMIT = 40;
var RATE_WINDOW_MS = 6e4;
var CACHE_PREFIX = "feed-rubric:cache:";
var memoryCache = /* @__PURE__ */ new Map();
var callTimestamps = [];
function cacheKey(platform, postId) {
  return `${platform}:${postId}`;
}
function isRateLimited() {
  const now = Date.now();
  while (callTimestamps.length > 0 && callTimestamps[0] < now - RATE_WINDOW_MS) {
    callTimestamps.shift();
  }
  return callTimestamps.length >= RATE_LIMIT;
}
function recordCall() {
  callTimestamps.push(Date.now());
}
async function readSessionCache(key) {
  const stored = await chrome.storage.session.get(CACHE_PREFIX + key);
  const entry = stored[CACHE_PREFIX + key];
  return entry ?? null;
}
async function writeSessionCache(key, result) {
  await chrome.storage.session.set({ [CACHE_PREFIX + key]: result });
}
async function getCached(platform, postId) {
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
async function setCached(platform, postId, result) {
  const key = cacheKey(platform, postId);
  memoryCache.set(key, result);
  await writeSessionCache(key, result);
}
function evaluateScores(scores, enabledIds, threshold) {
  const reasons = [];
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
function failOpen(error) {
  return { hide: false, reasons: [], scores: {}, error };
}
async function classifyWithFixture(fixtureScores, threshold, enabledIds) {
  return evaluateScores(fixtureScores, enabledIds, threshold);
}
async function handleClassify(req) {
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
      enabledIds
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
  const state = { author: req.author, text: req.text };
  try {
    recordCall();
    const response = await classifyPost(settings.apiKey, state, enabled);
    const scores = {};
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
  handleClassify(message).then((result) => {
    const response = {
      type: "classifyResult",
      postId: message.postId,
      result
    };
    sendResponse(response);
  }).catch((err) => {
    sendResponse({
      type: "classifyResult",
      postId: message.postId,
      result: failOpen(err instanceof Error ? err.message : "unknown_error")
    });
  });
  return true;
});
//# sourceMappingURL=background.js.map
