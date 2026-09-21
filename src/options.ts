import {
  DEFAULT_CATEGORIES,
  DEFAULT_THRESHOLD,
  normalizeCategories,
  parseCategory,
  type Category,
  type Settings,
} from "./categories.js";
import { formatLastError, LAST_ERROR_KEY, parseLastError } from "./last-error.js";
import type { CacheClearedResponse } from "./types.js";
import { isRecord } from "./guard.js";

function inputEl(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

function elById(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function renderCategories(categories: Category[]): void {
  const container = elById("categories");
  if (!container) return;
  container.innerHTML = "";

  for (const cat of categories) {
    const row = document.createElement("div");
    row.className = "category-row";
    row.dataset.id = cat.id;

    row.innerHTML = `
      <div class="category-header">
        <label>
          <input type="checkbox" class="cat-enabled" ${cat.enabled ? "checked" : ""} />
          <strong>${escapeHtml(cat.name)}</strong>
          <span class="cat-id">${escapeHtml(cat.id)}</span>
        </label>
      </div>
      <label class="field-label">Instructions (noul question)</label>
      <textarea class="cat-instructions" rows="2">${escapeHtml(cat.instructions)}</textarea>
      <label class="field-label">True</label>
      <textarea class="cat-true" rows="2">${escapeHtml(cat.criteria.true)}</textarea>
      <label class="field-label">False</label>
      <textarea class="cat-false" rows="2">${escapeHtml(cat.criteria.false)}</textarea>
    `;

    container.appendChild(row);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readCategories(): Category[] {
  const rows = document.querySelectorAll<HTMLElement>(".category-row");
  const parsed: Category[] = [];

  for (const row of rows) {
    const id = row.dataset.id;
    if (!id) continue;
    const base = DEFAULT_CATEGORIES.find((c) => c.id === id);
    const enabledEl = row.querySelector(".cat-enabled");
    const instructionsEl = row.querySelector(".cat-instructions");
    const trueEl = row.querySelector(".cat-true");
    const falseEl = row.querySelector(".cat-false");

    const candidate = parseCategory({
      id,
      name: base?.name ?? id,
      enabled: enabledEl instanceof HTMLInputElement ? enabledEl.checked : true,
      instructions:
        instructionsEl instanceof HTMLTextAreaElement ? instructionsEl.value.trim() : "",
      criteria: {
        true: trueEl instanceof HTMLTextAreaElement ? trueEl.value.trim() : "",
        false: falseEl instanceof HTMLTextAreaElement ? falseEl.value.trim() : "",
      },
    });
    if (candidate) parsed.push(candidate);
  }

  return parsed.length > 0 ? parsed : DEFAULT_CATEGORIES;
}

function renderLastError(value: unknown): void {
  const node = elById("last-error");
  if (!node) return;
  const error = parseLastError(value);
  node.textContent = formatLastError(error);
  node.classList.toggle("has-error", error !== null);
}

async function loadForm(): Promise<void> {
  const stored = await chrome.storage.local.get([
    "apiKey",
    "threshold",
    "categories",
    "debug",
    LAST_ERROR_KEY,
  ]);

  const apiKey = inputEl("apiKey");
  const threshold = inputEl("threshold");
  const debug = inputEl("debug");
  if (apiKey) apiKey.value = typeof stored.apiKey === "string" ? stored.apiKey : "";
  if (threshold) {
    threshold.value = String(
      typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD,
    );
  }
  if (debug) debug.checked = stored.debug === true;

  renderCategories(normalizeCategories(stored.categories));
  renderLastError(stored[LAST_ERROR_KEY]);
}

async function saveForm(): Promise<void> {
  const apiKeyEl = inputEl("apiKey");
  const thresholdEl = inputEl("threshold");
  const debugEl = inputEl("debug");
  if (!apiKeyEl || !thresholdEl || !debugEl) return;

  const threshold = parseFloat(thresholdEl.value);
  const settings: Settings = {
    apiKey: apiKeyEl.value.trim(),
    threshold: Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD,
    categories: readCategories(),
    debug: debugEl.checked,
  };

  await chrome.storage.local.set(settings);

  const status = elById("save-status");
  if (!status) return;
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

async function clearCache(): Promise<void> {
  const status = elById("cache-status");
  try {
    const response: unknown = await chrome.runtime.sendMessage({ type: "clearCache" });
    const cleared = readClearedCount(response);
    if (status) {
      status.textContent =
        cleared === null ? "Cache clear sent." : `Cleared ${cleared} cached score(s).`;
    }
  } catch (err) {
    if (status) {
      status.textContent = err instanceof Error ? err.message : "Cache clear failed.";
    }
  }
}

function readClearedCount(response: unknown): number | null {
  if (!isRecord(response)) return null;
  if (response.type !== "cacheCleared") return null;
  if (typeof response.cleared !== "number") return null;
  const typed: CacheClearedResponse = {
    type: "cacheCleared",
    cleared: response.cleared,
  };
  return typed.cleared;
}

document.getElementById("save")?.addEventListener("click", () => void saveForm());
document.getElementById("reset-categories")?.addEventListener("click", () => {
  renderCategories(DEFAULT_CATEGORIES);
});
document.getElementById("clear-cache")?.addEventListener("click", () => void clearCache());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[LAST_ERROR_KEY]) return;
  renderLastError(changes[LAST_ERROR_KEY].newValue);
});

void loadForm();
