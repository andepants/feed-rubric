import type { ClassifyResult } from "./types.js";

export type ClassifyPlan =
  | { kind: "cache"; result: ClassifyResult }
  | { kind: "fixture"; scores: Record<string, number> }
  | { kind: "fail_open"; error: "no_api_key" }
  | { kind: "fail_open"; error: "rate_limited" }
  | { kind: "api" };

export function planClassify(args: {
  cached: ClassifyResult | null;
  fixtureScores: Record<string, number> | undefined;
  hasApiKey: boolean;
  rateLimited: boolean;
}): ClassifyPlan {
  if (args.cached) {
    return { kind: "cache", result: args.cached };
  }
  if (args.fixtureScores) {
    return { kind: "fixture", scores: args.fixtureScores };
  }
  if (!args.hasApiKey) {
    return { kind: "fail_open", error: "no_api_key" };
  }
  if (args.rateLimited) {
    return { kind: "fail_open", error: "rate_limited" };
  }
  return { kind: "api" };
}
