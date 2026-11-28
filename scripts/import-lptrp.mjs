// Merge the organised CDO LPTRP dataset (jrequiroso/cdo-jeepney-routes,
// public/data/routes.json) into SakayGo's catalog.
//
//   node scripts/import-lptrp.mjs <routes.json> --bundle
//       Update the bundled fallback: public/data/catalog.json + public/data/routes/<id>.json
//   node scripts/import-lptrp.mjs <routes.json> --local
//       Update the local preview/test store (.local-admin) if it holds a saved catalog (backed up first).
//   node --env-file=.env scripts/import-lptrp.mjs <routes.json> --supabase
//       Dry run against the live Supabase catalog: prints what would change.
//   node --env-file=.env scripts/import-lptrp.mjs <routes.json> --supabase --write --backup <dir>
//       Back up the live document to <dir>, then write the merge (etag-guarded) and verify it.
//
// Existing route IDs, visibility, review status/notes, route identifiers and
// verified codes are preserved. Geometry, street lists, names, landmarks,
// stops and operational status come from the LPTRP dataset. The import aborts
// unless every source route matches exactly one catalog route.
import fs from "node:fs";
import path from "node:path";

const SOURCE_LABEL = "CDO Local Public Transport Route Plan (LPTRP), organised by github.com/jrequiroso/cdo-jeepney-routes";
const STATUS = { "imported-unverified": "unverified", "not-yet-operational": "not_yet_operational", "for-clarification": "for_clarification" };
const KEY = "sakaygo/catalog-state-v1.json";

const [sourcePath, ...flags] = process.argv.slice(2);
const has = (f) => flags.includes(f);
const flagValue = (f) => flags[flags.indexOf(f) + 1];
if (!sourcePath || (!has("--bundle") && !has("--local") && !has("--supabase")))
  throw new Error("Usage: import-lptrp.mjs <routes.json> --bundle | --local | --supabase [--write --backup <dir>]");

// ---------- read and validate the source (treat it as untrusted input) ----------
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
if (!Array.isArray(source) || source.length < 1 || source.length > 250) throw new Error("Source must be an array of routes");
const text = (v, max = 200) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const texts = (v, maxItems, max = 200) => (Array.isArray(v) ? [...new Set(v.map((s) => text(s, max)).filter(Boolean))].slice(0, maxItems) : []);
const inRegion = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= 7 && lat <= 10 && lng >= 123 && lng <= 126;
const line = (pts) => {
  if (!Array.isArray(pts)) return null;
  const clean = pts.filter((p) => Array.isArray(p) && p.length === 2 && inRegion(p[0], p[1])).map(([a, b]) => [Number(a), Number(b)]);
  if (clean.length !== pts.length) throw new Error("Geometry has points outside the CDO region or malformed points");
  return clean.length >= 2 && clean.length <= 10000 ? clean : null;
};
const DISTANCE = /\(?\s*\d+(?:\.\d+)?\s*km\b\s*(?:round\s*trip|roundtrip|rt)?\s*\)?/gi;
const cleanName = (s) => text(s, 300).replace(DISTANCE, "").replace(/\s+-\s*$/, "").replace(/\s{2,}/g, " ").trim();
const norm = (s) => s.normalize("NFKD").toLowerCase().replace(/[–—]/g, "-").replace(DISTANCE, "").replace(/\(r(\d+)\)/g, "r$1").replace(/[^a-z0-9]+/g, " ").trim();

const incoming = source.map((r) => {
  const code = cleanName(r.code);
  const name = cleanName(r.name);
  if (!code || !name) throw new Error(`Route without code/name: ${JSON.stringify(r).slice(0, 120)}`);
  const status = STATUS[r.status];
  if (!status) throw new Error(`Unknown status "${r.status}" on ${code}`);
  const geometry = {};
  for (const d of ["inbound", "outbound"]) { const g = line(r.paths?.[d]); if (g) geometry[d] = g; }
  const directions = Object.keys(geometry);
  if (!directions.length) throw new Error(`No usable geometry for ${code}`);
  const summary = (d) => text(r[d]?.summary, 300).split(/\s+to\s+/i);
  const [from, to] = summary("inbound").length === 2 ? summary("inbound") : [code, name];
  const roadsByDirection = Object.fromEntries(directions.map((d) => [d, texts(r[d]?.streets, 300)]));
  const stops = (Array.isArray(r.stops) ? r.stops : [])
    .map((s) => ({ name: text(s?.name), lat: Number(s?.lat), lng: Number(s?.lng), type: text(s?.type, 40) || "area" }))
    .filter((s) => s.name && inRegion(s.lat, s.lng))
    // The source lists each terminus once per direction; keep each place once.
    .filter((s, i, all) => all.findIndex((t) => t.name.toLowerCase() === s.name.toLowerCase()) === i)
    .slice(0, 50);
  const sourceRouteId = text(r.id, 120);
  if (!/^[a-z0-9-]+$/.test(sourceRouteId)) throw new Error(`Unexpected source route id on ${code}`);
  return {
    sourceRouteId,
    code,
    fullName: name.includes(" - ") || name.includes(" – ") ? `${code} ${name}` : `${code} - ${name}`,
    destination: norm(name.split(/\s[-–]\s/).at(-1)),
    from: cleanName(from) || code,
    to: cleanName(to) || name,
    sourceUpdated: text(r.lastUpdated, 80),
    operationalStatus: status,
    geometry,
    directions,
    roadsByDirection,
    roads: [...new Set(Object.values(roadsByDirection).flat())].slice(0, 300),
    landmarks: texts(r.landmarks, 80),
    transferPoints: texts(r.transferPoints, 20),
    stops,
  };
});

