// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures (radar-3):
//
//   fit        = log-log power law fitted at runtime to the snapshot's own live-token protocols:
//                log(mcap_usd) = a + b x log(tvl_usd), fitted by ordinary least squares on the
//                protocols with mcap_usd > 0, tvl_usd > 0 and 0.001 <= mcap_usd / tvl_usd <= 20
//                (the mcap_usd = -1 placeholder row and mcap_usd = 0 rows fail mcap_usd > 0)
//   shrink     = a category adjustment on top of the law: for each category c, r_c is the mean
//                residual log(mcap_usd) - (a + b x log(tvl_usd)) over the fit sample's live
//                members of c, and a row in category c gets adj = (n_c / (n_c + K)) x r_c with
//                K = 10 fixed a priori (0 when the category has no live members)
//   base       = exp(a + b x log(tvl_usd) + adj)
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//   range      = [round(implied x exp(q25)), round(implied x exp(q75))], the empirical quartiles
//                of the shipped model's own leave-one-out residuals (see PowerLawFit.interval)
//
// The growth and maturity adjustments are the starter's, unchanged. The power law replaces the
// starter's flat 0.25 x TVL base, and radar-3 adds the shrunk category adjustment: on the sealed
// snapshot both validate better out of sample than the flat base (leave-one-out, see PowerLawFit).
// No protocol name is ever special-cased: the same fitted function scores every row, and the fit
// is recomputed deterministically from the snapshot on every run, never hard-coded.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** The category shrinkage constant: adj_c = (n_c / (n_c + SHRINK_K)) x mean residual. Fixed a priori. */
export const SHRINK_K = 10;

/** The shrinkage applied to the category-median comps model in validation: medians are pulled
 *  toward the global median with weight n_c / (n_c + CATEGORY_MEDIAN_SHRINK). */
export const CATEGORY_MEDIAN_SHRINK = 5;

/**
 * The fit radar-3 scores with, fitted from the snapshot itself (see fitPowerLaw).
 * `a`, `b` and the per-category adjustments are carried at full precision: the dashboard
 * recomputes every row from them and the number must match board.json exactly. The validation
 * fields are summaries, rounded to 6 decimals: leave-one-out mean and median absolute log error
 * for the shipped model (power law + category shrinkage), the plain power law, the starter's
 * flat 0.25 x TVL base, and the category-median comps model, each on the same held-out protocols.
 * `interval` carries the empirical quartiles of the shipped model's leave-one-out residuals and
 * the share of those residuals inside them; every board row's range is its implied value scaled
 * by exp(q25) and exp(q75).
 */
export interface PowerLawFit {
  a: number;
  b: number;
  n: number;
  r_squared: number;
  loo_mean_abs_log_error: number;
  loo_median_abs_log_error: number;
  flat_025_mean_abs_log_error: number;
  flat_025_median_abs_log_error: number;
  shrink_k: number;
  shrink_loo_mean_abs_log_error: number;
  shrink_loo_median_abs_log_error: number;
  category_median_mean_abs_log_error: number;
  category_median_median_abs_log_error: number;
  interval: { q25: number; q75: number; coverage: number };
  category_adj: Record<string, { n: number; adj: number }>;
}

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  value_low_usd: number;
  value_high_usd: number;
  model: {
    fit_a: number;
    fit_b: number;
    fit_n: number;
    base_value_usd: number;
    shrink_adj: number;
    category_live_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  value_low_usd: number;
  value_high_usd: number;
  shrink_adj: number;
  category_live_n: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  fit: PowerLawFit;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Ordinary least squares for log(mcap) = a + b x log(tvl) on paired log points. */
function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const b = den === 0 ? 0 : num / den;
  return { a: my - b * mx, b };
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** The category a protocol is grouped under for shrinkage: its recorded category, else 'Other'. */
function categoryKey(p: SnapshotProtocol): string {
  return p.category ?? 'Other';
}

/** The empirical quantile of a sorted list: the element at floor(p x n), clamped to the list. */
function quantileFloor(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx]!;
}

/**
 * The category adjustments of one fitted law over one training set: for each category, the mean
 * residual log(mcap) - (a + b x log(tvl)) of its members, shrunk toward zero by n / (n + k).
 * A category with no members is absent from the map and adjusts by 0.
 */
