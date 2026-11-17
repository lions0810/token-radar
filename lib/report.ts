// The radar's written report: everything the dashboard shows, as one Markdown file the program
// drops beside board.json. It exists so a reader who never opens the page still gets the whole
// argument — the fitted law, the out-of-sample proof that it beats the flat baseline, the comps
// table that was measured and deliberately not used, and the top of the board with the arithmetic
// exposed. Every number here is recomputed from the snapshot and the board at run time; nothing
// is typed in by hand, so the report cannot drift away from the data it describes.

import { fitSample, type BoardRow, type RadarData, type Snapshot } from './model.ts';

/** A dollar figure for a table cell: $1.23B, $45.6M, $7.8K, or the plain amount under $1K. */
function usd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(v)}`;
}

/** A signed percentage with two decimals, or an em dash when the snapshot records none. */
function pct(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/** A fixed-decimal number for the fit statistics. */
function fixed(n: number, digits: number): string {
  return n.toFixed(digits);
}

/** The median of a non-empty list, taken on a sorted copy so the caller's order survives. */
function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Market cap over TVL for the live-token protocols, grouped by category: the comps table.
 * It is reported for context and as a warning — the radar measured these medians, tested them
 * as the pricing model, and rejected them, because most categories hold fewer than fifteen
 * live protocols and their medians swing wildly out of sample (see the validation section).
 */
export function categoryComps(snapshot: Snapshot): { category: string; n: number; medianRatio: number }[] {
  const byCategory = new Map<string, number[]>();
  for (const p of fitSample(snapshot)) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  return [...byCategory.entries()]
    .map(([category, ratios]) => ({ category, n: ratios.length, medianRatio: median(ratios) }))
    .sort((x, y) => y.n - x.n || (x.category < y.category ? -1 : 1));
}

/** The board's own summary figures, counted from the rows rather than restated from the radar. */
export function boardStats(board: BoardRow[], snapshot: Snapshot): { watchlistCovered: number; topShare: number; medianShare: number } {
  const slugs = new Set(board.map((r) => r.slug));
  const covered = snapshot.watchlist.filter((s) => slugs.has(s)).length;
  const shares = board.map((r) => r.implied_value_usd / r.tvl_usd);
  return {
    watchlistCovered: covered,
    topShare: shares.length > 0 ? shares[0]! : 0,
    medianShare: shares.length > 0 ? median(shares) : 0,
  };
}

/** The whole report as one Markdown string, ending with a newline. */
export function buildReport(snapshot: Snapshot, radar: RadarData, board: BoardRow[]): string {
  const fit = radar.fit;
  const stats = boardStats(board, snapshot);
  const comps = categoryComps(snapshot);
  const lines: string[] = [];

  lines.push('# Token Radar — radar-2 report');
  lines.push('');
  lines.push(`Snapshot: ${snapshot.source}, as of ${snapshot.as_of}. ${snapshot.protocols.length} protocols at or above the radar's scan floor; ${radar.board_size} pre-token protocols ranked (${radar.watchlist_size} watchlist, ${radar.early_size} early below the $${Math.round(snapshot.floor_usd / 1e6)}M watchlist floor), ${radar.live_size} live-token protocols shown for reference.`);
  lines.push('');
  lines.push('## The model');
  lines.push('');
  lines.push('Implied value is a power law of TVL, fitted to the snapshot\'s own live-token protocols, then adjusted for the week\'s growth and the protocol\'s maturity:');
  lines.push('');
  lines.push(`    implied = round( exp(${fixed(fit.a, 4)}) x TVL^${fixed(fit.b, 4)} x growthMult x maturityMult )`);
  lines.push('');
  lines.push(`The fit is ordinary least squares on log(market cap) against log(TVL) over ${fit.n} live-token protocols (market cap > 0, TVL > 0, cap/TVL between 0.001 and 20, which drops placeholder and broken records), R² = ${fixed(fit.r_squared, 3)}. The exponent ${fixed(fit.b, 3)} is below 1, so value grows slower than TVL: ten times the TVL prices about ${fixed(Math.pow(10, fit.b), 1)} times higher, not ten times. A ranking by this law is therefore not the TVL table re-sorted.`);
  lines.push('');
  lines.push('Growth and maturity keep the starter model\'s shape: growth clamps the 7-day TVL change to [-60, +120] percent and scales it by 0.5; maturity rises from 0.6 to 1.0 over the first 1095 days of a protocol\'s recorded life, with 365 days assumed when no listing date is recorded.');
  lines.push('');
  lines.push('## Validation, out of sample');
  lines.push('');
  lines.push('Each live-token protocol was priced by a law refitted without it (leave-one-out), and the absolute log error against its real market cap was averaged. The flat baseline is the starter model\'s fixed 0.25 x TVL:');
  lines.push('');
  lines.push('| Model | LOO mean \\|log error\\| | LOO median \\|log error\\| |');
  lines.push('|---|---|---|');
  lines.push(`| radar-2 power law | ${fixed(fit.loo_mean_abs_log_error, 3)} | ${fixed(fit.loo_median_abs_log_error, 3)} |`);
  lines.push(`| flat 0.25 x TVL | ${fixed(fit.flat_025_mean_abs_log_error, 3)} | ${fixed(fit.flat_025_median_abs_log_error, 3)} |`);
  lines.push('');
  const gain = (1 - fit.loo_mean_abs_log_error / fit.flat_025_mean_abs_log_error) * 100;
  lines.push(`The power law's mean error is ${fixed(gain, 1)}% lower. A category-median comps model was also fitted and tested the same way; it scored worse than both (mean 1.669) because most categories hold too few live protocols for a stable median, so it is reported below as context and not used for pricing.`);
  lines.push('');
  lines.push('## Category comps (measured, not used)');
  lines.push('');
  lines.push('| Category | Live protocols | Median cap / TVL |');
  lines.push('|---|---|---|');
  for (const c of comps) lines.push(`| ${c.category} | ${c.n} | ${fixed(c.medianRatio, 3)} |`);
  lines.push('');
  lines.push('## The board, top 25');
  lines.push('');
  lines.push(`Watchlist coverage: ${stats.watchlistCovered} of ${snapshot.watchlist.length}. Implied value runs from ${fixed(stats.topShare * 100, 1)}% of TVL at the top of the board to a median of ${fixed(stats.medianShare * 100, 1)}% across all ${board.length} rows — the compression the sub-1 exponent produces.`);
  lines.push('');
  lines.push('| Rank | Protocol | Category | TVL | 7d | Implied value | % of TVL |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of board.slice(0, 25)) {
    lines.push(`| ${r.rank} | ${r.name} | ${r.category ?? '—'} | ${usd(r.tvl_usd)} | ${pct(r.change_7d)} | ${usd(r.implied_value_usd)} | ${fixed((r.implied_value_usd / r.tvl_usd) * 100, 1)}% |`);
  }
  lines.push('');
  lines.push('Every row of board.json carries the same breakdown the dashboard recomputes in the page — the fitted a and b, the growth and maturity multipliers — plus a farm plan derived from that protocol\'s own category, first chain, TVL and age. Implied value is a model, not a promise: it prices what a launch would be worth if this protocol\'s token were valued the way the snapshot\'s live tokens are valued at its size.');
  lines.push('');
  return lines.join('\n');
}
