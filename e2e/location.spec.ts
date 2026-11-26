import { test, expect } from "@playwright/test";
test("current location waits for precision and shows accuracy", async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks: { success?: PositionCallback; cleared: boolean } = { cleared: false };
    Object.assign(window, { locationTest: callbacks });
    Object.defineProperty(navigator, "geolocation", { value: {
      watchPosition: (success: PositionCallback) => { callbacks.success = success; return 10; },
      clearWatch: () => { callbacks.cleared = true; },
    } });
  });
  await page.goto("/planner");
  await page.getByRole("button", { name: "Use my current location" }).click();
  await page.evaluate(() => {
    (window as any).locationTest.success({ coords: { latitude: 8.47, longitude: 124.63, accuracy: 3000 }, timestamp: Date.now() });
  });
  await expect(page.getByRole("combobox", { name: "Origin", exact: true })).toHaveValue("");
  await expect(page.getByText("Waiting for a precise location", { exact: false })).toBeVisible();
  await page.evaluate(() => {
    (window as any).locationTest.success({ coords: { latitude: 8.47357, longitude: 124.608488, accuracy: 12 }, timestamp: Date.now() });
  });
  await expect(page.getByRole("combobox", { name: "Origin", exact: true })).toHaveValue("My current location");
  await expect(page.getByText("reported accuracy within 12 m", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as any).locationTest.cleared)).toBe(true);
});
