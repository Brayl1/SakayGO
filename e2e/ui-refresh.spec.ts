import { test, expect } from "@playwright/test";

test("refreshed home and navigation work across viewports", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sakay na. Know your jeepney." })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".hero-route-badge")).toContainText("76");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.local-admin/ui-${info.project.name}.png`, fullPage: true, animations: "disabled" });
  const menu = page.locator(".menu-toggle");
  if (await menu.isVisible()) {
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "How It Works" })).toBeInViewport();
    const menuBottom = await page.locator(".mobile-navigation p").boundingBox();
    const lastLink = await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "How It Works" }).boundingBox();
    expect(menuBottom!.y).toBeGreaterThanOrEqual(lastLink!.y + lastLink!.height);
    await page.screenshot({ path: `.local-admin/ui-menu-${info.project.name}.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
    await menu.click();
    await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Explore Routes" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
  } else {
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Explore Routes" }).click();
  }
  await expect(page.getByRole("link", { name: "Explore Routes", exact: true }).filter({ visible: true })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (await menu.isVisible()) await menu.click();
  await page.goto("/planner");
  await expect(page.getByRole("combobox", { name: "Origin", exact: true })).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.screenshot({ path: `.local-admin/ui-planner-${info.project.name}.png`, fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});
