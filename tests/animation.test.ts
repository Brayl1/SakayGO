import { describe, it, expect } from "vitest";
import { measurePath, positionOnPath } from "../src/routeAnimation";

describe("route preview interpolation", () => {
  it("passes through actual corners and ends at the alighting point", () => {
    const p = measurePath([
      [8.48, 124.64],
      [8.48, 124.65],
      [8.49, 124.65],
    ]);
    expect(positionOnPath(p, 0).point).toEqual(p.points[0]);
    expect(positionOnPath(p, p.cumulative[1] / p.total).point).toEqual(
      p.points[1],
    );
    expect(positionOnPath(p, 1).point).toEqual(p.points[2]);
    const mid = positionOnPath(p, 0.75);
    expect(mid.point[1]).toBe(124.65);
    expect(mid.visible).toHaveLength(3);
  });
  it("handles duplicate vertices, clamps progress and retains direction", () => {
    const p = measurePath([
      [8.48, 124.64],
      [8.48, 124.64],
      [8.48, 124.65],
    ]);
    expect(positionOnPath(p, -1).point).toEqual(p.points[0]);
    expect(positionOnPath(p, 2).point).toEqual(p.points[2]);
    expect(positionOnPath(p, 0.5).bearing).toBeCloseTo(90, 1);
    expect(() => positionOnPath(measurePath([]), 0)).toThrow();
  });
});
