// src/guard.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/categories.ts
var DEFAULT_THRESHOLD = 0.75;
var FALLBACK_CRITERIA = {
  true: "The condition described in the instructions applies to this post.",
  false: "The condition does not apply."
};
var DEFAULT_CATEGORIES = [
  {
    id: "rage_bait",
    name: "Rage bait",
    enabled: true,
    instructions: "Is this post written to provoke outrage or a pile-on rather than to inform or argue?",
    criteria: {
      true: "The post's primary purpose is to inflame: it baits dunks or quote-tweets, treats an enemy as irredeemable without a claim, or tells the audience to get furious.",
      false: "The post informs, reports, jokes without targeting a pile-on, or makes a real argument (including sarcastic or sharp ones) that someone could agree or disagree with."
    }
  },
  {
    id: "crypto_promo",
    name: "Crypto promo",
    enabled: true,
    instructions: "Does this post promote a crypto token, exchange, wallet, or get-rich scheme?",
    criteria: {
      true: "The post shills a token or ticker, exchange, wallet, 'next 100x', pump group, or similar buy/sign-up pitch.",
      false: "The post is not a promo: policy or market news, education without a buy pitch, or unrelated content."
    }
  },
  {
    id: "unsolicited_politics",
    name: "Unsolicited politics",
    enabled: true,
    instructions: "Is this post a partisan political argument or campaign message?",
    criteria: {
      true: "The post campaigns for or against a party or candidate, frames the other side as the enemy, or urges votes, donations, or shares for a political cause.",
      false: "The post is a neutral news headline or report, civic or process information without a side, or not about electoral or partisan politics."
    }
  }
];
function parseCriteria(value, fallback = FALLBACK_CRITERIA) {
  if (!isRecord(value)) return fallback;
  const trueText = value.true;
  const falseText = value.false;
  return {
    true: typeof trueText === "string" && trueText.trim().length > 0 ? trueText : fallback.true,
    false: typeof falseText === "string" && falseText.trim().length > 0 ? falseText : fallback.false
  };
}
function parseCategory(value) {
  if (!isRecord(value)) return null;
  const id = value.id;
  const name = value.name;
  const instructions = value.instructions;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof instructions !== "string") return null;
  const defaults = DEFAULT_CATEGORIES.find((cat) => cat.id === id);
  return {
    id,
    name,
    instructions,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    criteria: parseCriteria(value.criteria, defaults?.criteria ?? FALLBACK_CRITERIA)
  };
}
function normalizeCategories(value) {
  if (!Array.isArray(value)) return DEFAULT_CATEGORIES;
  const parsed = [];
  for (const item of value) {
    const cat = parseCategory(item);
    if (cat) parsed.push(cat);
  }
  return parsed.length > 0 ? parsed : DEFAULT_CATEGORIES;
}
function enabledCategoryIds(categories) {
  return new Set(categories.filter((cat) => cat.enabled).map((cat) => cat.id));
}
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
    categories: normalizeCategories(stored.categories),
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
        true: cat.criteria.true,
        false: cat.criteria.false
      }
    };
  }
  return questions;
}
function parseNoulAnswer(value) {
  if (!isRecord(value)) return null;
  if (value.type !== "noul") return null;
  if (typeof value.noul !== "number" || !Number.isFinite(value.noul)) return null;
  return { type: "noul", noul: value.noul };
}
function parseSystemOneResponse(value) {
  if (!isRecord(value)) {
    throw new Error("invalid_jev_response");
  }
  const answersRaw = value.answers;
  if (!isRecord(answersRaw)) {
    throw new Error("invalid_jev_answers");
  }
  const answers = {};
  for (const [id, answer] of Object.entries(answersRaw)) {
    const parsed = parseNoulAnswer(answer);
    if (parsed) answers[id] = parsed;
  }
  const model = typeof value.model === "string" ? value.model : JEV_MODEL;
  return { model, answers };
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
  const payload = await res.json();
  return parseSystemOneResponse(payload);
}
function isConfidentYes(noul) {
  return Math.abs(noul - 0.5) > AMBIGUITY_MARGIN;
}

// src/last-error.ts
var LAST_ERROR_KEY = "lastError";

// src/score.ts
function parseScoreMap(value) {
  if (!isRecord(value)) return void 0;
  const scores = {};
  for (const [id, noul] of Object.entries(value)) {
    if (typeof noul !== "number" || !Number.isFinite(noul)) {
      return void 0;
    }
    scores[id] = noul;
  }
  return Object.keys(scores).length > 0 ? scores : void 0;
}
function evaluateScores(args) {
  const reasons = [];
  let hide = false;
  for (const [id, noul] of Object.entries(args.scores)) {
    if (!args.enabledIds.has(id)) continue;
    if (noul >= args.threshold && isConfidentYes(noul)) {
      hide = true;
      reasons.push(id);
    }
  }
  return { hide, reasons, scores: args.scores };
}
function failOpen(error) {
  return { hide: false, reasons: [], scores: {}, error };
}

// src/types.ts
function isClassifyRequest(message) {
  if (!isRecord(message)) return false;
  return message.type === "classify" && typeof message.platform === "string" && typeof message.postId === "string" && typeof message.author === "string" && typeof message.text === "string";
}
function isClearCacheRequest(message) {
  return isRecord(message) && message.type === "clearCache";
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
async function recordError(message) {
  const lastError = { message, at: Date.now() };
  await chrome.storage.local.set({ [LAST_ERROR_KEY]: lastError });
}
async function readSessionCache(key) {
  const stored = await chrome.storage.session.get(CACHE_PREFIX + key);
  const entry = stored[CACHE_PREFIX + key];
  if (!isRecord(entry)) return null;
  if (typeof entry.hide !== "boolean") return null;
  if (!Array.isArray(entry.reasons)) return null;
  const scores = parseScoreMap(entry.scores);
  return {
    hide: entry.hide,
    reasons: entry.reasons.filter((r) => typeof r === "string"),
    scores: scores ?? {},
    cached: true
  };
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
async function clearCache() {
  const memory = memoryCache.size;
  memoryCache.clear();
  const all = await chrome.storage.session.get(null);
  const keys = Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX));
  if (keys.length > 0) {
    await chrome.storage.session.remove(keys);
  }
  return memory + keys.length;
}
async function classifyWithFixture(fixtureScores, threshold, enabledIds) {
  return evaluateScores({ scores: fixtureScores, enabledIds, threshold });
}
async function handleClassify(req) {
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
      enabledIds
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
  const state = { author: req.author, text: req.text };
  try {
    recordCall();
    const response = await classifyPost(settings.apiKey, state, enabled);
    const scores = {};
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
    void clearCache().then((cleared) => {
      const response = { type: "cacheCleared", cleared };
      sendResponse(response);
    }).catch(() => {
      const response = { type: "cacheCleared", cleared: 0 };
      sendResponse(response);
    });
    return true;
  }
  if (!isClassifyRequest(message)) return false;
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
