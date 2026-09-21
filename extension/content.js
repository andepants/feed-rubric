// src/hide.ts
var HIDE_ATTR = "data-feed-rubric-hide";
var PLACEHOLDER_CLASS = "feed-rubric-placeholder";
var UNDO_CLASS = "feed-rubric-undo";
function applyHideState(args) {
  if (args.hide) {
    args.article.setAttribute(HIDE_ATTR, "true");
  } else {
    args.article.removeAttribute(HIDE_ATTR);
  }
}
function isHidden(article) {
  return article.getAttribute(HIDE_ATTR) === "true";
}
function placeholderSummary(reasons) {
  const label = reasons.length > 0 ? reasons.join(", ") : "rubric";
  return `Hidden \xB7 ${label}`;
}
function createPlaceholder(args) {
  const row = args.document.createElement("div");
  row.className = PLACEHOLDER_CLASS;
  const text = args.document.createElement("span");
  const summary = placeholderSummary(args.reasons);
  text.textContent = args.debugDetail ? `${summary} \xB7 ${args.debugDetail}` : summary;
  const undo = args.document.createElement("button");
  undo.type = "button";
  undo.className = UNDO_CLASS;
  undo.textContent = "Undo";
  row.append(text, undo);
  return row;
}
function removePlaceholder(article) {
  const nodes = article.querySelectorAll(`.${PLACEHOLDER_CLASS}`);
  for (const node of nodes) {
    node.remove();
  }
}

// src/guard.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isHtmlElement(node) {
  if (typeof node !== "object" || node === null) return false;
  if (!("nodeType" in node) || node.nodeType !== 1) return false;
  if (!("setAttribute" in node) || typeof node.setAttribute !== "function") {
    return false;
  }
  return true;
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
function parseFixtureScores(raw) {
  if (!raw) return void 0;
  try {
    const parsed = JSON.parse(raw);
    return parseScoreMap(parsed);
  } catch {
    return void 0;
  }
}

// src/origins.ts
var LIVE_ORIGINS = ["https://x.com", "https://twitter.com"];
var FIXTURE_ORIGIN = "http://127.0.0.1:18080";
var CLASSIFY_ORIGINS = /* @__PURE__ */ new Set([...LIVE_ORIGINS, FIXTURE_ORIGIN]);
var FIXTURE_ORIGINS = /* @__PURE__ */ new Set([FIXTURE_ORIGIN]);
function isFixtureOrigin(origin) {
  return origin !== null && FIXTURE_ORIGINS.has(origin);
}

// src/sites/x.ts
var PLATFORM = "x";
var SELECTOR_CHAINS = {
  tweet: [
    'article[data-testid="tweet"]',
    'div[data-testid="cellInnerDiv"] article',
    'article[role="article"]'
  ],
  tweetText: [
    '[data-testid="tweetText"]',
    'div[data-testid="tweetText"]',
    '[data-testid="tweet"] div[lang]',
    "div[lang]"
  ],
  userName: ['[data-testid="User-Name"]', '[data-testid="User-Names"]'],
  userLink: ['a[href^="/"][role="link"]', 'a[href^="/"]'],
  status: ['a[href*="/status/"] time', 'a[href*="/status/"]', "time"]
};
function queryEl(root, selector) {
  if (!root) return null;
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}
function queryAll(root, selector) {
  if (!root) return [];
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}
function queryFirstInChain(root, selectors) {
  for (const selector of selectors) {
    const el = queryEl(root, selector);
    if (el) return el;
  }
  return null;
}
function queryAllInChain(root, selectors) {
  for (const selector of selectors) {
    const els = queryAll(root, selector);
    if (els.length > 0) return els;
  }
  return [];
}
function matchesAny(node, selectors) {
  for (const selector of selectors) {
    try {
      if (node.matches(selector)) return true;
    } catch {
      continue;
    }
  }
  return false;
}
function elementText(el) {
  if (!el) return "";
  const inner = el.innerText;
  if (typeof inner === "string" && inner.trim().length > 0) {
    return inner.trim();
  }
  return (el.textContent ?? "").trim();
}
function parseStatusId(href) {
  const match = href.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}
