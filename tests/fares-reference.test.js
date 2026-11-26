import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  calculateFareBreakdown,
  referenceForLeg,
  sumReferenceFares,
  verifiedVehicleType,
} from "../shared/fares.mjs";
import { planGeometricTrips, fareForLeg } from "../shared/trips.mjs";
import { validateVerification } from "../worker/verification.mjs";
const reference = JSON.parse(
  fs.readFileSync("public/data/fare-reference.json", "utf8"),
);
const policy = {
  id: "test",
  region: "CDO",
  verification_status: "verified",
  approved_at: "2026-01-01",
  effective_from: "2026-01-01",
  effective_to: "2026-12-31",
  vehicle: "traditional",
  source_url: "https://example.test/test-policy",
  base_fare: 14,
  base_distance_km: 4,
  per_km: 2,
  discounts: reference.discounts,
  round_to: 0.25,
  rounding: "nearest",
  increment_mode: "started_km",
};
const classification = (routeId, vehicle = "traditional") => ({
  routeId,
  direction: "inbound",
  vehicle,
  verification_status: "verified",
  approved_at: "2026-01-01",
  verified_by: "test-reviewer",
  source_url: "https://example.test/evidence",
  evidence_type: "field_confirmed",
});
describe("supplied reference and decimal-safe fares", () => {
  it("preserves unverified scope and validates every supplied lookup value", () => {
    expect(reference.local_applicability_verified).toBe(false);
    expect(reference.distance_increment_rule).toBeNull();
    const rows = fs
      .readFileSync(
        "data/source/fares-2026/sakaygo_fare_lookup_1_to_30km.csv",
        "utf8",
      )
      .trim()
      .split(/\r?\n/)
      .slice(1);
    expect(rows).toHaveLength(60);
    for (const row of rows) {
      const [type, km, ...values] = row.split(",");
      for (const [i, passenger] of [
        "regular",
        "student",
        "senior",
        "pwd",
      ].entries()) {
        const r = referenceForLeg(
          Number(km) * 1000,
          reference,
          type === "traditional_jeepney" ? "traditional" : "modern",
          passenger,
          "2026-11-08",
        )[0];
        expect(r.minimum).toBe(Number(values[i]));
        expect(r.maximum).toBe(r.minimum);
      }
    }
  });
  it.each(["regular", "student", "senior", "pwd"])(
    "calculates %s base charges for both conditional vehicle types",
    (passenger) => {
      const r = referenceForLeg(
        3000,
        reference,
        "unknown",
        passenger,
        "2026-11-08",
      );
      expect(r.map((v) => v.minimum)).toEqual(
        passenger === "regular" ? [14, 17] : [11.25, 13.5],
      );
    },
  );
  it("does not invent partial-kilometer billing", () => {
    const r = referenceForLeg(
      4500,
      reference,
      "traditional",
      "regular",
      "2026-11-08",
    )[0];
    expect([r.lowerKm, r.upperKm, r.minimum, r.maximum]).toEqual([
      4, 5, 14, 16,
    ]);
    expect(r.note).toContain("unspecified");
    expect(
      referenceForLeg(4500, reference, "modern", "regular", "2026-11-08")[0]
        .maximum,
    ).toBe(19.5);
  });
  it("honors explicit approved increment/rounding rules and exact half-up ties", () => {
    expect(calculateFareBreakdown(4100, policy).amount).toBe(16);
    expect(
      calculateFareBreakdown(4100, {
        ...policy,
        increment_mode: "proportional",
      }).amount,
    ).toBe(14.25);
    expect(
      calculateFareBreakdown(1000, { ...policy, base_fare: 14.125 }).amount,
    ).toBe(14.25);
    expect(
      calculateFareBreakdown(1000, { ...policy, base_fare: 14.124999 }).amount,
    ).toBe(14);
    expect(
      calculateFareBreakdown(4100, {
        ...policy,
        increment_mode: "proportional",
        rounding: "floor",
      }).amount,
    ).toBe(14);
    expect(
      calculateFareBreakdown(4100, {
        ...policy,
        increment_mode: "proportional",
        rounding: "ceil",
      }).amount,
    ).toBe(14.25);
  });
  it("returns unavailable for absent, future, invalid and unsupported policies", () => {
    expect(referenceForLeg(5000, null)).toEqual([]);
    expect(
      referenceForLeg(5000, reference, "unknown", "regular", "2026-09-27"),
    ).toEqual([]);
    expect(
      calculateFareBreakdown(5000, { ...policy, increment_mode: null }),
    ).toBeNull();
    expect(calculateFareBreakdown(5000, policy, "student+senior")).toBeNull();
    expect(fareForLeg(5000, [policy])).toBeNull();
  });
  it("sums discounted rides separately in centavos, including mixed vehicles", () => {
    const legs = [
      {
        referenceFares: referenceForLeg(
          3000,
          reference,
          "unknown",
          "student",
          "2026-11-08",
        ),
      },
      {
        referenceFares: referenceForLeg(
          6000,
          reference,
          "unknown",
          "student",
          "2026-11-08",
        ),
      },
    ];
    const total = sumReferenceFares(legs);
    expect(total.scenarios).toHaveLength(4);
    expect(total.scenarios[0].minimum).toBe(25.75);
    expect(total.scenarios.at(-1).minimum).toBe(31);
    expect(sumReferenceFares([{ referenceFares: [] }])).toBeNull();
  });
  it("never treats a selected preference or unverified metadata as vehicle evidence", () => {
    expect(verifiedVehicleType([], "x", "inbound")).toBe("unknown");
    expect(verifiedVehicleType([classification("x")], "x", "outbound")).toBe(
      "unknown",
    );
    expect(
      verifiedVehicleType(
        [{ ...classification("x"), approved_at: null }],
        "x",
        "inbound",
      ),
    ).toBe("unknown");
    expect(verifiedVehicleType([classification("x")], "x", "inbound")).toBe(
      "traditional",
    );
    expect(
      verifiedVehicleType(
        [classification("x"), classification("x", "modern")],
        "x",
        "inbound",
      ),
    ).toBe("unknown");
  });
  it("requires explicit approval for future vehicle metadata", () => {
    const draft = {
      crosswalks: [],
      farePolicies: [],
      vehicleClassifications: [classification("x")],
    };
    const routes = [{ id: "x", directions: ["inbound"] }];
    expect(() => validateVerification(draft, routes, "tester")).toThrow();
    const approved = validateVerification(
      { ...draft, approve: true },
      routes,
      "tester",
    );
    expect(approved.vehicleClassifications[0].verified_by).toBe("tester");
  });
});
describe("itinerary data integrity and route-specific fares", () => {
  const routes = JSON.parse(
    fs.readFileSync("public/data/catalog.json"),
  ).routes.map((r) => ({
    ...r,
    geometry: JSON.parse(
      fs.readFileSync("public/data/routes/" + r.id + ".json"),
    ),
  }));
  const points = {
    origin: [8.449972, 124.622735],
    destination: [8.471176, 124.643082],
  };
  it("retains 76 unique IDs and 152 distinct source directions without mutation", () => {
    expect(new Set(routes.map((r) => r.id)).size).toBe(76);
    const shapes = routes.flatMap((r) =>
      Object.values(r.geometry).map((g) => JSON.stringify(g)),
    );
    expect(shapes).toHaveLength(152);
    expect(new Set(shapes).size).toBe(152);
    const original = JSON.stringify(routes);
    planGeometricTrips({ ...points, routes, fareReference: reference });
    expect(JSON.stringify(routes)).toBe(original);
  });
  it("keeps each geometry, endpoint, distance and reference charge attached to its own ID", () => {
    const trips = planGeometricTrips({
      ...points,
      routes,
      fareReference: reference,
      preferences: { vehicle: "modern" },
    }).trips;
    const a = trips.find((t) => t.legs[0].routeId === "26"),
      b = trips.find((t) => t.legs[0].routeId === "4");
    expect(a.id).not.toBe(b.id);
    expect(a.id).toContain(":inbound:");
    expect(a.legs[0].geometry).not.toEqual(b.legs[0].geometry);
    expect(a.rideMeters).not.toBe(b.rideMeters);
    expect(a.referenceFare.minimum).toBe(14);
    expect(b.referenceFare.minimum).toBe(16);
    for (const t of trips) {
      const l = t.legs[0];
      expect(l.geometry[0]).toEqual(l.board);
      expect(l.geometry.at(-1)).toEqual(l.alight);
      expect(l.vehicleType).toBe("unknown");
      expect(l.referenceFares).toHaveLength(2);
      expect(t.fare).toBeNull();
    }
  });
  it("uses approved actual vehicle metadata instead of the requested preference", () => {
    const t = planGeometricTrips({
      ...points,
      routes,
      fareReference: reference,
      farePolicies: [policy],
      vehicleClassifications: [classification("26")],
      preferences: { vehicle: "modern" },
    }).trips.find((t) => t.legs[0].routeId === "26");
    expect(t.legs[0].vehicleType).toBe("traditional");
    expect(t.fare).toBe(16);
    expect(t.legs[0].fare.baseFare).toBe(14);
  });
  it("keeps reversal independent and identifies shared ridden sections honestly", () => {
    const example = JSON.parse(
      fs.readFileSync("public/data/geometric-test-cases.json"),
    )[2];
    const forward = planGeometricTrips({ ...example, routes }).trips;
    expect(
      forward.find((t) => t.legs[0].routeId === "21").sharesRideWith.length,
    ).toBeGreaterThan(0);
    const reverse = planGeometricTrips({
      origin: example.destination,
      destination: example.origin,
      routes,
    }).trips;
    expect(reverse.length).toBeGreaterThan(0);
    expect(
      reverse.map((t) => t.id).some((id) => forward.some((f) => f.id === id)),
    ).toBe(false);
  });
});
