import {
  DEFAULT_CATEGORIES,
  DEFAULT_THRESHOLD,
  normalizeCategories,
  parseCategory,
  type Category,
  type Settings,
} from "./categories.js";
import { formatLastError, LAST_ERROR_KEY, parseLastError } from "./last-error.js";
import { clampThreshold } from "./limits.js";
import type { CacheClearedResponse } from "./types.js";
import { isRecord } from "./guard.js";

function inputEl(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

function elById(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setStatus(id: "save-status" | "cache-status", text: string, isError = false): void {
  const node = elById(id);
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("is-error", isError);
}

function appendField(
  row: HTMLElement,
  labelText: string,
  className: string,
  value: string,
): void {
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  const textarea = document.createElement("textarea");
  textarea.className = className;
  textarea.rows = 2;
  textarea.value = value;
  row.append(label, textarea);
}

function renderCategories(categories: Category[]): void {
  const container = elById("categories");
  if (!container) return;
  container.replaceChildren();

  if (categories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No categories. Reset to restore the defaults, then Save.";
    container.append(empty);
    return;
  }

  for (const cat of categories) {
    const row = document.createElement("div");
    row.className = "category-row";
    row.dataset.id = cat.id;

    const header = document.createElement("div");
    header.className = "category-header";
    const headerLabel = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "cat-enabled";
    checkbox.checked = cat.enabled;
    const name = document.createElement("strong");
    name.textContent = cat.name;
    const id = document.createElement("span");
    id.className = "cat-id";
    id.textContent = cat.id;
    headerLabel.append(checkbox, name, id);
    header.append(headerLabel);
    row.append(header);

    appendField(row, "Instructions (noul question)", "cat-instructions", cat.instructions);
    appendField(row, "True", "cat-true", cat.criteria.true);
    appendField(row, "False", "cat-false", cat.criteria.false);
    container.append(row);
  }
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
  try {
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
  } catch (err) {
    renderCategories([]);
    setStatus(
      "save-status",
      err instanceof Error ? err.message : "Could not load settings.",
      true,
    );
  }
}

async function saveForm(): Promise<void> {
  const apiKeyEl = inputEl("apiKey");
  const thresholdEl = inputEl("threshold");
  const debugEl = inputEl("debug");
  if (!apiKeyEl || !thresholdEl || !debugEl) {
    setStatus("save-status", "Settings form is missing a field.", true);
    return;
  }

  const threshold = clampThreshold(parseFloat(thresholdEl.value));
  const settings: Settings = {
    apiKey: apiKeyEl.value.trim(),
    threshold,
    categories: readCategories(),
    debug: debugEl.checked,
  };
  thresholdEl.value = String(threshold);

  try {
    await chrome.storage.local.set(settings);
  } catch (err) {
    setStatus(
      "save-status",
      err instanceof Error ? err.message : "Save failed.",
      true,
    );
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: "clearCache" });
  } catch {
    // Fail open: fingerprint in the cache key still isolates new settings.
  }

  setStatus("save-status", "Saved.");
  window.setTimeout(() => {
    const status = elById("save-status");
    if (status && status.textContent === "Saved.") {
      status.textContent = "";
      status.classList.remove("is-error");
    }
  }, 2000);
}

async function clearCache(): Promise<void> {
  try {
    const response: unknown = await chrome.runtime.sendMessage({ type: "clearCache" });
    const cleared = readClearedCount(response);
    setStatus(
      "cache-status",
      cleared === null ? "Cache clear sent." : `Cleared ${cleared} cached score(s).`,
    );
  } catch (err) {
    setStatus(
      "cache-status",
      err instanceof Error ? err.message : "Cache clear failed.",
      true,
    );
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
  setStatus("save-status", "Defaults restored — click Save to persist.");
});
document.getElementById("clear-cache")?.addEventListener("click", () => void clearCache());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[LAST_ERROR_KEY]) return;
  renderLastError(changes[LAST_ERROR_KEY].newValue);
});

void loadForm();
