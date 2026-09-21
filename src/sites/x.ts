/**
 * x.com / twitter.com DOM adapter.
 *
 * Selectors will break when X ships DOM changes — keep them isolated here.
 * Each field is a fallback chain: first selector that matches wins.
 * Fail-open: missing or unexpected nodes return null / empty string so the
 * content script skips classification and never hides the post.
 */

import { isHtmlElement } from "../guard.js";
import { isFixtureOrigin } from "../origins.js";

export const PLATFORM = "x";

/**
 * Ordered fallback chains. Prefer the current X testids; later entries exist
 * so a partial DOM change does not blank the extractor.
 */
export const SELECTOR_CHAINS = {
  tweet: [
    'article[data-testid="tweet"]',
    'div[data-testid="cellInnerDiv"] article',
    'article[role="article"]',
  ],
  tweetText: [
    '[data-testid="tweetText"]',
    'div[data-testid="tweetText"]',
    '[data-testid="tweet"] div[lang]',
    "div[lang]",
  ],
  userName: ['[data-testid="User-Name"]', '[data-testid="User-Names"]'],
  userLink: ['a[href^="/"][role="link"]', 'a[href^="/"]'],
  status: ['a[href*="/status/"] time', 'a[href*="/status/"]', 'time'],
} as const;

function queryEl(root: ParentNode | null | undefined, selector: string): Element | null {
  if (!root) return null;
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function queryAll(root: ParentNode | null | undefined, selector: string): Element[] {
  if (!root) return [];
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function queryFirstInChain(
  root: ParentNode | null | undefined,
  selectors: readonly string[],
): Element | null {
  for (const selector of selectors) {
    const el = queryEl(root, selector);
    if (el) return el;
  }
  return null;
}

function queryAllInChain(
  root: ParentNode | null | undefined,
  selectors: readonly string[],
): Element[] {
  for (const selector of selectors) {
    const els = queryAll(root, selector);
    if (els.length > 0) return els;
  }
  return [];
}

function matchesAny(node: Element, selectors: readonly string[]): boolean {
  for (const selector of selectors) {
    try {
      if (node.matches(selector)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function elementText(el: HTMLElement | null): string {
  if (!el) return "";
  const inner = el.innerText;
  if (typeof inner === "string" && inner.trim().length > 0) {
    return inner.trim();
  }
  return (el.textContent ?? "").trim();
}

export function parseStatusId(href: string): string | null {
  const match = href.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

export function parseHandleFromHref(href: string): string | null {
  const path = href.split("?")[0] ?? "";
  const trimmed = path.replace(/^\//, "");
  if (!trimmed || trimmed.includes("/")) return null;
  return `@${trimmed}`;
}

export function findTweetArticles(root: ParentNode | null | undefined): HTMLElement[] {
  return queryAllInChain(root, SELECTOR_CHAINS.tweet).filter(isHtmlElement);
}

export function isTweetArticle(node: Node): node is HTMLElement {
  return isHtmlElement(node) && matchesAny(node, SELECTOR_CHAINS.tweet);
}

function statusIdFromNode(node: Element | null): string | null {
  if (!node) return null;
  const hrefSelf = node.getAttribute("href");
  const fromSelf = hrefSelf ? parseStatusId(hrefSelf) : null;
  if (fromSelf) return fromSelf;
  const link = node.closest("a");
  const href = link?.getAttribute("href");
  return href ? parseStatusId(href) : null;
}

export function extractPostId(article: HTMLElement | null | undefined): string | null {
  if (!isHtmlElement(article)) return null;
  for (const selector of SELECTOR_CHAINS.status) {
    const id = statusIdFromNode(queryEl(article, selector));
    if (id) return id;
  }
  return null;
}

export function extractAuthor(article: HTMLElement | null | undefined): string {
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

export function extractText(article: HTMLElement | null | undefined): string {
  if (!isHtmlElement(article)) return "";

  const parts = queryAllInChain(article, SELECTOR_CHAINS.tweetText)
    .filter(isHtmlElement)
    .map((el) => elementText(el))
    .filter((text) => text.length > 0);

  if (parts.length > 0) return parts.join("\n\n");
  return elementText(article).slice(0, 500);
}

export function isFixtureHost(): boolean {
  try {
    return isFixtureOrigin(location.origin);
  } catch {
    return false;
  }
}
