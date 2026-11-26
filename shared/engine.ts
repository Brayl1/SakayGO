import type { Dataset, Journey, Passenger, Point, Policy, Ride } from "./model";
export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 +
    Math.cos(a[0] * rad) *
      Math.cos(b[0] * rad) *
      Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function estimateFare(
  km: number,
  policy: Policy | undefined,
  passenger: Passenger,
  demo: boolean,
  date = new Date().toISOString().slice(0, 10),
): number | null {
  if (
    !policy ||
    policy.demo !== demo ||
    !policy.source ||
    date < policy.effective ||
    date > policy.expires ||
    !Number.isFinite(km) ||
    km < 0 ||
    policy.roundTo <= 0
  )
    return null;
  const raw =
    (policy.base + Math.max(0, Math.ceil(km - policy.baseKm)) * policy.perKm) *
    (passenger === "regular" ? 1 : 1 - policy.discount);
  return Math.round(raw / policy.roundTo) * policy.roundTo;
}
// Directed ride edges, with service changes at explicit shared stops only.
// No proximity-based boarding, road routing, or assumed reverse service.
export function plan(
  data: Dataset,
  from: string,
  to: string,
  passenger: Passenger = "regular",
  demo = true,
  maxTransfers = 1,
): Journey[] {
  if (
    from === to ||
    !data.locations.some((l) => l.id === from) ||
    !data.locations.some((l) => l.id === to)
  )
    return [];
  const results: Journey[] = [];
  const routes = data.routes.filter((r) =>
    demo
      ? r.status === "demo"
      : r.status === "verified" && !!r.verifiedAt && !!r.source,
  );
  function visit(at: string, rides: Ride[], visited: Set<string>) {
    if (rides.length > Math.min(4, maxTransfers + 1)) return;
    if (at === to && rides.length) {
      results.push({
        id: rides.map((r) => `${r.route.id}:${r.from.id}-${r.to.id}`).join("|"),
        rides,
        transfers: rides.length - 1,
        fare: rides.some((r) => r.fare === null)
          ? null
          : rides.reduce((s, r) => s + r.fare!, 0),
        walking: 0,
      });
      return;
    }
    if (rides.length >= maxTransfers + 1) return;
    for (const route of routes) {
      if (rides.some((r) => r.route.id === route.id)) continue;
      const i = route.stops.indexOf(at);
      if (i < 0 || route.pickup?.[i] === false) continue;
      for (let j = i + 1; j < route.stops.length; j++) {
        const end = route.stops[j];
        if (visited.has(end) || route.dropoff?.[j] === false) continue;
        const points = route.geometry.slice(i, j + 1);
        const km = points
          .slice(1)
          .reduce((s, p, k) => s + distance(points[k], p), 0);
        const ride: Ride = {
          route,
          from: data.locations.find((l) => l.id === at)!,
          to: data.locations.find((l) => l.id === end)!,
          points,
          km,
          fare: estimateFare(
            km,
            data.policies.find((p) => p.id === route.policyId),
            passenger,
            demo,
          ),
        };
        visit(end, [...rides, ride], new Set([...visited, end]));
      }
    }
  }
  visit(from, [], new Set([from]));
  return results
    .sort(
      (a, b) =>
        a.transfers - b.transfers ||
        (a.fare ?? Infinity) - (b.fare ?? Infinity),
    )
    .slice(0, 12);
}
