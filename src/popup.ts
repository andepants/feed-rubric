import { DEFAULT_CATEGORIES, DEFAULT_THRESHOLD } from "./categories.js";

async function init(): Promise<void> {
  const status = document.getElementById("status");
  if (!status) return;

  try {
    const stored = await chrome.storage.local.get([
      "hasApiKey",
      "enabled",
      "threshold",
      "categories",
    ]);
    const hasKey = stored.hasApiKey === true;
    const enabled = stored.enabled !== false;
    const threshold =
      typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD;
    const categories = Array.isArray(stored.categories)
      ? stored.categories
      : DEFAULT_CATEGORIES;
    const enabledCategories = categories.filter((c) => {
      return typeof c === "object" && c !== null && "enabled" in c && c.enabled === true;
    }).length;

    if (!enabled) {
      status.textContent = "Paused — all posts stay visible.";
    } else if (!hasKey) {
      status.textContent = "No API key — posts stay visible (fail open).";
    } else if (enabledCategories === 0) {
      status.textContent = "No categories enabled — nothing will hide.";
    } else {
      status.textContent = `${enabledCategories} categories · threshold ${threshold}`;
    }
  } catch {
    status.textContent = "Could not load settings. Open options to retry.";
  }

  document.getElementById("open-options")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

void init();
