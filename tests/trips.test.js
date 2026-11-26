import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  sortTrips,
  indexGeometry,
  projectToLine,
  planGeometricTrips,
  meters,
  verifiedCodes,
  fareForLeg,
  refineWalking,
} from "../shared/trips.mjs";
import { validateVerification } from "../worker/verification.mjs";
const route = (id, points) => ({
  id,
  name: "Test geometry " + id,
  visible: true,
  source: "Synthetic unit-test geometry only",
  directions: ["inbound"],
  geometry: { inbound: points },
  roadsByDirection: { inbound: ["Synthetic test street"] },
});
const points = [
  [8.45, 124.65],
  [8.46, 124.65],
  [8.47, 124.65],
];
const one = route("test", points);
const request = (origin, destination, preferences = {}) =>
  planGeometricTrips({ origin, destination, routes: [one], preferences });
describe("Spherical directed geometry planning", () => {
  it("projects to a segment interior and measures along-line distance", () => {
    const index = indexGeometry(points);
    const p = projectToLine([8.455, 124.6501], index, 100)[0];
    expect(p.segment).toBe(0);
    expect(p.t).toBeCloseTo(0.5, 3);
    expect(p.walkMeters).toBeLessThan(12);
    expect(p.along).toBeGreaterThan(550);
  });
  it("uses an actual line subsection with intermediate vertices", () => {
    const trip = request([8.452, 124.65], [8.468, 124.65]).trips[0];
    expect(trip.legs[0].geometry).toContainEqual(points[1]);
    expect(trip.rideMeters).toBeCloseTo(
      meters([8.452, 124.65], [8.468, 124.65]),
      0,
    );
    expect(trip.legs[0].geometry[0][0]).toBeCloseTo(8.452, 5);
    expect(trip.legs[0].geometry.at(-1)[0]).toBeCloseTo(8.468, 5);
  });
  it("rejects alighting before boarding instead of reversing a line", () =>
    expect(
      request([8.468, 124.65], [8.452, 124.65], { maxWalkMeters: 100 }).trips,
    ).toEqual([]));
  it("uses supplied outbound geometry independently", () => {
    const r = {
      ...one,
      directions: ["inbound", "outbound"],
      geometry: {
        inbound: points,
        outbound: [
          [8.47, 124.651],
          [8.46, 124.651],
          [8.45, 124.651],
        ],
      },
    };
    const found = planGeometricTrips({
      routes: [r],
      origin: [8.468, 124.651],
      destination: [8.452, 124.651],
      preferences: { maxWalkMeters: 50 },
    });
    expect(found.trips[0].legs[0].direction).toBe("outbound");
    expect(
      found.trips[0].legs[0].geometry.every(
        (p) => Math.abs(p[1] - 124.651) < 0.00001,
      ),
    ).toBe(true);
  });
  it("rejects excessive access distance", () =>
    expect(
      request([8.452, 124.66], [8.468, 124.66], { maxWalkMeters: 100 }).trips,
    ).toEqual([]));
  it("handles identical points and missing geometry without invented trips", () => {
    expect(request(points[0], points[0]).trips).toEqual([]);
    expect(
      planGeometricTrips({
        origin: points[0],
        destination: points[2],
        routes: [{ ...one, geometry: {} }],
      }).trips,
    ).toEqual([]);
  });
  it("rejects swapped coordinate order", () => {
    expect(
      indexGeometry([
        [124.65, 8.45],
        [124.65, 8.47],
      ]),
    ).toBeNull();
    expect(() => request([124.65, 8.45], points[2])).toThrow();
  });
  it("labels projected areas as approximate and missing fare as null", () => {
    const trip = request(points[0], points[2]).trips[0];
    expect(trip.legs[0].boardingStatus).toContain("not an official stop");
    expect(trip.walks[0].method).toBe("straight_line");
    expect(trip.fare).toBeNull();
    expect(trip.legs[0].codes).toEqual([]);
  });
  it("does not infer a transfer from intersecting geometries", () => {
    const routes = [
      route("a", [
        [8.45, 124.65],
        [8.46, 124.65],
      ]),
      route("b", [
        [8.46, 124.65],
        [8.46, 124.66],
      ]),
    ];
    expect(
      planGeometricTrips({
        origin: [8.45, 124.65],
        destination: [8.46, 124.66],
        routes,
        preferences: { maxWalkMeters: 50 },
      }).trips,
    ).toEqual([]);
  });
  it("only connects correctly ordered legs through an explicit reviewed link", () => {
    const routes = [
      route("a", [
        [8.45, 124.65],
        [8.46, 124.65],
      ]),
      route("b", [
        [8.46, 124.65],
        [8.46, 124.66],
      ]),
    ];
    const found = planGeometricTrips({
      origin: [8.45, 124.65],
      destination: [8.46, 124.66],
      routes,
      preferences: { maxWalkMeters: 50 },
      transferLinks: [
        {
          id: "test-link",
          verified: true,
          evidence_url: "https://example.test/field-evidence",
          fromRouteId: "a",
          fromDirection: "inbound",
          fromPoint: [8.46, 124.65],
          toRouteId: "b",
          toDirection: "inbound",
          toPoint: [8.46, 124.65],
        },
      ],
    });
    expect(found.trips[0].transfers).toBe(1);
    expect(found.trips[0].walks.length).toBe(3);
  });
  it("uses pedestrian routing distances and rejects disconnected walk links", async () => {
    const initial = request([8.451, 124.6502], [8.469, 124.6502]);
    const refined = await refineWalking(initial, async (a, b) => ({
      distanceMeters: 60,
      geometry: [a, b],
    }));
    expect(refined.trips[0].walkingMeters).toBe(120);
    expect(refined.trips[0].walks[0].method).toBe("pedestrian_router");
    expect(
      (
        await refineWalking(initial, async () => {
          throw new Error("No footpath");
        })
      ).trips,
    ).toEqual([]);
    expect(
      (
        await refineWalking(initial, async (a, b) => ({
          distanceMeters: 2000,
          geometry: [a, b],
        }))
      ).trips,
    ).toEqual([]);
  });
});
describe("Traditional code and fare verification gates", () => {
  const research = JSON.parse(
    readFileSync("public/data/code-research.json", "utf8"),
  );
  it("retains C1 unknown and ten independent research entries", () => {
    expect(research).toHaveLength(10);
    const c1 = research.find((r) => r.code === "C1");
    expect(c1.reported_service_area).toBe("");
    expect(c1.verification_status).toBe("unknown");
  });
  it("never links C2 or research-only codes by name or route variant", () => {
    expect(verifiedCodes(research, "2", "inbound")).toEqual([]);
    expect(verifiedCodes([], "Carmen R2", "inbound")).toEqual([]);
    expect(research.find((r) => r.code === "R2").notes).toContain("not LPTRP");
  });
  it("requires explicit approval to promote a directional crosswalk", () => {
    const c = {
      id: "test",
      traditional_code: "C2",
      lptrp_route_id: "test",
      direction: "inbound",
      alias: "",
      notes: "Test evidence only",
      verification_status: "verified",
      operational_status: "active",
      confidence: 0.9,
      evidence_url: "https://example.test/verified",
      evidence_type: "field_confirmed",
    };
    expect(() =>
      validateVerification(
        { crosswalks: [c], farePolicies: [], approve: false },
        [one],
        "reviewer",
      ),
    ).toThrow();
    const v = validateVerification(
      { crosswalks: [c], farePolicies: [], approve: true },
      [one],
      "reviewer",
    );
    expect(verifiedCodes(v.crosswalks, "test", "inbound")).toEqual(["C2"]);
    expect(verifiedCodes(v.crosswalks, "test", "outbound")).toEqual([]);
  });
  const policy = {
    id: "test-only",
    verification_status: "verified",
    approved_at: "2026-01-01",
    region: "CDO",
    vehicle: "traditional",
    source_url: "https://example.test/fictional-test-policy",
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    base_distance_km: 4,
    base_fare: 15,
    per_km: 2,
    increment_mode: "started_km",
    round_to: 1,
    rounding: "nearest",
    discounts: { student: 0.2, senior: 0.2, pwd: 0.2 },
  };
  it("returns unavailable without an approved applicable matrix", () => {
    expect(fareForLeg(6000, [])).toBeNull();
    expect(
      fareForLeg(6000, [{ ...policy, verification_status: "pending" }]),
    ).toBeNull();
    expect(
      fareForLeg(6000, [policy], "modern", "regular", "2026-06-01"),
    ).toBeNull();
  });
  it("checks policy effective dates and overlapping policies", () => {
    expect(
      fareForLeg(6000, [policy], "traditional", "regular", "2025-01-01"),
    ).toBeNull();
    expect(
      fareForLeg(6000, [policy], "traditional", "regular", "2027-01-01"),
    ).toBeNull();
    expect(
      fareForLeg(
        6000,
        [policy, policy],
        "traditional",
        "regular",
        "2026-06-01",
      ),
    ).toBeNull();
  });
  it("calculates on ridden distance, discounts and configured rounding", () => {
    expect(
      fareForLeg(4100, [policy], "traditional", "regular", "2026-06-01").amount,
    ).toBe(17);
    expect(
      fareForLeg(4100, [policy], "traditional", "student", "2026-06-01").amount,
    ).toBe(14);
    expect(
      fareForLeg(
        1000,
        [{ ...policy, discounts: { student: null } }],
        "traditional",
        "student",
        "2026-06-01",
      ),
    ).toBeNull();
  });
  it("supports regional distance matrices and refuses unpriced distances", () => {
    const p = {
      ...policy,
      matrix: [
        { upToKm: 4, fare: 15 },
        { upToKm: 6, fare: 20 },
      ],
    };
    expect(
      fareForLeg(5000, [p], "traditional", "regular", "2026-06-01").amount,
    ).toBe(20);
    expect(
      fareForLeg(7000, [p], "traditional", "regular", "2026-06-01"),
    ).toBeNull();
  });
});
describe("Reproducible supplied-geometry cases", () => {
  const catalog = JSON.parse(
    readFileSync("public/data/catalog.json", "utf8"),
  ).routes;
  for (const sample of JSON.parse(
    readFileSync("public/data/geometric-test-cases.json", "utf8"),
  )) {
    it(sample.label, () => {
      const r = catalog.find((r) => r.id === sample.routeId);
      const geometry = JSON.parse(
        readFileSync(`public/data/routes/${r.id}.json`, "utf8"),
      );
      const result = planGeometricTrips({
        origin: sample.origin,
        destination: sample.destination,
        routes: [{ ...r, geometry }],
        preferences: { maxWalkMeters: 100 },
      });
      expect(
        result.trips.some((t) => t.legs[0].direction === sample.direction),
      ).toBe(true);
      expect(
        result.trips.every(
          (t) => t.fare === null && t.legs[0].codes.length === 0,
        ),
      ).toBe(true);
    });
  }
});
it("sorts known fares first without treating missing fares as zero", () => {
  const values = [
    { id: "unknown", fare: null, walkingMeters: 1 },
    { id: "dear", fare: 25, walkingMeters: 4 },
    { id: "cheap", fare: 15, walkingMeters: 5 },
    { id: "unknown2", fare: null, walkingMeters: 2 },
  ];
  expect(sortTrips(values, "fare").map((t) => t.id)).toEqual([
    "cheap",
    "dear",
    "unknown",
    "unknown2",
  ]);
});
