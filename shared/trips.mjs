import {
  calculateFareBreakdown,
  verifiedVehicleType,
  referenceForLeg,
  sumReferenceFares,
} from "./fares.mjs";
// Spherical projection onto each great-circle segment. Coordinates are [lat,lng].
const EARTH = 6371008.8,
  RAD = Math.PI / 180;
export const tripDefaults = {
  maxWalkMeters: 500,
  minRideMeters: 100,
  maxResults: 6,
  maxTransferWalkMeters: 150,
};
export const validPoint = (p) =>
  Array.isArray(p) &&
  p.length === 2 &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]) &&
  p[0] >= 8.1 &&
  p[0] <= 8.8 &&
  p[1] >= 124.2 &&
  p[1] <= 125;
export function meters(a, b) {
  const x =
    Math.sin(((b[0] - a[0]) * RAD) / 2) ** 2 +
    Math.cos(a[0] * RAD) *
      Math.cos(b[0] * RAD) *
      Math.sin(((b[1] - a[1]) * RAD) / 2) ** 2;
  return EARTH * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
const bearing = (a, b) =>
  Math.atan2(
    Math.sin((b[1] - a[1]) * RAD) * Math.cos(b[0] * RAD),
    Math.cos(a[0] * RAD) * Math.sin(b[0] * RAD) -
      Math.sin(a[0] * RAD) *
        Math.cos(b[0] * RAD) *
        Math.cos((b[1] - a[1]) * RAD),
  );
function interpolate(a, b, t, delta) {
  if (delta < 1e-12) return [...a];
  const A = Math.sin((1 - t) * delta) / Math.sin(delta),
    B = Math.sin(t * delta) / Math.sin(delta);
  const x =
      A * Math.cos(a[0] * RAD) * Math.cos(a[1] * RAD) +
      B * Math.cos(b[0] * RAD) * Math.cos(b[1] * RAD),
    y =
      A * Math.cos(a[0] * RAD) * Math.sin(a[1] * RAD) +
      B * Math.cos(b[0] * RAD) * Math.sin(b[1] * RAD),
    z = A * Math.sin(a[0] * RAD) + B * Math.sin(b[0] * RAD);
  return [Math.atan2(z, Math.hypot(x, y)) / RAD, Math.atan2(y, x) / RAD];
}
export function indexGeometry(points) {
  if (!Array.isArray(points) || points.length < 2 || !points.every(validPoint))
    return null;
  const cumulative = [0];
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    bbox[0] = Math.min(bbox[0], p[0]);
    bbox[1] = Math.min(bbox[1], p[1]);
    bbox[2] = Math.max(bbox[2], p[0]);
    bbox[3] = Math.max(bbox[3], p[1]);
    if (i) cumulative.push(cumulative[i - 1] + meters(points[i - 1], p));
  }
  return { points, cumulative, bbox, length: cumulative.at(-1) };
}
function nearBounds(point, bounds, radius) {
  const lat = radius / 110000,
    lon = radius / (110000 * Math.cos(point[0] * RAD));
  return (
    point[0] >= bounds[0] - lat &&
    point[0] <= bounds[2] + lat &&
    point[1] >= bounds[1] - lon &&
    point[1] <= bounds[3] + lon
  );
}
export function projectToLine(point, index, radius = 500) {
  if (!index || !validPoint(point) || !nearBounds(point, index.bbox, radius))
    return [];
  const found = [];
  for (let i = 0; i < index.points.length - 1; i++) {
    const a = index.points[i],
      b = index.points[i + 1],
      length = index.cumulative[i + 1] - index.cumulative[i];
    if (length < 0.01) continue;
    const delta = length / EARTH,
      d13 = meters(a, point) / EARTH,
      angle = bearing(a, point) - bearing(a, b);
    const alongAngle = Math.atan2(
      Math.sin(d13) * Math.cos(angle),
      Math.cos(d13),
    );
    const t = Math.max(0, Math.min(1, alongAngle / delta));
    const position = interpolate(a, b, t, delta),
      walk = meters(point, position);
    if (walk <= radius)
      found.push({
        point: position,
        segment: i,
        t,
        along: index.cumulative[i] + t * length,
        walkMeters: walk,
      });
  }
  found.sort((a, b) => a.walkMeters - b.walkMeters);
  const unique = [];
  for (const candidate of found) {
    if (!unique.some((v) => Math.abs(v.along - candidate.along) < 40))
      unique.push(candidate);
    if (unique.length === 4) break;
  }
  return unique;
}
export function sliceGeometry(index, board, alight) {
  if (alight.along <= board.along) return [];
  return [
    board.point,
    ...index.points.slice(board.segment + 1, alight.segment + 1),
    alight.point,
  ].filter((p, i, a) => i === 0 || meters(a[i - 1], p) > 0.01);
}
export function verifiedCodes(crosswalks, routeId, direction) {
  return (crosswalks || [])
    .filter(
      (c) =>
        c.lptrp_route_id === routeId &&
        c.direction === direction &&
        c.verification_status === "verified" &&
        c.operational_status === "active" &&
        c.approved_at &&
        c.verified_at &&
        c.verified_by &&
        /^https:\/\//.test(c.evidence_url) &&
        ["official", "field_confirmed"].includes(c.evidence_type),
    )
    .map((c) => c.traditional_code);
}
export function fareForLeg(
  distanceMeters,
  policies,
  vehicle = "unknown",
  passenger = "regular",
  date = new Date().toISOString().slice(0, 10),
) {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  const candidates = (policies || []).filter(
    (p) =>
      p.verification_status === "verified" &&
      p.approved_at &&
      p.region === "CDO" &&
      p.vehicle === vehicle &&
      p.effective_from <= date &&
      p.effective_to >= date &&
      /^https:\/\//.test(p.source_url),
  );
  if (candidates.length !== 1) return null;
  const p = candidates[0];
  const breakdown = calculateFareBreakdown(distanceMeters, p, passenger);
  return breakdown
    ? {
        ...breakdown,
        policyId: p.id,
        source: p.source_url,
        effective: p.effective_from,
        vehicle,
        passenger,
      }
    : null;
}
export function planGeometricTrips({
  origin,
  destination,
  routes,
  crosswalks = [],
  farePolicies = [],
  fareReference = null,
  vehicleClassifications = [],
  transferLinks = [],
  preferences = {},
}) {
  if (!validPoint(origin) || !validPoint(destination))
    throw new Error(
      "Choose origin and destination points within the CDO region.",
    );
  if (meters(origin, destination) < 20)
    return {
      trips: [],
      reason: "Origin and destination are effectively the same point.",
      limits: tripDefaults,
    };
  const limits = {
    ...tripDefaults,
    maxWalkMeters: Math.min(
      1000,
      Math.max(50, Number(preferences.maxWalkMeters) || 500),
    ),
  };
  const entries = routes
    .filter((r) => r.visible !== false && r.operationalStatus !== "inactive")
    .flatMap((r) =>
      Object.entries(r.geometry || {}).map(([direction, points]) => ({
        route: r,
        direction,
        index: r._indexes?.[direction] || indexGeometry(points),
      })),
    )
    .filter((e) => e.index);
  const trips = [];
  function leg(entry, board, alight) {
    const rideMeters = alight.along - board.along;
    const vehicleType = verifiedVehicleType(
      vehicleClassifications,
      entry.route.id,
      entry.direction,
    );
    return {
      routeId: entry.route.id,
      vehicleType,
      boardAlongMeters: board.along,
      alightAlongMeters: alight.along,
      referenceFares: referenceForLeg(
        rideMeters,
        fareReference,
        vehicleType,
        preferences.passenger,
      ),
      label: entry.route.name,
      direction: entry.direction,
      board: board.point,
      alight: alight.point,
      rideMeters,
      geometry: sliceGeometry(entry.index, board, alight),
      codes: verifiedCodes(crosswalks, entry.route.id, entry.direction),
      roads: entry.route.roadsByDirection?.[entry.direction] || [],
      source: entry.route.source,
      fare: fareForLeg(
        rideMeters,
        farePolicies,
        vehicleType,
        preferences.passenger,
      ),
      boardingStatus:
        "Approximate boarding area — not an official stop. Confirm with driver.",
    };
  }
  function push(legs, walks) {
    const walkingMeters = walks.reduce((n, w) => n + w.distanceMeters, 0),
      rideMeters = legs.reduce((n, l) => n + l.rideMeters, 0);
    trips.push({
      id: legs
        .map(
          (l) =>
            `${l.routeId}:${l.direction}:${Math.round(l.boardAlongMeters * 1000)}:${Math.round(l.alightAlongMeters * 1000)}`,
        )
        .join("|"),
      referenceFare: sumReferenceFares(legs),
      legs,
      walks,
      transfers: legs.length - 1,
      walkingMeters,
      rideMeters,
      totalMeters: walkingMeters + rideMeters,
      confidence:
        "Low — geometry only; operations and pedestrian access unverified",
      fare: legs.every((l) => l.fare)
        ? legs.reduce((n, l) => n + l.fare.amountCents, 0) / 100
        : null,
    });
  }
  const walk = (from, to) => ({
    from,
    to,
    geometry: [from, to],
    distanceMeters: meters(from, to),
    method: "straight_line",
    note: "Straight-line access estimate; safe pedestrian route is unverified.",
  });
  for (const entry of entries) {
    const boards = projectToLine(origin, entry.index, limits.maxWalkMeters),
      alights = projectToLine(destination, entry.index, limits.maxWalkMeters);
    let best;
    for (const b of boards)
      for (const a of alights) {
        if (a.along - b.along < limits.minRideMeters) continue;
        const score = b.walkMeters + a.walkMeters + (a.along - b.along) * 0.02;
        if (!best || score < best.score) best = { b, a, score };
      }
    if (best)
      push(
        [leg(entry, best.b, best.a)],
        [walk(origin, best.b.point), walk(best.a.point, destination)],
      );
  }
  // No transfers are inferred from intersections. Only independently reviewed links qualify.
  if (!trips.length && preferences.allowTransfers !== false) {
    for (const link of transferLinks
      .filter(
        (t) =>
          t.verified === true &&
          t.evidence_url &&
          t.fromRouteId !== t.toRouteId,
      )
      .slice(0, 30)) {
      const first = entries.find(
          (e) =>
            e.route.id === link.fromRouteId &&
            e.direction === link.fromDirection,
        ),
        second = entries.find(
          (e) =>
            e.route.id === link.toRouteId && e.direction === link.toDirection,
        );
      if (!first || !second) continue;
      const a = projectToLine(origin, first.index, limits.maxWalkMeters)[0],
        b = projectToLine(link.fromPoint, first.index, 15)[0],
        c = projectToLine(link.toPoint, second.index, 15)[0],
        d = projectToLine(destination, second.index, limits.maxWalkMeters)[0];
      if (
        !a ||
        !b ||
        !c ||
        !d ||
        b.along - a.along < limits.minRideMeters ||
        d.along - c.along < limits.minRideMeters ||
        meters(b.point, c.point) > limits.maxTransferWalkMeters
      )
        continue;
      push(
        [leg(first, a, b), leg(second, c, d)],
        [
          walk(origin, a.point),
          walk(b.point, c.point),
          walk(d.point, destination),
        ],
      );
    }
  }
  const sorted = sortTrips(trips, preferences.sort).slice(0, limits.maxResults);
  for (const t of sorted)
    t.sharesRideWith = sorted
      .filter((other) => other.id !== t.id && sameRideShape(t, other))
      .map((other) => other.id);
  return {
    trips: sorted.slice(0, limits.maxResults),
    limits,
    reason: trips.length
      ? ""
      : "No directed geometric match within the access-distance limit. No unverified transfers were inferred.",
    caveats: [
      "Projected areas are not verified boarding stops.",
      "Straight-line access may cross barriers or unsafe roads; confirm a pedestrian route.",
      "Road names describe the complete directional path, not a verified segment-to-street match.",
      "No live travel times or service schedules are inferred.",
    ],
    transferNote: transferLinks.length
      ? "Transfers use reviewed links only."
      : "No verified transfer links supplied; transfer recommendations are unavailable.",
  };
}
export function sortTrips(trips, sort = "walking") {
  return [...trips].sort((a, b) =>
    sort === "fare"
      ? (a.fare === null && b.fare === null
          ? 0
          : a.fare === null
            ? 1
            : b.fare === null
              ? -1
              : a.fare - b.fare) || a.walkingMeters - b.walkingMeters
      : sort === "distance"
        ? a.totalMeters - b.totalMeters
        : sort === "transfers"
          ? a.transfers - b.transfers || a.walkingMeters - b.walkingMeters
          : a.walkingMeters - b.walkingMeters ||
            a.transfers - b.transfers ||
            a.rideMeters - b.rideMeters,
  );
}
export async function refineWalking(result, router, preferences = {}) {
  if (!router) return result;
  const trips = [];
  for (const trip of result.trips) {
    let failed = false;
    const walks = [];
    for (const w of trip.walks) {
      try {
        const path = await router(w.from, w.to);
        if (
          !path ||
          !Number.isFinite(path.distanceMeters) ||
          path.distanceMeters < 0 ||
          !Array.isArray(path.geometry) ||
          path.geometry.length < 2 ||
          !path.geometry.every(validPoint) ||
          meters(path.geometry[0], w.from) > 50 ||
          meters(path.geometry.at(-1), w.to) > 50
        ) {
          failed = true;
          break;
        }
        walks.push({
          ...w,
          ...path,
          method: "pedestrian_router",
          note: "Estimated pedestrian route; verify local access.",
        });
      } catch {
        failed = true;
        break;
      }
    }
    if (failed) continue;
    if (
      walks.some(
        (w, i) =>
          w.distanceMeters >
          (i === 1 && trip.transfers
            ? result.limits.maxTransferWalkMeters
            : result.limits.maxWalkMeters),
      )
    )
      continue;
    const walkingMeters = walks.reduce((n, w) => n + w.distanceMeters, 0);
    trips.push({
      ...trip,
      walks,
      walkingMeters,
      totalMeters: walkingMeters + trip.rideMeters,
    });
  }
  return {
    ...result,
    trips: sortTrips(trips, preferences.sort),
    reason: trips.length
      ? ""
      : "No candidate could be confirmed by the configured pedestrian router. Check access or retry.",
  };
}

export function sameRideShape(a, b) {
  if (a.legs.length !== b.legs.length) return false;
  const sample = (index, fraction) => {
    const target = index.length * fraction;
    let i = 1;
    while (i < index.cumulative.length - 1 && index.cumulative[i] < target) i++;
    const segment = index.cumulative[i] - index.cumulative[i - 1];
    return interpolate(
      index.points[i - 1],
      index.points[i],
      segment ? (target - index.cumulative[i - 1]) / segment : 0,
      segment / EARTH,
    );
  };
  return a.legs.every((leg, i) => {
    const left = indexGeometry(leg.geometry),
      right = indexGeometry(b.legs[i].geometry);
    if (!left || !right || Math.abs(left.length - right.length) > 2)
      return false;
    for (let k = 0; k <= 32; k++)
      if (meters(sample(left, k / 32), sample(right, k / 32)) > 2) return false;
    return true;
  });
}
