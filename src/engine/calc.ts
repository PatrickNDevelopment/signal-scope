/** Calculations (docs/spec/01-calculations.md). `undefined` means "not defined here". */
import type { Series } from './types';

export type Num = number | undefined;

export function returns(series: Series): Num[] {
  const p = series.points;
  const out: Num[] = [undefined];
  for (let i = 1; i < p.length; i += 1) {
    const a = p[i - 1]?.value;
    const b = p[i]?.value;
    const r =
      a === null || a === undefined || b === null || b === undefined || a === 0
        ? undefined
        : b / a - 1;
    // Extreme inputs (e.g. 1e-300 then 1e300) overflow; an infinite return is "not defined".
    out.push(r !== undefined && Number.isFinite(r) ? r : undefined);
  }
  return out;
}

/** prod(1 + r) - 1 over indices a..b inclusive; undefined when any is undefined or the range is invalid. */
export function cumulative(r: readonly Num[], a: number, b: number): Num {
  if (a < 1 || b >= r.length || a > b) return undefined;
  let acc = 1;
  for (let i = a; i <= b; i += 1) {
    const v = r[i];
    if (v === undefined) return undefined;
    acc *= 1 + v;
  }
  return acc - 1;
}

export function mean(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length === 0 ? Number.NaN : s / xs.length;
}

/** Sample standard deviation (n - 1). NaN for fewer than 2 values. */
export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

function windowValues(xs: readonly Num[], from: number, to: number): number[] | undefined {
  if (from < 0 || to >= xs.length || from > to) return undefined;
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) {
    const v = xs[i];
    if (v === undefined) return undefined;
    out.push(v);
  }
  return out;
}

export function rollingVol(r: readonly Num[], n = 20): Num[] {
  return r.map((_, i) => {
    if (i - n + 1 < 1) return undefined;
    const w = windowValues(r, i - n + 1, i);
    return w === undefined ? undefined : sd(w);
  });
}

export function volumeShock(series: Series, n = 20): Num[] {
  const v: Num[] = series.points.map((p) => (p.volume === null ? undefined : p.volume));
  return v.map((cur, i) => {
    if (cur === undefined || i - n < 0) return undefined;
    const w = windowValues(v, i - n, i - 1);
    if (w === undefined) return undefined;
    const s = sd(w);
    if (!(s > 0)) return undefined;
    return (cur - mean(w)) / s;
  });
}

/** Wilder RSI; a missing price resets the seed. */
export function rsi(series: Series, period = 14): Num[] {
  const p = series.points.map((x) => x.value);
  const out: Num[] = p.map(() => undefined);
  let avgG = 0;
  let avgL = 0;
  let seeded = 0; // number of changes accumulated since the last reset
  for (let i = 1; i < p.length; i += 1) {
    const a = p[i - 1];
    const b = p[i];
    if (a === null || a === undefined || b === null || b === undefined) {
      seeded = 0;
      avgG = 0;
      avgL = 0;
      continue;
    }
    const g = Math.max(b - a, 0);
    const l = Math.max(a - b, 0);
    if (seeded < period) {
      avgG += g / period;
      avgL += l / period;
      seeded += 1;
      if (seeded < period) continue;
    } else {
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
    }
    out[i] = avgL === 0 ? (avgG === 0 ? 50 : 100) : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

/** Probability change over h sessions, in percentage points. */
export function probChange(series: Series, h: number): Num[] {
  const p = series.points.map((x) => x.value);
  return p.map((cur, i) => {
    const prev = i - h >= 0 ? p[i - h] : undefined;
    return cur === null || cur === undefined || prev === null || prev === undefined
      ? undefined
      : (cur - prev) * 100;
  });
}

export interface Correlation {
  lag: number;
  r: number;
  n: number;
}

/** Pearson correlation of returns matched by date; lag k pairs a's return on day i with b's on day i + k. */
export function correlations(a: Series, b: Series, maxLag = 5): Correlation[] {
  const ra = returns(a);
  const rb = returns(b);
  const bIndex = new Map(b.points.map((p, i) => [p.date, i]));
  const out: Correlation[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    const xs: number[] = [];
    const ys: number[] = [];
    a.points.forEach((p, i) => {
      const j = bIndex.get(p.date);
      if (j === undefined) return;
      const x = ra[i];
      const y = rb[j + lag];
      if (x !== undefined && y !== undefined) {
        xs.push(x);
        ys.push(y);
      }
    });
    out.push({ lag, r: pearson(xs, ys), n: xs.length });
  }
  return out;
}

export function pearson(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length < 3 || xs.length !== ys.length) return Number.NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? Number.NaN : sxy / Math.sqrt(sxx * syy);
}

export type Badge = 'very small sample' | 'small sample' | 'sample size ok';

export function uncertaintyBadge(n: number): Badge {
  return n < 10 ? 'very small sample' : n < 30 ? 'small sample' : 'sample size ok';
}

export interface Summary {
  n: number;
  mean: number;
  median: number;
  sd: number;
  se: number;
  low95: number;
  high95: number;
  sharePositive: number;
  badge: Badge;
}

/** Descriptive summary with a normal-approximation 95 % interval. */
export function summarize(xs: readonly number[]): Summary {
  const n = xs.length;
  const m = mean(xs);
  const s = sd(xs);
  const se = n >= 2 ? s / Math.sqrt(n) : Number.NaN;
  return {
    n,
    mean: m,
    median: median(xs),
    sd: s,
    se,
    low95: m - 1.96 * se,
    high95: m + 1.96 * se,
    sharePositive: n === 0 ? Number.NaN : xs.filter((x) => x > 0).length / n,
    badge: uncertaintyBadge(n),
  };
}
