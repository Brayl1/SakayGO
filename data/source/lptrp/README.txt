CDO Local Public Transport Route Plan (LPTRP) route dataset

File: cdo_lptrp_routes.json
Source: https://github.com/jrequiroso/cdo-jeepney-routes (public/data/routes.json),
        built from the CDO LPTRP site https://sites.google.com/view/cdo-routes-lptrp/district-1
Source commit: 61a453d (2026-05-29, "Clarify LPTRP route reference status")

Import:
  node scripts/import-lptrp.mjs data/source/lptrp/cdo_lptrp_routes.json --bundle
  node scripts/import-lptrp.mjs data/source/lptrp/cdo_lptrp_routes.json --local
  node --env-file=.env scripts/import-lptrp.mjs data/source/lptrp/cdo_lptrp_routes.json --supabase [--write --backup <dir>]

Notes:
- Reuse permission: the source repository has no license file; its owner (jrequiroso)
  approved SakayGo's use of the data on 2026-11-28 (permission reported by the SakayGo owner).
  Credit is shown on the About page.
- Route plan paths are reference alignments; actual jeepney operations may differ.
- "stops" are route plan reference points (areas, markets, terminals), not designated stops.
- Routes marked not_yet_operational are shown but never offered by the trip planner.
- No fares are included in this dataset.
