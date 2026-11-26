import { test, expect } from "@playwright/test";
test.beforeAll(async ({ request }, info) => {
  if (!info.project.name.startsWith("express-")) return;
  test.setTimeout(90000);
  // Desktop and mobile share one loopback client IP. Honor the actual server
  // quota between projects instead of disabling protection for browser tests.
  const response = await request.get("/api/health");
  if (response.status() === 429) {
    const retry = Number(response.headers()["retry-after"]);
    if (!Number.isFinite(retry) || retry < 0 || retry > 60)
      throw new Error("Unexpected Retry-After from the local API");
    let remaining = retry * 1000 + 300;
    while (remaining > 0) {
      const duration = Math.min(remaining, 30000);
      await new Promise((resolve) => setTimeout(resolve, duration));
      remaining -= duration;
    }
    expect((await request.get("/api/health")).status()).toBe(200);
  } else expect(response.status()).toBe(200);
});
test.beforeEach(async ({}, info) => {
  test.skip(!info.project.name.startsWith("express-"), "Run with playwright.express.config.ts");
});
test("Vite proxy serves both contracts and never accepts spoofed admin identity", async ({ request, page }) => {
  const session = await request.get("/api/session", { headers: { "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "local@localhost" } });
  expect(session.status()).toBe(200);
  expect(await session.json()).toEqual({ admin: false, signedIn: false });
  for (const path of ["/api/health", "/api/catalog", "/api/fare-policies/current", "/api/dataset", "/api/routes"])
    expect((await request.get(path)).status(), path).toBe(200);
  expect((await request.get("/api/dataset?demo=true")).status()).toBe(410);
  const plan = await request.post("/api/plan", { data: { from: "ustp", to: "divisoria", demo: true } });
  expect(plan.status()).toBe(410);
  const verified = await request.post("/api/plan", { data: { from: "ustp", to: "divisoria", demo: false } });
  expect(verified.status()).toBe(200);
  expect((await verified.json()).mode).toBe("verified");
  expect((await request.get("/api/admin/state")).status()).toBe(403);
  await page.goto("/planner");
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
});
test("failed session and fare endpoints are visible rather than treated as empty data", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.route("**/api/fare-policies/current", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.goto("/planner");
  await expect(page.getByText("Account status could not load.", { exact: false })).toBeVisible();
  await expect(page.getByText("Fare policies could not load.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
});
