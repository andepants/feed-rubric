import {
  extractAuthor,
  extractPostId,
  extractText,
  findTweetArticles,
  isFixtureHost,
  PLATFORM,
} from "./sites/x.js";
import type { ClassifyRequest, ClassifyResponse } from "./types.js";

const VISIBILITY_THRESHOLD = 0.55;
const pending = new Set<string>();
const observed = new WeakSet<HTMLElement>();

function parseFixtureScores(article: HTMLElement): Record<string, number> | undefined {
  const raw = article.dataset.feedRubricScores;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return undefined;
  }
}

function platformForHost(): string {
  return isFixtureHost() ? "fixture" : PLATFORM;
}

async function requestClassification(
  article: HTMLElement,
  postId: string,
): Promise<void> {
  if (pending.has(postId)) return;
  pending.add(postId);

  const fixtureScores = parseFixtureScores(article);
  const message: ClassifyRequest = {
    type: "classify",
    platform: platformForHost(),
    postId,
    author: extractAuthor(article),
    text: extractText(article),
    fixtureScores,
  };

  try {
    const response = (await chrome.runtime.sendMessage(message)) as ClassifyResponse;
    applyResult(article, response?.result);
  } catch (err) {
    console.warn("[feed-rubric] message failed:", err);
  } finally {
    pending.delete(postId);
  }
}

function applyResult(
  article: HTMLElement,
  result: ClassifyResponse["result"] | undefined,
): void {
  if (!result) return;

  article.removeAttribute("data-feed-rubric-hide");
  article.querySelector(".feed-rubric-debug-chip")?.remove();

  if (result.hide) {
    article.setAttribute("data-feed-rubric-hide", "true");
    maybeShowDebugChip(article, result);
  }
}

async function maybeShowDebugChip(
  article: HTMLElement,
  result: ClassifyResponse["result"],
): Promise<void> {
  const stored = await chrome.storage.local.get("debug");
  if (stored.debug !== true) return;

  const chip = document.createElement("button");
  chip.className = "feed-rubric-debug-chip";
  chip.type = "button";
  chip.title = "feed-rubric: click to unhide";
  const top = Object.entries(result.scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([k, v]) => `${k}:${v.toFixed(2)}`)
    .join(" ");
  chip.textContent = `hidden · ${result.reasons.join(", ")} · ${top}`;
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    article.removeAttribute("data-feed-rubric-hide");
    chip.remove();
  });
  article.style.position ||= "relative";
  article.appendChild(chip);
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.intersectionRatio < VISIBILITY_THRESHOLD) continue;
      const article = entry.target as HTMLElement;
      const postId = extractPostId(article);
      if (!postId) continue;
      observer.unobserve(article);
      void requestClassification(article, postId);
    }
  },
  { threshold: [0, VISIBILITY_THRESHOLD, 1] },
);

function observeTweet(article: HTMLElement): void {
  if (observed.has(article)) return;
  observed.add(article);
  observer.observe(article);
}

function scan(root: ParentNode = document): void {
  for (const article of findTweetArticles(root)) {
    observeTweet(article);
  }
}

const mutationObserver = new MutationObserver((mutations) => {
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
