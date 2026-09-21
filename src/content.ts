import {
  applyHideState,
  createPlaceholder,
  isHidden,
  PLACEHOLDER_CLASS,
  removePlaceholder,
  UNDO_CLASS,
} from "./hide.js";
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
const REASONS_ATTR = "data-feed-rubric-reasons";
const DEBUG_ATTR = "data-feed-rubric-debug";
const RATE_LIMIT_RETRY_MS = 15_000;
const ERROR_RETRY_MS = 5_000;

const pending = new Set<string>();
const finalized = new Set<string>();
const observed = new WeakSet<HTMLElement>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

let filteringEnabled = true;

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
    debug: result.debug === true,
    rateLimited: result.rateLimited === true,
    error: typeof result.error === "string" ? result.error : undefined,
  };
}

function debugDetail(result: ClassifyResult, debug: boolean): string | undefined {
  if (!debug) return undefined;
  return Object.entries(result.scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([k, v]) => `${k}:${v.toFixed(2)}`)
    .join(" ");
}

function parseStoredReasons(article: HTMLElement): string[] {
  const raw = article.getAttribute(REASONS_ATTR);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function shouldRetry(result: ClassifyResult | undefined, messageFailed: boolean): boolean {
  if (messageFailed) return true;
  if (!result) return true;
  if (result.rateLimited) return true;
  if (result.error) return true;
  return false;
}

function retryDelayMs(result: ClassifyResult | undefined): number {
  if (result?.rateLimited) return RATE_LIMIT_RETRY_MS;
  return ERROR_RETRY_MS;
}

function clearRetryTimer(postId: string): void {
  const timer = retryTimers.get(postId);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(postId);
  }
}

function scheduleRetry(article: HTMLElement, postId: string, delayMs: number): void {
  clearRetryTimer(postId);
  const timer = setTimeout(() => {
    retryTimers.delete(postId);
    if (!filteringEnabled) return;
    observer.observe(article);
  }, delayMs);
  retryTimers.set(postId, timer);
}

async function requestClassification(
  article: HTMLElement,
  postId: string,
): Promise<boolean> {
  if (!filteringEnabled) return true;
  if (pending.has(postId)) return false;
  if (finalized.has(postId)) return true;

  const text = extractText(article);
  if (!text) {
    finalized.add(postId);
    return true;
  }

  pending.add(postId);

  const message: ClassifyRequest = {
    type: "classify",
    platform: platformForHost(),
    postId,
    author: extractAuthor(article),
    text,
    fixtureScores: isFixtureHost()
      ? parseFixtureScores(article.dataset.feedRubricScores)
      : undefined,
  };

  let messageFailed = false;
  let result: ClassifyResult | undefined;

  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
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

function bindUndo(article: HTMLElement, row: HTMLElement): void {
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
    { capture: true },
  );
}

function mountPlaceholder(article: HTMLElement, result: ClassifyResult, debug: boolean): void {
  removePlaceholder(article);
  const row = createPlaceholder({
    document: article.ownerDocument,
    reasons: result.reasons,
    debugDetail: debugDetail(result, debug),
  });
  bindUndo(article, row);
  article.prepend(row);
}

function restorePlaceholderIfMissing(article: HTMLElement): void {
  if (!isHidden(article)) return;
  if (article.querySelector(`.${PLACEHOLDER_CLASS}`)) return;
  const reasons = parseStoredReasons(article);
  const debugText = article.getAttribute(DEBUG_ATTR) ?? undefined;
  const row = createPlaceholder({
    document: article.ownerDocument,
    reasons,
    debugDetail: debugText,
  });
  bindUndo(article, row);
  article.prepend(row);
}

async function applyResult(
  article: HTMLElement,
  result: ClassifyResult | undefined,
): Promise<void> {
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

function restoreAllHidden(): void {
  for (const article of findTweetArticles(document)) {
    if (!isHidden(article)) continue;
    article.removeAttribute(REASONS_ATTR);
    article.removeAttribute(DEBUG_ATTR);
    applyHideState({ article, hide: false });
    removePlaceholder(article);
  }
}

function resetClassificationState(): void {
  finalized.clear();
  for (const timer of retryTimers.values()) {
    clearTimeout(timer);
  }
  retryTimers.clear();
}

function rescanVisiblePosts(): void {
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

const observer = new IntersectionObserver(
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
  { threshold: [0, VISIBILITY_THRESHOLD, 1] },
);

function observeTweet(article: HTMLElement): void {
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

function scan(root: ParentNode | null | undefined): void {
  for (const article of findTweetArticles(root)) {
    observeTweet(article);
  }
}

const mutationObserver = new MutationObserver((mutations) => {
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

async function loadFilteringEnabled(): Promise<void> {
  try {
    const response: unknown = await chrome.runtime.sendMessage({ type: "getState" });
    if (isRecord(response) && response.type === "state" && typeof response.enabled === "boolean") {
      filteringEnabled = response.enabled;
      return;
    }
  } catch {
    // Fail open with filtering on until state arrives.
  }
}

function onSettingsChanged(enabled: boolean): void {
  filteringEnabled = enabled;
  if (!enabled) {
    restoreAllHidden();
    resetClassificationState();
    return;
  }
  rescanVisiblePosts();
}

function start(): void {
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
