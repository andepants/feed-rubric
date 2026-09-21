import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  webServer: {
    command: "python3 -m http.server 18080 --directory fixtures",
    url: "http://127.0.0.1:18080/timeline.html",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:18080",
  },
});
