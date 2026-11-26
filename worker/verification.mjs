const VERIFICATION_KEY = "sakaygo/verification-v1.json";
const vJson = (v, status = 200, headers = {}) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
export async function readVerification(env) {
  const obj = await env.BUCKET.get(VERIFICATION_KEY);
  return obj
    ? { state: await obj.json(), etag: obj.etag }
    : {
        state: { crosswalks: [], farePolicies: [], events: [], revision: 0 },
        etag: "initial",
      };
}
const secureUrl = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
const dateString = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function validateVerification(
  input,
  routes,
  actor,
  now = new Date().toISOString(),
) {
  const bad = (message) => {
    throw new Error(message);
  };
  if (
    !Array.isArray(input.crosswalks) ||
    input.crosswalks.length > 500 ||
    !Array.isArray(input.farePolicies) ||
    input.farePolicies.length > 50
  )
    bad("Expected crosswalks and farePolicies arrays within limits.");
  const approve = input.approve === true,
    ids = new Set();
  const crosswalks = input.crosswalks.map((c) => {
    if (
      !c ||
      typeof c.id !== "string" ||
      !/^[-a-zA-Z0-9]{1,60}$/.test(c.id) ||
      ids.has(c.id)
    )
      bad("Crosswalk IDs must be unique.");
    ids.add(c.id);
    if (
      !/^[A-Z0-9]{1,10}$/.test(c.traditional_code) ||
      !routes.some(
        (r) => r.id === c.lptrp_route_id && r.directions.includes(c.direction),
      )
    )
      bad("Crosswalk must refer to an existing route and supplied direction.");
    if (
      !["pending", "verified"].includes(c.verification_status) ||
      !["active", "inactive", "unknown"].includes(c.operational_status) ||
      !Number.isFinite(c.confidence) ||
      c.confidence < 0 ||
      c.confidence > 1
    )
      bad("Invalid crosswalk status or confidence.");
    if (
      c.verification_status === "verified" &&
      (!approve ||
        !secureUrl(c.evidence_url) ||
        !["official", "field_confirmed"].includes(c.evidence_type))
    )
      bad(
        "Verified crosswalks require explicit approval and official or field-confirmed evidence.",
      );
    if (
      typeof c.alias !== "string" ||
      c.alias.length > 200 ||
      typeof c.notes !== "string" ||
      c.notes.length > 1000 ||
      typeof c.evidence_url !== "string" ||
      c.evidence_url.length > 1000
    )
      bad("Invalid crosswalk text fields.");
    return {
      id: c.id,
      traditional_code: c.traditional_code,
      lptrp_route_id: c.lptrp_route_id,
      direction: c.direction,
      alias: c.alias,
      evidence_url: c.evidence_url,
      evidence_type: c.evidence_type,
      verification_status: c.verification_status,
      operational_status: c.operational_status,
      confidence: c.confidence,
      notes: c.notes,
      verified_at:
        c.verification_status === "verified" ? now.slice(0, 10) : null,
      verified_by: c.verification_status === "verified" ? actor : null,
      approved_at: c.verification_status === "verified" ? now : null,
    };
  });
  const policyIds = new Set();
  const farePolicies = input.farePolicies.map((p) => {
    if (
      !p ||
      typeof p.id !== "string" ||
      !/^[-a-zA-Z0-9]{1,60}$/.test(p.id) ||
      policyIds.has(p.id)
    )
      bad("Policy IDs must be unique.");
    policyIds.add(p.id);
    if (
      !["pending", "verified"].includes(p.verification_status) ||
      p.region !== "CDO" ||
      !["traditional", "modern"].includes(p.vehicle) ||
      !dateString(p.effective_from) ||
      !dateString(p.effective_to) ||
      p.effective_to < p.effective_from
    )
      bad("Invalid fare policy region, vehicle or date range.");
    if (
      p.verification_status === "verified" &&
      (!approve ||
        !secureUrl(p.source_url) ||
        !["official", "field_confirmed"].includes(p.evidence_type))
    )
      bad(
        "Fare policies require explicit approval and applicable official evidence.",
      );
    for (const k of ["base_distance_km", "base_fare", "per_km"])
      if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 100000)
        bad("Fare values must be finite and nonnegative.");
    if (
      !Number.isFinite(p.round_to) ||
      p.round_to <= 0 ||
      p.round_to > 1000 ||
      !["nearest", "ceil", "floor"].includes(p.rounding) ||
      !["started_km", "proportional"].includes(p.increment_mode)
    )
      bad("Invalid increment or rounding rules.");
    if (
      !p.discounts ||
      !["student", "senior", "pwd"].every(
        (k) =>
          p.discounts[k] === null ||
          (Number.isFinite(p.discounts[k]) &&
            p.discounts[k] >= 0 &&
            p.discounts[k] <= 1),
      )
    )
      bad("Specify each discount or null when eligibility is unknown.");
    const matrix = p.matrix || [];
    if (
      !Array.isArray(matrix) ||
      matrix.length > 200 ||
      !matrix.every(
        (v) =>
          Number.isFinite(v.upToKm) &&
          v.upToKm > 0 &&
          Number.isFinite(v.fare) &&
          v.fare >= 0,
      ) ||
      new Set(matrix.map((v) => v.upToKm)).size !== matrix.length
    )
      bad("Invalid distance fare matrix.");
    return {
      id: p.id,
      region: p.region,
      vehicle: p.vehicle,
      effective_from: p.effective_from,
      effective_to: p.effective_to,
      base_distance_km: p.base_distance_km,
      base_fare: p.base_fare,
      per_km: p.per_km,
      increment_mode: p.increment_mode,
      round_to: p.round_to,
      rounding: p.rounding,
      discounts: p.discounts,
      matrix,
      source_url: p.source_url,
      evidence_type: p.evidence_type,
      verification_status: p.verification_status,
      verified_by: p.verification_status === "verified" ? actor : null,
      approved_at: p.verification_status === "verified" ? now : null,
    };
  });
  const vehicleRows = input.vehicleClassifications || [];
  if (!Array.isArray(vehicleRows) || vehicleRows.length > 500)
    bad("Invalid vehicle classifications.");
  const vehicleKeys = new Set();
  const vehicleClassifications = vehicleRows.map((c) => {
    if (!c || typeof c !== "object") bad("Invalid vehicle classification.");
    const key = `${c.routeId}:${c.direction}`;
    if (
      !c ||
      vehicleKeys.has(key) ||
      !routes.some(
        (r) => r.id === c.routeId && r.directions.includes(c.direction),
      ) ||
      !["traditional", "modern"].includes(c.vehicle) ||
      !["pending", "verified"].includes(c.verification_status)
    )
      bad(
        "Vehicle classification requires a unique valid route/direction and vehicle type.",
      );
    vehicleKeys.add(key);
    if (
      c.verification_status === "verified" &&
      (!approve ||
        !secureUrl(c.source_url) ||
        !["official", "field_confirmed"].includes(c.evidence_type))
    )
      bad(
        "Vehicle classification requires explicit approval and source evidence.",
      );
    return {
      routeId: c.routeId,
      direction: c.direction,
      vehicle: c.vehicle,
      source_url: c.source_url || "",
      evidence_type: c.evidence_type || "",
      verification_status: c.verification_status,
      approved_at: c.verification_status === "verified" ? now : null,
      verified_by: c.verification_status === "verified" ? actor : null,
    };
  });
  return { crosswalks, farePolicies, vehicleClassifications };
}
export async function verificationEndpoint(request, env, routes) {
  const current = await readVerification(env);
  if (request.method === "GET")
    return vJson(current.state, 200, { ETag: current.etag });
  if (request.method !== "PUT")
    return vJson({ error: "Method not allowed" }, 405);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return vJson({ error: "Same-origin request required" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return vJson({ error: "JSON required" }, 415);
  if (request.headers.get("if-match") !== current.etag)
    return vJson(
      { error: "A newer verification revision exists. Reload before saving." },
      409,
    );
  const raw = await request.text();
  if (raw.length > 2000000)
    return vJson({ error: "Import exceeds 2 MB limit" }, 413);
  let validated, body;
  try {
    body = JSON.parse(raw);
    validated = validateVerification(
      body,
      routes,
      request.headers.get("oai-authenticated-user-email"),
    );
  } catch (e) {
    return vJson({ error: e.message || "Invalid verification data" }, 400);
  }
  const now = new Date().toISOString();
  const state = {
    ...validated,
    revision: current.state.revision + 1,
    events: [
      ...current.state.events,
      {
        at: now,
        actor: request.headers.get("oai-authenticated-user-email"),
        action: body.approve === true ? "explicit_approval" : "save_pending",
        crosswalkIds: validated.crosswalks.map((c) => c.id),
        policyIds: validated.farePolicies.map((p) => p.id),
        vehicleKeys: validated.vehicleClassifications.map(
          (c) => `${c.routeId}:${c.direction}`,
        ),
      },
    ].slice(-200),
  };
  const saved = await env.BUCKET.put(VERIFICATION_KEY, JSON.stringify(state), {
    onlyIf:
      current.etag === "initial"
        ? { etagDoesNotMatch: "*" }
        : { etagMatches: current.etag },
  });
  if (!saved) return vJson({ error: "Concurrent update. Reload first." }, 409);
  return vJson(state, 200, { ETag: saved.etag });
}
