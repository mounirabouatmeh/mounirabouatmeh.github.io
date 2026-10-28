# Cuberence public website and shared workspace assets

Production website: **https://www.cuberence.com**. This repository hosts the marketing pages, public demo and **versioned client-side JS/CSS used by the protected Luna workspace in the separate Cuberence-App project**. It is not an independent flight-pricing engine.

## Current three-repository architecture

```text
cuberence.com          public marketing + versioned Luna display scripts
         │                          │
         │                 /static-issue115.js
         │                 /static-issue23-candidates.js
         │                 /static-issue115.css
         ▼                          ▼
app.cuberence.com      protected advisor + admin app (Clerk / Neon)
         │             /luna/workspace iframe; server proxy /api/luna/chat
         ▼
Cuberence-Travel-API   AeroDataBox discovery + Kiwi/Sabre fare providers
                       G4 7A ticket-first cheapest → price cache
                       G4 7B score ALL feasible and price experience top 3
                       G5 engine-owned, verified, tagged recommendationTableV1
         ▼
Luna                   explain the engine table; no selection/re-ranking
```

Backend authoritative design: [G0–G7 architecture](https://github.com/mounirabouatmeh/Cuberence-Travel-API/blob/main/Architecture/README.md), [rollout](https://github.com/mounirabouatmeh/Cuberence-Travel-API/blob/main/docs/optimization-v1-rollout.md), [G7 compatibility/cleanup](https://github.com/mounirabouatmeh/Cuberence-Travel-API/blob/main/docs/optimization-v1-g7-cleanup.md).

## Rendering invariants

- `static-issue115.js` must take **exact candidate IDs** only from G5 `recommendationTableV1` when present; it must NOT merge legacy `universeRecommendationCategories` or `RECOMMENDED` evaluation flags into a READY list. WITHHELD/STALE/invalid table means no authoritative recommendation list; only jobs with no G5 table may use old fields.
- `static-issue23-candidates.js` renders each engine row's **actual matched outer+inner RT fares**, provider marketed carrier identity, preserved ADB schedule, risk, Kiwi ticket links where provided, and “not locked/booked” warnings. Do not display `PROXY` as a validated fare.
- The “All ticket-compatible” tab is the full schedule universe, not additional recommendations. Engine `BOTH` overlap appears once. If coverage is **3/3 cheapest and 2/3 experience**, show five distinct priced candidates, not nine legacy picks or a fabricated third experience.
- Advisor's signed, candidate-specific exact confirmation remains in authenticated App/backend. Rendering must not invoke provider confirmation by itself.

## Development and delivery

The protected App embeds these website scripts through `Cuberence-App/app/luna/workspace/route.ts`. When modifying one, **deploy this repo first**, then increment its `?v=` reference in the App repo; test fresh browser cache/mobile rendering. Old job compatibility is intentional until G7 signoff, not a competing recommendation algorithm.

```bash
node --test test/*.test.cjs
# Plus GitHub Static UI CI and Agent Shell CI checks
```

The G5 parity regression `test/issue258-authoritative-engine-recommendations.test.cjs` reproduces nine historical picks vs the five verified Paris rows and checks the fail-closed table behavior. Current marketing language/route examples live in `index.html` and `fr/` translations.

## G7 retired UI overlay register

The pre-G0–G7 browser scripts `static-issue16.js` (parallel pricing/selection state interceptor and obsolete fixed-date sample prompt) and `static-sticky-progress.js` (duplicate progress-state tracker) were **retired** after verifying **no production or demo script references** in this repo or `Cuberence-App`. The site CI now **requires both paths to remain absent**. Their previous history is preserved in Git.

These replacements remain authoritative and must not be deleted:
- `static-issue23-state.js`, `static-issue23-workflow.js`: the current advisor workflow and flight-validation state machine
- `static-issue115.js`, `static-issue23-candidates.js`: the G5 engine-ranked recommendation IDs and complete provider-matched fare evidence
- `static-issue95.js` and `static-issue95-guard.js`: **dynamically loaded** by `static-issue25.js` for off-page candidate details/selection; the absence of a static demo script tag does **not** imply unused code
- `static-issue14-land.js`: geographical data used by the hub map; not a workflow duplicate

**Historical note:** older `/app` public demo, Next.js agent-shell files and pre-G5 recommendation field readers remain for compatibility/developer tests. They must not be presented as the currently authenticated production advisor architecture. Do not delete them until source references and migration tests prove they are unused.
