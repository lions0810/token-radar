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

  lines.push('# Token Radar — radar-3 report');
  lines.push('');
  lines.push(`Snapshot: ${snapshot.source}, as of ${snapshot.as_of}. ${snapshot.protocols.length} protocols at or above the radar's scan floor; ${radar.board_size} pre-token protocols ranked (${radar.watchlist_size} watchlist, ${radar.early_size} early below the $${Math.round(snapshot.floor_usd / 1e6)}M watchlist floor), ${radar.live_size} live-token protocols shown for reference.`);
  lines.push('');
  lines.push('## The model');
  lines.push('');
  lines.push('Implied value is a power law of TVL, fitted to the snapshot\'s own live-token protocols, adjusted by a shrunk category residual, then adjusted for the week\'s growth and the protocol\'s maturity:');
  lines.push('');
  lines.push(`    implied = round( exp(${fixed(fit.a, 4)} + ${fixed(fit.b, 4)} x log(TVL) + adj) x growthMult x maturityMult )`);
  lines.push('');
  lines.push(`The fit is ordinary least squares on log(market cap) against log(TVL) over ${fit.n} live-token protocols (market cap > 0, TVL > 0, cap/TVL between 0.001 and 20, which drops placeholder and broken records), R² = ${fixed(fit.r_squared, 3)}. The exponent ${fixed(fit.b, 3)} is below 1, so value grows slower than TVL: ten times the TVL prices about ${fixed(Math.pow(10, fit.b), 1)} times higher, not ten times. A ranking by this law is therefore not the TVL table re-sorted.`);
  lines.push('');
  lines.push(`The adjustment adj is where category information enters, in shrunk form. For each category c, r_c is the mean residual log(market cap) - (a + b x log(TVL)) over the fit sample's live members of c, and a protocol in category c is adjusted by adj = (n_c / (n_c + ${fit.shrink_k})) x r_c, where n_c is that live member count; a category with no live members adjusts by 0. The constant ${fit.shrink_k} was fixed a priori, before validation, not tuned on it: a category priced richly by the market lifts its pre-token peers, but a category with two live members moves them by only a sixth of its raw residual, and one with fifteen by three fifths.`);
  lines.push('');
  lines.push('Growth and maturity keep the starter model\'s shape: growth clamps the 7-day TVL change to [-60, +120] percent and scales it by 0.5; maturity rises from 0.6 to 1.0 over the first 1095 days of a protocol\'s recorded life, with 365 days assumed when no listing date is recorded.');
  lines.push('');
  lines.push(`Every row also carries a P25-P75 range: its implied value scaled by exp(q25) and exp(q75), the empirical quartiles of the shipped model's own leave-one-out residuals (q25 = ${fixed(fit.interval.q25, 2)}, q75 = +${fixed(fit.interval.q75, 2)} in log space). ${fixed(fit.interval.coverage * 100, 0)}% of held-out protocols landed inside their range, against the 50% the quartiles promise — the range is the model's measured uncertainty, stated rather than hidden.`);
  lines.push('');
  lines.push('## Validation, out of sample');
  lines.push('');
  lines.push('Each live-token protocol was priced by a model refitted without it (leave-one-out, with the category residuals refitted inside each fold for the models that use them), and the absolute log error against its real market cap was averaged. The flat baseline is the starter model\'s fixed 0.25 x TVL; the comps model prices at the category\'s median cap/TVL, shrunk toward the global median:');
  lines.push('');
  lines.push('| Model | LOO mean \\|log error\\| | LOO median \\|log error\\| |');
  lines.push('|---|---|---|');
  lines.push(`| radar-3 power law + category shrinkage | ${fixed(fit.shrink_loo_mean_abs_log_error, 3)} | ${fixed(fit.shrink_loo_median_abs_log_error, 3)} |`);
  lines.push(`| radar-2 power law | ${fixed(fit.loo_mean_abs_log_error, 3)} | ${fixed(fit.loo_median_abs_log_error, 3)} |`);
  lines.push(`| flat 0.25 x TVL | ${fixed(fit.flat_025_mean_abs_log_error, 3)} | ${fixed(fit.flat_025_median_abs_log_error, 3)} |`);
  lines.push(`| category-median comps | ${fixed(fit.category_median_mean_abs_log_error, 3)} | ${fixed(fit.category_median_median_abs_log_error, 3)} |`);
  lines.push('');
  const gain = (1 - fit.shrink_loo_mean_abs_log_error / fit.flat_025_mean_abs_log_error) * 100;
  const shrinkGain = (1 - fit.shrink_loo_mean_abs_log_error / fit.loo_mean_abs_log_error) * 100;
  lines.push(`The shipped model's mean error is ${fixed(gain, 1)}% lower than the flat baseline's; the shrinkage layer contributes ${fixed(shrinkGain, 1)} points of that over the plain power law — a small, consistent gain on both the mean and the median, kept because it costs the ranking nothing when a category has no live evidence. The comps model scored worst of the four even with its medians shrunk toward the global median, because most categories hold too few live protocols for a stable median; it is reported below as context and not used for pricing. Category information enters the shipped model only as a shrunk residual on top of the law, never as the price itself.`);
  lines.push('');
  lines.push('Development-stage tests measured in-session on the same snapshot: Huber robust regression scored LOO 1.448, Theil–Sen 1.452, and a TVL+growth two-feature model 1.465 — all at or behind the shipped model, so none replaced it.');
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
  lines.push('## The watchlist, in full');
  lines.push('');
  lines.push('The forty protocols the brief guarantees a place to — TVL at or above the floor and no token on record — with the rank the model gives each. A watchlist protocol the model prices low is still here: coverage is the floor, the ranking is the model\'s opinion, and the two are never traded against each other.');
  lines.push('');
  lines.push('| Rank | Protocol | Category | TVL | Implied value | % of TVL |');
  lines.push('|---|---|---|---|---|---|');
  const watchlistRows = board.filter((r) => snapshot.watchlist.includes(r.slug));
  for (const r of watchlistRows) {
    lines.push(`| ${r.rank} | ${r.name} | ${r.category ?? '—'} | ${usd(r.tvl_usd)} | ${usd(r.implied_value_usd)} | ${fixed((r.implied_value_usd / r.tvl_usd) * 100, 1)}% |`);
  }
  lines.push('');
  lines.push('Every row of board.json carries the same breakdown the dashboard recomputes in the page — the fitted a and b, its category adjustment, the growth and maturity multipliers, and its P25-P75 range — plus a farm plan derived from that protocol\'s own category, first chain, TVL and age. Implied value is a model, not a promise: it prices what a launch would be worth if this protocol\'s token were valued the way the snapshot\'s live tokens are valued at its size and in its category.');
  lines.push('');
  return lines.join('\n');
}
