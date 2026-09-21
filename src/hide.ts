export const HIDE_ATTR = "data-feed-rubric-hide";
export const PLACEHOLDER_CLASS = "feed-rubric-placeholder";
export const UNDO_CLASS = "feed-rubric-undo";

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

export function placeholderSummary(reasons: string[]): string {
  const label = reasons.length > 0 ? reasons.join(", ") : "rubric";
  return `Hidden · ${label}`;
}

export function createPlaceholder(args: {
  document: Document;
  reasons: string[];
  debugDetail?: string;
}): HTMLElement {
  const row = args.document.createElement("div");
  row.className = PLACEHOLDER_CLASS;

  const text = args.document.createElement("span");
  const summary = placeholderSummary(args.reasons);
  text.textContent = args.debugDetail ? `${summary} · ${args.debugDetail}` : summary;

  const undo = args.document.createElement("button");
  undo.type = "button";
  undo.className = UNDO_CLASS;
  undo.textContent = "Undo";

  row.append(text, undo);
  return row;
}

export function removePlaceholder(article: HTMLElement): void {
  const nodes = article.querySelectorAll(`.${PLACEHOLDER_CLASS}`);
  for (const node of nodes) {
    node.remove();
  }
}
