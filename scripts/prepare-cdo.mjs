import fs from "node:fs";
import path from "node:path";
const source = process.argv[2];
if (!source)
  throw new Error(
    "Pass the directory containing the supplied geometry, index, roads, signboards and code research files.",
  );
const json = JSON.parse(
  fs.readFileSync(path.join(source, "sakaygo_cdo_routes.json"), "utf8"),
);
const geo = JSON.parse(
  fs.readFileSync(path.join(source, "sakaygo_cdo_routes.geojson"), "utf8"),
);
const csv = fs.readFileSync(
  path.join(source, "sakaygo_cdo_route_index.csv"),
  "utf8",
);
const rows = csv.trim().split(/\r?\n/).slice(1);
const parseRow = (line) => {
  const values = [];
  let value = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += char;
  }
  values.push(value);
  return values;
};
const index = rows.map(parseRow);
const metadata = [];
const readCSV = (name) => {
  const lines = fs
    .readFileSync(path.join(source, name), "utf8")
    .trim()
    .split(/\r?\n/);
  const keys = parseRow(lines.shift());
  return lines.map((line) =>
    Object.fromEntries(parseRow(line).map((value, i) => [keys[i], value])),
  );
};
const signboards = readCSV("sakaygo_route_signboard_reference.csv");
const roadRows = readCSV("sakaygo_route_roads.csv");
const research = readCSV("sakaygo_traditional_jeepney_codes_research.csv");
if (research.length !== 10 || new Set(research.map((r) => r.code)).size !== 10)
  throw new Error("Expected ten distinct research records");
if (signboards.some((s) => s.signboard_code.trim()))
  throw new Error(
    "Nonblank signboards require a separately approved crosswalk",
  );
const seen = new Set();
fs.mkdirSync("public/data/routes", { recursive: true });
for (const r of json.routes) {
  if (seen.has(String(r.id))) throw new Error("Duplicate source route ID");
  seen.add(String(r.id));
  const features = geo.features.filter(
    (f) => String(f.properties.id) === String(r.id),
  );
  if (
    features.length > 2 ||
    new Set(features.map((f) => f.properties.direction)).size !==
      features.length
  )
    throw new Error(`Duplicate directions for ${r.id}`);
  const directions = {};
  for (const f of features) {
    const dir = f.properties.direction;
    if (
      f.geometry.type !== "LineString" ||
      !["inbound", "outbound"].includes(dir) ||
      f.geometry.coordinates.length < 2
    )
      throw new Error("Invalid directional LineString");
    const points = f.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const original =
      dir === "inbound"
        ? r.inbound_coordinates_latlng
        : r.other_paths.find((p) => p.id === dir)?.route;
    if (JSON.stringify(points) !== JSON.stringify(original))
      throw new Error(`Coordinate mismatch for ${r.id}/${dir}`);
    if (
      !points.every(
        (p) =>
          p.length === 2 && p[0] > 7 && p[0] < 10 && p[1] > 123 && p[1] < 126,
      )
    )
      throw new Error("Invalid CDO coordinates");
    directions[dir] = points;
    const row = index.find((row) => row[0] === String(r.id) && row[2] === dir);
    if (
      !row ||
      row[1] !== r.label ||
      row[3] !== r.from_location ||
      row[4] !== r.to_location ||
      Number(row[5]) !== points.length ||
      row[6] !== r.updated_at
    )
      throw new Error(`CSV mismatch for ${r.id}/${dir}`);
  }
  const roads = Array.isArray(r.road_names)
    ? r.road_names
    : Object.values(r.road_names || {}).flat();
  metadata.push({
    id: String(r.id),
    name: r.label,
    from: r.from_location,
    to: r.to_location,
    source: json.source,
    sourceUpdated: r.updated_at,
    visible: true,
    status: "unverified",
    reviewNotes: "",
    reviewedAt: "",
    roads: [...new Set(roads.filter((v) => typeof v === "string"))],
    roadsByDirection: Object.fromEntries(
      Object.keys(directions).map((dir) => [
        dir,
        roadRows
          .filter(
            (row) => row.route_id === String(r.id) && row.direction === dir,
          )
          .sort((a, b) => Number(a.road_sequence) - Number(b.road_sequence))
          .map((row) => row.road_name),
      ]),
    ),
    routeIdentifier:
      signboards.find((s) => s.route_id === String(r.id))?.route_identifier ||
      "",
    signboardCode: "",
    license: "not verified",
    operationalStatus: "unverified",
    fieldVerification: {
      label: "unverified",
      geometry: "unverified",
      roads: "unverified",
      stops: "unavailable",
      signboard_code: "unverified",
      fares: "unavailable",
      operation: "unverified",
    },
    missingDirections: ["inbound", "outbound"].filter(
      (dir) => !directions[dir],
    ),
    directions: Object.keys(directions),
  });
  fs.writeFileSync(
    `public/data/routes/${r.id}.json`,
    JSON.stringify(directions),
  );
}
if (
  metadata.length !== json.routes.length ||
  geo.features.length !==
    metadata.reduce((n, r) => n + r.directions.length, 0) ||
  rows.length !== geo.features.length
)
  throw new Error("Source counts do not agree");
