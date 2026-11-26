import { test, expect } from "@playwright/test";
const from = [8.47357, 124.608488],
  to = [8.475241, 124.630949];
async function fillTrip(page: any) {
  await page
    .getByRole("combobox", { name: "Origin", exact: true })
    .fill(from.join(", "));
  await page
    .getByRole("combobox", { name: "Destination", exact: true })
    .fill(to.join(", "));
}
test("welcome → trip → animated route → alternatives → edit and reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Less guessing. More going." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Plan a trip", exact: true }).click();
  await expect(page).toHaveURL(/planner/);
  await fillTrip(page);
  let posts = 0;
  await page.route("**/api/trips/plan", async (route) => {
    posts++;
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 200));
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Find My Jeepney", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finding your best jeepney route…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Here's your next sakay." }),
  ).toBeVisible();
  expect(posts).toBe(1);
  await expect(page.locator(".prominent-fare")).toContainText(
    "Conditional national reference",
  );
  await expect(page.locator(".recommended-ride")).toContainText(
    "Signboard code not verified",
  );
  await expect(page.locator(".trip-map")).toHaveAttribute(
    "data-animation-state",
    "Playing route preview",
  );
  const marker = page.locator(".jeepney-preview-marker");
  await expect(marker).toHaveCount(1);
  const first = await marker.getAttribute("data-progress");
  await expect
    .poll(async () => Number(await marker.getAttribute("data-progress")))
    .toBeGreaterThan(Number(first));
  await expect(marker).toHaveAttribute("data-progress", "1");
  await expect(page.locator(".animated-ride")).not.toHaveCount(0);
  await page.getByRole("button", { name: "View Fare Breakdown" }).click();
  await expect(page.locator("#fare-breakdown")).toContainText(
    "Supplied rate source",
  );
  await page.getByRole("button", { name: "View Full Directions" }).click();
  await expect(page.locator(".trip-steps")).toContainText(
    "approximate boarding area",
  );
  await page.getByRole("button", { name: /Alternative Routes/ }).click();
  const cards = page.locator(".route-alternatives .route-card");
  await expect(cards).toHaveCount(6);
  await cards.last().click();
  await expect(cards.last()).toHaveAttribute("aria-pressed", "true");
  await expect(marker).toHaveCount(1);
  await page
    .getByRole("button", { name: "Replay Route Animation", exact: true })
    .click();
  await expect(page.locator(".trip-map")).toHaveAttribute(
    "data-animation-state",
    "Playing route preview",
  );
  await expect(marker).toHaveAttribute("data-progress", "1");
  await page.getByRole("button", { name: "Edit trip", exact: true }).click();
  await expect(marker).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Origin", exact: true }),
  ).toHaveValue(from.join(", "));
  await page
    .getByRole("button", { name: "Swap origin and destination" })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Destination", exact: true }),
  ).toHaveValue(from.join(", "));
  await page
    .getByRole("button", { name: "Find My Jeepney", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Here's your next sakay." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan Another Trip" }).click();
  await expect(
    page.getByRole("combobox", { name: "Origin", exact: true }),
  ).toHaveValue("");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("place search keyboard selection, provider recovery and map picking", async ({
  page,
}) => {
  await page.route("**/api/places?**", (r) =>
    r.fulfill({
      status: 502,
      json: {
        error: "Place provider temporarily unavailable. Choose map points.",
      },
    }),
  );
  await page.goto("/planner");
  const input = page.getByRole("combobox", { name: "Origin", exact: true });
  await input.fill("Carmen");
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.unroute("**/api/places?**");
  await page.route("**/api/places?**", (r) =>
    r.fulfill({
      json: {
        places: [
          {
            label: "Mock provider result — test only",
            point: [8.48, 124.637],
            source: "Mock geocoder test",
          },
        ],
      },
    }),
  );
  await input.fill("Carmen Market");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("Mock provider result — test only");
  await input.fill("Changed query");
  await expect(input).toHaveValue("Changed query");
  await page.getByRole("button", { name: "Choose destination on map" }).click();
  await page
    .locator(".trip-map .leaflet-container")
    .click({ position: { x: 150, y: 160 } });
  await expect(
    page.getByRole("combobox", { name: "Destination", exact: true }),
  ).toHaveValue(/^8\./);
  await page.getByRole("button", { name: "Centrio Mall", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Destination", exact: true }),
  ).toHaveValue("Centrio Mall");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
});
test("reduced motion shows complete geometry and cancellation removes old preview", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/planner");
  await fillTrip(page);
  await page
    .getByRole("button", { name: "Find My Jeepney", exact: true })
    .click();
  await expect(page.locator(".trip-map")).toHaveAttribute(
    "data-animation-state",
    "Route preview ready",
  );
  await expect(page.locator(".jeepney-preview-marker")).toHaveAttribute(
    "data-progress",
    "1",
  );
  await page
    .getByRole("button", { name: "Replay Route Animation", exact: true })
    .click();
  await expect(page.locator(".jeepney-preview-marker")).toHaveAttribute(
    "data-progress",
    "1",
  );
  await page.getByRole("button", { name: "Edit trip", exact: true }).click();
  await expect(page.locator(".jeepney-preview-marker")).toHaveCount(0);
  await expect(page.locator(".animated-ride")).toHaveCount(0);
});
test("validation, no-match, request failure and location denial remain recoverable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition: (_ok: any, fail: any) => { fail({ code: 1 }); return 1; }, clearWatch: () => {} },
    }),
  );
  await page.goto("/planner");
  await page
    .getByRole("button", { name: "Find My Jeepney", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Choose your starting location",
  );
  await page.getByRole("button", { name: "Use my current location" }).click();
  await expect(page.getByRole("alert")).toContainText("permission was denied");
  await fillTrip(page);
  await page
    .getByRole("combobox", { name: "Destination", exact: true })
    .fill(from.join(", "));
  await page
    .getByRole("button", { name: "Find My Jeepney", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "No suitable jeepney route",
  );
  await fillTrip(page);
  await page.route("**/api/trips/plan", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "Route service unavailable. Please retry." },
    }),
  );
  await page
    .getByRole("button", { name: "Find My Jeepney", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Please retry");
  await page.unroute("**/api/trips/plan");
  await page
    .getByRole("button", { name: "Find My Jeepney", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Here's your next sakay." }),
  ).toBeVisible();
});
test("traditional code research stays separate and C1 stays unknown", async ({
  page,
}) => {
  await page.goto("/codes");
  await expect(page.locator(".research-card")).toHaveCount(10);
  await page
    .getByRole("textbox", { name: "Search traditional codes" })
    .fill("C1");
  await expect(page.locator(".research-card")).toHaveCount(1);
  await expect(page.locator(".research-card")).toContainText(
    "Service area unknown",
  );
  await page
    .getByRole("textbox", { name: "Search traditional codes" })
    .fill("C2");
  await expect(page.locator(".research-card")).toContainText(
    "No operating route is inferred",
  );
  await expect(page.locator('.research-card a[href^="/routes"]')).toHaveCount(
    0,
  );
});

test("approved synthetic policy fixture renders automatic fare and breakdown", async ({
  page,
}) => {
  // Test-only policy; never saved to the website or represented as an official rate.
  const { fareForLeg } = await import("../shared/trips.mjs");
  const policy = {
    id: "synthetic-browser-policy",
    region: "CDO",
    vehicle: "traditional",
    verification_status: "verified",
    approved_at: "2026-01-01",
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    source_url: "https://example.test/synthetic-policy",
    base_distance_km: 4,
    base_fare: 15,
    per_km: 2,
    increment_mode: "started_km",
    round_to: 1,
    rounding: "nearest",
    discounts: { student: 0.2, senior: 0.2, pwd: 0.2 },
  };
  let expected = 0;
  await page.route("**/api/trips/plan", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    for (const trip of data.trips) {
      for (const leg of trip.legs)
        leg.fare = fareForLeg(
          leg.rideMeters,
          [policy],
          "traditional",
          "student",
          "2026-06-01",
        );
      trip.legs.forEach((leg: any) => {
        leg.vehicleType = "traditional";
      });
      trip.fare = trip.legs.reduce((n: number, l: any) => n + l.fare.amount, 0);
    }
    expected = data.trips[0].fare;
    await route.fulfill({ json: data });
  });
  await page.goto("/planner");
  await fillTrip(page);
  await page.getByLabel("Passenger type").selectOption("student");
  await page
    .getByRole("button", { name: "Find My Jeepney", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Here's your next sakay." }),
  ).toBeVisible();
  await expect(page.locator(".prominent-fare>strong")).toHaveText(
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(expected),
  );
  await expect(page.locator(".prominent-fare")).toContainText("Student");
  await page.getByRole("button", { name: "View Fare Breakdown" }).click();
  await expect(page.locator("#fare-breakdown")).toContainText("20% discount");
  await expect(page.locator("#fare-breakdown a")).toHaveAttribute(
    "href",
    policy.source_url,
  );
});

test("tile failures offer retry without breaking the planner", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/planner");
  await expect(page.locator(".map-load-error")).toContainText(
    "Some map tiles could not load",
  );
  await page.unroute("https://tile.openstreetmap.org/**");
  await page.getByRole("button", { name: "Retry map" }).click();
  await expect(page.locator(".map-load-error")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Find My Jeepney", exact: true }),
  ).toBeEnabled();
});

