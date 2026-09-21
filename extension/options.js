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

// src/options.ts
function renderCategories(categories) {
  const container = document.getElementById("categories");
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
      <textarea class="cat-instructions" rows="3">${escapeHtml(cat.instructions)}</textarea>
    `;
    container.appendChild(row);
  }
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function readCategories() {
  const rows = document.querySelectorAll(".category-row");
  return Array.from(rows).map((row) => {
    const id = row.dataset.id;
    const base = DEFAULT_CATEGORIES.find((c) => c.id === id);
    return {
      id,
      name: base?.name ?? id,
      enabled: row.querySelector(".cat-enabled").checked,
      instructions: row.querySelector(".cat-instructions").value.trim()
    };
  });
}
async function loadForm() {
  const stored = await chrome.storage.local.get([
    "apiKey",
    "threshold",
    "categories",
    "debug"
  ]);
  document.getElementById("apiKey").value = typeof stored.apiKey === "string" ? stored.apiKey : "";
  document.getElementById("threshold").value = String(
    typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD
  );
  document.getElementById("debug").checked = stored.debug === true;
  renderCategories(
    Array.isArray(stored.categories) ? stored.categories : DEFAULT_CATEGORIES
  );
}
async function saveForm() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const threshold = parseFloat(
    document.getElementById("threshold").value
  );
  const debug = document.getElementById("debug").checked;
  const categories = readCategories();
  const settings = {
    apiKey,
    threshold: Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD,
    categories,
    debug
  };
  await chrome.storage.local.set(settings);
  const status = document.getElementById("save-status");
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2e3);
}
document.getElementById("save")?.addEventListener("click", () => void saveForm());
document.getElementById("reset-categories")?.addEventListener("click", () => {
  renderCategories(DEFAULT_CATEGORIES);
});
void loadForm();
//# sourceMappingURL=options.js.map
