import { applyHideState } from "./hide.js";
import { isHtmlElement, isRecord } from "./guard.js";
import { parseFixtureScores, parseScoreMap } from "./score.js";
import {
  extractAuthor,
  extractPostId,
  extractText,
  findTweetArticles,
  isFixtureHost,
  isTweetArticle,
  PLATFORM,
} from "./sites/x.js";
import type { ClassifyRequest, ClassifyResult } from "./types.js";

const VISIBILITY_THRESHOLD = 0.55;
const pending = new Set<string>();
const observed = new WeakSet<HTMLElement>();

function platformForHost(): string {
  return isFixtureHost() ? "fixture" : PLATFORM;
}

function parseClassifyResult(value: unknown): ClassifyResult | undefined {
  if (!isRecord(value)) return undefined;
  const result = value.result;
  if (!isRecord(result)) return undefined;
  if (typeof result.hide !== "boolean") return undefined;
  const reasons = Array.isArray(result.reasons)
    ? result.reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  return {
    hide: result.hide,
    reasons,
    scores: parseScoreMap(result.scores) ?? {},
  };
}

async function requestClassification(
  article: HTMLElement,
  postId: string,
): Promise<void> {
  if (pending.has(postId)) return;

  const text = extractText(article);
  if (!text) return;

  pending.add(postId);

  const message: ClassifyRequest = {
    type: "classify",
    platform: platformForHost(),
    postId,
    author: extractAuthor(article),
    text,
    fixtureScores: parseFixtureScores(article.dataset.feedRubricScores),
  };

  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    applyResult(article, parseClassifyResult(response));
  } catch (err) {
    console.warn("[feed-rubric] message failed:", err);
  } finally {
    pending.delete(postId);
  }
}

function applyResult(
  article: HTMLElement,
  result: ClassifyResult | undefined,
): void {
  if (!result) return;

  article.querySelector(".feed-rubric-debug-chip")?.remove();
  applyHideState({ article, hide: result.hide });

  if (result.hide) {
    void maybeShowDebugChip(article, result);
  }
}

async function maybeShowDebugChip(
  article: HTMLElement,
  result: ClassifyResult,
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
    applyHideState({ article, hide: false });
    chip.remove();
  });
  article.style.position ||= "relative";
  article.appendChild(chip);
}

const observer = new IntersectionObserver(
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
  { threshold: [0, VISIBILITY_THRESHOLD, 1] },
);

function observeTweet(article: HTMLElement): void {
  if (observed.has(article)) return;
  observed.add(article);
  observer.observe(article);
}

function scan(root: ParentNode | null | undefined): void {
  for (const article of findTweetArticles(root)) {
    observeTweet(article);
  }
}

const mutationObserver = new MutationObserver((mutations) => {
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

function start(): void {
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
