import { readFileSync } from "node:fs";
import { defaultSettings } from "../shared/catalog";
import { test, expect } from "@playwright/test";
const origin = { label: "Centrio Mall", point: [8.485, 124.65], source: "Test search" };
const destination = { label: "Carmen Market", point: [8.48, 124.635], source: "Test search" };
test.beforeEach(async ({ page }) => {
  await page.route("**/api/catalog", (route) => route.fulfill({ json: { ...JSON.parse(readFileSync("public/data/catalog.json", "utf8")), settings: defaultSettings, revision: 0, updatedAt: "2026-11-28" } }));
  await page.route("**/api/session", (route) => route.fulfill({ json: { admin: false, signedIn: false } }));
  await page.route("**/api/fare-policies/current", (route) => route.fulfill({ json: { policies: [] } }));
});
test("navigation, privacy, unavailable fallback, retry, clear and layout", async ({ page }, info) => {
  await page.route("**/api/kasakay", (route) => route.fulfill({ status: 503, json: { error: "KaSakay AI is temporarily unavailable." } }));
  await page.goto("/");
  if (info.project.name.includes("mobile")) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Ask KaSakay", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Ask KaSakay" })).toBeVisible();
  await expect(page.getByText("Your message and recent conversation are sent to Google Gemini.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Help me plan a trip" }).click();
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByRole("link", { name: "Guided trip planning", exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Retry request" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Clear conversation" }).click();
  await expect(page.getByRole("status")).toContainText("Conversation cleared.");
  await expect(page.getByLabel("Your message to KaSakay")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/kasakay-" + info.project.name + ".png", fullPage: true });
});
test("confirms ambiguous places and preserves both planner endpoints", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/kasakay", async (route) => {
    calls++;
    if (calls === 1) await route.fulfill({ json: { text: "Choose both matching places.", source: "SakayGo place search", choices: { token: "mock", origins: [origin, { ...origin, label: "Another Centrio" }], destinations: [destination] } } });
    else {
      expect(route.request().postDataJSON().choice).toEqual({ token: "mock", origin: 0, destination: 0 });
      await route.fulfill({ json: { text: "No suitable route was found.", source: "SakayGo planner data", trips: [], origin, destination, passenger: "student" } });
    }
  });
  await page.goto("/kasakay");
  await page.getByLabel("Your message to KaSakay").fill("Unsa akong sakyan gikan Centrio padulong Carmen Market?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Confirm places and find routes" })).toBeDisabled();
  await page.getByLabel("Starting place", { exact: true }).selectOption("0");
  await page.getByLabel("Destination", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Confirm places and find routes" }).click();
  await page.getByRole("link", { name: "Open these places in the planner" }).click();
  await expect(page).toHaveURL(/\/planner$/);
  await expect(page.getByRole("combobox").nth(0)).toHaveValue("Centrio Mall");
  await expect(page.getByRole("combobox").nth(1)).toHaveValue("Carmen Market");
  await expect(page.getByRole("button", { name: "Find My Jeepney" })).toBeEnabled();
});
test("loading can be cancelled and cleared without a stale answer", async ({ page }) => {
  await page.route("**/api/kasakay", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: { text: "Old answer", source: "Test" } }).catch(() => {});
  });
  await page.goto("/kasakay");
  await page.getByRole("button", { name: "Help me plan a trip" }).click();
  await expect(page.getByRole("status")).toContainText("checking");
  await page.getByRole("button", { name: "Clear conversation" }).click();
  await expect(page.getByRole("status")).toHaveText("Conversation cleared.");
  await expect(page.getByText("Old answer", { exact: true })).toHaveCount(0);
});

test("keyboard sending, route cards and fare controls use application data", async ({ page, request }, info) => {
  const response = await request.post("/api/trips/plan", { data: { origin: [8.449972,124.622735], destination: [8.471176,124.643082], preferences: { passenger: "student" } } });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.trips.length).toBeGreaterThan(1);
  await page.route("**/api/kasakay", (route) => route.fulfill({ json: {
    text: "The planner found these approximate routes.", source: "AI-arranged explanation · SakayGo planner data",
    trips: result.trips.slice(0,2), origin, destination, passenger: "student",
  } }));
  await page.goto("/kasakay");
  const message = page.getByLabel("Your message to KaSakay");
  await message.fill("Plan a trip");
  await message.press("Tab");
  await expect(page.getByRole("button", { name: "Send message" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".kasakay-route")).toHaveCount(2);
  await expect(page.locator(".kasakay-route").first()).toContainText("Conditional national reference");
  for (const button of await page.getByRole("button", { name: "View Fare Breakdown" }).all()) {
    const id = await button.getAttribute("aria-controls");
    await button.click();
    expect(await page.locator('[id="' + id + '"]').count()).toBe(1);
  }
  const routeLink = page.locator(".kasakay-route a").first();
  expect(await routeLink.getAttribute("href")).toBe("/routes/" + result.trips[0].legs[0].routeId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/kasakay-routes-" + info.project.name + ".png", fullPage: true });
});
test("heading and landing hero remain unobstructed", async ({ page }, info) => {
  await page.goto("/kasakay");
  const heading = await page.getByRole("heading", { name: "Ask KaSakay" }).boundingBox();
  const chat = await page.locator(".kasakay-chat").boundingBox();
  expect(heading!.y + heading!.height).toBeLessThan(chat!.y);
  await page.goto("/");
  await expect(page.locator(".hero-route-badge")).toBeVisible();
  await expect(page.locator(".hero-route-badge")).toContainText("76");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/kasakay-home-" + info.project.name + ".png", fullPage: true, animations: "disabled" });
});
