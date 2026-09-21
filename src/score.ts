import { isRecord } from "./guard.js";
import { isConfidentYes } from "./jev.js";
import type { ClassifyResult } from "./types.js";

export function parseScoreMap(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;

  const scores: Record<string, number> = {};
  for (const [id, noul] of Object.entries(value)) {
    if (typeof noul !== "number" || !Number.isFinite(noul)) {
      return undefined;
    }
    scores[id] = noul;
  }

  return Object.keys(scores).length > 0 ? scores : undefined;
}

export function parseFixtureScores(
  raw: string | undefined,
): Record<string, number> | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parseScoreMap(parsed);
  } catch {
    return undefined;
  }
}

export function evaluateScores(args: {
  scores: Record<string, number>;
  enabledIds: ReadonlySet<string>;
  threshold: number;
}): ClassifyResult {
  const reasons: string[] = [];
  let hide = false;

  for (const [id, noul] of Object.entries(args.scores)) {
    if (!args.enabledIds.has(id)) continue;
    if (noul >= args.threshold && isConfidentYes(noul)) {
      hide = true;
      reasons.push(id);
    }
  }

  return { hide, reasons, scores: args.scores };
}

export function failOpen(error?: string): ClassifyResult {
  return { hide: false, reasons: [], scores: {}, error };
}
