# Mobile Home and Planner layout

The Home and /planner pages use a ride-app mobile layout at widths up to 768px. Existing desktop elements and base styles remain intact; additive mobile controls are hidden by default. All new visual rules are inside the mobile media query except the required `.mobile-only { display: none; }` rule. Existing sage variables are not changed.

## Changed files

- `src/mobile-ride.css`: mobile header treatment, photo hero and form card, guide tiles, bottom tabs, map overlays, scrollable planner sheet, safe-area spacing and reduced-motion styling.
- `src/main.tsx`: imports the mobile stylesheet after existing styles.
- `src/Welcome.tsx`: adds hidden-by-default guide tiles using existing routes. Existing form and dynamic route count are reused.
- `src/TripPlanner.tsx`: adds hidden-by-default sheet heading, back/city/location map overlays and route caution text in Map information. Existing fields, state, submit, swap, place shortcuts, passenger/preferences and map handlers remain intact.
- `src/KaSakayWidget.tsx`: adds hidden-by-default Home/Planner/KaSakay/Routes tabs, opens the same existing dialog, returns focus to the visible launcher, and measures visual viewport occlusion for mobile-only keyboard spacing. No JavaScript width checks are used.
- `e2e/mobile-ride.spec.ts`: mobile layout/interaction and desktop appearance regression coverage.
- `docs/mobile-layout.md`: this delivery record.

No new dependencies. No route-planning algorithm, API, SQL, fare calculation, shared navigation component or TripMap changes. TripMap already observes its container with ResizeObserver and calls invalidateSize({ pan: false }); the mobile layout reuses that behavior.

## Validation (2026-11-28)

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed (includes TypeScript, Vite production bundle and existing worker build).
- `git diff --check`: passed.
- `npm.cmd run test:e2e:express -- e2e/mobile-ride.spec.ts e2e/kasakay-widget.spec.ts --workers=1`: 8 passed; 4 intentionally skipped because mobile cases run only in the mobile project and desktop cases only in the desktop project.
- At 360, 390 and 430px: no horizontal overflow; CTA remains above tabs; menu, guide tiles, KaSakay dialog/focus restoration, Home-to-Planner queries, mocked autocomplete, swap, passenger and preference selection, real local trip planning/results/edit, map picking, popular destination searches, More options and Map information, and mocked device geolocation checked.
- At each mobile width: a 500px-high viewport checks sheet scrolling and CTA clearance. A simulated VisualViewport height of 460px inside an 844px layout checks keyboard-inset calculation and tab/CTA clearance.
- Desktop screenshots at 1280 and 1440px matched screenshots captured before editing exactly, masking only the changing map area. Automated comparisons at 769, 1280 and 1440px also matched with the new mobile-only nodes and stylesheet removed. Existing desktop markup is retained; the only additional desktop DOM nodes are the deliberately hidden mobile controls.
- Final mobile Home, Planner and short-viewport screenshots were visually inspected. Browser checks use Chromium/Edge emulation; a physical iOS/Android soft keyboard was not available for testing.

## Design assumptions

- The map uses a responsive height capped at 340px, with a smaller height on typical phones so the CTA stays accessible.
- Existing popular destinations are labeled as popular, not recent history. The first two shortcuts are shown; all places remain searchable using the existing autocomplete. A shortcut starts its existing destination search and requires confirming the matching place.
- Map-pick controls use target icons with their existing accessible names. They share the original handlers.
- The map legend and attribution remain visible. More options and Map information remain collapsible below the CTA, within the scrollable sheet.
- The original additional Home sections remain reachable below the new guide tiles.
- Tests do not send messages to Gemini. Chat fallback uses mocked responses; no live Gemini request was made for this UI change.
