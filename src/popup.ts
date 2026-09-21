import { DEFAULT_CATEGORIES, DEFAULT_THRESHOLD } from "./categories.js";

async function init(): Promise<void> {
  const status = document.getElementById("status");
  if (!status) return;

  try {
    const stored = await chrome.storage.local.get(["apiKey", "threshold", "categories"]);
    const hasKey = typeof stored.apiKey === "string" && stored.apiKey.length > 0;
    const threshold =
      typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD;
    const categories = Array.isArray(stored.categories)
      ? stored.categories
      : DEFAULT_CATEGORIES;
    const enabled = categories.filter((c) => {
      return typeof c === "object" && c !== null && "enabled" in c && c.enabled === true;
    }).length;

    if (!hasKey) {
      status.textContent = "No API key — posts stay visible (fail open).";
    } else if (enabled === 0) {
      status.textContent = "No categories enabled — nothing will hide.";
    } else {
      status.textContent = `${enabled} categories · threshold ${threshold}`;
    }
  } catch {
    status.textContent = "Could not load settings. Open options to retry.";
  }

  document.getElementById("open-options")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

void init();
