# SakayGo — Cagayan de Oro

React + TypeScript + Vite + Leaflet + Motion. Express now serves the current catalog/trip API by reusing the existing Worker implementation, alongside the unchanged legacy stop-ID API. The hosted Worker and R2/Supabase persistence remain supported. All 76 records and 152 directional geometries are retained. The synthetic planner remains isolated at `/demo`.

## Run and import

Requires Node 22.19+, npm, and Microsoft Edge for Playwright. Full API-contract and authentication notes: [Express setup](docs/EXPRESS_SETUP.md).

```powershell
npm ci
npm run server
```

Keep that terminal running. In a second terminal run `npm run dev`, then open http://localhost:5173. Vite uses strict port 5173 and proxies `/api` to Express at http://127.0.0.1:3001. No preview server on 5174 is required. The server launcher loads `.env`; restart the backend after server/environment changes. Do not reimport or reseed existing data just to start the app.

The separate built Worker preview is still available with `npm run build` followed by `node --env-file=.env scripts/preview-worker.mjs` at http://127.0.0.1:5174. Its explicit local-owner flag applies only to that localhost preview, not Express. Hosted Sites authorization is unchanged.

On this Windows machine's broken npm launcher, replace `npm` with `node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'`. `.env.example` documents server settings; keep secret keys out of `VITE_*` variables.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:e2e:express
```

Playwright starts a local owner preview if port 5174 is free; an already running preview must have owner mode for admin tests. Tests cover desktop/mobile, actual directed geometry, keyboard search, map picking, provider errors, alternatives, reset, route directions, code research and persistent admin edits.

## Data and changed files

`scripts/prepare-cdo.mjs` validates regional bounds, IDs, duplicate directions, index metadata, exact JSON/GeoJSON coordinate agreement and ordered road references. GeoJSON longitude/latitude converts exactly once to internal latitude/longitude. Missing directions stay absent; outbound is never created by reversing inbound. Explicit structural validation and TypeScript contracts in `shared/catalog.ts` and `shared/trip-types.ts` define the model.

- `data/source/`: unchanged supplied files, retained separately.
- `public/data/catalog.json` and `routes/`: normalized metadata, field verification, provenance, timestamps and independent geometries.
- `public/data/route-signboards.json`: normalized blank signboards/aliases; no inferred codes.
- `public/data/code-research.json`: 10 separate research records with original notes, areas, URLs and unverified status. C1's area remains unknown.
- `shared/trips.mjs`: spherical projection, cumulative directed distance, bounding-box filtering, bounded candidates, geometry subsections, optional verified transfers and effective-dated fares.
- `src/TripPlanner.tsx`, `PlaceInput.tsx`, `TripMap.tsx`: accessible place/map inputs, alternatives, numbered itinerary, map fit, dashed walks and collapsible details.
- `Catalog.tsx`/`CatalogMap.tsx`: searchable directory and independent directional geometry.
- `CodeResearch.tsx`: research-only code directory.
- `Admin.tsx`: routes, geometry, visibility, review notes, backups, announcements and maintenance.
- `VerificationAdmin.tsx`: explicit crosswalk/fare approvals and audit history.
- `worker/handler.mjs`, `worker/verification.mjs`: authorization, APIs, validation and conditional persistence.
- `scripts/build-worker.mjs`: packaged client assets and Worker. `Root.tsx` applies Motion reduced-motion preferences.

R2 keys `sakaygo/catalog-state-v1.json` and `sakaygo/verification-v1.json` separate catalog/settings from crosswalks, policies and approval events. Normal edits cannot mark a signboard verified. Future authoritative sources can augment these collections. Geometry is cached/indexed independently of display metadata.

## API and routing

