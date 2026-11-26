import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createSupabaseStore } from "../worker/supabase-store.mjs";
const mode = process.argv[2];
if (!["check", "import-local"].includes(mode))
  throw new Error("Usage: node --env-file=.env scripts/supabase-setup.mjs check|import-local");
const store = createSupabaseStore(process.env);
const keys = ["sakaygo/catalog-state-v1.json", "sakaygo/verification-v1.json"];
for (const key of keys) {
  const existing = await store.get(key);
  if (mode === "check") {
    console.log(`${key}: ${existing ? "saved document accessible" : "table accessible; document not imported"}`);
    continue;
  }
  if (existing) {
    console.log(`${key}: already exists; preserved unchanged`);
    continue;
  }
  let state;
  try {
    state = JSON.parse(await fs.readFile(new URL(`../.local-admin/${createHash("sha256").update(key).digest("hex")}.json`, import.meta.url), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    if (key.includes("verification")) state = { crosswalks: [], farePolicies: [], vehicleClassifications: [], events: [], revision: 0 };
    else {
      const catalog = JSON.parse(await fs.readFile(new URL("../public/data/catalog.json", import.meta.url), "utf8"));
      state = { routes: catalog.routes, settings: { headline: "Where to today?", description: "Explore jeepney routes around Cagayan de Oro. A little local knowledge for your next sakay.", announcement: "", maintenance: false }, revision: 0, updatedAt: "" };
    }
  }
  if (state.routes) {
    // Preserve edited geometry; copy bundled geometry for unedited routes.
    for (const route of state.routes) {
      if (!/^\d+$/.test(route.id)) throw new Error("Unexpected route ID");
      route.geometry ??= JSON.parse(await fs.readFile(new URL(`../public/data/routes/${route.id}.json`, import.meta.url), "utf8"));
    }
  }
  const saved = await store.put(key, JSON.stringify(state), { onlyIf: { etagDoesNotMatch: "*" } });
  if (!saved) throw new Error("Another writer initialized this document. Check before continuing.");
  const readback = await store.get(key);
  if (!readback || JSON.stringify(await readback.json()).length === 0) throw new Error("Read-back failed");
  // JSONB may reorder keys; compare canonical content instead of serialized order.
  const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
  if (JSON.stringify(canonical(await readback.json())) !== JSON.stringify(canonical(state)))
    throw new Error("Imported document differs from local source");
  console.log(`${key}: imported and verified${state.routes ? ` (${state.routes.length} routes)` : ""}`);
}