function categoryAdjustments(train: SnapshotProtocol[], a: number, b: number, k: number): Map<string, { n: number; adj: number }> {
  const sums = new Map<string, { n: number; sum: number }>();
  for (const p of train) {
    const key = categoryKey(p);
    const residual = Math.log(p.mcap_usd!) - (a + b * Math.log(p.tvl_usd));
    const entry = sums.get(key);
    if (entry === undefined) sums.set(key, { n: 1, sum: residual });
    else {
      entry.n += 1;
      entry.sum += residual;
    }
  }
  const out = new Map<string, { n: number; adj: number }>();
  for (const [key, entry] of sums) {
    out.set(key, { n: entry.n, adj: (entry.n / (entry.n + k)) * (entry.sum / entry.n) });
  }
  return out;
}

/**
 * The live-token protocols the power law is fitted on, in snapshot order: a recorded market cap
 * above zero (so the mcap_usd = -1 placeholder row and the mcap_usd = 0 rows are out), a TVL
 * above zero, and a market-cap-to-TVL ratio inside [0.001, 20].
 */
export function fitSample(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => {
    if (p.mcap_usd === null || !(p.mcap_usd > 0)) return false;
    if (!(p.tvl_usd > 0)) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return ratio >= 0.001 && ratio <= 20;
  });
}

/**
 * Fit the radar-3 model from the snapshot's own live-token protocols, deterministically: the
 * OLS power law, then the category adjustments of the full fit. Also computes the leave-one-out
 * validation (one refit per held-out protocol, with the category residuals and adjustments
 * refitted inside each fold) for the shipped model and for the three models it is compared
 * against, and the prediction interval from the shipped model's leave-one-out residuals.
 */
export function fitPowerLaw(snapshot: Snapshot): PowerLawFit {
  const sample = fitSample(snapshot);
  if (sample.length < 2) throw new SnapshotError(`snapshot has ${sample.length} usable live-token protocols: the power law needs at least 2`);
  const xs = sample.map((p) => Math.log(p.tvl_usd));
  const ys = sample.map((p) => Math.log(p.mcap_usd!));
  const { a, b } = ols(xs, ys);
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < xs.length; i++) {
    ssRes += (ys[i]! - (a + b * xs[i]!)) ** 2;
    ssTot += (ys[i]! - my) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const fullAdj = categoryAdjustments(sample, a, b, SHRINK_K);
  const looErrors: number[] = [];
  const flatErrors: number[] = [];
  const shrinkErrors: number[] = [];
  const shrinkResiduals: number[] = [];
  const compsErrors: number[] = [];
  for (let i = 0; i < sample.length; i++) {
    const trainXs = xs.filter((_, j) => j !== i);
    const trainYs = ys.filter((_, j) => j !== i);
    const held = ols(trainXs, trainYs);
    looErrors.push(Math.abs(ys[i]! - (held.a + held.b * xs[i]!)));
    flatErrors.push(Math.abs(ys[i]! - Math.log(sample[i]!.tvl_usd * 0.25)));
    const train = sample.filter((_, j) => j !== i);
    const foldAdj = categoryAdjustments(train, held.a, held.b, SHRINK_K);
    const adj = foldAdj.get(categoryKey(sample[i]!))?.adj ?? 0;
    const shrinkResidual = ys[i]! - (held.a + held.b * xs[i]! + adj);
    shrinkResiduals.push(shrinkResidual);
    shrinkErrors.push(Math.abs(shrinkResidual));
    // The category-median comps model: the category's median cap/TVL, shrunk toward the
    // training set's global median with weight n / (n + CATEGORY_MEDIAN_SHRINK).
    const ratios = train.map((p) => p.mcap_usd! / p.tvl_usd);
    const globalMedian = median(ratios);
    const sameCat = train.filter((p) => categoryKey(p) === categoryKey(sample[i]!)).map((p) => p.mcap_usd! / p.tvl_usd);
    let compsRatio = globalMedian;
    if (sameCat.length > 0) {
      const w = sameCat.length / (sameCat.length + CATEGORY_MEDIAN_SHRINK);
      compsRatio = w * median(sameCat) + (1 - w) * globalMedian;
    }
    compsErrors.push(Math.abs(ys[i]! - Math.log(sample[i]!.tvl_usd * compsRatio)));
  }
  const sortedResiduals = [...shrinkResiduals].sort((x, y) => x - y);
  const q25 = quantileFloor(sortedResiduals, 0.25);
  const q75 = quantileFloor(sortedResiduals, 0.75);
  const inside = shrinkResiduals.filter((r) => r >= q25 && r <= q75).length;
  const categoryAdj: Record<string, { n: number; adj: number }> = {};
  for (const [key, entry] of fullAdj) categoryAdj[key] = { n: entry.n, adj: entry.adj };
  return {
    a,
    b,
    n: sample.length,
    r_squared: round6(rSquared),
    loo_mean_abs_log_error: round6(looErrors.reduce((s, e) => s + e, 0) / looErrors.length),
    loo_median_abs_log_error: round6(median(looErrors)),
    flat_025_mean_abs_log_error: round6(flatErrors.reduce((s, e) => s + e, 0) / flatErrors.length),
    flat_025_median_abs_log_error: round6(median(flatErrors)),
    shrink_k: SHRINK_K,
    shrink_loo_mean_abs_log_error: round6(shrinkErrors.reduce((s, e) => s + e, 0) / shrinkErrors.length),
    shrink_loo_median_abs_log_error: round6(median(shrinkErrors)),
    category_median_mean_abs_log_error: round6(compsErrors.reduce((s, e) => s + e, 0) / compsErrors.length),
    category_median_median_abs_log_error: round6(median(compsErrors)),
    interval: { q25: round6(q25), q75: round6(q75), coverage: round6(inside / shrinkResiduals.length) },
    category_adj: categoryAdj,
  };
}

