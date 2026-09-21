export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isHtmlElement(node: unknown): node is HTMLElement {
  if (typeof node !== "object" || node === null) return false;
  if (!("nodeType" in node) || node.nodeType !== 1) return false;
  if (!("setAttribute" in node) || typeof node.setAttribute !== "function") {
    return false;
  }
  return true;
}
