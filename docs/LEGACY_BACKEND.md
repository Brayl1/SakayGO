# SakayGo

**Know Your Route. Know Your Fare.**

A functional, mobile-first Cagayan de Oro jeepney planner demonstration. Synthetic route IDs A–D, stops, alignments and prices are **not real transport information**. The landmark coordinates are approximate. No verified route dataset was available during development.

## Run locally

Requires Node.js 22+, npm and an internet connection for map tiles. From this directory:

```sh
npm install
npm run dev
```

Open the printed localhost URL. The frontend works independently using bundled synthetic data. Select **Find my jeepney** for the preset USTP → Divisoria journey, then select an alternative to explore a transfer. Switch to verified mode to confirm demo data is excluded.

```sh
npm run build
npm test
npm run test:e2e
```

Browser tests target the production build, require Microsoft Edge, and cover desktop (1440 px) and mobile (390 px). Change the Playwright channel if using another installed browser. `npm run build` must precede browser tests.

On this Windows host the global npm launcher was broken; the working alternative is `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" <command>`. Vite uses its runner config loader to avoid a sandbox-specific esbuild directory-enumeration failure. If development dependency optimization is blocked by the host sandbox, use `npm run build` then `node node_modules/vite/bin/vite.js preview --configLoader runner`.

## Backend

```sh
npm run server
```

The API listens on `127.0.0.1:3001`. Copy `.env.example` to `.env` and set `VITE_DATA_MODE=api` to connect the Vite frontend to it. Restart Vite after changing environment variables. Backend configuration is read from the process environment; `.env` is not automatically loaded into the API process. On PowerShell use `$env:DATASET_PATH='verified-data.json'` or `$env:DATABASE_URL='...'` before running the API. Without either storage variable, verified mode returns an empty dataset. Demo mode always uses the isolated synthetic fixture.

The private hosted static Site runs the browser-based demo engine. It does not run the local Express API or Postgres database. To host the full stack, deploy Express separately behind HTTPS and a same-origin `/api` reverse proxy, set `VITE_DATA_MODE=api`, and rebuild the frontend. Configure proxy trust and rate limiting for that deployment explicitly.

## Architecture and folders

```text
src/                 React UI, accessible search, pages, Leaflet map, responsive CSS
shared/model.ts      Location, directed service, policy, journey contracts
shared/data.ts       Clearly marked synthetic fixture and approximate landmarks
shared/engine.ts     Directed graph search and per-ride fare estimation
shared/validation.ts Bounded API/import schemas and relational validation
server/              Express endpoints, input validation, rate limit, data repository
db/001_initial.sql   Transactional PostGIS migration, tables and indexes
scripts/             Validated import, seed, portable API build/runner
tests/               Routing, fare, validation and HTTP API tests
e2e/                 Essential desktop/mobile journeys
```

React state is sufficient for the small anonymous planner; no account layer is needed. CSS design tokens and reusable controls replace a larger UI framework. Secondary information pages and Leaflet are lazy loaded. These choices keep the demo maintainable without adding unused state/query packages.

The primary journey is origin → destination → route options → selected ride/transfer timeline → per-ride fare. The desktop workspace keeps the planner beside the map. Mobile uses an expandable bottom sheet with collapsed, half and full states, controlled by the handle. The map remains usable above the panel. All essential route information is also text.

## Routing and fares

The graph enumerates downstream stop pairs on direction-specific services. Transfers occur only at explicitly shared nodes. It honors pickup/drop-off permissions and prevents repeated services and cycles. The UI requests direct and one-transfer options; the API supports up to three transfers. It ranks by transfer count and fare; the user can sort by fare. It never infers reverse service or treats ordinary road routing as proof of jeepney service.

Demo geometry consists of straight illustrative connections between landmark nodes. Its distance is **not an authoritative road distance**. For imported data, supply surveyed ordered shape nodes as described below. Walking paths, walking distances and reliable travel times are not implemented; the interface explicitly reports them as unavailable. The `walking` field is an internal placeholder and is not displayed as a measured zero.

Fare calculation supports a minimum/base distance, a per-started-kilometer increment, configurable discount and rounding step, with separate calculation for each ride. Missing, expired, future-effective or mode-incompatible policies produce `null` / “Fare unavailable.” The simple policy model is not a universal Philippine fare engine: extend it for graduated matrices, vehicle-specific distinctions or special eligibility rules before importing policies that require them. No official fare amounts or eligibility claims are supplied.

## API contracts

