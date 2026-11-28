import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { defaultSettings } from "../shared/catalog";

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/catalog", route => route.fulfill({ json: { ...JSON.parse(readFileSync("public/data/catalog.json", "utf8")), settings: defaultSettings, revision: 0, updatedAt: "2026-11-28" } }));
  await page.route("**/api/session", route => route.fulfill({ json: { admin: false, signedIn: false } }));
});

for (const width of [360, 390, 430]) {
  test(`mobile ride layouts and existing interactions at ${width}px`, async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".hero-route-badge")).toContainText("76 routes");
    await noOverflow(page);
    const tabs = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(tabs).toBeVisible();
    await expect(page.locator(".kasakay-launcher")).toBeHidden();
    await expect(page.locator(".mobile-home-tiles a")).toHaveCount(3);
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await tabs.getByRole("button", { name: "Open KaSakay assistant" }).click();
    await expect(page.getByRole("dialog", { name: "KaSakay" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tabs.getByRole("button")).toBeFocused();
    await page.locator("#home-from").fill("8.47357, 124.608488");
    await page.locator("#home-to").fill("8.475241, 124.630949");
    await page.getByRole("button", { name: "Find my sakay" }).click();
    await expect(page).toHaveURL(/planner/);
    await expect(page.locator("#trip-origin")).toHaveValue("8.47357, 124.608488");
    await expect(page.locator("#trip-destination")).toHaveValue("8.475241, 124.630949");
    await page.locator("#trip-destination").blur();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Asa ta karon?" })).toBeVisible();
    await noOverflow(page);
    const cta = page.getByRole("button", { name: "Find My Jeepney", exact: true });
    expect((await cta.boundingBox())!.y + (await cta.boundingBox())!.height).toBeLessThanOrEqual((await tabs.boundingBox())!.y);
    await page.screenshot({ path: `test-results/mobile-restyle/planner-${width}.png` });
    await page.route("**/api/places?*", route => route.fulfill({ json: { places: [{ label: "Test starting place", point: [8.47357,124.608488], source: "Test fixture" }] } }));
    await page.locator("#trip-origin").fill("Test starting");
    await page.getByRole("option", { name: /Test starting place/ }).click();
    await page.locator("#trip-destination").fill("8.475242, 124.630949");
    await page.getByRole("button", { name: "Swap origin and destination" }).click();
    await expect(page.locator("#trip-destination")).toHaveValue("Test starting place");
    await page.getByRole("button", { name: "Swap origin and destination" }).click();
    await page.getByLabel("Passenger type").selectOption("student");
    await page.getByRole("button", { name: "Fewer transfers", exact: true }).click();
    await expect(page.getByRole("button", { name: "Fewer transfers", exact: true })).toHaveAttribute("aria-pressed", "true");
    await cta.click();
    await expect(page.getByRole("heading", { name: "Here's your next sakay." })).toBeVisible();
    await noOverflow(page);
    await page.getByRole("button", { name: "Edit trip", exact: true }).click();
    await page.getByText("More options", { exact: true }).click();
    await expect(page.getByLabel("Walking limit per end")).toBeVisible();
    await page.getByText("Map information", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Choose origin on map", exact: true }).click();
    await expect(page.getByRole("status").filter({hasText:"Tap map to set origin"})).toBeVisible();
    await page.locator(".leaflet-container").click({position:{x:width/2,y:165}});
    await expect(page.locator("#trip-origin")).not.toHaveValue("Test starting place");
    await page.getByRole("button", { name: "Centrio Mall", exact: false }).click();
    await expect(page.locator("#trip-destination")).toHaveValue("Centrio Mall");
    await page.locator("#trip-destination").blur();
    await page.setViewportSize({width,height:500});
    await page.locator("#trip-origin").focus();
    await noOverflow(page);
    expect(await page.locator(".trip-panel").evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
    await cta.scrollIntoViewIfNeeded();
    expect((await cta.boundingBox())!.y + (await cta.boundingBox())!.height).toBeLessThanOrEqual((await tabs.boundingBox())!.y);
    await page.screenshot({path:`test-results/mobile-restyle/short-viewport-${width}.png`});
    await page.setViewportSize({width,height:844});
    await page.locator("#trip-origin").focus();
    await page.evaluate(() => {
      if (!window.visualViewport) throw new Error("Visual viewport unavailable");
      Object.defineProperty(window.visualViewport,"height",{configurable:true,value:460});
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--ride-keyboard-inset"))).toBe("384px");
    expect((await tabs.boundingBox())!.y + (await tabs.boundingBox())!.height).toBeLessThanOrEqual(460);
    await cta.scrollIntoViewIfNeeded();
    expect((await cta.boundingBox())!.y + (await cta.boundingBox())!.height).toBeLessThanOrEqual((await tabs.boundingBox())!.y);
    await page.locator("#trip-origin").blur();
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({latitude:8.47357,longitude:124.608488,accuracy:10});
    await page.getByRole("button",{name:"Use my current location on map",exact:true}).click();
    await expect(page.locator("#trip-origin")).toHaveValue("My current location");
  });
}

test("desktop layout is identical with mobile additions removed", async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  for (const width of [769, 1280, 1440]) {
    await page.setViewportSize({width,height:1000});
    for (const path of ["/", "/planner"]) {
      await page.goto(path);
      await expect(page.locator(path === "/" ? ".hero-route-badge" : ".leaflet-container")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1000);
      await expect(page.locator(".mobile-bottom-tabs")).toBeHidden();
      const options = {fullPage:true,animations:"disabled" as const,mask:path==="/planner"?[page.locator(".trip-map")]:[]};
      const withMobile = await page.screenshot(options);
      await page.evaluate(() => {
        document.querySelectorAll(".mobile-only").forEach(e=>e.remove());
        document.querySelectorAll<HTMLStyleElement>('style[data-vite-dev-id$="mobile-ride.css"]').forEach(e=>e.remove());
      });
      expect((await page.screenshot(options)).equals(withMobile)).toBe(true);
      await noOverflow(page);
    }
  }
});
