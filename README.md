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

**Historical note:** older `/app` public demo, Next.js agent-shell files and pre-G5 recommendation field readers remain for compatibility/developer tests. They must not be presented as the currently authenticated production advisor architecture. Do not delete them until source references and migration tests prove they are unused.
