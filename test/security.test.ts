import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createPlaceholder, PLACEHOLDER_CLASS, UNDO_CLASS } from "../src/hide.js";
import { isValidPostId, sanitizeErrorMessage } from "../src/limits.js";
import {
  isAllowedClassifyOrigin,
  isExtensionPageUrl,
  isFixtureOrigin,
  originOf,
} from "../src/origins.js";
import {
  isExtensionPageSender,
  isFixtureSender,
  isTrustedClassifySender,
} from "../src/messaging.js";
import { findTweetArticles } from "../src/sites/x.js";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("origin allowlists", () => {
  it("allows x.com and the fixture ports only", () => {
    expect(isAllowedClassifyOrigin(originOf("https://x.com/home"))).toBe(true);
    expect(isAllowedClassifyOrigin(originOf("https://twitter.com/i/status/1"))).toBe(
      true,
    );
    expect(isAllowedClassifyOrigin(originOf("http://127.0.0.1:8080/timeline.html"))).toBe(
      true,
    );
    expect(isAllowedClassifyOrigin(originOf("http://127.0.0.1:18080/timeline.html"))).toBe(
      true,
    );
    expect(isAllowedClassifyOrigin(originOf("http://127.0.0.1:3000/"))).toBe(false);
    expect(isAllowedClassifyOrigin(originOf("http://localhost:8080/"))).toBe(false);
    expect(isAllowedClassifyOrigin(originOf("https://evil.example/"))).toBe(false);
    expect(isAllowedClassifyOrigin(originOf("https://x.com.evil.example/"))).toBe(false);
  });

  it("treats only loopback fixture ports as fixture hosts", () => {
    expect(isFixtureOrigin(originOf("http://127.0.0.1:8080/timeline.html"))).toBe(true);
    expect(isFixtureOrigin(originOf("https://x.com/home"))).toBe(false);
    expect(isFixtureOrigin(originOf("http://localhost:8080/"))).toBe(false);
  });

  it("accepts chrome-extension options/popup URLs for cache-clear", () => {
    const id = "abcdefghijklmnopqrstuvwxyzabcdef";
    expect(
      isExtensionPageUrl(`chrome-extension://${id}/options.html`, id),
    ).toBe(true);
    expect(
      isExtensionPageUrl(`chrome-extension://${id}/popup.html`, id),
    ).toBe(true);
    expect(
      isExtensionPageUrl(`chrome-extension://other/options.html`, id),
    ).toBe(false);
    expect(isExtensionPageUrl("https://x.com/options.html", id)).toBe(false);
    expect(
      isExtensionPageSender(
        { id, url: `chrome-extension://${id}/options.html` },
        id,
      ),
    ).toBe(true);
    expect(
      isExtensionPageSender({ url: "https://x.com/home" }, id),
    ).toBe(false);
  });

  it("derives fixture vs live from sender URL, not the message body", () => {
    const id = "abcdefghijklmnopqrstuvwxyzabcdef";
    expect(
      isTrustedClassifySender({ id, url: "https://x.com/home" }, id),
    ).toBe(true);
    expect(
      isFixtureSender({ id, url: "https://x.com/home" }),
    ).toBe(false);
    expect(
      isFixtureSender({ id, url: "http://127.0.0.1:18080/timeline.html" }),
    ).toBe(true);
    expect(
      isTrustedClassifySender({ id, url: "https://evil.example/" }, id),
    ).toBe(false);
  });
});

describe("error and id sanitization", () => {
  it("redacts bearer tokens and TypeSafe-looking keys", () => {
    expect(
      sanitizeErrorMessage("Jev API 401 Bearer ts_live_secret_value extra"),
    ).toContain("[redacted]");
    expect(sanitizeErrorMessage("Bearer ts_live_secret_value")).not.toMatch(/ts_live/);
  });

  it("accepts X snowflake ids and rejects junk cache keys", () => {
    expect(isValidPostId("1000000000000000001")).toBe(true);
    expect(isValidPostId("../foo")).toBe(false);
    expect(isValidPostId("a".repeat(65))).toBe(false);
    expect(isValidPostId("")).toBe(false);
  });
});

describe("placeholder XSS", () => {
  it("puts untrusted reason text in textContent, not HTML", () => {
    const document = new JSDOM(
      `<article data-testid="tweet"><div data-testid="tweetText">keep</div></article>`,
    ).window.document;
    const article = findTweetArticles(document)[0];
    expect(article).toBeDefined();
    if (!article) return;

    const payload = `<img src="x" onerror="alert(1)">`;
    const row = createPlaceholder({
      document,
      reasons: [payload],
      debugDetail: `<script>alert(1)</script>`,
    });
    article.prepend(row);

    expect(row.querySelector("img")).toBeNull();
    expect(row.querySelector("script")).toBeNull();
    expect(row.innerHTML).not.toMatch(/onerror/i);
    expect(row.textContent).toContain(payload);
    expect(article.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toContain(
      payload,
    );
    expect(article.querySelector(`.${UNDO_CLASS}`)?.textContent).toBe("Undo");
  });
});

describe("content script storage isolation", () => {
  it("does not call chrome.storage (API key lives in the service worker)", () => {
    const source = readFileSync(join(srcDir, "content.ts"), "utf8");
    expect(source).not.toMatch(/chrome\.storage/);
    expect(source).not.toMatch(/apiKey/);
    expect(source).not.toMatch(/postMessage/);
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/innerHTML/);
  });
});
