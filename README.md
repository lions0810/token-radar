# Token Radar — radar-2

A token launch radar for the make.fun `token-radar-01` competition. It reads the sealed
DefiLlama snapshot, finds the protocols that record no token, and ranks them by what a
token launch would be worth — with a model that is fitted to the snapshot itself and
validated out of sample, not a multiple typed in by hand.

## The model

Live-token protocols in the snapshot obey a power law, not a fixed multiple:

    log(market cap) = a + b x log(TVL)        fitted: a = 5.185, b = 0.620, n = 123, R² = 0.310

Implied value for a pre-token protocol is `round(exp(a) x TVL^b x growthMult x maturityMult)`,
where growthMult clamps the 7-day TVL change to [-60, +120]% at weight 0.5 and maturityMult
rises from 0.6 to 1.0 over 1095 days of recorded life. Because b < 1, size is discounted:
10x the TVL prices about 4.2x higher, so the board is not the TVL table re-sorted.

Validation is leave-one-out over the live set — each protocol priced by a law refitted
without it:

| Model | LOO mean \|log error\| | LOO median \|log error\| |
|---|---|---|
| radar-2 power law | 1.452 | 1.232 |
| flat 0.25 x TVL (starter) | 1.589 | 1.505 |
| category-median comps | 1.669 | — |

Category comps were fitted, tested and rejected: most categories hold fewer than fifteen
live protocols, so their medians do not survive out of sample. They are printed in the
generated report for context, marked as not used.

## What a run writes

- `board.json` — 200 ranked rows (the full 40-protocol watchlist plus 160 early finds
  below the $50M floor), each with its model breakdown and a farm plan derived from its
  own category, chain, TVL and age.
- `data.js` + `dashboard/` — the static, offline dashboard: ranked board, filters,
  per-protocol detail that recomputes the row's implied value in the page and checks it
  against board.json, and the model panel with the fit and validation above the board.
- `report.md` — the same argument as text: fit, validation, comps table, top 25.
- `dossier.json` — built last by `vendor/makefun-board.ts`, as the kit requires.

## Run it

Node 22.18 or later, standard library only:

    mkdir -p out
    MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>

## Layout

- `main.ts` — entry point: read, score, gate-check, write, copy, dossier.
- `lib/model.ts` — the fit, the board, the farm plans, the gate's own board checks.
- `lib/report.ts` — the Markdown report generator.
- `dashboard/` — `index.html`, `app.css`, `app.js`; no framework, no network.
- `screenshots/` — board, detail and filtered views of the shipped dashboard.
- `vendor/makefun-board.ts` — the kit's dossier library, unmodified.

License: MIT (see `LICENSE`).
