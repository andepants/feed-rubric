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
    return location.hostname === "127.0.0.1" || location.hostname === "localhost";
  } catch {
    return false;
  }
}

// src/content.ts
var VISIBILITY_THRESHOLD = 0.55;
var pending = /* @__PURE__ */ new Set();
var observed = /* @__PURE__ */ new WeakSet();
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
    scores: parseScoreMap(result.scores) ?? {}
  };
}
function debugDetail(result, debug) {
  if (!debug) return void 0;
  return Object.entries(result.scores).sort(([, a], [, b]) => b - a).slice(0, 2).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(" ");
}
async function requestClassification(article, postId) {
  if (pending.has(postId)) return;
  const text = extractText(article);
  if (!text) return;
  pending.add(postId);
  const message = {
    type: "classify",
    platform: platformForHost(),
    postId,
    author: extractAuthor(article),
    text,
    fixtureScores: parseFixtureScores(article.dataset.feedRubricScores)
  };
  try {
    const response = await chrome.runtime.sendMessage(message);
    await applyResult(article, parseClassifyResult(response));
  } catch (err) {
    console.warn("[feed-rubric] message failed:", err);
  } finally {
    pending.delete(postId);
  }
}
function mountPlaceholder(article, result, debug) {
  removePlaceholder(article);
  const row = createPlaceholder({
    document: article.ownerDocument,
    reasons: result.reasons,
    debugDetail: debugDetail(result, debug)
  });
  const undo = row.querySelector(`.${UNDO_CLASS}`);
  undo?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    applyHideState({ article, hide: false });
    removePlaceholder(article);
  });
  article.prepend(row);
}
async function applyResult(article, result) {
  if (!result) return;
  removePlaceholder(article);
  applyHideState({ article, hide: result.hide });
  if (!result.hide) return;
  const stored = await chrome.storage.local.get("debug");
  mountPlaceholder(article, result, stored.debug === true);
}
var observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.intersectionRatio < VISIBILITY_THRESHOLD) continue;
      const target = entry.target;
      if (!isHtmlElement(target)) continue;
      const postId = extractPostId(target);
      if (!postId) continue;
      observer.unobserve(target);
      void requestClassification(target, postId);
    }
  },
  { threshold: [0, VISIBILITY_THRESHOLD, 1] }
);
function observeTweet(article) {
  if (observed.has(article)) return;
  observed.add(article);
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
      if (isTweetArticle(node)) {
        observeTweet(node);
      }
      if ("querySelectorAll" in node) {
        scan(node);
      }
    }
  }
});
function start() {
  scan(document);
  const body = document.body;
  if (!body) return;
  mutationObserver.observe(body, { childList: true, subtree: true });
}
if (document.body) {
  start();
} else {
  document.addEventListener("DOMContentLoaded", start, { once: true });
}
//# sourceMappingURL=content.js.map
