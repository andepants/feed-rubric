import { loadSettings } from "./categories.js";

async function init(): Promise<void> {
  const settings = await loadSettings();
  const status = document.getElementById("status")!;
  const enabled = settings.categories.filter((c) => c.enabled).length;

  if (!settings.apiKey) {
    status.textContent = "No API key — posts stay visible (fail open).";
  } else {
    status.textContent = `${enabled} categories · threshold ${settings.threshold}`;
  }

  document.getElementById("open-options")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

void init();
