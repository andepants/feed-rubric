import {
  DEFAULT_CATEGORIES,
  DEFAULT_THRESHOLD,
  type Category,
  type Settings,
} from "./categories.js";

function renderCategories(categories: Category[]): void {
  const container = document.getElementById("categories")!;
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readCategories(): Category[] {
  const rows = document.querySelectorAll<HTMLElement>(".category-row");
  return Array.from(rows).map((row) => {
    const id = row.dataset.id!;
    const base = DEFAULT_CATEGORIES.find((c) => c.id === id);
    return {
      id,
      name: base?.name ?? id,
      enabled: row.querySelector<HTMLInputElement>(".cat-enabled")!.checked,
      instructions: row.querySelector<HTMLTextAreaElement>(".cat-instructions")!.value.trim(),
    };
  });
}

async function loadForm(): Promise<void> {
  const stored = await chrome.storage.local.get([
    "apiKey",
    "threshold",
    "categories",
    "debug",
  ]);

  (document.getElementById("apiKey") as HTMLInputElement).value =
    typeof stored.apiKey === "string" ? stored.apiKey : "";
  (document.getElementById("threshold") as HTMLInputElement).value = String(
    typeof stored.threshold === "number" ? stored.threshold : DEFAULT_THRESHOLD,
  );
  (document.getElementById("debug") as HTMLInputElement).checked =
    stored.debug === true;

  renderCategories(
    Array.isArray(stored.categories) ? stored.categories : DEFAULT_CATEGORIES,
  );
}

async function saveForm(): Promise<void> {
  const apiKey = (document.getElementById("apiKey") as HTMLInputElement).value.trim();
  const threshold = parseFloat(
    (document.getElementById("threshold") as HTMLInputElement).value,
  );
  const debug = (document.getElementById("debug") as HTMLInputElement).checked;
  const categories = readCategories();

  const settings: Settings = {
    apiKey,
    threshold: Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD,
    categories,
    debug,
  };

  await chrome.storage.local.set(settings);

  const status = document.getElementById("save-status")!;
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

document.getElementById("save")?.addEventListener("click", () => void saveForm());
document.getElementById("reset-categories")?.addEventListener("click", () => {
  renderCategories(DEFAULT_CATEGORIES);
});

void loadForm();
