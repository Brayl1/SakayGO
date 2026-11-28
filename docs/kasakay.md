# KaSakay setup and verification

KaSakay is available at /kasakay through desktop navigation and the mobile menu. It uses the supplied mascot and existing sage styles. The landing hero is unchanged.

## Activate without billing

1. In [Google AI Studio](https://aistudio.google.com/apikey), create/select a project that is on the Gemini Developer API **Free tier**, with no billing account attached. Create a Gemini API key there. Do not enable billing or upgrade the project.
2. In the SakayGo Vercel project, open **Settings → Environment Variables**. Add **GEMINI_API_KEY** as a sensitive server environment variable for Production (and Preview only if wanted). Paste the key directly into Vercel, never chat or repository files. Do not use a VITE_ prefix.
3. After confirming the Google project is on the free tier, add **GEMINI_FREE_TIER_ENABLED=true** to the same environment. This deliberate activation gate is not an API billing-tier detector. A key attached to a billed project can incur charges even on a model with a free tier; do not use one.
4. Redeploy Vercel so the function receives these variables. Open /kasakay, ask a question, confirm both search matches, and check the planner handoff.
5. Locally, put these variables only in the ignored .env file. Run npm run server and npm run dev. The existing Worker preview is a separate deployment target; Gemini support is in the Node/Vercel/Express API. The UI reports unavailable on unsupported backends.

No billing configuration, paid provider fallback, Google Search grounding, or Google Maps grounding is enabled. The fixed model is **gemini-3.5-flash-lite**. Google’s official pricing page listed free-tier Standard text input/output and its model page listed a stable version and function calling when checked on 2026-11-28:

- [Official Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
- [Official model documentation](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)
- [Official function calling documentation](https://aistudio.google.com/docs/function-calling)
- [API keys](https://ai.google.dev/gemini-api/docs/api-key)
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

Free-tier access and capacity depend on Google’s current terms, region, project, and model availability. There is no promise of unlimited usage and no hard-coded Google quota. If unavailable or quota-limited, KaSakay stops calling the provider temporarily and offers the normal planner, route directory and fare guide. It never changes providers or models automatically. If Google retires this model, verify a new free-tier option before a deliberate code update.

## How grounding works

Gemini interprets English, Filipino and Cebuano into a strictly validated intent, endpoint search strings and passenger category. The server invokes only the existing /api/places and /api/trips/plan contracts in process, through the same catalog adapter used on Vercel.

Every search result requires explicit user confirmation, including single matches. Choice lists are signed with HMAC, expire after ten minutes, and are validated server-side. Coordinates come from the app’s search response, never the model. The server rejects edited choices; it exposes no admin or data-writing tools.

For completed plans, Gemini orders a closed set of localized factual sentences supplied by SakayGo. It cannot add route facts or URLs. The UI labels this as an AI-arranged explanation with SakayGo planner data. Help and clarification copy is labelled AI interpretation / SakayGo guidance. This deliberately constrained design trades conversational variety for route accuracy. Fallback tools are explicitly labelled as regular SakayGo functionality, not AI answers.

Up to three route cards reuse the existing FareCard, preserving its distinctions between policy-based estimates for verified classifications, conditional national references and unavailable fares. Verified policy inputs do not make the actual charge guaranteed. Planner links use local route IDs and confirmed place objects; they preserve start, destination and passenger type. Users still press Find My Jeepney in the regular planner.

## Privacy, limits and operational scope

The page tells users that messages and recent conversation are sent to Google and free-tier data may be used to improve Google products. No device geolocation is accessed by KaSakay. Google receives typed messages for interpretation, and fixed localized sentences for the explanation step; the latter contains no precise coordinates. Users can still explicitly type sensitive information, so the UI asks them not to.

Conversation state stays in page memory. No conversation, provider details or secret is logged by this module. Clear aborts outstanding browser work and removes page history; it cannot retract data already sent to Google.

Limits are application safeguards, not claims about Google quotas:
- 1,000 characters per message; at most ten recent messages / 6,000 characters.
- 16 KB request body, 24 KB provider response, 800 output tokens per call.
- Twenty-second server deadline; twenty-five-second browser deadline.
- At most two active requests, six requests per client per minute and sixty requests per instance per hour.
- A one-minute circuit break after a provider quota error.
- Fixed tool allowlist, schema validation, same-origin browser checks, bounded signed choices, and generic errors.

The throttles and circuit breaker are **in memory per serverless instance**. They reset on cold starts and do not provide a global budget across instances or regions. IP grouping can affect shared networks; distributed clients can bypass per-IP limits. The instance-wide ceiling still bounds an individual process. For stronger protection, configure available Vercel Firewall controls or a durable rate-limit store separately; neither paid service nor billing was enabled here. Use a non-billed Google project as the cost boundary. Disable GEMINI_FREE_TIER_ENABLED to turn AI off while preserving the planner.

## Verification

Automated provider calls are mocked; no API key or quota is required. tests/kasakay.test.js covers input bounds, methods/origins, missing-key/activation handling, provider errors/quota/backoff, model tool validation, timeouts, throttling, missing and ambiguous locations, signed/expired choices, no-route results, and comparison with the real route/fare engine.

e2e/kasakay.spec.ts covers desktop/mobile navigation, privacy notice, fallback, retry, loading/cancellation, clearing, place confirmation, planner handoff, keyboard controls and layout checks. Existing planner and fare tests should also run after changes to their shared components.

A real Gemini request has **not** been verified during implementation. Activation requires your own free-tier project key and the activation flag in Vercel. Passing mocked tests verifies application behavior, not live model availability or quality of multilingual extraction.

## Delivery record — 2026-11-28

Rebased onto origin/main at 66a56d0, preserving the three newer admin/verification commits. No route dataset or fare engine changes are included in KaSakay.

Validation performed:
- npm test: **132 passed**, including 37 mocked-provider KaSakay tests and the upstream admin transport tests.
- npm run build: passed TypeScript checking and the production Vite/Worker build.
- npm run lint and git diff --check: passed.
- Desktop (1440 × 1000) and mobile (390 × 844), Microsoft Edge via Playwright: **20 existing trip/fare cases passed** in the combined regression run. That run also exposed an inherited fixed-height mobile menu.
- After correcting mobile menu height/position and the catalog test fixture, reran e2e/kasakay.spec.ts and e2e/ui-refresh.spec.ts: **12 passed** (ten assistant cases plus two navigation cases). Thus all 32 selected browser cases have passing results across the final runs.
- Inspected desktop/mobile screenshots of the assistant, route cards, hero and mobile menu. Hero photo and 76-route badge remain intact.
- Updated stale test assertions to the pre-existing hero title, route badge selector and sage fare background. Product copy/colors were preserved.
- Checked that Gemini key references appear only in server/setup files, not client source or public assets.
- No real Gemini request was made. Live multilingual understanding and provider activation remain to be verified with the owner's non-billed key. No billing or paid fallback was enabled.

Changed files:
- Assistant UI: src/KaSakay.tsx, src/kasakay.css, public/images/kasakay.png.
- Navigation/planner integration: src/Navigation.tsx, src/Root.tsx, src/TripPlanner.tsx, src/FareCard.tsx, src/refresh.css.
- Server/deployment: server/kasakay.mjs, server/catalog-api.mjs, server/index.ts, vercel.json.
- Tests: tests/kasakay.test.js, e2e/kasakay.spec.ts, e2e/trips.spec.ts, e2e/fare-comparison.spec.ts, e2e/ui-refresh.spec.ts.
- Setup/documentation: .env.example, README.md, docs/kasakay.md.

## Floating panel update

The mascot button opens a right-side dialog on desktop and a full-width dialog on mobile. The existing navbar entry still opens the full assistant page. Closing/reopening the panel retains its draft and conversation; opening regular tools closes the panel. Escape, focus wrapping/restoration and background scroll locking are supported. The home-page launcher is positioned separately to avoid the route-count badge. The full assistant page does not show a duplicate launcher.

Changed: src/KaSakayWidget.tsx, src/kasakay-widget.css, src/KaSakay.tsx, src/Root.tsx, e2e/kasakay-widget.spec.ts, docs/kasakay.md.

Validation: ten existing assistant browser cases passed; all four new panel cases passed after the keyboard-focus fix, covering desktop/mobile opening, hero-badge clearance, draft persistence, Escape, focus wrapping, fallback links, and route navigation. Desktop/mobile screenshots were inspected. Production build, lint and whitespace checks passed. No provider or fare-engine changes and no live Gemini request were made for this UI update.
