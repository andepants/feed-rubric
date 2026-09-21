import { describe, expect, it } from "vitest";
import { cacheKey, settingsFingerprint } from "../src/cache-key.js";
import { DEFAULT_CATEGORIES, DEFAULT_THRESHOLD } from "../src/categories.js";
import { planClassify } from "../src/classify-plan.js";
import { failOpen } from "../src/score.js";
import { isRateLimited, pruneTimestamps, RATE_LIMIT } from "../src/rate-limit.js";

describe("planClassify", () => {
  const visible = failOpen();

  it("uses cache when present", () => {
    const plan = planClassify({
      cached: { hide: true, reasons: ["rage_bait"], scores: { rage_bait: 0.9 } },
      fixtureScores: { rage_bait: 0.1 },
      hasApiKey: true,
      rateLimited: true,
    });
    expect(plan.kind).toBe("cache");
  });

  it("uses fixture scores without an API key", () => {
    const plan = planClassify({
      cached: null,
      fixtureScores: { rage_bait: 0.92 },
      hasApiKey: false,
      rateLimited: false,
    });
    expect(plan).toEqual({ kind: "fixture", scores: { rage_bait: 0.92 } });
  });

  it("fail-opens when there is no API key", () => {
    const plan = planClassify({
      cached: null,
      fixtureScores: undefined,
      hasApiKey: false,
      rateLimited: false,
    });
    expect(plan).toEqual({ kind: "fail_open", error: "no_api_key" });
    expect(visible.hide).toBe(false);
  });

  it("fail-opens when rate limited", () => {
    const plan = planClassify({
      cached: null,
      fixtureScores: undefined,
      hasApiKey: true,
      rateLimited: true,
    });
    expect(plan).toEqual({ kind: "fail_open", error: "rate_limited" });
  });

  it("calls the API when key is present and under the cap", () => {
    const plan = planClassify({
      cached: null,
      fixtureScores: undefined,
      hasApiKey: true,
      rateLimited: false,
    });
    expect(plan).toEqual({ kind: "api" });
  });
});

describe("rate limit", () => {
  it("prunes timestamps outside the window and trips at 40/min", () => {
    const now = 60_000;
    const stale = pruneTimestamps({
      timestamps: [0, 1000, 50_000],
      now,
      windowMs: 60_000,
    });
    expect(stale).toEqual([0, 1000, 50_000]);

    const pruned = pruneTimestamps({
      timestamps: [0, 1000, 50_000],
      now: 61_500,
      windowMs: 60_000,
    });
    expect(pruned).toEqual([50_000]);

    const full = Array.from({ length: RATE_LIMIT }, (_, i) => now - i * 10);
    expect(
      isRateLimited({ timestamps: full, now, limit: RATE_LIMIT, windowMs: 60_000 }),
    ).toBe(true);
    expect(
      isRateLimited({
        timestamps: full.slice(1),
        now,
        limit: RATE_LIMIT,
        windowMs: 60_000,
      }),
    ).toBe(false);
  });
});

describe("settings fingerprint cache key", () => {
  it("changes when threshold or enabled instructions change", () => {
    const base = settingsFingerprint({
      threshold: DEFAULT_THRESHOLD,
      categories: DEFAULT_CATEGORIES,
    });
    const raised = settingsFingerprint({
      threshold: 0.9,
      categories: DEFAULT_CATEGORIES,
    });
    expect(raised).not.toBe(base);

    const rewritten = settingsFingerprint({
      threshold: DEFAULT_THRESHOLD,
      categories: DEFAULT_CATEGORIES.map((cat) =>
        cat.id === "rage_bait"
          ? { ...cat, instructions: "rewritten noul question?" }
          : cat,
      ),
    });
    expect(rewritten).not.toBe(base);

    expect(
      cacheKey({ platform: "x", postId: "1", fingerprint: base }),
    ).toContain(base);
  });
});
