import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5174",
    headless: true,
    launchOptions: { channel: "msedge" },
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "node scripts/preview-worker.mjs",
        env: { SAKAYGO_LOCAL_ADMIN: "1" },
        url: "http://127.0.0.1:5174",
        reuseExistingServer: true,
      },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
