import { test, expect } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`KaSakay loader respects ${reducedMotion} and ends with the request`, async ({page}) => {
    await page.emulateMedia({reducedMotion});
    let release = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/kasakay", async route => {
      await pending;
      await route.fulfill({json:{text:"Use the existing planner to choose your places.",source:"KaSakay"}});
    });
    try {
      await page.goto("/kasakay");
      await page.getByRole("button",{name:"Help me plan a trip",exact:true}).click();
      const logo = page.locator(".kasakay-loader .kasakay-loading-logo");
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute("src","/images/kasakay.png");
      await expect(page.getByRole("status")).toContainText("checking your request");
      const before = await logo.evaluate(e=>getComputedStyle(e).transform);
      if(reducedMotion === "reduce") {
        await expect(logo).toHaveCSS("transform","none");
      } else {
        await expect.poll(()=>logo.evaluate(e=>getComputedStyle(e).transform)).not.toBe(before);
      }
      release();
      await expect(logo).toHaveCount(0);
      await expect(page.getByRole("log")).toContainText("Use the existing planner");
      await expect(page.getByLabel("Your message to KaSakay")).toBeFocused();
    } finally { release(); }
  });
}
