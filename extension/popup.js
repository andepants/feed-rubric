// src/guard.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/categories.ts
var DEFAULT_THRESHOLD = 0.75;
var FALLBACK_CRITERIA = {
  true: "The condition described in the instructions applies to this post.",
  false: "The condition does not apply."
};
var DEFAULT_CATEGORIES = [
  {
    id: "rage_bait",
    name: "Rage bait",
    enabled: true,
    instructions: "Is this post written to provoke outrage or a pile-on rather than to inform or argue?",
    criteria: {
      true: "The post's primary purpose is to inflame: it baits dunks or quote-tweets, treats an enemy as irredeemable without a claim, or tells the audience to get furious.",
      false: "The post informs, reports, jokes without targeting a pile-on, or makes a real argument (including sarcastic or sharp ones) that someone could agree or disagree with."
    }
  },
  {
    id: "crypto_promo",
    name: "Crypto promo",
    enabled: true,
    instructions: "Does this post promote a crypto token, exchange, wallet, or get-rich scheme?",
    criteria: {
      true: "The post shills a token or ticker, exchange, wallet, 'next 100x', pump group, or similar buy/sign-up pitch.",
      false: "The post is not a promo: policy or market news, education without a buy pitch, or unrelated content."
    }
  },
  {
    id: "unsolicited_politics",
    name: "Unsolicited politics",
    enabled: true,
    instructions: "Is this post a partisan political argument or campaign message?",
    criteria: {
      true: "The post campaigns for or against a party or candidate, frames the other side as the enemy, or urges votes, donations, or shares for a political cause.",
      false: "The post is a neutral news headline or report, civic or process information without a side, or not about electoral or partisan politics."
    }
  }
];
function parseCriteria(value, fallback = FALLBACK_CRITERIA) {
  if (!isRecord(value)) return fallback;
  const trueText = value.true;
  const falseText = value.false;
  return {
    true: typeof trueText === "string" && trueText.trim().length > 0 ? trueText : fallback.true,
    false: typeof falseText === "string" && falseText.trim().length > 0 ? falseText : fallback.false
  };
}
function parseCategory(value) {
  if (!isRecord(value)) return null;
  const id = value.id;
  const name = value.name;
  const instructions = value.instructions;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof instructions !== "string") return null;
  const defaults = DEFAULT_CATEGORIES.find((cat) => cat.id === id);
  return {
    id,
    name,
    instructions,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    criteria: parseCriteria(value.criteria, defaults?.criteria ?? FALLBACK_CRITERIA)
  };
}
function normalizeCategories(value) {
  if (!Array.isArray(value)) return DEFAULT_CATEGORIES;
  const parsed = [];
  for (const item of value) {
    const cat = parseCategory(item);
    if (cat) parsed.push(cat);
  }
  return parsed.length > 0 ? parsed : DEFAULT_CATEGORIES;
}
async function loadSettings() {
  const stored = await chrome.storage.local.get([
    "apiKey",
    "threshold",
    "categories",
    "debug"
  ]);
  return {
    apiKey: typeof stored.apiKey === "string" ? stored.apiKey : "",
    threshold: typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD,
    categories: normalizeCategories(stored.categories),
    debug: stored.debug === true
  };
}

// src/popup.ts
async function init() {
  const settings = await loadSettings();
  const status = document.getElementById("status");
  const enabled = settings.categories.filter((c) => c.enabled).length;
  if (!settings.apiKey) {
    status.textContent = "No API key \u2014 posts stay visible (fail open).";
  } else {
    status.textContent = `${enabled} categories \xB7 threshold ${settings.threshold}`;
  }
  document.getElementById("open-options")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}
void init();
//# sourceMappingURL=popup.js.map
