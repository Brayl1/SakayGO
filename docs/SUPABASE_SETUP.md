# Supabase setup for the current SakayGo app

Status: the empty table was created in project hnjzxbgkelpxzjvulxir. At your request, remaining setup is manual. Paste db/supabase-setup.sql into the Supabase SQL Editor to insert the bundled data. The script preserves existing records. The hosted website still uses R2; its runtime settings have not been changed.

## 1. Create the table

In your project's Supabase SQL Editor, run `db/supabase-setup.sql`. It includes 76 routes and 152 directional geometries, default settings and an empty verification document. It is safe to rerun because existing documents are not overwritten. Do not run `db/001_initial.sql`: that belongs to the old demo. Enable the Data API with `public` as an exposed schema. The `sakaygo_documents` table stores the route catalog/geometry/settings and the separate verification/approval document as JSONB, preserving the current admin revision model. It is not a normalized PostGIS transit network.

RLS is enabled. Browser roles have no access. Only the server's `service_role` may select, insert or update; the existing Worker validates owner identity before admin writes. No public RLS policies or browser database keys are required.

## 2. Configure this PC

Create an ignored `.env` in the project root (copy `.env.example` if needed). Set:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
SAKAYGO_LOCAL_ADMIN=1
```

Use a current `sb_secret_...` key from Supabase Project Settings → API Keys. Paste it directly into the local `.env`, not chat. Never use a `VITE_` prefix. No database password is needed for this HTTPS Data API integration. Node 22 loads this file only when `--env-file=.env` is supplied.

## 3. Check (SQL already imports the bundled data)

From the project directory:

```powershell
node --env-file=.env scripts/supabase-setup.mjs check
 # Optional alternative to SQL seeding: node --env-file=.env scripts/supabase-setup.mjs import-local
node --env-file=.env scripts/supabase-setup.mjs check
```

The importer copies the CURRENT local saved state plus route geometry, or bundled defaults when there is no local state. It verifies content after every insert and never overwrites existing Supabase documents. It does not copy hosted R2 edits automatically. Before switching the live site, compare/export its admin backup and migrate that state if it differs from local. Keep R2 unchanged as a rollback source. There are no fabricated approved fares or signboard codes in the import.

The supplied fare reference stays bundled with the app; approved fare policies and classifications live in the verification document. This preserves the existing separation between reference data and approved commuter information.

## 4. Build and run

```powershell
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
node --env-file=.env scripts/preview-worker.mjs
```

Open http://127.0.0.1:5174 and http://127.0.0.1:5174/admin. Local owner mode is restricted to localhost. Save a reversible announcement, restart the server, and verify the saved value; restore it afterward. With Supabase configured, failures do not silently fall back to local files or R2. Stop the existing preview with Ctrl+C before starting another.

## 5. Connect the existing hosted site

After live database verification and state migration, configure `SUPABASE_URL` and secret `SUPABASE_SECRET_KEY` as SERVER runtime variables on the existing Sites project, then deploy the updated Worker. Retain `SAKAYGO_ADMIN_EMAIL` and its trusted Sites identity checks. Never deploy `SAKAYGO_LOCAL_ADMIN=1` as a public authentication system. The current change adds Supabase database persistence, not a new Supabase Auth login UI.

Do not switch the live site merely by setting an empty/new database URL: first verify all expected route and verification records. Removing BOTH Supabase variables returns to R2, whose contents may be older; reconcile writes before a rollback.

References: [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [API security](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
