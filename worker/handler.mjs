import {
  indexGeometry,
  planGeometricTrips,
  refineWalking,
  validPoint,
  verifiedCodes,
} from "../shared/trips.mjs";
import { readVerification, verificationEndpoint } from "./verification.mjs";
import { withConfiguredStorage } from "./supabase-store.mjs";

// Route states from the CDO LPTRP. Routes that are not yet operational stay
// visible in the directory (clearly labelled) but are never offered as trips.
const OPERATIONAL_STATUSES = ["unverified", "not_yet_operational", "for_clarification"];
const plannable = (r) => r.visible && r.operationalStatus !== "not_yet_operational";
const defaults = {
  headline: "Where to today?",
  description:
    "Explore jeepney routes around Cagayan de Oro. A little local knowledge for your next sakay.",
  announcement: "",
  maintenance: false,
};
const STATE_KEY = "sakaygo/catalog-state-v1.json";
const response = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
export function isAdmin(request, env) {
  const email = request.headers.get("oai-authenticated-user-email");
  return (
    !!env.SAKAYGO_ADMIN_EMAIL &&
    !!request.headers.get("oai-authenticated-user-id") &&
    email?.toLowerCase() === env.SAKAYGO_ADMIN_EMAIL.toLowerCase()
  );
}
export function validateState(input, baseIds) {
  const fail = () => {
    throw new Error(
      "Invalid settings or route data. Check field lengths, IDs and coordinates.",
    );
  };
  const str = (v, max = 300) => typeof v === "string" && v.length <= max;
  const strings = (v, maxItems) =>
    Array.isArray(v)
      ? v.filter((x) => str(x, 200) && x.trim()).slice(0, maxItems)
      : [];
  if (
    !input ||
    !input.settings ||
    !Array.isArray(input.routes) ||
    input.routes.length > 250
  )
    fail();
  const s = input.settings;
  if (
    !str(s.headline, 80) ||
    !s.headline.trim() ||
    !str(s.description, 240) ||
    !str(s.announcement, 500) ||
    typeof s.maintenance !== "boolean"
  )
    fail();
  const ids = new Set();
  const routes = input.routes.map((r) => {
    if (!r || !str(r.id, 50) || !/^[-a-zA-Z0-9]+$/.test(r.id) || ids.has(r.id))
      fail();
    ids.add(r.id);
    for (const k of ["name", "from", "to", "source"])
      if (!str(r[k], 300) || !r[k].trim()) fail();
    if (
      !str(r.sourceUpdated, 80) ||
      !str(r.reviewNotes, 1500) ||
      !str(r.reviewedAt, 30) ||
      typeof r.visible !== "boolean" ||
      !["unverified", "under_review", "approved"].includes(r.status)
    )
      fail();
    if (
      !Array.isArray(r.roads) ||
      r.roads.length > 300 ||
      !r.roads.every((v) => str(v, 200))
    )
      fail();
    if (
      !Array.isArray(r.directions) ||
      !r.directions.length ||
      r.directions.length > 2 ||
      new Set(r.directions).size !== r.directions.length ||
      !r.directions.every((v) => ["inbound", "outbound"].includes(v))
    )
      fail();
    let geometry;
    if (r.geometry !== undefined) {
      geometry = {};
      for (const dir of r.directions) {
        const points = r.geometry[dir];
        if (
          !Array.isArray(points) ||
          points.length < 2 ||
          points.length > 10000 ||
          !points.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              Number.isFinite(p[0]) &&
              Number.isFinite(p[1]) &&
              p[0] >= 7 &&
              p[0] <= 10 &&
              p[1] >= 123 &&
              p[1] <= 126,
          )
        )
          fail();
        geometry[dir] = points;
      }
    } else if (!baseIds.has(r.id)) fail();
    return {
      id: r.id,
      name: r.name.trim(),
      from: r.from.trim(),
      to: r.to.trim(),
      source: r.source.trim(),
      sourceUpdated: r.sourceUpdated,
      visible: r.visible,
      status: r.status,
      reviewNotes: r.reviewNotes,
      reviewedAt: r.reviewedAt,
      roads: r.roads,
      roadsByDirection:
        r.roadsByDirection &&
        Object.values(r.roadsByDirection).every(
          (v) =>
            Array.isArray(v) && v.length <= 300 && v.every((s) => str(s, 200)),
        )
          ? r.roadsByDirection
          : {},
      routeIdentifier: str(r.routeIdentifier, 80) ? r.routeIdentifier : "",
      ...(str(r.sourceRouteId, 120) && /^[a-z0-9-]+$/.test(r.sourceRouteId)
        ? { sourceRouteId: r.sourceRouteId }
        : {}),
      signboardCode: "",
      license: "not verified",
      // LPTRP route state; anything unknown falls back to "unverified".
      operationalStatus: OPERATIONAL_STATUSES.includes(r.operationalStatus)
        ? r.operationalStatus
        : "unverified",
      landmarks: strings(r.landmarks, 80),
      transferPoints: strings(r.transferPoints, 20),
      stops: Array.isArray(r.stops)
        ? r.stops
            .filter(
              (st) =>
                st &&
                str(st.name, 200) &&
                st.name.trim() &&
                Number.isFinite(st.lat) &&
                Number.isFinite(st.lng) &&
                st.lat >= 7 &&
                st.lat <= 10 &&
                st.lng >= 123 &&
                st.lng <= 126,
            )
            .slice(0, 50)
            .map((st) => ({
              name: st.name.trim(),
              lat: st.lat,
              lng: st.lng,
              type: str(st.type, 40) ? st.type : "area",
            }))
        : [],
      fieldVerification: {
        label: "unverified",
        geometry: "unverified",
        roads: "unverified",
        stops:
          Array.isArray(r.stops) && r.stops.length
            ? "source_reference"
            : "unavailable",
        signboard_code: "unverified",
        fares: "unavailable",
        operation: "unverified",
      },
      missingDirections: ["inbound", "outbound"].filter(
        (d) => !r.directions.includes(d),
      ),
      directions: r.directions,
      ...(geometry ? { geometry } : {}),
    };
  });
  return {
    settings: {
      headline: s.headline.trim(),
      description: s.description.trim(),
      announcement: s.announcement.trim(),
      maintenance: s.maintenance,
    },
    routes,
  };
}
export function createHandler({
  baseRoutes,
  assets,
  researchCodes = [],
  fareReference = null,
}) {
  const baseIds = new Set(baseRoutes.map((r) => r.id));
  const geometryCache = new Map(),
    indexed = new WeakMap(),
    placeCache = new Map(),
    quotas = new Map();
  function geometryFor(route) {
    if (route.geometry) return route.geometry;
    if (geometryCache.has(route.id)) return geometryCache.get(route.id);
    const asset = assets[`/data/routes/${route.id}.json`];
    if (!asset) return {};
    const shape = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0)),
      ),
    );
    geometryCache.set(route.id, shape);
    return shape;
  }
  function routeForPlanning(route) {
    const geometry = geometryFor(route);
    if (!indexed.has(geometry))
      indexed.set(
        geometry,
        Object.fromEntries(
          Object.entries(geometry).map(([d, p]) => [d, indexGeometry(p)]),
        ),
      );
    return { ...route, geometry, _indexes: indexed.get(geometry) };
  }
  function permitted(request, kind, limit) {
    const key =
      kind +
      ":" +
      (request.headers.get("oai-authenticated-user-id") ||
        request.headers.get("cf-connecting-ip") ||
        "local");
    const now = Date.now(),
      old = quotas.get(key);
    const q = old && now - old.start < 60000 ? old : { start: now, count: 0 };
    q.count++;
    quotas.set(key, q);
    if (quotas.size > 1000)
      for (const [k, v] of quotas) if (now - v.start > 60000) quotas.delete(k);
    return q.count <= limit;
  }
  async function read(env) {
    if (!env.BUCKET) throw new Error("storage");
    const obj = await env.BUCKET.get(STATE_KEY);
    const result = obj
      ? { state: await obj.json(), etag: obj.etag }
      : {
          state: {
            routes: baseRoutes,
            settings: defaults,
            revision: 0,
            updatedAt: "",
          },
          etag: "initial",
        };
    result.state.routes = result.state.routes.map((r) => ({
      ...baseRoutes.find((b) => b.id === r.id),
      ...r,
    }));
    return result;
  }
  return {
    async fetch(request, env) {
      const url = new URL(request.url),
        p = url.pathname;
      try {
        env = withConfiguredStorage(env, async (key, previous) => {
          if (key !== STATE_KEY)
            return previous || { crosswalks: [], farePolicies: [], vehicleClassifications: [], events: [], revision: 0 };
          const state = previous || { routes: baseRoutes, settings: defaults, revision: 0, updatedAt: "" };
          return { ...state, routes: state.routes.map((route) => ({ ...route, geometry: geometryFor(route) })) };
        });
        if (p === "/api/session")
          return response({
            admin: isAdmin(request, env),
            signedIn: !!request.headers.get("oai-authenticated-user-id"),
          });
        if (p === "/api/test-cases" && request.method === "GET") {
          const asset = assets["/data/geometric-test-cases.json"];
          return asset
            ? new Response(
                Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0)),
                {
                  headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache",
                  },
                },
              )
            : response({ error: "Test cases unavailable" }, 404);
        }
        if (p === "/api/route-codes" && request.method === "GET") {
          const { state } = await readVerification(env);
          return response({
            research: researchCodes,
            crosswalks: state.crosswalks
              .filter((c) => c.verification_status === "verified")
              .map(({ verified_by, ...c }) => c),
            note: "Research only. Traditional R1/R2 codes are not LPTRP variant identifiers.",
          });
        }
        if (p === "/api/fare-reference" && request.method === "GET")
          return response({ reference: fareReference });
        if (p === "/api/fare-policies/current" && request.method === "GET") {
          const { state } = await readVerification(env);
          const today = new Date().toISOString().slice(0, 10);
          return response({
            policies: state.farePolicies
              .filter(
                (p) =>
                  p.verification_status === "verified" &&
                  p.approved_at &&
                  p.effective_from <= today &&
                  p.effective_to >= today,
              )
              .map(({ verified_by, ...p }) => p),
            unavailableMessage:
              "Fare unavailable — awaiting verified LTFRB matrix",
          });
        }
        if (p === "/api/places" && request.method === "GET") {
          const q = (url.searchParams.get("q") || "").trim();
          if (q.length < 3 || q.length > 120)
            return response(
              { error: "Search text must be 3–120 characters." },
              400,
            );
          const cached = placeCache.get(q.toLowerCase());
          if (cached && Date.now() - cached.at < 600000)
            return response(cached.result);
          if (!permitted(request, "places", 20))
            return response(
              {
                error:
                  "Place search limit reached. Wait a minute or pick points on the map.",
              },
              429,
              { "Retry-After": "60" },
            );
          const provider = new URL(
            env.GEOSEARCH_URL || "https://photon.komoot.io/api/",
          );
          if (provider.protocol !== "https:")
            return response(
              {
                error:
                  "Place provider is not configured securely. Use map points.",
              },
              503,
            );
          provider.searchParams.set("q", q);
          provider.searchParams.set("limit", "5");
          provider.searchParams.set("bbox", "124.2,8.1,125,8.8");
          provider.searchParams.set("lat", "8.48");
          provider.searchParams.set("lon", "124.65");
          try {
            const upstream = await fetch(provider, {
              signal: AbortSignal.timeout(7000),
              headers: { Accept: "application/json" },
            });
            if (!upstream.ok) throw new Error();
            const body = await upstream.json();
            const places = (body.features || [])
              .map((f) => ({
                label: [
                  f.properties?.name,
                  f.properties?.street,
                  f.properties?.city,
                ]
                  .filter(Boolean)
                  .join(", "),
                point: [
                  f.geometry?.coordinates?.[1],
                  f.geometry?.coordinates?.[0],
                ],
                source: "Photon / OpenStreetMap",
              }))
              .filter((p) => p.label && validPoint(p.point))
              .slice(0, 5);
            const result = {
              places,
              attribution:
                env.GEOSEARCH_ATTRIBUTION ||
                "Place search: Photon by komoot · © OpenStreetMap contributors",
            };
            if (placeCache.size > 100)
              placeCache.delete(placeCache.keys().next().value);
            placeCache.set(q.toLowerCase(), { at: Date.now(), result });
            return response(result);
          } catch {
            return response(
              {
                error:
                  "Place search is unavailable. Retry or choose exact points on the map.",
              },
              502,
            );
          }
        }
        if (p === "/api/trips/plan" && request.method === "POST") {
          if (!permitted(request, "trips", 30))
            return response(
              { error: "Too many trip searches. Please wait a minute." },
              429,
            );
          const text = await request.text();
          if (text.length > 4096)
            return response({ error: "Trip request too large" }, 413);
          let input;
          try {
            input = JSON.parse(text);
            if (
              !validPoint(input.origin) ||
              !validPoint(input.destination) ||
              (input.preferences?.maxWalkMeters !== undefined &&
                (!Number.isFinite(input.preferences.maxWalkMeters) ||
                  input.preferences.maxWalkMeters < 50 ||
                  input.preferences.maxWalkMeters > 1000)) ||
              (input.preferences?.sort &&
                !["walking", "transfers", "distance", "fare"].includes(
                  input.preferences.sort,
                )) ||
              (input.preferences?.vehicle &&
                !["traditional", "modern"].includes(
                  input.preferences.vehicle,
                )) ||
              (input.preferences?.passenger &&
                !["regular", "student", "senior", "pwd"].includes(
                  input.preferences.passenger,
                ))
            )
              throw new Error();
          } catch {
            return response(
              {
                error:
                  "Choose two valid CDO points and an access limit from 50 to 1000 meters.",
              },
              400,
            );
          }
          const { state } = await read(env);
          if (state.settings.maintenance)
            return response(
              { error: "Trip planning is paused for maintenance." },
              503,
            );
          const verification = (await readVerification(env)).state;
          let result = planGeometricTrips({
            ...input,
            routes: state.routes.filter(plannable).map(routeForPlanning),
            crosswalks: verification.crosswalks,
            farePolicies: verification.farePolicies,
            fareReference,
            vehicleClassifications: verification.vehicleClassifications || [],
          });
          if (env.WALK_ROUTER_URL) {
            const endpoint = new URL(env.WALK_ROUTER_URL);
            if (endpoint.protocol !== "https:")
              return response(
                { error: "Pedestrian router must use HTTPS" },
                503,
              );
            result = await refineWalking(
              result,
              async (origin, destination) => {
                const res = await fetch(endpoint, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(env.WALK_ROUTER_TOKEN
                      ? { Authorization: "Bearer " + env.WALK_ROUTER_TOKEN }
                      : {}),
                  },
                  body: JSON.stringify({ origin, destination }),
                  signal: AbortSignal.timeout(5000),
                });
                if (!res.ok) throw new Error();
                return res.json();
              },
              input.preferences,
            );
          }
          return response(result);
        }
        if (p.startsWith("/api/admin/")) {
          if (!isAdmin(request, env))
            return response(
              {
                error:
                  "Owner access required. Sign in with the site owner account.",
              },
              403,
            );
          if (p === "/api/admin/verification")
            return verificationEndpoint(
              request,
              env,
              (await read(env)).state.routes,
            );
          if (p !== "/api/admin/state")
            return response({ error: "Not found" }, 404);
          if (request.method === "GET") {
            const { state, etag } = await read(env);
            return response(state, 200, { ETag: etag });
          }
          if (request.method !== "PUT")
            return response({ error: "Method not allowed" }, 405, {
              Allow: "GET, PUT",
            });
          if (request.headers.get("origin") !== url.origin)
            return response({ error: "Same-origin request required" }, 403);
          if (
            !request.headers.get("content-type")?.startsWith("application/json")
          )
            return response({ error: "JSON required" }, 415);
          if (Number(request.headers.get("content-length")) > 6000000)
            return response({ error: "Dataset exceeds 6 MB limit" }, 413);
          const raw = await request.text();
          if (raw.length > 6000000)
            return response({ error: "Dataset exceeds 6 MB limit" }, 413);
          let parsed;
          try {
            parsed = validateState(JSON.parse(raw), baseIds);
          } catch {
            return response(
              {
                error:
                  "Invalid settings or route data. Check field lengths, IDs and coordinates.",
              },
              400,
            );
          }
          const current = await read(env);
          if (request.headers.get("if-match") !== current.etag)
            return response(
              {
                error:
                  "Someone saved newer changes. Reload the latest version before saving.",
              },
              409,
            );
          const state = {
            ...parsed,
            revision: current.state.revision + 1,
            updatedAt: new Date().toISOString(),
          };
          const saved = await env.BUCKET.put(STATE_KEY, JSON.stringify(state), {
            onlyIf:
              current.etag === "initial"
                ? { etagDoesNotMatch: "*" }
                : { etagMatches: current.etag },
            httpMetadata: { contentType: "application/json" },
          });
          if (!saved)
            return response(
              { error: "A newer version was saved. Reload before saving." },
              409,
            );
          return response(state, 200, { ETag: saved.etag });
        }
        if (
          (p === "/api/catalog" || p === "/api/routes") &&
          request.method === "GET"
        ) {
          const { state } = await read(env);
          const verification = (await readVerification(env)).state;
          return response({
            settings: state.settings,
            revision: state.revision,
            updatedAt: state.updatedAt,
            routes: state.settings.maintenance
              ? []
              : state.routes
                  .filter((r) => r.visible)
                  .map(({ geometry, reviewNotes, ...r }) => ({
                    ...r,
                    verifiedCodes: Object.fromEntries(
                      r.directions.map((d) => [
                        d,
                        verifiedCodes(verification.crosswalks, r.id, d),
                      ]),
                    ),
                  })),
          });
        }
        if (
          (p.startsWith("/api/catalog/") || p.startsWith("/api/routes/")) &&
          request.method === "GET"
        ) {
          const id = decodeURIComponent(p.split("/").at(-1));
          const { state } = await read(env);
          const route = state.routes.find((r) => r.id === id && r.visible);
          if (!route || state.settings.maintenance)
            return response({ error: "Route is not available" }, 404);
          let geometry = route.geometry;
          if (!geometry) {
            const asset = assets[`/data/routes/${id}.json`];
            if (!asset) return response({ error: "Geometry unavailable" }, 404);
            geometry = JSON.parse(
              new TextDecoder().decode(
                Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0)),
              ),
            );
          }
          const { reviewNotes, ...safe } = route;
          const verification = (await readVerification(env)).state;
          return response({
            ...safe,
            geometry,
            verifiedCodes: Object.fromEntries(
              route.directions.map((d) => [
                d,
                verifiedCodes(verification.crosswalks, route.id, d),
              ]),
            ),
          });
        }
        if (p.startsWith("/api/"))
          return response({ error: "Endpoint not found" }, 404);
        // Dataset files are only served through the catalog API, so archived routes stay hidden.
        if (p.startsWith("/data/"))
          return response({ error: "Not found" }, 404);
        if (!["GET", "HEAD"].includes(request.method))
          return response({ error: "Method not allowed" }, 405);
        const file =
          assets[p] || (!p.includes(".") ? assets["/index.html"] : null);
        if (!file) return new Response("Not found", { status: 404 });
        const bytes = Uint8Array.from(atob(file.body), (c) => c.charCodeAt(0));
        return new Response(request.method === "HEAD" ? null : bytes, {
          headers: {
            "Content-Type": file.type,
            "Cache-Control": p.startsWith("/assets/")
              ? "public, max-age=31536000, immutable"
              : "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          },
        });
      } catch {
        return response(
          { error: "Service unavailable. Please retry shortly." },
          503,
        );
      }
    },
  };
}
