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
function renderCategories(categories) {
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
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  const stored = await chrome.storage.local.get([
    "apiKey",
    "threshold",
    "categories",
    "debug",
    LAST_ERROR_KEY
  ]);
  const apiKey = inputEl("apiKey");
  const threshold = inputEl("threshold");
  const debug = inputEl("debug");
  if (apiKey) apiKey.value = typeof stored.apiKey === "string" ? stored.apiKey : "";
  if (threshold) {
    threshold.value = String(
      typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD
    );
  }
  if (debug) debug.checked = stored.debug === true;
  renderCategories(normalizeCategories(stored.categories));
  renderLastError(stored[LAST_ERROR_KEY]);
}
async function saveForm() {
  const apiKeyEl = inputEl("apiKey");
  const thresholdEl = inputEl("threshold");
  const debugEl = inputEl("debug");
  if (!apiKeyEl || !thresholdEl || !debugEl) return;
  const threshold = parseFloat(thresholdEl.value);
  const settings = {
    apiKey: apiKeyEl.value.trim(),
    threshold: Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD,
    categories: readCategories(),
    debug: debugEl.checked
  };
  await chrome.storage.local.set(settings);
  try {
    await chrome.runtime.sendMessage({ type: "clearCache" });
  } catch {
  }
  const status = elById("save-status");
  if (!status) return;
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2e3);
}
async function clearCache() {
  const status = elById("cache-status");
  try {
    const response = await chrome.runtime.sendMessage({ type: "clearCache" });
    const cleared = readClearedCount(response);
    if (status) {
      status.textContent = cleared === null ? "Cache clear sent." : `Cleared ${cleared} cached score(s).`;
    }
  } catch (err) {
    if (status) {
      status.textContent = err instanceof Error ? err.message : "Cache clear failed.";
    }
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
});
document.getElementById("clear-cache")?.addEventListener("click", () => void clearCache());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[LAST_ERROR_KEY]) return;
  renderLastError(changes[LAST_ERROR_KEY].newValue);
});
void loadForm();
//# sourceMappingURL=options.js.map