function parseHandleFromHref(href) {
  const path = href.split("?")[0] ?? "";
  const trimmed = path.replace(/^\//, "");
  if (!trimmed || trimmed.includes("/")) return null;
  return `@${trimmed}`;
}
function findTweetArticles(root) {
  return queryAllInChain(root, SELECTOR_CHAINS.tweet).filter(isHtmlElement);
}
function isTweetArticle(node) {
  return isHtmlElement(node) && matchesAny(node, SELECTOR_CHAINS.tweet);
}
function statusIdFromNode(node) {
  if (!node) return null;
  const hrefSelf = node.getAttribute("href");
  const fromSelf = hrefSelf ? parseStatusId(hrefSelf) : null;
  if (fromSelf) return fromSelf;
  const link = node.closest("a");
  const href = link?.getAttribute("href");
  return href ? parseStatusId(href) : null;
}
function extractPostId(article) {
  if (!isHtmlElement(article)) return null;
  for (const selector of SELECTOR_CHAINS.status) {
    const id = statusIdFromNode(queryEl(article, selector));
    if (id) return id;
  }
  return null;
}
function extractAuthor(article) {
  if (!isHtmlElement(article)) return "@unknown";
  const nameBlock = queryFirstInChain(article, SELECTOR_CHAINS.userName);
  if (!isHtmlElement(nameBlock)) return "@unknown";
  const handleLink = queryFirstInChain(nameBlock, SELECTOR_CHAINS.userLink);
  const href = handleLink?.getAttribute("href");
  const fromHref = href ? parseHandleFromHref(href) : null;
  if (fromHref) return fromHref;
  const text = elementText(nameBlock);
  const atMatch = text.match(/@\w+/);
  return atMatch?.[0] ?? "@unknown";
}
function extractText(article) {
  if (!isHtmlElement(article)) return "";
  const parts = queryAllInChain(article, SELECTOR_CHAINS.tweetText).filter(isHtmlElement).map((el) => elementText(el)).filter((text) => text.length > 0);
  if (parts.length > 0) return parts.join("\n\n");
  return elementText(article).slice(0, 500);
}
function isFixtureHost() {
  try {
    return isFixtureOrigin(location.origin);
  } catch {
    return false;
  }
}

// src/content.ts
var VISIBILITY_THRESHOLD = 0.55;
var REASONS_ATTR = "data-feed-rubric-reasons";
var DEBUG_ATTR = "data-feed-rubric-debug";
var RATE_LIMIT_RETRY_MS = 15e3;
var ERROR_RETRY_MS = 5e3;
var pending = /* @__PURE__ */ new Set();
var finalized = /* @__PURE__ */ new Set();
var observed = /* @__PURE__ */ new WeakSet();
var retryTimers = /* @__PURE__ */ new Map();
var filteringEnabled = true;
function platformForHost() {
  return isFixtureHost() ? "fixture" : PLATFORM;
}
function parseClassifyResult(value) {
  if (!isRecord(value)) return void 0;
  const result = value.result;
  if (!isRecord(result)) return void 0;
  if (typeof result.hide !== "boolean") return void 0;
  const reasons = Array.isArray(result.reasons) ? result.reasons.filter((reason) => typeof reason === "string") : [];
  return {
    hide: result.hide,
    reasons,
    scores: parseScoreMap(result.scores) ?? {},
    debug: result.debug === true,
    rateLimited: result.rateLimited === true,
    error: typeof result.error === "string" ? result.error : void 0
  };
}
function debugDetail(result, debug) {
  if (!debug) return void 0;
  return Object.entries(result.scores).sort(([, a], [, b]) => b - a).slice(0, 2).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(" ");
}
function parseStoredReasons(article) {
  const raw = article.getAttribute(REASONS_ATTR);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === "string");
  } catch {
    return [];
  }
}
function shouldRetry(result, messageFailed) {
  if (messageFailed) return true;
  if (!result) return true;
  if (result.rateLimited) return true;
  if (result.error) return true;
  return false;
}
function retryDelayMs(result) {
  if (result?.rateLimited) return RATE_LIMIT_RETRY_MS;
  return ERROR_RETRY_MS;
}
function clearRetryTimer(postId) {
  const timer = retryTimers.get(postId);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(postId);
  }
}
function scheduleRetry(article, postId, delayMs) {
  clearRetryTimer(postId);
  const timer = setTimeout(() => {
    retryTimers.delete(postId);
    if (!filteringEnabled) return;
    observer.observe(article);
  }, delayMs);
  retryTimers.set(postId, timer);
}
async function requestClassification(article, postId) {
  if (!filteringEnabled) return true;
  if (pending.has(postId)) return false;
  if (finalized.has(postId)) return true;
  const text = extractText(article);
  if (!text) {
    finalized.add(postId);
    return true;
  }
  pending.add(postId);
  const message = {
    type: "classify",
    platform: platformForHost(),
    postId,
    author: extractAuthor(article),
    text,
    fixtureScores: isFixtureHost() ? parseFixtureScores(article.dataset.feedRubricScores) : void 0
  };
  let messageFailed = false;
  let result;
  try {
    const response = await chrome.runtime.sendMessage(message);
    result = parseClassifyResult(response);
    await applyResult(article, result);
  } catch (err) {
    messageFailed = true;
    console.warn("[feed-rubric] message failed:", err);
  } finally {
    pending.delete(postId);
  }
  if (shouldRetry(result, messageFailed)) {
    scheduleRetry(article, postId, retryDelayMs(result));
    return false;
  }
  finalized.add(postId);
  return true;
}
function bindUndo(article, row) {
  const undo = row.querySelector(`.${UNDO_CLASS}`);
  undo?.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) return;
      event.preventDefault();
      event.stopPropagation();
      article.removeAttribute(REASONS_ATTR);
      article.removeAttribute(DEBUG_ATTR);
      applyHideState({ article, hide: false });
      removePlaceholder(article);
    },
    { capture: true }
  );
}
function mountPlaceholder(article, result, debug) {
  removePlaceholder(article);
  const row = createPlaceholder({
    document: article.ownerDocument,
    reasons: result.reasons,
    debugDetail: debugDetail(result, debug)
  });
  bindUndo(article, row);
  article.prepend(row);
}
function restorePlaceholderIfMissing(article) {
  if (!isHidden(article)) return;
  if (article.querySelector(`.${PLACEHOLDER_CLASS}`)) return;
  const reasons = parseStoredReasons(article);
  const debugText = article.getAttribute(DEBUG_ATTR) ?? void 0;
  const row = createPlaceholder({
    document: article.ownerDocument,
    reasons,
    debugDetail: debugText
  });
  bindUndo(article, row);
  article.prepend(row);
}
async function applyResult(article, result) {
  if (!result) return;
  removePlaceholder(article);
  applyHideState({ article, hide: result.hide });
  if (!result.hide) {
    article.removeAttribute(REASONS_ATTR);
    article.removeAttribute(DEBUG_ATTR);
    return;
  }
  const debug = result.debug === true;
  article.setAttribute(REASONS_ATTR, JSON.stringify(result.reasons));
  const detail = debugDetail(result, debug);
  if (detail) article.setAttribute(DEBUG_ATTR, detail);
  else article.removeAttribute(DEBUG_ATTR);
  mountPlaceholder(article, result, debug);
}
function restoreAllHidden() {
  for (const article of findTweetArticles(document)) {
    if (!isHidden(article)) continue;
    article.removeAttribute(REASONS_ATTR);
    article.removeAttribute(DEBUG_ATTR);
    applyHideState({ article, hide: false });
    removePlaceholder(article);
  }
}
function resetClassificationState() {
  finalized.clear();
  for (const timer of retryTimers.values()) {
    clearTimeout(timer);
  }
  retryTimers.clear();
}
function rescanVisiblePosts() {
  resetClassificationState();
  for (const article of findTweetArticles(document)) {
    const postId = extractPostId(article);
    if (!postId) continue;
    clearRetryTimer(postId);
    if (isFixtureHost()) {
      void requestClassification(article, postId);
      continue;
    }
    observer.observe(article);
  }
}
var observer = new IntersectionObserver(
  (entries) => {
    if (!filteringEnabled) return;
    for (const entry of entries) {
      if (entry.intersectionRatio < VISIBILITY_THRESHOLD) continue;
      const target = entry.target;
      if (!isHtmlElement(target)) continue;
      const postId = extractPostId(target);
      if (!postId) {
        observer.unobserve(target);
        continue;
      }
      if (finalized.has(postId) || pending.has(postId)) {
        observer.unobserve(target);
        continue;
      }
      observer.unobserve(target);
      void requestClassification(target, postId).then((done) => {
        if (!done && filteringEnabled) {
          observer.observe(target);
        }
      });
    }
  },
  { threshold: [0, VISIBILITY_THRESHOLD, 1] }
);
function observeTweet(article) {
  if (observed.has(article)) {
    restorePlaceholderIfMissing(article);
    return;
  }
  observed.add(article);
  if (!filteringEnabled) return;
  if (isFixtureHost()) {
    const postId = extractPostId(article);
    if (postId) void requestClassification(article, postId);
    return;
  }
  observer.observe(article);
}
function scan(root) {
  for (const article of findTweetArticles(root)) {
    observeTweet(article);
  }
}
var mutationObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (isHtmlElement(node) && node.classList.contains(PLACEHOLDER_CLASS)) {
        continue;
      }
      if (isTweetArticle(node)) {
        observeTweet(node);
      }
      if ("querySelectorAll" in node) {
        scan(node);
      }
    }
    const target = mutation.target;
    if (isHtmlElement(target) && isHidden(target)) {
      restorePlaceholderIfMissing(target);
    }
  }
});
async function loadFilteringEnabled() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "getState" });
    if (isRecord(response) && response.type === "state" && typeof response.enabled === "boolean") {
      filteringEnabled = response.enabled;
      return;
    }
  } catch {
  }
}
function onSettingsChanged(enabled) {
  filteringEnabled = enabled;
  if (!enabled) {
    restoreAllHidden();
    resetClassificationState();
    return;
  }
  rescanVisiblePosts();
}
function start() {
  scan(document);
  const body = document.body;
  if (!body) return;
  mutationObserver.observe(body, { childList: true, subtree: true });
}
void loadFilteringEnabled().then(() => {
  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
});
chrome.runtime.onMessage.addListener((message) => {
  if (!isRecord(message)) return;
  if (message.type === "settingsChanged" && typeof message.enabled === "boolean") {
    onSettingsChanged(message.enabled);
  }
});
