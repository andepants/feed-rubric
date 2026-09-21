import { expect, test as base, chromium, type BrowserContext } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = join(repoRoot, "extension");

export const test = base.extend<{
  context: BrowserContext;
}>({
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), "feed-rubric-pw-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // Full Chromium (not headless shell) is required for MV3 extensions.
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    if (context.serviceWorkers().length === 0) {
      await context.waitForEvent("serviceworker", { timeout: 15_000 });
    }
    await use(context);
    await context.close();
  },
});

test("unpacked extension hides fixture tweets 1–3 with Undo, no X login", async ({
  context,
}, testInfo) => {
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:18080/timeline.html");
  await expect(page.locator('[data-feed-rubric-hide="true"]')).toHaveCount(3, {
    timeout: 15_000,
  });

  const first = page.locator('article[data-testid="tweet"]').first();
  await expect(first.locator(".feed-rubric-undo")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("fixture_undo_placeholders.png"),
    fullPage: true,
  });
  await first.locator(".feed-rubric-undo").click();
  await expect(first).not.toHaveAttribute("data-feed-rubric-hide", "true");
  await expect(page.locator('[data-feed-rubric-hide="true"]')).toHaveCount(2);
});

test("options page shows noul criteria, last error, and cache clear", async ({
  context,
}, testInfo) => {
  const [worker] = context.serviceWorkers();
  expect(worker).toBeTruthy();
  if (!worker) return;
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator("#last-error")).toHaveText("No errors recorded.");
  await expect(page.locator("#clear-cache")).toBeVisible();
  await expect(page.locator(".cat-true")).toHaveCount(3);
  await expect(page.locator(".cat-false")).toHaveCount(3);
  await page.screenshot({
    path: testInfo.outputPath("options_runtime.png"),
    fullPage: true,
  });
});