fs.writeFileSync(
  "public/data/catalog.json",
  JSON.stringify({
    exportedAt: json.exported_at,
    license: json.license,
    routes: metadata,
  }),
);
fs.mkdirSync("data/source", { recursive: true });
const cases = ["1", "3", "21"].map((id, i) => {
  const points = JSON.parse(
    fs.readFileSync(`public/data/routes/${id}.json`, "utf8"),
  ).inbound;
  return {
    label: `Geometric test ${String.fromCharCode(65 + i)} — not independently verified travel advice`,
    routeId: id,
    direction: "inbound",
    origin: points[Math.floor(points.length * 0.15)],
    destination: points[Math.floor(points.length * 0.7)],
    note: "Coordinates taken directly from supplied geometry. Vertices are not official stops.",
  };
});
fs.writeFileSync(
  "public/data/geometric-test-cases.json",
  JSON.stringify(cases, null, 2),
);
const codeApprovals = JSON.parse(fs.readFileSync(new URL("../data/code-owner-approvals.json", import.meta.url), "utf8"));
const reviewedResearch = research.map((record) => {
  const approval = codeApprovals[record.code];
  return approval && approval.reported_service_area === record.reported_service_area
    ? { ...record, verification_status: approval.verification_status, verification_basis: approval.verification_basis, verified_at: approval.verified_at }
    : record;
});
fs.writeFileSync("public/data/code-research.json", JSON.stringify(reviewedResearch));
fs.writeFileSync(
  "public/data/route-signboards.json",
  JSON.stringify(
    signboards.map((s) => ({
      route_id: s.route_id,
      signboard_code: "",
      alias: "",
      direction: null,
      verification_status: "unverified",
      source_url: "",
      verified_at: null,
      notes:
        "Source signboard field is blank. LPTRP variant identifiers are not traditional codes.",
    })),
  ),
);
for (const name of [
  "sakaygo_cdo_routes.json",
  "sakaygo_cdo_routes.geojson",
  "sakaygo_cdo_route_index.csv",
  "sakaygo_dataset_README.txt",
  "sakaygo_route_signboard_reference.csv",
  "sakaygo_route_roads.csv",
  "sakaygo_traditional_jeepney_codes_research.csv",
])
  if (fs.existsSync(path.join(source, name)))
    fs.copyFileSync(path.join(source, name), path.join("data/source", name));
console.log(
  `Validated ${metadata.length} records, ${geo.features.length} directional geometries and ${rows.length} CSV rows. Coordinates preserved exactly; no stops or fares inferred.`,
);
