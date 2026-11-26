// Currency is computed as exact rational centavos. Only geometry distance is
// quantized (to one millimeter); currency rounding occurs once, per ride.
const rat = (value) => {
  const s = String(value);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid nonnegative decimal");
  const [a, b = ""] = s.split(".");
  return [BigInt(a + b), 10n ** BigInt(b.length)];
};
const addR = (a, b) => [a[0] * b[1] + b[0] * a[1], a[1] * b[1]];
const mulR = (a, b) => [a[0] * b[0], a[1] * b[1]];
const valueR = (r) => Number(r[0]) / Number(r[1]);
const centsR = (v) => mulR(rat(v), [100n, 1n]);
function roundedCents(raw, unit, mode) {
  const n = raw[0],
    d = raw[1] * unit,
    q = n / d,
    remainder = n % d;
  return (
    (q +
      (mode === "ceil"
        ? remainder
          ? 1n
          : 0n
        : mode === "floor"
          ? 0n
          : remainder * 2n >= d
            ? 1n
            : 0n)) *
    unit
  );
}
export function calculateFareBreakdown(
  distanceMeters,
  policy,
  passenger = "regular",
) {
  try {
    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0 ||
      !["regular", "student", "senior", "pwd"].includes(passenger)
    )
      return null;
    const discount =
      passenger === "regular" ? 0 : policy.discounts?.[passenger];
    if (
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > 1 ||
      !["nearest", "ceil", "floor"].includes(policy.rounding) ||
      !["started_km", "proportional"].includes(policy.increment_mode)
    )
      return null;
    const distanceMm = BigInt(Math.round(distanceMeters * 1000));
    const km = [distanceMm, 1000000n];
    const base = rat(policy.base_distance_km);
    const extraNumerator = km[0] * base[1] - base[0] * km[1];
    let extra = [extraNumerator > 0n ? extraNumerator : 0n, km[1] * base[1]];
    if (policy.increment_mode === "started_km")
      extra = [(extra[0] + extra[1] - 1n) / extra[1], 1n];
    let baseCharge = centsR(policy.base_fare),
      additional = mulR(extra, centsR(policy.per_km));
    if (policy.matrix?.length) {
      const row = [...policy.matrix]
        .sort((a, b) => a.upToKm - b.upToKm)
        .find((r) => rat(r.upToKm)[0] * km[1] >= km[0] * rat(r.upToKm)[1]);
      if (!row) return null;
      baseCharge = centsR(row.fare);
      additional = [0n, 1n];
    }
    const before = addR(baseCharge, additional),
      dr = rat(discount),
      discountCharge = mulR(before, dr),
      after = mulR(before, [dr[1] - dr[0], dr[1]]),
      unit = centsR(policy.round_to);
    if (unit[0] <= 0n || unit[0] % unit[1] !== 0n) return null;
    const rounded = roundedCents(after, unit[0] / unit[1], policy.rounding);
    if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    const money = (r) => Number((valueR(r) / 100).toFixed(8));
    return {
      amount: Number(rounded) / 100,
      amountCents: Number(rounded),
      distanceMeters,
      baseFare: money(baseCharge),
      baseDistanceKm: policy.base_distance_km,
      additionalDistanceKm: valueR(extra),
      additionalCharge: money(additional),
      undiscounted: money(before),
      discount,
      discountAmount: money(discountCharge),
      afterDiscount: money(after),
      roundingAdjustment: Number(
        (Number(rounded) / 100 - money(after)).toFixed(8),
      ),
      rounding: policy.rounding,
      roundTo: policy.round_to,
      incrementMode: policy.increment_mode,
      matrixApplied: !!policy.matrix?.length,
    };
  } catch {
    return null;
  }
}
export function verifiedVehicleType(classifications, routeId, direction) {
  const matches = (classifications || []).filter(
    (c) =>
      c.routeId === routeId &&
      c.direction === direction &&
      c.verification_status === "verified" &&
      c.approved_at &&
      c.verified_by &&
      /^https:\/\//.test(c.source_url) &&
      ["official", "field_confirmed"].includes(c.evidence_type) &&
      ["traditional", "modern"].includes(c.vehicle),
  );
  return matches.length === 1 ? matches[0].vehicle : "unknown";
}
export function referenceForLeg(
  distanceMeters,
  reference,
  vehicle = "unknown",
  passenger = "regular",
  date = new Date().toISOString().slice(0, 10),
) {
  if (
    !reference ||
    !/^\d{4}-\d{2}-\d{2}$/.test(reference.effective_date) ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    reference.effective_date > date ||
    !reference.rules?.length
  )
    return [];
  return reference.rules
    .filter((r) => vehicle === "unknown" || r.vehicle === vehicle)
    .map((r) => {
      // The supplied lookup establishes whole-kilometer illustrations only. Do not
      // silently invent proportional or started-kilometer billing for a fraction.
      const km = Math.round(distanceMeters * 1000) / 1000000;
      const lowerKm = km <= r.base_distance_km ? km : Math.floor(km),
        upperKm = km <= r.base_distance_km ? km : Math.ceil(km);
      const p = {
        base_fare: r.base_fare_php,
        base_distance_km: r.base_distance_km,
        per_km: r.additional_per_km_php,
        discounts: reference.discounts,
        round_to: 0.25,
        rounding: "nearest",
        increment_mode: "proportional",
      };
      const lower = calculateFareBreakdown(lowerKm * 1000, p, passenger),
        upper = calculateFareBreakdown(upperKm * 1000, p, passenger);
      if (!lower || !upper) return null;
      return {
        vehicle: r.vehicle,
        distanceMeters,
        lowerKm,
        upperKm,
        lower,
        upper,
        minimum: lower.amount,
        maximum: upper.amount,
        classification: vehicle,
        effective: reference.effective_date,
        datasetId: reference.dataset_id,
        sources: reference.sources,
        status: "conditional_national_reference",
        note:
          lowerKm === upperKm
            ? "Supplied reference rules; local applicability, rounding and discount eligibility are unverified."
            : "Whole-kilometer reference bracket. Partial-kilometer billing is unspecified; this is not a guaranteed fare range.",
      };
    })
    .filter(Boolean);
}
export function sumReferenceFares(legs) {
  if (!legs.length || legs.some((l) => !l.referenceFares?.length)) return null;
  let combinations = [
    { vehicles: [], rides: [], minimumCents: 0, maximumCents: 0 },
  ];
  for (const l of legs)
    combinations = combinations
      .flatMap((c) =>
        l.referenceFares.map((r) => ({
          vehicles: [...c.vehicles, r.vehicle],
          rides: [...c.rides, r],
          minimumCents: c.minimumCents + r.lower.amountCents,
          maximumCents: c.maximumCents + r.upper.amountCents,
        })),
      )
      .slice(0, 16);
  return {
    status: "conditional_national_reference",
    scenarios: combinations.map((c) => ({
      ...c,
      minimum: c.minimumCents / 100,
      maximum: c.maximumCents / 100,
    })),
    minimum: Math.min(...combinations.map((c) => c.minimumCents)) / 100,
    maximum: Math.max(...combinations.map((c) => c.maximumCents)) / 100,
  };
}
