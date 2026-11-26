import { describe, it, expect } from "vitest";
import { demoData } from "../shared/data";
import { plan, estimateFare } from "../shared/engine";
import { datasetSchema, planSchema } from "../shared/validation";
describe("Directed transit routing", () => {
  it("finds a direct service and a one-transfer alternative", () => {
    const trips = plan(demoData, "ustp", "divisoria");
    expect(trips.some((t) => t.transfers === 0)).toBe(true);
    expect(trips.some((t) => t.transfers === 1)).toBe(true);
  });
  it("does not infer a reverse route", () => {
    expect(
      plan({ ...demoData, routes: [demoData.routes[0]] }, "divisoria", "ustp"),
    ).toEqual([]);
  });
  it("excludes all demo services in verified mode", () =>
    expect(plan(demoData, "ustp", "divisoria", "regular", false)).toEqual([]));
  it("handles unknown and identical endpoints", () => {
    expect(plan(demoData, "missing", "ustp")).toEqual([]);
    expect(plan(demoData, "ustp", "ustp")).toEqual([]);
  });
  it("respects pickup restrictions", () => {
    const data = structuredClone(demoData);
    data.routes.forEach((r) => (r.pickup = r.stops.map(() => false)));
    expect(plan(data, "ustp", "divisoria")).toEqual([]);
  });
  it("finds multiple transfers only when explicitly enabled", () => {
    const data = structuredClone(demoData);
    data.routes = data.routes.slice(0, 3);
    data.routes[0].stops = ["ustp", "limketkai"];
    data.routes[1].stops = ["limketkai", "centrio"];
    data.routes[2].stops = ["centrio", "carmen"];
    data.routes.forEach(
      (r) =>
        (r.geometry = r.stops.map(
          (id) => data.locations.find((l) => l.id === id)!.point,
        )),
    );
    expect(plan(data, "ustp", "carmen", "regular", true, 1)).toEqual([]);
    expect(plan(data, "ustp", "carmen", "regular", true, 2)[0].transfers).toBe(
      2,
    );
  });
  it("adds per-ride transfer fares", () => {
    const t = plan(demoData, "ustp", "carmen").find((t) => t.transfers === 1)!;
    expect(t.fare).toBe(t.rides.reduce((s, r) => s + r.fare!, 0));
  });
});
describe("Fare safety", () => {
  const policy = demoData.policies[0];
  it("applies minimum, distance, discount and rounding", () => {
    expect(estimateFare(2, policy, "regular", true)).toBe(15);
    expect(estimateFare(4.1, policy, "regular", true)).toBe(17);
    expect(estimateFare(4.1, policy, "student", true)).toBe(14);
  });
  it("rejects expired, missing, future, mismatched and negative inputs", () => {
    expect(estimateFare(2, undefined, "regular", true)).toBeNull();
    expect(estimateFare(2, policy, "regular", false)).toBeNull();
    expect(
      estimateFare(2, { ...policy, expires: "2020-01-01" }, "regular", true),
    ).toBeNull();
    expect(
      estimateFare(2, { ...policy, effective: "2099-01-01" }, "regular", true),
    ).toBeNull();
    expect(estimateFare(-1, policy, "regular", true)).toBeNull();
  });
});
describe("Import validation", () => {
  it("accepts the synthetic seed", () =>
    expect(datasetSchema.safeParse(demoData).success).toBe(true));
  it("rejects fake verified fares and broken geometry", () => {
    const data = structuredClone(demoData);
    data.routes[0].status = "verified";
    data.routes[0].verifiedAt = "2026-01-01";
    expect(datasetSchema.safeParse(data).success).toBe(false);
    data.routes[0].status = "demo";
    data.routes[0].geometry = [];
    expect(datasetSchema.safeParse(data).success).toBe(false);
  });
  it("bounds search complexity", () =>
    expect(
      planSchema.safeParse({ from: "a", to: "b", maxTransfers: 100 }).success,
    ).toBe(false));
});