| Endpoint                                     | Behavior                                                    |
| -------------------------------------------- | ----------------------------------------------------------- |
| `GET /api/health`                            | Runtime/storage status; not a database health guarantee     |
| `GET /api/dataset?demo=true`                 | Bounded initial dataset for the current mode                |
| `GET /api/locations?q=...&demo=true`         | Up to 30 named locations                                    |
| `GET /api/routes?demo=true`                  | Route metadata without geometries                           |
| `GET /api/routes/:id?demo=true`              | Direction-specific route detail                             |
| `GET /api/policies?demo=true`                | Mode-appropriate fare policies                              |
| `GET /api/nearby?lat=...&lng=...&meters=500` | PostGIS proximity query; 503 without database               |
| `POST /api/plan`                             | `{from,to,passenger,demo,maxTransfers}` → `{mode,journeys}` |

`passenger`: regular/student/senior/pwd. `demo` defaults to false; `maxTransfers` defaults to 1 and is bounded to 0–3. Invalid inputs return 400, missing routes 404, unavailable storage 503, excessive traffic 429. Errors do not expose stacks. There is no publicly exposed write/admin endpoint.

## Importing a verified dataset

1. Obtain operator/transport-authority alignments, pickup/drop-off permissions, fare policies and source references. Perform field verification. Do not convert the synthetic fixture into “verified” data.
2. Run `npm run seed` to create `demo-dataset.json` as a **format reference only**. Replace it with independently collected data following `shared/model.ts` and the constraints in `shared/validation.ts`.
3. Each route is one direction. Give every ordered shape point a location ID and matching coordinate in `geometry`; mark intermediate shape-only nodes `pickup:false` and `dropoff:false`. Each permission array must match `stops.length`. Shared stop IDs imply an actual verified transfer opportunity; do not merge opposite-side stops without evidence. Repeated loop stops must be split into distinct directed records.
4. Use `status: verified`, a real nonfuture `verifiedAt`, and a source reference only after validation by a responsible reviewer. The importer validates structure, **not the truth of source claims**. Supply non-demo fare policies with source, validity window and supported calculation rules, or leave the referenced policy absent to show Fare unavailable.
5. Run `npm run import:data -- your-dataset.json`. The validated local output is `verified-data.json`. Set `DATASET_PATH` to that path, start the API, and use frontend API mode. Data switching clears old results.
6. For Postgres, create a database with PostGIS, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/001_initial.sql` once, then `npm run import:data -- your-dataset.json --database`. Use process-environment syntax appropriate to your shell. Migrations record their version; the initial migration is intended to run once, not repeatedly.

The database importer writes normalized locations, stops, service geometry, relationships, sources and fare policies in one transaction, then activates a validated JSON release used by the planner. An advisory lock serializes imports. Older release snapshots remain inactive for audit. Normalized rows from older releases are retained; nearby results are candidate landmarks, not verified service recommendations. Use a separate read-only runtime role with SELECT on `dataset_releases` and `locations`; administrative credentials belong only to the importer. Public privileges are revoked in the migration.

No Postgres server was provisioned in this workspace. The SQL migration and database import are supplied but have not been integration-tested against a running PostGIS instance. The local-file API and synthetic API are executable without a database.

## Implemented vs. remaining

Implemented: responsive planner and three-state mobile sheet; keyboard autocomplete; clear/swap/geolocation; local named-landmark history; demo/verified isolation; route alternatives; map selection, markers and popups; transfer timeline with map focus; configurable per-ride fares; directory/detail pages; fare/how/about/404 pages; loading/empty/error states; REST API; bounded import validation; file repository; PostGIS schema, queries and transactional importer; unit/API/browser tests.

Remaining before real commuter use: sourced and surveyed CDO services and fares; independent route/fare review; pedestrian graph/access links; real walking instructions; reliable travel-time data; richer fare-policy classes; authenticated admin UI; database integration tests; geographic pagination for large datasets; formal accessibility audit. No offline navigation, live vehicle tracking or fabricated schedules are provided. The initial dataset endpoint loads bounded geometries for the small prototype; it must be replaced with geographic/route-based loading as coverage grows.

## Privacy, accessibility and map policy

No accounts or analytics. Precise geolocation remains in memory. Named-landmark history is stored on-device and can be cleared. Geolocation is optional and only requested after a user action. Inputs are bounded and validated; database statements use parameters. Map tile providers receive normal browser requests, subject to their policies.

Semantic controls, labeled inputs, keyboard autocomplete, visible focus, reduced-motion styling, textual journeys and responsive touch controls are included. This is not a claim of audited WCAG certification.

OpenStreetMap attribution is displayed. Standard tiles load on demand over HTTPS with ordinary browser caching and referrer behavior; there is no bulk download, tile prefetcher or offline cache. Review the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) before increasing traffic and choose an appropriate provider for production scale.