/** The base value, the multipliers and the implied value one protocol gets under `model` and `fit`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants, fit: PowerLawFit): { implied: number; baseValue: number; shrinkAdj: number; categoryLiveN: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const adjEntry = fit.category_adj[categoryKey(protocol)];
  const shrinkAdj = adjEntry?.adj ?? 0;
  const categoryLiveN = adjEntry?.n ?? 0;
  const base = Math.exp(fit.a + fit.b * Math.log(protocol.tvl_usd) + shrinkAdj);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, baseValue: base, shrinkAdj, categoryLiveN, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, fit: PowerLawFit = fitPowerLaw(snapshot)): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, baseValue, shrinkAdj, categoryLiveN, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, model, fit);
    // The row's P25-P75 range: its implied value scaled by the fit's residual quartiles.
    const valueLow = Math.min(implied, Math.round(implied * Math.exp(fit.interval.q25)));
    const valueHigh = Math.max(implied, Math.round(implied * Math.exp(fit.interval.q75)));
    return { p, implied, valueLow, valueHigh, baseValue, shrinkAdj, categoryLiveN, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    value_low_usd: s.valueLow,
    value_high_usd: s.valueHigh,
    model: {
      fit_a: fit.a,
      fit_b: fit.b,
      fit_n: fit.n,
      base_value_usd: s.baseValue,
      shrink_adj: s.shrinkAdj,
      category_live_n: s.categoryLiveN,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action: the repeatable move that keeps a farm counted, per protocol. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the ${name} position on ${chain} each week and repay it, so supply and borrow activity both count.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap a small amount through ${name}'s main pool on ${chain} each week and add the proceeds back to the position.`;
  if (c.includes('bridge')) return `Bridge a small amount to ${chain} through ${name} each week and use the bridged funds in its app the same day.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim the ${name} staking rewards on ${chain} each week and restake them so the staked balance keeps growing.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Open and close one small hedged trade on ${name} each week so both volume and time in the market register.`;
  if (c.includes('prediction')) return `Place one small position on a new ${name} market each week and settle it before it expires.`;
  if (c.includes('curator') || c.includes('allocator')) return `Add a small amount to the ${name} vault on ${chain} each week so the share balance and the deposit history both grow.`;
  if (c.includes('stable')) return `Mint or redeem a small amount of the stable asset through ${name} on ${chain} each week and hold the rest.`;
  if (c.includes('rwa')) return `Add a small amount to the ${name} yield position on ${chain} each week and keep the receipt with the first mint.`;
  if (c.includes('insurance')) return `Renew or extend the ${name} cover on ${chain} each week so the policy never lapses.`;
  return `Repeat the ${name} deposit on ${chain} each week with a small amount so the activity is spread over time, not done in one day.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p, chain);
  return [
    {
      text: `Use a fresh wallet on ${chain} that holds only the funds you plan to farm ${p.name} with, fund it for ${chain} gas, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the ${p.name} position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the ${chain} dates and every ${p.name} transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    value_low_usd: row.value_low_usd,
    value_high_usd: row.value_high_usd,
    shrink_adj: row.model.shrink_adj,
    category_live_n: row.model.category_live_n,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitPowerLaw(snapshot);
  const board = buildBoard(snapshot, model, fit);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    fit,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
