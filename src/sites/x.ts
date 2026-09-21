/**
 * x.com / twitter.com DOM adapter.
 *
 * Selectors will break when X ships DOM changes — keep them isolated here.
 * Fail-open: missing or unexpected nodes return null / empty string so the
 * content script skips classification and never hides the post.
 */

import { isHtmlElement } from "../guard.js";

export const PLATFORM = "x";

export const SELECTORS = {
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
  statusLink: 'a[href*="/status/"]',
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
  return queryAll(root, SELECTORS.tweet).filter(isHtmlElement);
}

export function isTweetArticle(node: Node): node is HTMLElement {
  return isHtmlElement(node) && node.matches(SELECTORS.tweet);
}

export function extractPostId(article: HTMLElement | null | undefined): string | null {
  if (!isHtmlElement(article)) return null;

  const timeEl = queryEl(article, SELECTORS.statusTime);
  const timeLink = timeEl?.closest("a");
  if (timeLink) {
    const href = timeLink.getAttribute("href");
    const id = href ? parseStatusId(href) : null;
    if (id) return id;
  }

  const fallback = queryEl(article, SELECTORS.statusLink);
  const href = fallback?.getAttribute("href");
  return href ? parseStatusId(href) : null;
}

export function extractAuthor(article: HTMLElement | null | undefined): string {
  if (!isHtmlElement(article)) return "@unknown";

  const nameBlock = queryEl(article, SELECTORS.userName);
  if (!isHtmlElement(nameBlock)) return "@unknown";

  const handleLink =
    queryEl(nameBlock, SELECTORS.userLink) ?? queryEl(nameBlock, 'a[href^="/"]');
  const href = handleLink?.getAttribute("href");
  const fromHref = href ? parseHandleFromHref(href) : null;
  if (fromHref) return fromHref;

  const text = elementText(nameBlock);
  const atMatch = text.match(/@\w+/);
  return atMatch?.[0] ?? "@unknown";
}

export function extractText(article: HTMLElement | null | undefined): string {
  if (!isHtmlElement(article)) return "";

  const parts = queryAll(article, SELECTORS.tweetText)
    .filter(isHtmlElement)
    .map((el) => elementText(el))
    .filter((text) => text.length > 0);

  if (parts.length > 0) return parts.join("\n\n");
  return elementText(article).slice(0, 500);
}

export function isFixtureHost(): boolean {
  try {
    return location.hostname === "127.0.0.1" || location.hostname === "localhost";
  } catch {
    return false;
  }
}
