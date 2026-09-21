import type { ClassifyResult } from "./types.js";

export type ClassifyPlan =
  | { kind: "cache"; result: ClassifyResult }
  | { kind: "fixture"; scores: Record<string, number> }
  | { kind: "fail_open"; error: "no_api_key" }
  | { kind: "fail_open"; error: "rate_limited" }
  | { kind: "fail_open"; error: "fixture_only" }
  | { kind: "fail_open"; error: "invalid_post" }
  | { kind: "api" };

export function planClassify(args: {
  cached: ClassifyResult | null;
  fixtureScores: Record<string, number> | undefined;
  allowFixture: boolean;
  allowApi: boolean;
  hasApiKey: boolean;
  rateLimited: boolean;
  validPost: boolean;
}): ClassifyPlan {
  if (!args.validPost) {
    return { kind: "fail_open", error: "invalid_post" };
  }
  if (args.cached) {
    return { kind: "cache", result: args.cached };
  }
  if (args.allowFixture && args.fixtureScores) {
    return { kind: "fixture", scores: args.fixtureScores };
  }
  if (!args.allowApi) {
    return { kind: "fail_open", error: "fixture_only" };
  }
  if (!args.hasApiKey) {
    return { kind: "fail_open", error: "no_api_key" };
  }
  if (args.rateLimited) {
    return { kind: "fail_open", error: "rate_limited" };
  }
  return { kind: "api" };
}
