// src/guard.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/limits.ts
var MAX_POST_TEXT_LENGTH = 4e3;
var MAX_AUTHOR_LENGTH = 64;
var MAX_ERROR_LENGTH = 280;
var MAX_CATEGORY_FIELD_LENGTH = 2e3;
var CLASSIFY_TIMEOUT_MS = 15e3;
var POST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function clampText(value, max) {
  if (value.length <= max) return value;
  return value.slice(0, max);
}
function isValidPostId(postId) {
  return POST_ID_RE.test(postId);
}
function clampThreshold(value) {
  if (!Number.isFinite(value)) return 0.75;
  return Math.min(1, Math.max(0, value));
}
function sanitizeErrorMessage(message) {
  const redacted = message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\bts_[A-Za-z0-9._-]+/gi, "[redacted]");
  return clampText(redacted, MAX_ERROR_LENGTH);
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
    true: typeof trueText === "string" && trueText.trim().length > 0 ? clampText(trueText, MAX_CATEGORY_FIELD_LENGTH) : fallback.true,
    false: typeof falseText === "string" && falseText.trim().length > 0 ? clampText(falseText, MAX_CATEGORY_FIELD_LENGTH) : fallback.false
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
    id: clampText(id, 64),
    name: clampText(name, 80),
    instructions: clampText(instructions, MAX_CATEGORY_FIELD_LENGTH),
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
    "hasApiKey",
    "enabled",
    "threshold",
    "categories",
    "debug"
  ]);
  const apiKey = typeof stored.apiKey === "string" ? stored.apiKey : "";
  const hasApiKey = stored.hasApiKey === true || stored.hasApiKey !== false && apiKey.length > 0;
  return {
    apiKey,
    hasApiKey,
    enabled: stored.enabled !== false,
    threshold: typeof stored.threshold === "number" ? clampThreshold(stored.threshold) : DEFAULT_THRESHOLD,
    categories: normalizeCategories(stored.categories),
    debug: stored.debug === true
  };
}

// src/cache-key.ts
function djb2Hex(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) + hash + input.charCodeAt(i) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
function settingsFingerprint(args) {
  const enabled = args.categories.filter((cat) => cat.enabled).map((cat) => ({
    id: cat.id,
    instructions: cat.instructions,
    true: cat.criteria.true,
    false: cat.criteria.false
  })).sort((a, b) => a.id.localeCompare(b.id));
  return djb2Hex(JSON.stringify({ threshold: args.threshold, enabled }));
}
function cacheKey(args) {
  return `${args.platform}:${args.postId}:${args.fingerprint}`;
}

// src/classify-plan.ts
function planClassify(args) {
  if (!args.validPost) {
    return { kind: "fail_open", error: "invalid_post" };
  }
  if (!args.enabled) {
    return { kind: "fail_open", error: "disabled" };
  }
  if (args.cached) {
    return { kind: "cache", result: args.cached };
  }
  if (args.allowFixture && args.fixtureScores) {
    return { kind: "fixture", scores: args.fixtureScores };
  }
  if (!args.allowApi) {
    return { kind: "fail_open", error: "fixture_only" };
  }
  if (!args.hasApiKey) {
    return { kind: "fail_open", error: "no_api_key" };
  }
  if (args.rateLimited) {
    return { kind: "fail_open", error: "rate_limited" };
  }
  return { kind: "api" };
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
  const model = typeof value.model === "string" ? value.model : "";
  if (model !== JEV_MODEL) {
    throw new Error("unexpected_jev_model");
  }
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
    body: JSON.stringify({ state, model: JEV_MODEL, questions }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS)
  });
  if (!res.ok) {
    throw new Error(`Jev API ${res.status}`);
  }
  const payload = await res.json();
  return parseSystemOneResponse(payload);
}
function isConfidentYes(noul) {
  return Math.abs(noul - 0.5) > AMBIGUITY_MARGIN;
}