test("real alternative geometry, endpoints, instructions and reference fare stay synchronized during rapid selection", async ({
  page,
}) => {
  await page.goto("/planner");
  await page
    .getByRole("combobox", { name: "Origin", exact: true })
    .fill("8.449972, 124.622735");
  await page
    .getByRole("combobox", { name: "Destination", exact: true })
    .fill("8.471176, 124.643082");
  const reply = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/trips/plan") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Find My Jeepney", exact: true })
    .click();
  const result = await (await reply).json();
  const a = result.trips.find((t: any) => t.legs[0].routeId === "26"),
    b = result.trips.find((t: any) => t.legs[0].routeId === "4");
  expect(a).toBeTruthy();
  expect(b).toBeTruthy();
  expect(a.legs[0].geometry).not.toEqual(b.legs[0].geometry);
  expect(a.referenceFare.minimum).not.toEqual(b.referenceFare.minimum);
  const marker = page.locator(".jeepney-preview-marker");
  await expect(marker).toHaveAttribute("data-progress", "1");
  const before = await page.locator(".animated-ride").getAttribute("d");
  const beforeFare = await page.locator(".prominent-fare>strong").innerText();
  await page.getByRole("button", { name: "View Full Directions" }).click();
  await page.getByRole("button", { name: "View Fare Breakdown" }).click();
  await page.getByRole("button", { name: /Alternative Routes/ }).click();
  const cards = page.locator(".route-alternatives .route-card");
  const first = cards.filter({ hasText: a.legs[0].label }),
    next = cards.filter({ hasText: b.legs[0].label });
  await next.click();
  await expect(page.locator(".trip-map")).toHaveAttribute(
    "data-animation-state",
    "Playing route preview",
  );
  await first.click();
  await next.click();
  await expect(page.locator(".result-card")).toHaveAttribute(
    "data-itinerary-id",
    b.id,
  );
  await expect(page.locator(".trip-map")).toHaveAttribute(
    "data-itinerary-id",
    b.id,
  );
  await expect(page.locator(".prominent-fare")).toHaveAttribute(
    "data-itinerary-id",
    b.id,
  );
  await expect(page.locator("#fare-breakdown")).toHaveAttribute(
    "data-itinerary-id",
    b.id,
  );
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute("data-route", b.id);
  await expect(marker).toHaveAttribute("data-progress", "1");
  expect(await page.locator(".animated-ride").getAttribute("d")).not.toBe(
    before,
  );
  await expect(page.locator(".animated-ride")).toHaveCount(1);
  await expect(page.locator(".animated-ride")).toHaveAttribute(
    "data-route-id",
    "4",
  );
  await expect(page.locator(".animated-ride")).toHaveAttribute(
    "data-direction",
    b.legs[0].direction,
  );
  expect(Number(await marker.getAttribute("data-latitude"))).toBeCloseTo(
    b.legs[0].alight[0],
    6,
  );
  expect(Number(await marker.getAttribute("data-longitude"))).toBeCloseTo(
    b.legs[0].alight[1],
    6,
  );
  expect(await page.locator(".prominent-fare>strong").innerText()).not.toBe(
    beforeFare,
  );
  await expect(page.locator(".prominent-fare")).toContainText(
    (b.rideMeters / 1000).toFixed(3) + " km ridden",
  );
  await expect(page.locator(".trip-steps")).toContainText(b.legs[0].label);
  await expect(page.locator("#fare-breakdown")).toContainText(b.legs[0].label);
  await expect(page.locator(".prominent-fare")).toContainText(
    "Jeepney Type: Confirm with operator",
  );
});

test("legacy results URL opens the live dataset planner", async ({ page }) => {
  await page.goto("/results");
  await expect(page).toHaveURL(/\/planner$/);
  await expect(page.getByRole("button", { name: "Find My Jeepney", exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic demo", { exact: true })).toHaveCount(0);
});
