// src/sites/x.ts
var PLATFORM = "x";
var SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  userLink: 'a[href^="/"][role="link"]'
};
function findTweetArticles(root = document) {
  return Array.from(root.querySelectorAll(SELECTORS.tweet));
}
function extractPostId(article) {
  const link = article.querySelector(
    'a[href*="/status/"] time'
  )?.closest("a");
  const href = link?.getAttribute("href") ?? "";
  const match = href.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}
function extractAuthor(article) {
  const nameBlock = article.querySelector(SELECTORS.userName);
  const handleLink = nameBlock?.querySelector(
    'a[href^="/"]'
  );
  const handle = handleLink?.getAttribute("href")?.replace(/^\//, "");
  if (handle && !handle.includes("/")) {
    return `@${handle}`;
  }
  const text = nameBlock?.textContent?.trim() ?? "";
  const atMatch = text.match(/@\w+/);
  return atMatch?.[0] ?? "@unknown";
}
function extractText(article) {
  const parts = Array.from(
    article.querySelectorAll(SELECTORS.tweetText)
  ).map((el) => el.innerText.trim());
  return parts.filter(Boolean).join("\n\n") || article.innerText.slice(0, 500);
}
function isFixtureHost() {
  return location.hostname === "127.0.0.1" || location.hostname === "localhost";
}

// src/content.ts
var VISIBILITY_THRESHOLD = 0.55;
var pending = /* @__PURE__ */ new Set();
var observed = /* @__PURE__ */ new WeakSet();
function parseFixtureScores(article) {
  const raw = article.dataset.feedRubricScores;
  if (!raw) return void 0;
  try {
    return JSON.parse(raw);
  } catch {
    return void 0;
  }
}
function platformForHost() {
  return isFixtureHost() ? "fixture" : PLATFORM;
}
async function requestClassification(article, postId) {
  if (pending.has(postId)) return;
  pending.add(postId);
  const fixtureScores = parseFixtureScores(article);
  const message = {
    type: "classify",
    platform: platformForHost(),
    postId,
    author: extractAuthor(article),
    text: extractText(article),
    fixtureScores
  };
  try {
    const response = await chrome.runtime.sendMessage(message);
    applyResult(article, response?.result);
  } catch (err) {
    console.warn("[feed-rubric] message failed:", err);
  } finally {
    pending.delete(postId);
  }
}
function applyResult(article, result) {
  if (!result) return;
  article.removeAttribute("data-feed-rubric-hide");
  article.querySelector(".feed-rubric-debug-chip")?.remove();
  if (result.hide) {
    article.setAttribute("data-feed-rubric-hide", "true");
    maybeShowDebugChip(article, result);
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
    article.removeAttribute("data-feed-rubric-hide");
    chip.remove();
  });
  article.style.position ||= "relative";
  article.appendChild(chip);
}
var observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.intersectionRatio < VISIBILITY_THRESHOLD) continue;
      const article = entry.target;
      const postId = extractPostId(article);
      if (!postId) continue;
      observer.unobserve(article);
      void requestClassification(article, postId);
    }
  },
  { threshold: [0, VISIBILITY_THRESHOLD, 1] }
);
function observeTweet(article) {
  if (observed.has(article)) return;
  observed.add(article);
  observer.observe(article);
}
function scan(root = document) {
  for (const article of findTweetArticles(root)) {
    observeTweet(article);
  }
}
var mutationObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches?.('article[data-testid="tweet"]')) {
        observeTweet(node);
      }
      scan(node);
    }
  }
});
scan();
mutationObserver.observe(document.body, { childList: true, subtree: true });
//# sourceMappingURL=content.js.map
