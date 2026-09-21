import { isRecord } from "./guard.js";
import { clampText, clampThreshold, MAX_CATEGORY_FIELD_LENGTH } from "./limits.js";

export interface NoulCriteria {
  true: string;
  false: string;
}

export interface Category {
  id: string;
  name: string;
  instructions: string;
  criteria: NoulCriteria;
  enabled: boolean;
}

export const DEFAULT_THRESHOLD = 0.75;

export const FALLBACK_CRITERIA: NoulCriteria = {
  true: "The condition described in the instructions applies to this post.",
  false: "The condition does not apply.",
};

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "rage_bait",
    name: "Rage bait",
    enabled: true,
    instructions:
      "Is this post written to provoke outrage or a pile-on rather than to inform or argue?",
    criteria: {
      true:
        "The post's primary purpose is to inflame: it baits dunks or quote-tweets, treats an enemy as irredeemable without a claim, or tells the audience to get furious.",
      false:
        "The post informs, reports, jokes without targeting a pile-on, or makes a real argument (including sarcastic or sharp ones) that someone could agree or disagree with.",
    },
  },
  {
    id: "crypto_promo",
    name: "Crypto promo",
    enabled: true,
    instructions:
      "Does this post promote a crypto token, exchange, wallet, or get-rich scheme?",
    criteria: {
      true:
        "The post shills a token or ticker, exchange, wallet, 'next 100x', pump group, or similar buy/sign-up pitch.",
      false:
        "The post is not a promo: policy or market news, education without a buy pitch, or unrelated content.",
    },
  },
  {
    id: "unsolicited_politics",
    name: "Unsolicited politics",
    enabled: true,
    instructions:
      "Is this post a partisan political argument or campaign message?",
    criteria: {
      true:
        "The post campaigns for or against a party or candidate, frames the other side as the enemy, or urges votes, donations, or shares for a political cause.",
      false:
        "The post is a neutral news headline or report, civic or process information without a side, or not about electoral or partisan politics.",
    },
  },
];

export interface Settings {
  apiKey: string;
  threshold: number;
  categories: Category[];
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  threshold: DEFAULT_THRESHOLD,
  categories: DEFAULT_CATEGORIES,
  debug: false,
};

export function parseCriteria(
  value: unknown,
  fallback: NoulCriteria = FALLBACK_CRITERIA,
): NoulCriteria {
  if (!isRecord(value)) return fallback;
  const trueText = value.true;
  const falseText = value.false;
  return {
    true:
      typeof trueText === "string" && trueText.trim().length > 0
        ? clampText(trueText, MAX_CATEGORY_FIELD_LENGTH)
        : fallback.true,
    false:
      typeof falseText === "string" && falseText.trim().length > 0
        ? clampText(falseText, MAX_CATEGORY_FIELD_LENGTH)
        : fallback.false,
  };
}

export function parseCategory(value: unknown): Category | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const name = value.name;
  const instructions = value.instructions;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof instructions !== "string") return null;

  const defaults = DEFAULT_CATEGORIES.find((cat) => cat.id === id);
  return {
    id: clampText(id, 64),
    name: clampText(name, 80),
    instructions: clampText(instructions, MAX_CATEGORY_FIELD_LENGTH),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    criteria: parseCriteria(value.criteria, defaults?.criteria ?? FALLBACK_CRITERIA),
  };
}

export function normalizeCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) return DEFAULT_CATEGORIES;
  const parsed: Category[] = [];
  for (const item of value) {
    const cat = parseCategory(item);
    if (cat) parsed.push(cat);
  }
  return parsed.length > 0 ? parsed : DEFAULT_CATEGORIES;
}

export function enabledCategoryIds(categories: Category[]): Set<string> {
  return new Set(categories.filter((cat) => cat.enabled).map((cat) => cat.id));
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get([
    "apiKey",
    "threshold",
    "categories",
    "debug",
  ]);

  return {
    apiKey: typeof stored.apiKey === "string" ? stored.apiKey : "",
    threshold:
      typeof stored.threshold === "number"
        ? clampThreshold(stored.threshold)
        : DEFAULT_THRESHOLD,
    categories: normalizeCategories(stored.categories),
    debug: stored.debug === true,
  };
}
