export interface Category {
  id: string;
  name: string;
  instructions: string;
  enabled: boolean;
}

export const DEFAULT_THRESHOLD = 0.75;

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "rage_bait",
    name: "Rage bait",
    enabled: true,
    instructions:
      "The post is written to provoke outrage, dunking, or quote-tweet pile-ons more than to inform. Sarcasm that is still a real argument is false.",
  },
  {
    id: "crypto_promo",
    name: "Crypto promo",
    enabled: true,
    instructions:
      "The post promotes a token, exchange, wallet, or 'next 100x' scheme. News reporting about crypto policy is false.",
  },
  {
    id: "unsolicited_politics",
    name: "Unsolicited politics",
    enabled: true,
    instructions:
      "The post is a partisan political argument or campaign message. Neutral news headlines are false.",
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
        ? stored.threshold
        : DEFAULT_THRESHOLD,
    categories: Array.isArray(stored.categories)
      ? stored.categories
      : DEFAULT_CATEGORIES,
    debug: stored.debug === true,
  };
}
