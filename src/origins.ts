/** Origins allowed to send classify messages. Keep in sync with manifest matches. */
export const CLASSIFY_ORIGINS = new Set([
  "https://x.com",
  "https://twitter.com",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:18080",
]);

/** Local fixture servers only — never live TypeSafe calls from these. */
export const FIXTURE_ORIGINS = new Set([
  "http://127.0.0.1:8080",
  "http://127.0.0.1:18080",
]);

export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function isAllowedClassifyOrigin(origin: string | null): boolean {
  return origin !== null && CLASSIFY_ORIGINS.has(origin);
}

export function isFixtureOrigin(origin: string | null): boolean {
  return origin !== null && FIXTURE_ORIGINS.has(origin);
}

export function isExtensionPageUrl(
  url: string | undefined,
  extensionId: string,
): boolean {
  if (!url || !extensionId) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "chrome-extension:" && parsed.hostname === extensionId;
  } catch {
    return false;
  }
}
