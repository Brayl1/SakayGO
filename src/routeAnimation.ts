import type { Point } from "../shared/model";
import { distance } from "../shared/engine";
export function measurePath(points: Point[]) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  return { points, cumulative, total: cumulative.at(-1) || 0 };
}
export function positionOnPath(
  path: ReturnType<typeof measurePath>,
  fraction: number,
) {
  const { points, cumulative, total } = path;
  if (!points.length) throw new Error("Cannot animate an empty path");
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let low = 1,
    high = points.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] < target) low = mid + 1;
    else high = mid;
  }
  const end = Math.min(low, points.length - 1),
    start = Math.max(0, end - 1);
  const a = points[start],
    b = points[end],
    length = cumulative[end] - cumulative[start];
  const t = length ? (target - cumulative[start]) / length : 0;
  const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const radians = Math.PI / 180,
    dLng = (b[1] - a[1]) * radians;
  const bearing =
    Math.atan2(
      Math.sin(dLng) * Math.cos(b[0] * radians),
      Math.cos(a[0] * radians) * Math.sin(b[0] * radians) -
        Math.sin(a[0] * radians) * Math.cos(b[0] * radians) * Math.cos(dLng),
    ) / radians;
  return { point, bearing, end, visible: [...points.slice(0, end), point] };
}
