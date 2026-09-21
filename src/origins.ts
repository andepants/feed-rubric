/** Origins allowed to send classify messages. Keep in sync with manifest matches. */
export const LIVE_ORIGINS = ["https://x.com", "https://twitter.com"] as const;

/** Loopback fixture server (`npm run fixture` / Playwright). Never a TypeSafe caller. */
export const FIXTURE_ORIGIN = "http://127.0.0.1:18080";

export const CLASSIFY_ORIGINS = new Set<string>([...LIVE_ORIGINS, FIXTURE_ORIGIN]);

export const FIXTURE_ORIGINS = new Set<string>([FIXTURE_ORIGIN]);

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
