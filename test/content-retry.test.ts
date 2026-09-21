import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("content script reliability", () => {
  it("retries classify failures and re-scans after settings changes", () => {
    const source = readFileSync(join(srcDir, "content.ts"), "utf8");
    expect(source).toMatch(/shouldRetry/);
    expect(source).toMatch(/scheduleRetry/);
    expect(source).toMatch(/rescanVisiblePosts/);
    expect(source).toMatch(/chrome\.runtime\.onMessage/);
    expect(source).not.toMatch(/chrome\.storage/);
    expect(source).toMatch(/filteringEnabled/);
    expect(source).toMatch(/restoreAllHidden/);
  });
});