// src/last-error.ts
var LAST_ERROR_KEY = "lastError";

// src/origins.ts
var LIVE_ORIGINS = ["https://x.com", "https://twitter.com"];
var FIXTURE_ORIGIN = "http://127.0.0.1:18080";
var CLASSIFY_ORIGINS = /* @__PURE__ */ new Set([...LIVE_ORIGINS, FIXTURE_ORIGIN]);
var FIXTURE_ORIGINS = /* @__PURE__ */ new Set([FIXTURE_ORIGIN]);
function originOf(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
function isAllowedClassifyOrigin(origin) {
  return origin !== null && CLASSIFY_ORIGINS.has(origin);
}
function isFixtureOrigin(origin) {
  return origin !== null && FIXTURE_ORIGINS.has(origin);
}
function isExtensionPageUrl(url, extensionId) {
  if (!url || !extensionId) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "chrome-extension:" && parsed.hostname === extensionId;
  } catch {
    return false;
  }
}

// src/messaging.ts
function classifySenderOrigin(sender) {
  return originOf(sender.url) ?? (sender.origin ? originOf(sender.origin) : null);
}
function isTrustedClassifySender(sender, extensionId) {
  if (!sender.id || sender.id !== extensionId) return false;
  return isAllowedClassifyOrigin(classifySenderOrigin(sender));
}
function isFixtureSender(sender) {
  return isFixtureOrigin(classifySenderOrigin(sender));
}
function isExtensionPageSender(sender, extensionId) {
  if (!sender.id || sender.id !== extensionId) return false;
  return isExtensionPageUrl(sender.url, extensionId);
}

// src/rate-limit.ts
var RATE_LIMIT = 40;
var RATE_WINDOW_MS = 6e4;
function pruneTimestamps(args) {
  return args.timestamps.filter((stamp) => stamp >= args.now - args.windowMs);
}
function isRateLimited(args) {
  return pruneTimestamps(args).length >= args.limit;
}

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
function isGetStateRequest(message) {
  return isRecord(message) && message.type === "getState";
}

