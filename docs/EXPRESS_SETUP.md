# Running the existing frontend with Express

Use Node 22.19 or newer. From `D:\Downloads\sakaygo-HC1I`, install dependencies once with `npm ci` if needed.

Terminal 1:

```powershell
npm run server
```

Terminal 2:

```powershell
npm run dev
```

Open http://localhost:5173 (or http://127.0.0.1:5173). Keep both terminals running. Express listens on 127.0.0.1:3001; Vite uses strict port 5173 and proxies /api only to 3001. Port 5174 is not required. A port-in-use error means stop the previous process in its terminal; do not change the proxy to Vite's own port.

If this machine's npm launcher fails, replace `npm` with `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"` in these commands.

## Environment and datasets

The server launcher now loads the project `.env` before starting Express. Existing process variables take precedence. Current catalog persistence uses `SUPABASE_URL` and server-only `SUPABASE_SECRET_KEY` when configured; otherwise it reads existing local admin state and bundled route data. A configured database failure is reported, not replaced with synthetic data. No environment secret is sent to the browser.

The project has two intentionally separate data contracts:

| Endpoints | Data contract |
| --- | --- |
| `/api/catalog`, `/api/catalog/:id`, `/api/trips/plan` | Current 76-route directional catalog and coordinate-based geometric planner, sourced from Supabase/local state; existing Worker implementation reused inside Express |
| `/api/fare-policies/current`, `/api/fare-reference`, `/api/route-codes`, `/api/places`, `/api/test-cases` | Current reviewed policies, separate national reference rates, research/approved crosswalks, place search and geometric examples |
| `/api/dataset`, `/api/routes`, `/api/routes/:id`, `/api/locations`, `/api/policies`, `/api/plan`, `/api/nearby` | Existing stop-ID prototype, retaining PostgreSQL `dataset_releases` / `DATASET_PATH` support and explicit `demo=true` behavior |

Do not replace catalog requests with dataset requests or join traditional codes to numeric route IDs. The catalog's roads, independent geometry and review metadata do not represent surveyed pickup/dropoff stops. No conversion invents stops, transfer permissions or verified services.

On the inspected configuration, `/api/dataset` contains 10 bundled landmark locations but zero verified services/policies. It explicitly returns `source: bundled_landmarks_only`; nonempty JSON is not evidence of verified routes. `demo=true` returns four synthetic services. `/api/routes` retains this legacy contract and can correctly be empty while `/api/catalog` has 76 records. `/api/plan` with recognized IDs and `demo:false` may correctly return no journeys. Do not mark the synthetic dataset verified to populate it.

## Authentication

Express has no configured authentication middleware. `/api/session` therefore returns `{admin:false,signedIn:false}`; admin endpoints return 403. Caller-provided Sites identity headers and `SAKAYGO_LOCAL_ADMIN` do not grant Express access. Hosted Sites owner authorization and the existing explicit localhost-owner preview remain unchanged. To administer through this new Express entrypoint, implement and verify a real session/authentication integration first; this API compatibility fix does not create one.

## Validation

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e:express
```

The Express browser configuration tests Vite and Express together. It excludes the owner-write scenario because this transport is unauthenticated; it tests denial instead. The original `npm run test:e2e` remains available for the existing local-owner Worker preview. Real map tiles and geocoding require network connectivity.

An empty current-policy list is valid when no CDO policy is approved. Reference fare illustrations remain separate and do not become official fares. Fare/session HTTP failures now display errors rather than being silently treated as empty data.

The Express API retains its 90-requests-per-minute limit. Browser test projects share one loopback IP; their setup honors Retry-After when that limit is reached instead of disabling the limiter. A 429 response during repeated manual or automated runs means wait for the indicated retry interval.
