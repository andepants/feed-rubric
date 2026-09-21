/** Caps for untrusted post payloads sent to the service worker / TypeSafe. */
export const MAX_POST_TEXT_LENGTH = 4_000;
export const MAX_AUTHOR_LENGTH = 64;
export const MAX_POST_ID_LENGTH = 64;
export const MAX_ERROR_LENGTH = 280;
export const MAX_CATEGORY_FIELD_LENGTH = 2_000;
export const CLASSIFY_TIMEOUT_MS = 15_000;

const POST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function clampText(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max);
}

export function isValidPostId(postId: string): boolean {
  return POST_ID_RE.test(postId);
}

export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return 0.75;
  return Math.min(1, Math.max(0, value));
}

export function sanitizeErrorMessage(message: string): string {
  const redacted = message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bts_[A-Za-z0-9._-]+/gi, "[redacted]");
  return clampText(redacted, MAX_ERROR_LENGTH);
}