// ---------- match source routes to existing catalog routes ----------
function match(routes) {
  const byExisting = new Map();
  for (const item of incoming) {
    const full = norm(item.fullName);
    const codeKey = norm(item.code.replace(/\(.*?\)/g, ""));
    let hits = routes.filter((r) => norm(r.name) === full);
    if (hits.length !== 1) hits = routes.filter((r) => { const n = norm(r.name); return n.startsWith(codeKey + " ") && n.endsWith(item.destination); });
    if (hits.length !== 1) throw new Error(`Could not match "${item.fullName}" to exactly one catalog route (found ${hits.length})`);
    if (byExisting.has(hits[0].id)) throw new Error(`Two source routes matched catalog route ${hits[0].id} (${hits[0].name})`);
    byExisting.set(hits[0].id, item);
  }
  const missing = routes.filter((r) => !byExisting.has(r.id));
  if (missing.length) throw new Error(`Catalog routes with no LPTRP match: ${missing.map((r) => r.name).join("; ")}`);
  return byExisting;
}

function merge(routes, withGeometry) {
  const matches = match(routes);
  const changes = [];
  const merged = routes.map((r) => {
    const m = matches.get(r.id);
    const next = {
      ...r,
      name: m.fullName,
      from: m.from,
      to: m.to,
      source: SOURCE_LABEL,
      sourceRouteId: m.sourceRouteId,
      sourceUpdated: m.sourceUpdated || r.sourceUpdated,
      roads: m.roads,
      roadsByDirection: m.roadsByDirection,
      directions: m.directions,
      missingDirections: ["inbound", "outbound"].filter((d) => !m.directions.includes(d)),
      operationalStatus: m.operationalStatus,
      landmarks: m.landmarks,
      transferPoints: m.transferPoints,
      stops: m.stops,
      fieldVerification: { ...(r.fieldVerification || {}), stops: m.stops.length ? "source_reference" : "unavailable" },
    };
    if (withGeometry) next.geometry = m.geometry;
    if (r.name !== next.name) changes.push(`rename  ${r.id}: "${r.name}" -> "${next.name}"`);
    if (m.operationalStatus !== "unverified") changes.push(`status  ${r.id}: ${m.operationalStatus} (${next.name})`);
    return next;
  });
  return { merged, changes, matches };
}

// ---------- bundled fallback ----------
if (has("--bundle")) {
  const catalogPath = "public/data/catalog.json";
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const { merged, changes, matches } = merge(catalog.routes, false);
  for (const r of merged) {
    const g = matches.get(r.id).geometry;
    fs.writeFileSync(path.join("public/data/routes", `${r.id}.json`), JSON.stringify(g));
  }
  fs.writeFileSync(catalogPath, JSON.stringify({ ...catalog, exportedAt: new Date().toISOString(), routes: merged }));
  console.log(changes.join("\n"));
  console.log(`Bundled catalog updated: ${merged.length} routes, geometry files rewritten.`);
}

// ---------- local preview/test store ----------
if (has("--local")) {
  const { createHash } = await import("node:crypto");
  const file = path.join(".local-admin", createHash("sha256").update(KEY).digest("hex") + ".json");
  if (!fs.existsSync(file)) console.log("No local saved catalog; previews use the bundled data.");
  else {
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    const { merged } = merge(state.routes, state.routes.some((r) => r.geometry));
    fs.copyFileSync(file, file.replace(/\.json$/, `.before-lptrp-${Date.now()}.bak`));
    fs.writeFileSync(file, JSON.stringify({ ...state, routes: merged, revision: state.revision + 1, updatedAt: new Date().toISOString() }));
    console.log(`Local saved catalog updated (${merged.length} routes); previous copy kept as .bak.`);
  }
}

// ---------- live Supabase ----------
if (has("--supabase")) {
  const { createSupabaseStore } = await import("../worker/supabase-store.mjs");
  const store = createSupabaseStore(process.env);
  const live = await store.get(KEY);
  if (!live) throw new Error("Live catalog document not found; run scripts/supabase-setup.mjs import-local first");
  const state = await live.json();
  const { merged, changes } = merge(state.routes, true);
  const pts = (rs) => rs.reduce((n, r) => n + Object.values(r.geometry || {}).reduce((a, g) => a + g.length, 0), 0);
  console.log(changes.join("\n"));
  console.log(`Live: ${state.routes.length} routes, revision ${state.revision}, ${pts(state.routes)} geometry points -> ${pts(merged)} after merge.`);
  console.log(`Preserved per route: id, visible, status, reviewNotes, reviewedAt, routeIdentifier, verifiedCodes. Settings untouched.`);
  if (!has("--write")) { console.log("Dry run only. Add --write --backup <dir> to apply."); process.exit(0); }
  const backupDir = flagValue("--backup");
  if (!backupDir || backupDir.startsWith("--")) throw new Error("--write requires --backup <dir>");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `catalog-state-v1.rev${state.revision}.${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(state));
  console.log(`Backup written: ${path.resolve(backupFile)}`);
  const nextState = { ...state, routes: merged, revision: state.revision + 1, updatedAt: new Date().toISOString() };
  const saved = await store.put(KEY, JSON.stringify(nextState), { onlyIf: { etagMatches: live.etag } });
  if (!saved) throw new Error("The live catalog changed while importing (etag mismatch). Nothing was written; re-run.");
  const readback = await (await store.get(KEY)).json();
  if (readback.revision !== nextState.revision || readback.routes.length !== merged.length || pts(readback.routes) !== pts(merged))
    throw new Error("Read-back verification failed; restore from the backup file above.");
  console.log(`Supabase updated and verified: revision ${readback.revision}, ${readback.routes.length} routes.`);
}
