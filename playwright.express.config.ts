import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  // Express intentionally has no authenticated owner session. The existing
  // owner-write test belongs to the separate trusted/local-owner preview.
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
