import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  // This suite runs without an administrator key. The owner-write test uses
  // the separate trusted/local-owner preview.
  grepInvert: /owner saves a website announcement/,
  use: { ...base.use, baseURL: "http://127.0.0.1:5173" },
  webServer: [
    { command: "node scripts/run-server.cjs server/index", url: "http://127.0.0.1:3001/api/health", reuseExistingServer: true },
    { command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --configLoader runner", url: "http://127.0.0.1:5173", reuseExistingServer: true },
  ],
  projects: [
    { name: "express-desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "express-mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
