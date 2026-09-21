// src/categories.ts
var DEFAULT_THRESHOLD = 0.75;
var DEFAULT_CATEGORIES = [
  {
    id: "rage_bait",
    name: "Rage bait",
    enabled: true,
    instructions: "The post is written to provoke outrage, dunking, or quote-tweet pile-ons more than to inform. Sarcasm that is still a real argument is false."
  },
  {
    id: "crypto_promo",
    name: "Crypto promo",
    enabled: true,
    instructions: "The post promotes a token, exchange, wallet, or 'next 100x' scheme. News reporting about crypto policy is false."
  },
  {
    id: "unsolicited_politics",
    name: "Unsolicited politics",
    enabled: true,
    instructions: "The post is a partisan political argument or campaign message. Neutral news headlines are false."
  }
];
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
    categories: Array.isArray(stored.categories) ? stored.categories : DEFAULT_CATEGORIES,
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
