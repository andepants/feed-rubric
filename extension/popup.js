// src/categories.ts
var DEFAULT_THRESHOLD = 0.75;
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

// src/popup.ts
async function init() {
  const status = document.getElementById("status");
  if (!status) return;
  try {
    const stored = await chrome.storage.local.get(["apiKey", "threshold", "categories"]);
    const hasKey = typeof stored.apiKey === "string" && stored.apiKey.length > 0;
    const threshold = typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD;
    const categories = Array.isArray(stored.categories) ? stored.categories : DEFAULT_CATEGORIES;
    const enabled = categories.filter((c) => {
      return typeof c === "object" && c !== null && "enabled" in c && c.enabled === true;
    }).length;
    if (!hasKey) {
      status.textContent = "No API key \u2014 posts stay visible (fail open).";
    } else if (enabled === 0) {
      status.textContent = "No categories enabled \u2014 nothing will hide.";
    } else {
      status.textContent = `${enabled} categories \xB7 threshold ${threshold}`;
    }
  } catch {
    status.textContent = "Could not load settings. Open options to retry.";
  }
  document.getElementById("open-options")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}
void init();
//# sourceMappingURL=popup.js.map
