import { describe, expect, it } from "vitest";
import { cacheKey, settingsFingerprint } from "../src/cache-key.js";
import { DEFAULT_CATEGORIES, DEFAULT_THRESHOLD } from "../src/categories.js";
import { planClassify } from "../src/classify-plan.js";
import { failOpen } from "../src/score.js";
import { isRateLimited, pruneTimestamps, RATE_LIMIT } from "../src/rate-limit.js";

const base = {
  cached: null as null,
  fixtureScores: undefined as Record<string, number> | undefined,
  allowFixture: false,
  allowApi: true,
  enabled: true,
  hasApiKey: true,
  rateLimited: false,
  validPost: true,
};

describe("planClassify", () => {
  const visible = failOpen();

  it("uses cache when present", () => {
    const plan = planClassify({
      ...base,
      cached: { hide: true, reasons: ["rage_bait"], scores: { rage_bait: 0.9 } },
      fixtureScores: { rage_bait: 0.1 },
      allowFixture: true,
      rateLimited: true,
    });
    expect(plan.kind).toBe("cache");
  });

  it("uses fixture scores without an API key when the sender is a fixture host", () => {
    const plan = planClassify({
      ...base,
      fixtureScores: { rage_bait: 0.92 },
      allowFixture: true,
      allowApi: false,
      hasApiKey: false,
    });
    expect(plan).toEqual({ kind: "fixture", scores: { rage_bait: 0.92 } });
  });

  it("ignores spoofed fixture scores from a live host (cache-poisoning guard)", () => {
    const plan = planClassify({
      ...base,
      fixtureScores: { rage_bait: 0.99 },
      allowFixture: false,
      allowApi: true,
      hasApiKey: true,
    });
    expect(plan).toEqual({ kind: "api" });
  });

  it("never calls the API from a fixture host", () => {
    const plan = planClassify({
      ...base,
      allowFixture: true,
      allowApi: false,
      hasApiKey: true,
    });
    expect(plan).toEqual({ kind: "fail_open", error: "fixture_only" });
  });

  it("fail-opens when there is no API key", () => {
    const plan = planClassify({
      ...base,
      hasApiKey: false,
    });
    expect(plan).toEqual({ kind: "fail_open", error: "no_api_key" });
    expect(visible.hide).toBe(false);
  });

  it("fail-opens when rate limited", () => {
    const plan = planClassify({
      ...base,
      rateLimited: true,
    });
    expect(plan).toEqual({ kind: "fail_open", error: "rate_limited" });
  });

  it("fail-opens malformed post ids", () => {
    const plan = planClassify({
      ...base,
      validPost: false,
    });
    expect(plan).toEqual({ kind: "fail_open", error: "invalid_post" });
  });

  it("fail-opens when filtering is paused", () => {
    const plan = planClassify({
      ...base,
      enabled: false,
    });
    expect(plan).toEqual({ kind: "fail_open", error: "disabled" });
  });

  it("calls the API when key is present and under the cap", () => {
    const plan = planClassify(base);
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
    const fingerprint = settingsFingerprint({
      threshold: DEFAULT_THRESHOLD,
      categories: DEFAULT_CATEGORIES,
    });
    const raised = settingsFingerprint({
      threshold: 0.9,
      categories: DEFAULT_CATEGORIES,
    });
    expect(raised).not.toBe(fingerprint);

    const rewritten = settingsFingerprint({
      threshold: DEFAULT_THRESHOLD,
      categories: DEFAULT_CATEGORIES.map((cat) =>
        cat.id === "rage_bait"
          ? { ...cat, instructions: "rewritten noul question?" }
          : cat,
      ),
    });
    expect(rewritten).not.toBe(fingerprint);

    expect(
      cacheKey({ platform: "x", postId: "1", fingerprint }),
    ).toContain(fingerprint);
  });
});
