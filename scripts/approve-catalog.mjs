import fs from "node:fs/promises";
import { createSupabaseStore } from "../worker/supabase-store.mjs";
const store = createSupabaseStore(process.env);
const key = "sakaygo/catalog-state-v1.json";
const current = await store.get(key);
if (!current) throw new Error("Saved catalog not found; no changes applied.");
const state = await current.json();
const bundled = JSON.parse(await fs.readFile(new URL("../public/data/catalog.json", import.meta.url), "utf8"));
const ids = new Set(bundled.routes.map((r) => r.id));
const routes = state.routes.filter((r) => ids.has(r.id));
if (routes.length !== ids.size) throw new Error("Saved catalog does not contain all bundled routes; review before approval.");
const now = new Date().toISOString();
const root = new URL("../.local-admin/", import.meta.url);
await fs.mkdir(root, { recursive: true });
await fs.writeFile(new URL(`before-owner-approval-${Date.now()}.json`, root), JSON.stringify(state, null, 2));
for (const route of routes) {
  route.status = "approved";
  route.reviewedAt = "2026-11-27";
  const note = "Owner explicitly approved this route record on 2026-11-27. Approval does not establish fare, stop, or operational verification.";
  if (!(route.reviewNotes || "").includes(note)) route.reviewNotes = [route.reviewNotes, note].filter(Boolean).join("\n");
}
state.revision = (state.revision || 0) + 1;
state.updatedAt = now;
const result = await store.put(key, JSON.stringify(state), { onlyIf: { etagMatches: current.etag } });
if (!result) throw new Error("Catalog changed concurrently; approval was not saved. Reload before retrying.");
const confirmed = await (await store.get(key)).json();
const approved = confirmed.routes.filter((r) => ids.has(r.id) && r.status === "approved");
if (approved.length !== ids.size) throw new Error("Approval read-back failed.");
console.log(JSON.stringify({ approvedRoutes: approved.length, revision: confirmed.revision, reviewedAt: "2026-11-27" }));
