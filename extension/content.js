// src/hide.ts
var HIDE_ATTR = "data-feed-rubric-hide";
function applyHideState(args) {
  if (args.hide) {
    args.article.setAttribute(HIDE_ATTR, "true");
  } else {
    args.article.removeAttribute(HIDE_ATTR);
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
var SELECTORS = {
  /**
   * Timeline tweet card. X uses `<article data-testid="tweet">` for home,
   * notifications, and status pages. Fixture timeline copies this.
   */
  tweet: 'article[data-testid="tweet"]',
  /**
   * Tweet body. Quote-tweets may contain more than one; we join them.
   */
  tweetText: '[data-testid="tweetText"]',
  /**
   * Author name/handle cluster in the tweet header.
   */
  userName: '[data-testid="User-Name"]',
  /**
   * Profile link inside the name cluster (`href="/handle"`, role=link).
   */
  userLink: 'a[href^="/"][role="link"]',
  /**
   * Timestamp node inside the permalink. X wraps `<time>` in
   * `a[href*="/status/{id}"]`.
   */
  statusTime: 'a[href*="/status/"] time',
  /**
   * Fallback permalink if `<time>` is missing from the article.
   */
  statusLink: 'a[href*="/status/"]'
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
  return queryAll(root, SELECTORS.tweet).filter(isHtmlElement);
}
function isTweetArticle(node) {
  return isHtmlElement(node) && node.matches(SELECTORS.tweet);
}
function extractPostId(article) {
  if (!isHtmlElement(article)) return null;
  const timeEl = queryEl(article, SELECTORS.statusTime);
  const timeLink = timeEl?.closest("a");
  if (timeLink) {
    const href2 = timeLink.getAttribute("href");
    const id = href2 ? parseStatusId(href2) : null;
    if (id) return id;
  }
  const fallback = queryEl(article, SELECTORS.statusLink);
  const href = fallback?.getAttribute("href");
  return href ? parseStatusId(href) : null;
}
function extractAuthor(article) {
  if (!isHtmlElement(article)) return "@unknown";
  const nameBlock = queryEl(article, SELECTORS.userName);
  if (!isHtmlElement(nameBlock)) return "@unknown";
  const handleLink = queryEl(nameBlock, SELECTORS.userLink) ?? queryEl(nameBlock, 'a[href^="/"]');
  const href = handleLink?.getAttribute("href");
  const fromHref = href ? parseHandleFromHref(href) : null;
  if (fromHref) return fromHref;
  const text = elementText(nameBlock);
  const atMatch = text.match(/@\w+/);
  return atMatch?.[0] ?? "@unknown";
}
function extractText(article) {
  if (!isHtmlElement(article)) return "";
  const parts = queryAll(article, SELECTORS.tweetText).filter(isHtmlElement).map((el) => elementText(el)).filter((text) => text.length > 0);
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
    applyResult(article, parseClassifyResult(response));
  } catch (err) {
    console.warn("[feed-rubric] message failed:", err);
  } finally {
    pending.delete(postId);
  }
}
function applyResult(article, result) {
  if (!result) return;
  article.querySelector(".feed-rubric-debug-chip")?.remove();
  applyHideState({ article, hide: result.hide });
  if (result.hide) {
    void maybeShowDebugChip(article, result);
  }
}
async function maybeShowDebugChip(article, result) {
  const stored = await chrome.storage.local.get("debug");
  if (stored.debug !== true) return;
  const chip = document.createElement("button");
  chip.className = "feed-rubric-debug-chip";
  chip.type = "button";
  chip.title = "feed-rubric: click to unhide";
  const top = Object.entries(result.scores).sort(([, a], [, b]) => b - a).slice(0, 2).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(" ");
  chip.textContent = `hidden \xB7 ${result.reasons.join(", ")} \xB7 ${top}`;
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    applyHideState({ article, hide: false });
    chip.remove();
  });
  article.style.position ||= "relative";
  article.appendChild(chip);
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
