import fs from "node:fs";
import { validateState } from "../worker/handler.mjs";
const routes = JSON.parse(fs.readFileSync("public/data/catalog.json", "utf8")).routes.map((r) => ({
  ...r,
  geometry: JSON.parse(fs.readFileSync(`public/data/routes/${r.id}.json`, "utf8")),
}));
const state = {
  routes,
  settings: { headline: "Where to today?", description: "Explore jeepney routes around Cagayan de Oro. A little local knowledge for your next sakay.", announcement: "", maintenance: false },
  revision: 0,
  updatedAt: "",
};
validateState(state, new Set(routes.map((r) => r.id)));
const verification = { crosswalks: [], farePolicies: [], vehicleClassifications: [], events: [], revision: 0 };
const literal = (v) => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
const sql = `-- SAKAYGO: paste this entire file into your Supabase SQL Editor and Run.
-- Generated from the bundled dataset; ${routes.length} routes and ${routes.reduce((n, r) => n + Object.keys(r.geometry).length, 0)} directional geometries.
-- Re-runnable: existing documents are NEVER overwritten.
-- Uses the current app's JSONB document model, not the legacy demo schema.
-- Includes bundled route data/default settings, not live-site admin edits.
-- Approved fares/codes start empty. National reference fares remain bundled in the app.
-- Server-only access. Do not grant browser roles access to this table.
begin;
create table if not exists public.sakaygo_documents (
  key text primary key check (key in ('sakaygo/catalog-state-v1.json', 'sakaygo/verification-v1.json')),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  etag text not null check (length(etag) between 1 and 128),
  updated_at timestamptz not null default now()
);
alter table public.sakaygo_documents enable row level security;
revoke all on table public.sakaygo_documents from public, anon, authenticated;
grant select, insert, update on table public.sakaygo_documents to service_role;

insert into public.sakaygo_documents (key, value, etag) values
('sakaygo/catalog-state-v1.json', ${literal(state)}, gen_random_uuid()::text),
('sakaygo/verification-v1.json', ${literal(verification)}, gen_random_uuid()::text)
on conflict (key) do nothing;
commit;

-- Verification: expect 76 routes and 152 directions for the bundled dataset.
select key, case when key = 'sakaygo/catalog-state-v1.json'
  then jsonb_array_length(value->'routes') end as route_count
from public.sakaygo_documents order by key;
select count(*) as directional_geometry_count
from public.sakaygo_documents d,
lateral jsonb_array_elements(d.value->'routes') route,
lateral jsonb_object_keys(route->'geometry') direction
where d.key = 'sakaygo/catalog-state-v1.json';
`;
fs.writeFileSync("db/supabase-setup.sql", sql);
console.log(`Generated db/supabase-setup.sql (${Buffer.byteLength(sql)} bytes). Existing database data will be preserved.`);
