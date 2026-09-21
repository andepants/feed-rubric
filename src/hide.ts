export const HIDE_ATTR = "data-feed-rubric-hide";

export function applyHideState(args: {
  article: HTMLElement;
  hide: boolean;
}): void {
  if (args.hide) {
    args.article.setAttribute(HIDE_ATTR, "true");
  } else {
    args.article.removeAttribute(HIDE_ATTR);
  }
}

export function isHidden(article: HTMLElement): boolean {
  return article.getAttribute(HIDE_ATTR) === "true";
}
