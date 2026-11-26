import { test, expect } from "@playwright/test";
test("imported route search, both directions and details", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.stack || e.message));
  await page.goto("/network");
  await expect(page.locator(".catalog-route-card")).toHaveCount(12);
  await page.getByLabel("From area").fill("Balulang");
  await page.getByLabel("To area").fill("Cogon");
  await page.getByRole("button", { name: "Find matching routes" }).click();
  await expect(page.locator(".catalog-route-card")).toHaveCount(2);
  await page.locator(".catalog-route-card").first().click();
  await expect(page.locator(".selected-heading")).toContainText("Balulang");
  await page.getByRole("button", { name: "Outbound", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Outbound", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".leaflet-overlay-pane path")).not.toHaveCount(0);
  await page.getByRole("link", { name: "Route details", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recorded geometry" }),
  ).toBeVisible();
  await expect(page.locator(".catalog-detail")).toContainText(
    "Fare: Unavailable",
  );
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("directory filtering and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");
  await expect(page.locator(".imported-card")).toHaveCount(12);
  await page
    .getByRole("textbox", { name: "Search imported routes" })
    .fill("Baikingon");
  // Baikingon matches its own route and two Iponan routes' source roads.
  await expect(page.locator(".imported-card")).toHaveCount(3);
  await page
    .getByRole("textbox", { name: "Search imported routes" })
    .fill("no-such-route");
  await expect(
    page.getByRole("heading", { name: "No routes to display" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("owner saves a website announcement and restores it", async ({ page }) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Keep SakayGo moving." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Website settings", exact: true })
    .click();
  const field = page.getByLabel("Public announcement");
  const original = await field.inputValue();
  await field.fill("Test advisory — route data is under review.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".admin-success")).toContainText(
    "Changes are now live",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Website settings", exact: true })
    .click();
  await expect(field).toHaveValue(
    "Test advisory — route data is under review.",
  );
  await expect(page.locator(".site-announcement")).toContainText(
    "Test advisory",
  );
  await field.fill(original);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".admin-success")).toContainText(
    "Changes are now live",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("retired demo URL redirects to the production planner", async ({ page }) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/planner$/);
  await expect(page.getByRole("button", { name: "Find my jeepney" })).toBeVisible();
  await expect(page.locator('a[href="/demo"]')).toHaveCount(0);
  await expect(page.getByText("Try geometric test A", { exact: true })).toHaveCount(0);
});
