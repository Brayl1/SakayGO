import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHandler } from "../worker/handler.mjs";
const routes = JSON.parse(
  readFileSync("public/data/catalog.json", "utf8"),
).routes;
const cases = JSON.parse(
  readFileSync("public/data/geometric-test-cases.json", "utf8"),
);
const research = JSON.parse(
  readFileSync("public/data/code-research.json", "utf8"),
);
const assets = Object.fromEntries(
  routes.map((r) => [
    "/data/routes/" + r.id + ".json",
    {
      body: readFileSync("public/data/routes/" + r.id + ".json").toString(
        "base64",
      ),
    },
  ]),
);
const env = { BUCKET: { get: async () => null } };
it("HTTP trip planning uses all supplied geometries and never confirms research codes or fares", async () => {
  const app = createHandler({
    baseRoutes: routes,
    assets,
    researchCodes: research,
  });
  for (const example of cases) {
    const response = await app.fetch(
      new Request("https://sakay.test/api/trips/plan", {
        method: "POST",
        body: JSON.stringify({
          origin: example.origin,
          destination: example.destination,
        }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(
      result.trips.some((t) =>
        t.legs.some(
          (l) =>
            l.routeId === example.routeId && l.direction === example.direction,
        ),
      ),
    ).toBe(true);
    for (const trip of result.trips) {
      expect(trip.fare).toBeNull();
      for (const leg of trip.legs) expect(leg.codes).toEqual([]);
    }
  }
  const invalid = await app.fetch(
    new Request("https://sakay.test/api/trips/plan", {
      method: "POST",
      body: JSON.stringify({
        origin: [124.6, 8.4],
        destination: cases[0].destination,
      }),
    }),
    env,
  );
  expect(invalid.status).toBe(400);
});
it("verification API requires owner identity independently of catalog UI", async () => {
  const app = createHandler({
    baseRoutes: routes,
    assets,
    researchCodes: research,
  });
  const response = await app.fetch(
    new Request("https://sakay.test/api/admin/verification"),
    env,
  );
  expect(response.status).toBe(403);
});
