export const RATE_LIMIT = 40;
export const RATE_WINDOW_MS = 60_000;

export function pruneTimestamps(args: {
  timestamps: readonly number[];
  now: number;
  windowMs: number;
}): number[] {
  return args.timestamps.filter((stamp) => stamp >= args.now - args.windowMs);
}

export function isRateLimited(args: {
  timestamps: readonly number[];
  now: number;
  limit: number;
  windowMs: number;
}): boolean {
  return pruneTimestamps(args).length >= args.limit;
}
