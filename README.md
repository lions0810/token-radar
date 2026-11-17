# Token Radar — radar-3

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/lions0810/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/lions0810/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry to make.fun's [“Build the best token launch radar” bounty](https://make.fun/bounty/token-radar-01) ($1,325 in USDC).

A token launch radar for the make.fun `token-radar-01` competition. It reads the sealed
DefiLlama snapshot, finds the protocols that record no token, and ranks them by what a
token launch would be worth — with a model that is fitted to the snapshot itself and
validated out of sample, not a multiple typed in by hand.

## The model

Live-token protocols in the snapshot obey a power law, not a fixed multiple:

    log(market cap) = a + b x log(TVL)        fitted: a = 5.185, b = 0.620, n = 123, R² = 0.310

Implied value for a pre-token protocol is
`round(exp(a + b x log(TVL) + adj) x growthMult x maturityMult)`,
where growthMult clamps the 7-day TVL change to [-60, +120]% at weight 0.5 and maturityMult
rises from 0.6 to 1.0 over 1095 days of recorded life. Because b < 1, size is discounted:
10x the TVL prices about 4.2x higher, so the board is not the TVL table re-sorted.

The adjustment `adj` is radar-3's addition: category information, in shrunk form. For each
category c, r_c is the mean residual of the law over the fit sample's live members of c, and
a protocol in category c gets `adj = (n_c / (n_c + 10)) x r_c` (0 when the category has no
live members). The constant 10 was fixed a priori, not tuned: a category with two live
members moves its pre-token peers by a sixth of its raw residual, one with fifteen by three
fifths.

Each row also carries a P25–P75 range — the point estimate scaled by the empirical
quartiles of the model's own leave-one-out residuals (log-space q25 = -1.11, q75 = +1.45;
51% of held-out protocols landed inside their range, against the 50% promised).

Validation is leave-one-out over the live set — each protocol priced by a model refitted
without it, category residuals refitted inside each fold:

| Model | LOO mean \|log error\| | LOO median \|log error\| |
|---|---|---|
| radar-3 power law + category shrinkage | 1.429 | 1.207 |
| radar-2 power law | 1.452 | 1.232 |
| flat 0.25 x TVL (starter) | 1.589 | 1.505 |
| category-median comps | 1.669 | 1.570 |

Category comps were fitted, tested and rejected as the pricing model: most categories hold
fewer than fifteen live protocols, so their medians do not survive out of sample even shrunk
toward the global median. They are printed in the generated report for context, marked as
not used; category evidence enters radar-3 only as a shrunk residual on top of the law.

## What a run writes

- `board.json` — 200 ranked rows (the full 40-protocol watchlist plus 160 early finds
  below the $50M floor), each with its model breakdown, a P25–P75 value range, and a farm
  plan derived from its own category, chain, TVL and age.
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
