/**
 * x.com / twitter.com DOM adapter.
 * Selectors will break; keep them isolated here.
 */

export const PLATFORM = "x";

export const SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  userLink: 'a[href^="/"][role="link"]',
} as const;

export function findTweetArticles(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.tweet));
}

export function extractPostId(article: HTMLElement): string | null {
  const link = article.querySelector<HTMLAnchorElement>(
    'a[href*="/status/"] time',
  )?.closest("a");
  const href = link?.getAttribute("href") ?? "";
  const match = href.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

export function extractAuthor(article: HTMLElement): string {
  const nameBlock = article.querySelector(SELECTORS.userName);
  const handleLink = nameBlock?.querySelector<HTMLAnchorElement>(
    'a[href^="/"]',
  );
  const handle = handleLink?.getAttribute("href")?.replace(/^\//, "");
  if (handle && !handle.includes("/")) {
    return `@${handle}`;
  }
  const text = nameBlock?.textContent?.trim() ?? "";
  const atMatch = text.match(/@\w+/);
  return atMatch?.[0] ?? "@unknown";
}

export function extractText(article: HTMLElement): string {
  const parts = Array.from(
    article.querySelectorAll<HTMLElement>(SELECTORS.tweetText),
  ).map((el) => el.innerText.trim());
  return parts.filter(Boolean).join("\n\n") || article.innerText.slice(0, 500);
}

export function isFixtureHost(): boolean {
  return location.hostname === "127.0.0.1" || location.hostname === "localhost";
}
