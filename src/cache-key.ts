import type { Category } from "./categories.js";

export function djb2Hex(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function settingsFingerprint(args: {
  threshold: number;
  categories: Category[];
}): string {
  const enabled = args.categories
    .filter((cat) => cat.enabled)
    .map((cat) => ({
      id: cat.id,
      instructions: cat.instructions,
      true: cat.criteria.true,
      false: cat.criteria.false,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return djb2Hex(JSON.stringify({ threshold: args.threshold, enabled }));
}

export function cacheKey(args: {
  platform: string;
  postId: string;
  fingerprint: string;
}): string {
  return `${args.platform}:${args.postId}:${args.fingerprint}`;
}
