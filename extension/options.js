// src/guard.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/limits.ts
var MAX_CATEGORY_FIELD_LENGTH = 2e3;
function clampText(value, max) {
  if (value.length <= max) return value;
  return value.slice(0, max);
}
function clampThreshold(value) {
  if (!Number.isFinite(value)) return 0.75;
  return Math.min(1, Math.max(0, value));
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
    true: typeof trueText === "string" && trueText.trim().length > 0 ? clampText(trueText, MAX_CATEGORY_FIELD_LENGTH) : fallback.true,
    false: typeof falseText === "string" && falseText.trim().length > 0 ? clampText(falseText, MAX_CATEGORY_FIELD_LENGTH) : fallback.false
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
    id: clampText(id, 64),
    name: clampText(name, 80),
    instructions: clampText(instructions, MAX_CATEGORY_FIELD_LENGTH),
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

// src/last-error.ts
var LAST_ERROR_KEY = "lastError";
function parseLastError(value) {
  if (!isRecord(value)) return null;
  const message = value.message;
  const at = value.at;
  if (typeof message !== "string" || message.length === 0) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  return { message, at };
}
function formatLastError(error) {
  if (!error) return "No errors recorded.";
  return `${new Date(error.at).toLocaleString()} \u2014 ${humanizeError(error.message)}`;
}
function humanizeError(message) {
  switch (message) {
    case "no_api_key":
      return "No TypeSafe API key \u2014 posts stay visible (fail open).";
    case "rate_limited":
      return "Rate limited (~40 calls/min) \u2014 posts stay visible (fail open).";
    case "fixture_only":
      return "Fixture host \u2014 live TypeSafe calls are disabled; posts stay visible without dry-run scores.";
    case "invalid_post":
      return "Ignored a malformed classify request (fail open).";
    case "untrusted_sender":
      return "Ignored a classify message from an unexpected origin (fail open).";
    default:
      return message;
  }
}

// src/options.ts
function inputEl(id) {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}
function elById(id) {
  return document.getElementById(id);
}
function setStatus(id, text, isError = false) {
  const node = elById(id);
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("is-error", isError);
}
function appendField(row, labelText, className, value) {
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  const textarea = document.createElement("textarea");
  textarea.className = className;
  textarea.rows = 2;
  textarea.value = value;
  row.append(label, textarea);
}
function renderCategories(categories) {
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
function readCategories() {
  const rows = document.querySelectorAll(".category-row");
  const parsed = [];
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
      instructions: instructionsEl instanceof HTMLTextAreaElement ? instructionsEl.value.trim() : "",
      criteria: {
        true: trueEl instanceof HTMLTextAreaElement ? trueEl.value.trim() : "",
        false: falseEl instanceof HTMLTextAreaElement ? falseEl.value.trim() : ""
      }
    });
    if (candidate) parsed.push(candidate);
  }
  return parsed.length > 0 ? parsed : DEFAULT_CATEGORIES;
}
function renderLastError(value) {
  const node = elById("last-error");
  if (!node) return;
  const error = parseLastError(value);
  node.textContent = formatLastError(error);
  node.classList.toggle("has-error", error !== null);
}
async function loadForm() {
  try {
    const stored = await chrome.storage.local.get([
      "apiKey",
      "enabled",
      "threshold",
      "categories",
      "debug",
      LAST_ERROR_KEY
    ]);
    const apiKey = inputEl("apiKey");
    const enabled = inputEl("enabled");
    const threshold = inputEl("threshold");
    const debug = inputEl("debug");
    if (apiKey) apiKey.value = typeof stored.apiKey === "string" ? stored.apiKey : "";
    if (enabled) enabled.checked = stored.enabled !== false;
    if (threshold) {
      threshold.value = String(
        typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD
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
      true
    );
  }
}
async function saveForm() {
  const apiKeyEl = inputEl("apiKey");
  const enabledEl = inputEl("enabled");
  const thresholdEl = inputEl("threshold");
  const debugEl = inputEl("debug");
  if (!apiKeyEl || !enabledEl || !thresholdEl || !debugEl) {
    setStatus("save-status", "Settings form is missing a field.", true);
    return;
  }
  const apiKey = apiKeyEl.value.trim();
  const threshold = clampThreshold(parseFloat(thresholdEl.value));
  const settings = {
    apiKey,
    hasApiKey: apiKey.length > 0,
    enabled: enabledEl.checked,
    threshold,
    categories: readCategories(),
    debug: debugEl.checked
  };
  thresholdEl.value = String(threshold);
  try {
    await chrome.storage.local.set(settings);
  } catch (err) {
    setStatus(
      "save-status",
      err instanceof Error ? err.message : "Save failed.",
      true
    );
    return;
  }
  try {
    await chrome.runtime.sendMessage({ type: "clearCache" });
  } catch {
  }
  setStatus("save-status", "Saved.");
  window.setTimeout(() => {
    const status = elById("save-status");
    if (status && status.textContent === "Saved.") {
      status.textContent = "";
      status.classList.remove("is-error");
    }
  }, 2e3);
}
async function clearCache() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "clearCache" });
    const cleared = readClearedCount(response);
    setStatus(
      "cache-status",
      cleared === null ? "Cache clear sent." : `Cleared ${cleared} cached score(s).`
    );
  } catch (err) {
    setStatus(
      "cache-status",
      err instanceof Error ? err.message : "Cache clear failed.",
      true
    );
  }
}
function readClearedCount(response) {
  if (!isRecord(response)) return null;
  if (response.type !== "cacheCleared") return null;
  if (typeof response.cleared !== "number") return null;
  const typed = {
    type: "cacheCleared",
    cleared: response.cleared
  };
  return typed.cleared;
}
document.getElementById("save")?.addEventListener("click", () => void saveForm());
document.getElementById("reset-categories")?.addEventListener("click", () => {
  renderCategories(DEFAULT_CATEGORIES);
  setStatus("save-status", "Defaults restored \u2014 click Save to persist.");
});
document.getElementById("clear-cache")?.addEventListener("click", () => void clearCache());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[LAST_ERROR_KEY]) return;
  renderLastError(changes[LAST_ERROR_KEY].newValue);
});
void loadForm();
