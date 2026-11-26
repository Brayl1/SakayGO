import fs from "node:fs";
import path from "node:path";
import { calculateFareBreakdown } from "../shared/fares.mjs";
const source = process.argv[2];
if (!source) throw new Error("Pass the supplied fare dataset directory");
const files = [
  "sakaygo_fare_rules_2026.json",
  "sakaygo_fare_rules_2026.csv",
  "sakaygo_fare_lookup_1_to_30km.csv",
  "sakaygo_fare_dataset_README.txt",
];
const raw = JSON.parse(fs.readFileSync(path.join(source, files[0]), "utf8"));
if (
  raw.dataset_id !== "sakaygo_fare_reference_2026_09_28" ||
  raw.currency !== "PHP" ||
  raw.effective_date !== "2026-09-28" ||
  raw.status !== "published_rates_not_cdo_route_specific_matrix" ||
  raw.rounding !==
    "nearest 0.25 PHP, half-up; verify against current official LTFRB fare guide" ||
  raw.rules.length !== 2 ||
  !raw.sources.every((s) => new URL(s).protocol === "https:")
)
  throw new Error(
    "Unexpected fare dataset schema/status/rounding; review before import",
  );
const readCsv = (name) => {
  const lines = fs
      .readFileSync(path.join(source, name), "utf8")
      .trim()
      .split(/\r?\n/),
    headers = lines.shift().split(",");
  return lines.map((line) =>
    Object.fromEntries(line.split(",").map((v, i) => [headers[i], v])),
  );
};
const rates = readCsv(files[1]),
  lookup = readCsv(files[2]);
if (rates.length !== 2 || lookup.length !== 60)
  throw new Error("Expected two vehicle rates and sixty lookup rows");
const seen = new Set();
for (const rule of raw.rules) {
  if (
    !["traditional_jeepney", "modern_jeepney"].includes(rule.vehicle_type) ||
    seen.has(rule.vehicle_type)
  )
    throw new Error("Invalid/duplicate vehicle");
  seen.add(rule.vehicle_type);
  for (const k of [
    "base_fare_php",
    "base_distance_km",
    "additional_per_km_php",
  ])
    if (!Number.isFinite(rule[k]) || rule[k] <= 0)
      throw new Error("Invalid rate");
  const row = rates.find((r) => r.vehicle_type === rule.vehicle_type);
  if (
    !row ||
    row.effective_date !== raw.effective_date ||
    row.currency !== raw.currency ||
    row.verification_status !== "national_published_not_local_matrix" ||
    !raw.sources.includes(row.source_url) ||
    ["base_fare_php", "base_distance_km", "additional_per_km_php"].some(
      (k) => Number(row[k]) !== rule[k],
    )
  )
    throw new Error("JSON/CSV rates disagree");
}
for (const p of ["regular", "student", "senior", "pwd"])
  if (
    !Number.isFinite(raw.discounts[p]) ||
    raw.discounts[p] < 0 ||
    raw.discounts[p] > 1
  )
    throw new Error("Invalid discounts");
const keys = new Set();
for (const row of lookup) {
  const rule = raw.rules.find((r) => r.vehicle_type === row.vehicle_type),
    km = Number(row.distance_km),
    key = row.vehicle_type + ":" + km;
  if (
    !rule ||
    !Number.isInteger(km) ||
    km < 1 ||
    km > 30 ||
    keys.has(key) ||
    row.status !== "illustrative_computed_national_rates"
  )
    throw new Error("Invalid lookup row");
  keys.add(key);
  for (const passenger of ["regular", "student", "senior", "pwd"]) {
    const result = calculateFareBreakdown(
      km * 1000,
      {
        base_fare: rule.base_fare_php,
        base_distance_km: rule.base_distance_km,
        per_km: rule.additional_per_km_php,
        increment_mode: "proportional",
        round_to: 0.25,
        rounding: "nearest",
        discounts: raw.discounts,
      },
      passenger,
    );
    if (result.amount !== Number(row[passenger + "_php"]))
      throw new Error(
        "Lookup disagrees with decimal-safe calculation at " +
          key +
          " " +
          passenger,
      );
  }
}
const normalized = {
  ...raw,
  verification_status: "reference_only",
  distance_increment_rule: null,
  rounding_verified: false,
  local_applicability_verified: false,
  vehicle_classification: "unknown",
  rules: raw.rules.map((r) => ({
    ...r,
    vehicle:
      r.vehicle_type === "traditional_jeepney" ? "traditional" : "modern",
  })),
};
fs.mkdirSync("data/source/fares-2026", { recursive: true });
for (const name of files)
  fs.copyFileSync(
    path.join(source, name),
    path.join("data/source/fares-2026", name),
  );
fs.writeFileSync(
  "public/data/fare-reference.json",
  JSON.stringify(normalized, null, 2) + "\n",
);
console.log(
  "Validated 2 reference rates and 240 passenger lookup values; no local policy or vehicle class approved.",
);