| Endpoint | Purpose |
| --- | --- |
| GET `/api/routes`, `/api/routes/:id` | Visible route metadata and individual geometry |
| GET `/api/route-codes` | Separate research and approved crosswalks |
| POST `/api/trips/plan` | `{origin:[lat,lng],destination:[lat,lng],preferences:{maxWalkMeters,sort,passenger}}` |
| GET `/api/places?q=...` | Configurable CDO-bounded geocoding |
| GET `/api/fare-policies/current` | Approved current policies |
| GET `/api/test-cases` | Three geometric examples |
| GET/PUT `/api/admin/state` | Owner edits, ETag / If-Match required for saves |
| GET/PUT `/api/admin/verification` | Owner reviewed imports and audit events |

Boarding must precede alighting on the supplied direction. Access limits are 50–1000 meters, default 500. Sort is `walking`, `transfers` or `distance`; actual vehicle class comes only from approved directional classifications; passenger is `regular`/`student`/`senior`/`pwd`. Optional transfer generation accepts only verified connection records. None were supplied, so hosted itineraries do not invent transfers from intersecting lines. The optional transfer engine is independently tested.

Geocoding defaults to [Photon](https://github.com/komoot/photon): 650 ms debounce, cancellation, 10-minute bounded cache, 20 requests/minute per identity/IP per isolate. Public Photon has no availability guarantee. Configure a suitable compatible HTTPS `GEOSEARCH_URL` and `GEOSEARCH_ATTRIBUTION` for production use. Trip requests allow 30/minute per isolate; distributed quotas need shared infrastructure at scale.

Optional `WALK_ROUTER_URL` accepts HTTPS POST `{origin,destination}` in latitude/longitude order and returns `{distanceMeters,geometry}`. `WALK_ROUTER_TOKEN` remains server-only. Endpoints and limits are validated, and failures reject affected candidates. Without this provider, access is clearly labeled straight-line approximation, not pedestrian navigation; barriers/safe crossings are unverified.

## Verified mappings and fares

At `/admin/verification`, import JSON with `crosswalks` and `farePolicies` arrays. Leave empty until authoritative evidence exists. Pending entries are never used as confirmed codes or fares. Verified entries require the explicit approval checkbox; the server stamps authenticated approver/time and audit events. Full field help appears in the panel.

Crosswalk fields: `id`, `traditional_code`, `lptrp_route_id`, `direction`, `alias`, `verification_status` (pending/verified), `operational_status` (active/inactive/unknown), `evidence_url`, `evidence_type` (official/field_confirmed), `confidence` (0–1), `notes`. Many-to-many mappings are allowed. Only an approved active exact-direction mapping labels a trip. Traditional R1/R2 are not LPTRP variants; C2 is not Carmen R2. Research never creates a join.

Fare fields: `id`, `region` (CDO), `vehicle`, `verification_status`, `effective_from`, `effective_to`, `source_url`, `evidence_type`, `base_distance_km`, `base_fare`, `per_km`, `increment_mode` (started_km/proportional), `round_to`, `rounding` (nearest/ceil/floor), `discounts` (student/senior/pwd fractions or null), optional `matrix` rows `{upToKm,fare}`. Each ridden segment is priced separately, with source, effective date, discount and rounding breakdown. Missing, expired, overlapping or inapplicable policies yield no fare. The supplied national reference is separate from approved CDO policies; see the November 8 update below.

Hosted administration requires trusted Sites identity headers, runtime secret `SAKAYGO_ADMIN_EMAIL`, and R2 binding `BUCKET`. Do not put the Worker behind a proxy permitting forged identity headers. The existing deployment remains owner-private.

## Three reproducible tests

These source vertices are **geometric tests, not independently verified trips or official stops**. Use them as planner coordinates or POST inputs with default preferences; the matching source direction should appear among candidates.

| Test | Route/direction | Origin `[lat,lng]` | Destination `[lat,lng]` |
| --- | --- | --- | --- |
| A | 1 / inbound | `[8.472827,124.573064]` | `[8.474138,124.613327]` |
| B | 3 / inbound | `[8.438273,124.631824]` | `[8.471611,124.635034]` |
| C | 21 / inbound | `[8.47357,124.608488]` | `[8.475241,124.630949]` |

The UI includes “Try geometric test A”; automated tests cover all three.

## Provenance, privacy and limits

The SakayCDO export is dated 2026-08-04 and may describe planned rather than active services. Reuse rights are **not verified**. Keep source/deployment private; obtain applicable permission or a license before public redistribution. Local import does not establish rights. The optional [CDO reference repository](https://github.com/jrequiroso/cdo-jeepney-routes) was inspected but not imported: its README cautions that LPTRP routes can differ from active services, and sufficient reuse permission was not established.

The 10 code records are third-party reports, not a complete/current official registry. Original URLs may be outdated and are preserved. Confirm operating routes, codes, lawful stops and transfers through official or field evidence. Ordered road references describe a full direction but are not tied to individual geometry segments; they are not precise turn-by-turn subsection instructions. No verified stop network, schedule, pedestrian paths or LTFRB matrix was supplied. No live arrival times are claimed. Fare remains unavailable until a valid policy is approved.

Place queries go to the geocoder; coordinates go to the planning API and optionally pedestrian provider. Basemap tiles load on demand with OpenStreetMap attribution. No offline navigation or live vehicle tracking is claimed.

## Interactive commuter update

The existing routing/data/admin implementation is retained. `/` is now the welcome page and `/planner` is the working trip planner. Get Started opens the planner; Find My Jeepney replaces the form with recommendations on the same page. Edit Trip retains selected locations; Plan Another Trip clears them. Popular destinations populate real geocoder search results for user confirmation, without assigning guessed landmark coordinates. Device geolocation is optional and handles denial/out-of-region/error cases.

The added `src/Welcome.tsx`, `TripResults.tsx`, `routeAnimation.ts` and `commuter.css`, plus changes to `TripPlanner.tsx`, `TripMap.tsx`, `PlaceInput.tsx` and `Root.tsx`, implement the screenshot-based presentation. `shared/trips.mjs` and `worker/handler.mjs` also support sorting by known fares (unknown fares last). Lowest-fare comparison is disabled until applicable approved policies exist; fastest-trip comparison remains unavailable without reliable timing data.

The Leaflet camera flies to the complete itinerary, then an 1.8-second requestAnimationFrame preview draws the actual selected geometry and moves a bearing-aligned jeepney marker. Each segment is interpolated by distance; no straight-line substitute is drawn across corners or between transfer legs. Replay and alternative selection cancel prior animation frames/layers. Reduced motion fits immediately and displays completed geometry without movement. Results are not delayed until animation finishes. On mobile, the result map appears above the recommendation. Map tile failures offer Retry while route information stays available.

The prominent fare card uses the existing approved policy engine and provides per-leg breakdown, source and effective date. No real fare policy, authoritative code crosswalk or safe transfer links were added: these still require evidence through the existing admin workflow. Geometry-derived boarding/drop-off locations remain approximate; moving markers are trip previews, not live vehicle tracking. Basemap tiles and place search require external connectivity.

Tests cover welcome-to-results, actual animation progress/endpoints, replay, direction/alternative switching, edit/reset, geocoding failures, geolocation denial, no matches, reduced motion, fare display using an explicitly synthetic browser-only policy fixture, and the existing admin/data checks. The browser fare fixture is never persisted or shipped as a policy. Source geometry test C provides six real geometric candidates for exercising alternatives.

Validation for this update: 52 unit/API tests and 22 desktop/mobile Playwright tests passed, along with ESLint, TypeScript checking and the production build. Screenshot inspection showed loaded OpenStreetMap tiles and no browser errors. No source dataset records were changed.

## November 8: route selection and supplied fare reference

The existing Leaflet/Motion planner, recommendation engine, moving marker, alternatives, admin and all 76 records/152 directional geometries are preserved. `/results` previously opened the legacy synthetic demo; it now redirects to `/planner`. The demo stays at `/demo`.

Selection uses one itinerary ID containing route ID, direction and boarding/alighting distances. The same selected object drives route geometry, animation, camera, instructions, ridden distance and fare. Selecting another alternative disposes the previous animation controller. Distinct records that genuinely share a ridden path are identified without modifying geometry or inventing differences.

Import the supplied fare files repeatably with `npm run import:fares -- "C:/Users/QWE/Downloads/sakaygo_fare_dataset_2026"`. Raw copies live in `data/source/fares-2026/`; the generated reference is `public/data/fare-reference.json` and GET `/api/fare-reference`. The importer checks JSON/CSV agreement and all 240 passenger/vehicle lookup values. Currency calculations use rational integer arithmetic and round once per ride before summing centavos.

The national reference supplies traditional/modern base fares and distance increments, but does not establish actual route vehicle classes, local CDO applicability or partial-kilometer billing. Unknown classes remain unknown and show separate conditional illustrations. Fractional distances above the base distance show adjacent whole-kilometer illustrations, explicitly not guaranteed fare bounds. They are not used to claim a verified cheapest trip. Discounts and quarter-peso rounding follow the supplied reference and remain subject to local confirmation.

The official PCO announcement confirms the September 28 minimum-fare change (https://pco.gov.ph/news_releases/palace-govt-balances-transport-support-commuter-welfare-amid-fare-hike-and-rising-fuel-prices/); it does not supply a CDO route-specific matrix. PIA reminds operators to display the updated matrix (https://pia.gov.ph/news/luzon/ncr/ltfrb-reminds-puv-operators-drivers-to-display-updated-fare-matrix/). These checks do not resolve fractional-distance or local applicability questions.

Admin verification now accepts optional `vehicleClassifications`: records with `routeId`, `direction`, `vehicle` (`traditional`/`modern`), `verification_status`, `source_url` and `evidence_type` (`official`/`field_confirmed`). Verified records require explicit approval and server-stamped reviewer identity. No classifications or policies are automatically approved by importing the reference.

Remaining data work: authoritative CDO matrices/increment rules, approved route vehicle classifications, traditional-code crosswalks, verified transfer connections and pedestrian-routing evidence. Moving jeepneys remain route previews, not live GPS tracking.
Validation: production build (including TypeScript), Worker syntax check and ESLint passed; 67 unit/API tests passed. All 26 desktop/mobile browser cases passed across the initial run and targeted retry: the two map-retry cases initially failed with network access restricted, then both passed after enabling network access. Screenshot checks reported no browser errors and confirmed loaded basemap tiles. No supplied route geometry was modified.

## Supabase database setup

See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for the current app's Supabase adapter, database permissions, import/read-back commands and server-only environment settings. This replaces persistence only when both Supabase variables are configured; otherwise existing R2/local storage remains active. The legacy PostGIS scripts are not used by this integration.

## November 25: demo retirement

The released website redirects `/demo` to `/planner`. Synthetic demo links and commuter-facing geometric test controls have been removed. The legacy Express API rejects requests selecting demo data with HTTP 410. The synthetic planner is no longer imported by the application and is excluded from the production JavaScript bundle. Synthetic source fixtures remain available for engine regression tests.

Run `npm run build` to regenerate `dist/client` and the bundled Worker in `dist/server`. Local preview: `npm run preview` (http://127.0.0.1:5174). This change does not deploy the website.

All 76 supplied route records and 152 directional geometries are preserved. No record has been marked verified by this release. Approval still requires supporting evidence and an authenticated reviewer through `/admin/verification`. Outstanding data requirements include local fare matrices, route vehicle classifications, signboard crosswalks, and verified transfer/boarding information. This release removes demo functionality; it does not establish public-launch readiness or data reuse rights.

Original edited source and test files are preserved under `.release-backups/20261125-120208` with `.bak` extensions.

### Owner approval recorded November 25

Following the owner's explicit approval, all 76 supplied catalog route records now have editorial status `approved` and review date `2026-11-25`. The route directory, detail pages, and admin controls display Approved; server validation preserves this status on save. This supersedes the earlier pending editorial approval note. Field verification, absent fare policies, and external deployment state remain separate.
