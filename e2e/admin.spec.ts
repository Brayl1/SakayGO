import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const base = JSON.parse(readFileSync("public/data/catalog.json", "utf8"));
test("admin adds data with clear validation, preserves road lines, and discards new drafts", async ({
  page,
}) => {
  let state = {
    routes: base.routes,
    settings: {
      headline: "Planner",
      description: "",
      announcement: "",
      maintenance: false,
    },
    revision: 0,
    updatedAt: "",
  };
  await page.route("**/api/admin/state", async (route) => {
    if (route.request().method() === "PUT")
      state = {
        ...route.request().postDataJSON(),
        revision: state.revision + 1,
      };
    await route.fulfill({
      json: state,
      headers: { etag: String(state.revision) },
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Add route", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Fill in from, to, source",
  );
  await page
    .getByLabel("Route name", { exact: true })
    .fill("New regression route");
  await page.getByLabel("From area").fill("Origin");
  await page.getByLabel("To area").fill("Destination");
  await page.getByLabel("Source reference").fill("Field survey");
  const roads = page.getByLabel("Road names (one per line)");
  await roads.fill("First road");
  await roads.press("End");
  await roads.press("Enter");
  await roads.pressSequentially("Second road");
  await expect(roads).toHaveValue("First road\nSecond road");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Upload directional geometry",
  );
  await page
    .locator('input[type="file"]')
    .last()
    .setInputFiles({
      name: "geometry.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          inbound: [
            [8.48, 124.65],
            [8.49, 124.65],
          ],
        }),
      ),
    });
  await page.getByRole("button", { name: "Make visible" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".admin-success")).toContainText(
    "Saved revision 1",
  );
  expect(state.routes[0].name).toBe("New regression route");
  expect(state.routes[0].roads).toEqual(["First road", "Second road"]);
  await page.getByRole("button", { name: "Add route", exact: true }).click();
  await page.getByRole("button", { name: "Discard draft" }).click();
  await expect(page.getByLabel("Route name", { exact: true })).toHaveValue(
    "New regression route",
  );
});
test("access key unlocks administration and sign out clears it", async ({
  page,
}) => {
  await page.route("**/api/session", async (route) => {
    const admin = route.request().headers().authorization === "Bearer test-key";
    await route.fulfill({ json: { admin, signedIn: admin } });
  });
  await page.route("**/api/admin/state", async (route) => {
    if (route.request().headers().authorization !== "Bearer test-key")
      return route.fulfill({
        status: 403,
        json: { auth: "access-key", error: "Enter your access key." },
      });
    await route.fulfill({
      json: {
        routes: base.routes,
        settings: {
          headline: "Planner",
          description: "",
          announcement: "",
          maintenance: false,
        },
        revision: 0,
        updatedAt: "",
      },
      headers: { etag: "initial" },
    });
  });
  await page.goto("/admin");
  await page.getByLabel("Administrator access key").fill("wrong");
  await page.getByRole("button", { name: "Unlock administration" }).click();
  await expect(page.getByRole("alert")).toContainText("not accepted");
  await page.getByLabel("Administrator access key").fill("test-key");
  await page.getByRole("button", { name: "Unlock administration" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep SakayGo moving." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Administrator access key")).toBeVisible();
});
