import { defineConfig } from "@playwright/test";

// Tests get their own port and never reuse a running server, so a dev server left
// open elsewhere can never stand in for this one. E2E_PORT moves it.
const port = Number(process.env.E2E_PORT ?? 4193);
const BASE = `http://127.0.0.1:${port}`;
const preview = `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: "list",
  use: {
    baseURL: BASE,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // The production build is what ships, so the tests run against it.
    command: process.env.CI ? preview : `npm run build && ${preview}`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
