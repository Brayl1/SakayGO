# API integration repair — November 9, 2026

## Root causes

1. The current UI uses CatalogState and the coordinate-based trip API implemented in worker/handler.mjs. Express previously exposed only the older stop-ID Dataset/Journey contract. Changing the proxy alone could not create /api/catalog, /api/session, /api/fare-policies/current or the other current endpoints.
2. The old server launcher did not load .env, so Supabase/process settings used by the preview were not available to npm run server.
3. The inspected Vite configuration already targeted 3001 with strict port 5173. Earlier 5174 connection failures were from the previous preview architecture, not a reason to proxy to the frontend.
4. The legacy /api/dataset was nonempty because it included 10 bundled landmarks. No PostgreSQL URL or DATASET_PATH was configured: it had zero verified services and zero policies. Explicit demo=true returns four synthetic services and one demo policy. The separate current catalog contains 76 supplied community route records, not 76 verified services.
5. Session and fare-policy request failures could be silently treated as false/empty. These failures now surface in the UI without granting access.
6. Browser testing found a separate Leaflet 1.9.4 teardown race: the CSS zoom completion timer touched a removed map pane. A layout-effect cleanup clears the pending animation flag before map removal, preserving mounted animations.

## Implementation

Express mounts the existing Worker handler for the current API, reusing its geometry, recommendations, code research, effective-dated policy selection and national-reference calculation. No routes, stops, fare values or vehicle classifications were invented. The existing /api/routes and /api/plan contracts remain unchanged; they are not silently converted to current catalog data.

Supabase uses server-only environment values. Express has no trusted Sites identity gateway or login middleware, so /api/session correctly returns anonymous/non-admin and /api/admin/* returns 403. Forged identity headers and the local preview flag do not grant Express privileges. Hosted Sites and the separate explicit localhost-owner preview retain their existing authorization.

The launcher retains TypeScript compilation and copies shared ESM modules alongside the compiled server for Node 22.19+. It does not need dist/ or a second backend on 5174. An attempted tsx loader failed with uv_os_get_passwd on this Windows environment; the final implementation does not use it.

## Files changed

- server/index.ts — mount current endpoints, retain legacy endpoints, add truthful health/dataset metadata and body-limit error handling.
- server/repository.ts — describe the actual legacy dataset source.
- server/catalog-api.mjs and server/catalog-api.d.mts — current API transport, source asset loading, safe local/Supabase storage and explicit unauthenticated boundary.
- scripts/run-server.cjs — load .env and copy shared ESM modules into the existing compiled server layout.
- vite.config.ts — retain 5173/strictPort/3001 proxy; bind localhost consistently.
- shared/catalog.ts — reflect omission of private review notes from public responses.
- src/CatalogContext.tsx, src/Root.tsx — validate responses and display session failures.
- src/TripPlanner.tsx — check fare-policy HTTP/schema failures and display them.
- src/CatalogMap.tsx — prevent the observed map teardown error.
- tests/current-api.test.ts — seven integration/security/data-contract regressions.
- e2e/express.spec.ts, e2e/planner.spec.ts, playwright.express.config.ts — real Vite/Express checks, error handling, better runtime diagnostics and safe anonymous browser testing.
- package.json — add test:e2e:express; no new dependencies.
- README.md, .env.example, docs/EXPRESS_SETUP.md and this report — correct startup instructions and explain contract/authentication boundaries.

## Verified HTTP behavior

| Request | Observed result |
| --- | --- |
| GET /api/health | 200; legacy storage local, current catalog storage Supabase |
| GET /api/catalog | 200; 76 records with original metadata |
| GET /api/catalog/1 | 200; independent inbound/outbound geometry |
| GET /api/session | 200; admin=false, signedIn=false |
| GET /api/fare-policies/current | 200; empty approved-policy list, not an error |
| GET /api/fare-reference | 200; supplied national reference |
| GET /api/dataset | 200; 10 landmarks, no verified routes/policies, explicit source |
| GET /api/routes | 200; empty legacy verified-service list |
| POST /api/plan, ustp → divisoria, demo=false | 200; verified mode, zero journeys |
| POST /api/plan, ustp → divisoria, demo=true | 200; three explicitly synthetic journeys |
| POST /api/trips/plan, real geometric example | 200; three directional alternatives |
| GET /api/places?q=Centrio%20Mall | 200; four provider results |
| GET /api/admin/state, including spoofed owner headers | 403; expected authorization denial |

Checks ran through both Express and the Vite proxy. localhost:5173 resolves successfully. All 92 files under data/ and public/ match the original project copy byte-for-byte. No database mutation or dataset import was performed during this repair.

## Limits

Express owner login is not implemented; admin authorization was not fabricated to make a menu appear. The optional legacy /api/nearby requires a separately configured PostGIS database; it is not used by the current place picker. There are no approved local CDO fare policies or verified transfer links in the current database, so the existing conditional-reference and transfer limitations remain accurate. No live PostgreSQL/PostGIS instance was available for testing the legacy pg path; the Supabase current-catalog path was exercised successfully.

See EXPRESS_SETUP.md for the two-terminal startup commands and reproducible test commands.

## Final validation results

- npm run typecheck: passed.
- npm test: 81 tests passed across 9 files.
- npm run build: passed, including TypeScript, Vite and Worker packaging.
- npm run lint: passed.
- Full Vite/Express desktop/mobile browser run: 28 tests passed in one final run (1.9 minutes).
- The mobile map teardown regression also passed three consecutive targeted repetitions after its fix.
- Earlier browser runs exposed the Leaflet teardown issue and then HTTP 429 from the unchanged 90-request/minute limiter. Test project setup now honors Retry-After instead of disabling that protection. The final run has no failures.
- The original owner-write browser scenario was intentionally not run against unauthenticated Express; authorization-denial tests passed. Existing Worker security tests passed.
- No live pg/PostGIS integration was claimed; no DATABASE_URL was configured. Supabase-backed catalog reads, directional trip planning, real provider place lookup and the Vite proxy were tested successfully.

The root cause, files and validation are recorded here; the user can start the two services from their own terminals using EXPRESS_SETUP.md. No deployment or database modification was performed.