// src/background.ts
var CACHE_PREFIX = "feed-rubric:cache:";
var memoryCache = /* @__PURE__ */ new Map();
var callTimestamps = [];
async function recordError(message) {
  const lastError = {
    message: sanitizeErrorMessage(message),
    at: Date.now()
  };
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
async function getCached(key) {
  const mem = memoryCache.get(key);
  if (mem) return mem;
  const session = await readSessionCache(key);
  if (session) {
    memoryCache.set(key, session);
    return session;
  }
  return null;
}
async function setCached(key, result) {
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
function takeRateLimitSlot(now) {
  callTimestamps = pruneTimestamps({
    timestamps: callTimestamps,
    now,
    windowMs: RATE_WINDOW_MS
  });
  if (isRateLimited({
    timestamps: callTimestamps,
    now,
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS
  })) {
    return false;
  }
  callTimestamps.push(now);
  return true;
}
function withDebug(result, debug) {
  return { ...result, debug };
}
async function handleClassify(req) {
  const settings = await loadSettings();
  const enabled = settings.categories.filter((c) => c.enabled);
  const enabledIds = enabledCategoryIds(settings.categories);
  const fingerprint = settingsFingerprint({
    threshold: settings.threshold,
    categories: settings.categories
  });
  const key = cacheKey({
    platform: req.platform,
    postId: req.postId,
    fingerprint
  });
  const cached = await getCached(key);
  const plan = planClassify({
    cached,
    fixtureScores: parseScoreMap(req.fixtureScores),
    allowFixture: req.allowFixture === true,
    allowApi: req.allowApi !== false,
    enabled: settings.enabled,
    hasApiKey: settings.hasApiKey,
    rateLimited: isRateLimited({
      timestamps: callTimestamps,
      now: Date.now(),
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS
    }),
    validPost: isValidPostId(req.postId)
  });
  switch (plan.kind) {
    case "cache":
      return withDebug({ ...plan.result, cached: true }, settings.debug);
    case "fixture": {
      const result = evaluateScores({
        scores: plan.scores,
        enabledIds,
        threshold: settings.threshold
      });
      await setCached(key, result);
      return withDebug(result, settings.debug);
    }
    case "fail_open": {
      if (plan.error !== "disabled") {
        await recordError(plan.error);
      }
      if (plan.error === "rate_limited") {
        return withDebug({ ...failOpen(plan.error), rateLimited: true }, settings.debug);
      }
      return withDebug(failOpen(plan.error), settings.debug);
    }
    case "api": {
      const state = {
        author: clampText(req.author, MAX_AUTHOR_LENGTH),
        text: clampText(req.text, MAX_POST_TEXT_LENGTH)
      };
      try {
        if (!takeRateLimitSlot(Date.now())) {
          await recordError("rate_limited");
          return withDebug({ ...failOpen("rate_limited"), rateLimited: true }, settings.debug);
        }
        const response = await classifyPost(settings.apiKey, state, enabled);
        const scores = {};
        for (const [id, answer] of Object.entries(response.answers)) {
          scores[id] = answer.noul;
        }
        const result = evaluateScores({
          scores,
          enabledIds,
          threshold: settings.threshold
        });
        await setCached(key, result);
        return withDebug(result, settings.debug);
      } catch (err) {
        const message = sanitizeErrorMessage(
          err instanceof Error ? err.message : "unknown_error"
        );
        console.warn("[feed-rubric] classify failed:", message);
        await recordError(message);
        return withDebug(failOpen(message), settings.debug);
      }
    }
    default: {
      const _exhaustive = plan;
      return withDebug(failOpen(`unhandled_plan:${String(_exhaustive)}`), settings.debug);
    }
  }
}
async function broadcastSettingsChanged(enabled) {
  const payload = { type: "settingsChanged", enabled };
  const patterns = [...LIVE_ORIGINS, "http://127.0.0.1:18080/*"];
  try {
    const tabs = await chrome.tabs.query({ url: patterns });
    for (const tab of tabs) {
      if (tab.id === void 0) continue;
      void chrome.tabs.sendMessage(tab.id, payload).catch(() => void 0);
    }
  } catch {
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("enabled" in changes || "apiKey" in changes || "hasApiKey" in changes || "threshold" in changes || "categories" in changes) {
    void loadSettings().then((settings) => broadcastSettingsChanged(settings.enabled));
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const extensionId = chrome.runtime.id;
  if (isGetStateRequest(message)) {
    void loadSettings().then((settings) => {
      const response = { type: "state", enabled: settings.enabled };
      sendResponse(response);
    }).catch(() => {
      const response = { type: "state", enabled: true };
      sendResponse(response);
    });
    return true;
  }
  if (isClearCacheRequest(message)) {
    if (!isExtensionPageSender(sender, extensionId)) {
      const response = { type: "cacheCleared", cleared: 0 };
      sendResponse(response);
      return false;
    }
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
  const trusted = isTrustedClassifySender(sender, extensionId);
  const fixtureSender = isFixtureSender(sender);
  const request = {
    ...message,
    author: clampText(message.author, MAX_AUTHOR_LENGTH),
    text: clampText(message.text, MAX_POST_TEXT_LENGTH),
    fixtureScores: fixtureSender ? message.fixtureScores : void 0,
    allowFixture: fixtureSender,
    allowApi: trusted && !fixtureSender
  };
  if (!trusted) {
    sendResponse({
      type: "classifyResult",
      postId: message.postId,
      result: failOpen("untrusted_sender")
    });
    return false;
  }
  handleClassify(request).then((result) => {
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
      result: failOpen(
        sanitizeErrorMessage(err instanceof Error ? err.message : "unknown_error")
      )
    });
  });
  return true;
});
