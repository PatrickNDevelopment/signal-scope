/** Exploratory rules and the backtest (docs/spec/02-rules-backtest-io.md). */
import {
  cumulative,
  median,
  probChange,
  returns,
  rsi,
  summarize,
  volumeShock,
  type Num,
  type Summary,
} from './calc';
import { lastOnOrBefore } from './dates';
import { assertEntryAfterSignal, assertNoLookahead } from './lookahead';
import { anchorIndex } from './study';
import type { Direction, EventKind, MarketEvent, Series } from './types';

export type Condition =
  | { type: 'volume_shock'; n: number; zMin: number }
  | { type: 'rsi_below'; level: number }
  | { type: 'rsi_above'; level: number }
  | { type: 'return_below'; h: number; pct: number }
  | { type: 'event_recent'; kind: EventKind; direction: Direction | 'any'; days: number }
  | { type: 'prob_change'; seriesId: string; h: number; ppMin: number };

export type EvidenceType = 'volume' | 'momentum' | 'price' | 'event' | 'prediction';

export function evidenceOf(c: Condition): EvidenceType {
  switch (c.type) {
    case 'volume_shock':
      return 'volume';
    case 'rsi_below':
    case 'rsi_above':
      return 'momentum';
    case 'return_below':
      return 'price';
    case 'event_recent':
      return 'event';
    case 'prob_change':
      return 'prediction';
  }
}

export interface Rule {
  name: string;
  targetId: string;
  conditions: Condition[];
  horizon: number;
}

export function ruleProblems(rule: Rule, series: readonly Series[]): string[] {
  const out: string[] = [];
  if (rule.conditions.length < 2 || rule.conditions.length > 6)
    out.push('A rule needs 2 to 6 conditions.');
  if (new Set(rule.conditions.map(evidenceOf)).size < 2) {
    out.push('A rule must cross at least two different evidence types.');
  }
  const target = series.find((s) => s.id === rule.targetId);
  if (!target || target.kind !== 'price') out.push('Choose a price series as the target.');
  for (const c of rule.conditions) {
    if (
      c.type === 'prob_change' &&
      !series.some((s) => s.id === c.seriesId && s.kind === 'probability')
    ) {
      out.push(`Probability series "${c.seriesId}" is not loaded.`);
    }
  }
  if (!(rule.horizon >= 1 && rule.horizon <= 60)) out.push('The horizon must be 1 to 60 sessions.');
  return out;
}

interface Prepared {
  dates: string[];
  values: (number | null)[];
  r: Num[];
  fns: ((t: number, used: string[]) => boolean)[];
}

function prepare(rule: Rule, series: readonly Series[], events: readonly MarketEvent[]): Prepared {
  const target = series.find((s) => s.id === rule.targetId);
  if (!target) throw new Error('target series missing');
  const dates = target.points.map((p) => p.date);
  const r = returns(target);
  const fns = rule.conditions.map((c): ((t: number, used: string[]) => boolean) => {
    switch (c.type) {
      case 'volume_shock': {
        const z = volumeShock(target, c.n);
        return (t, used) => {
          used.push(dates[t] as string);
          const v = z[t];
          return v !== undefined && v >= c.zMin;
        };
      }
      case 'rsi_below':
      case 'rsi_above': {
        const x = rsi(target);
        return (t, used) => {
          used.push(dates[t] as string);
          const v = x[t];
          return v !== undefined && (c.type === 'rsi_below' ? v < c.level : v > c.level);
        };
      }
      case 'return_below':
        return (t, used) => {
          used.push(dates[t] as string);
          const v = cumulative(r, t - c.h + 1, t);
          return v !== undefined && v * 100 <= c.pct;
        };
      case 'event_recent': {
        const anchors = events
          .filter(
            (e) =>
              e.symbols.includes(target.id) &&
              e.kind === c.kind &&
              (c.direction === 'any' || e.direction === c.direction),
          )
          .map((e) => ({ e, a: anchorIndex(dates, e) }))
          .filter((x) => x.a >= 0);
        return (t, used) => {
          const hit = anchors.find((x) => x.a <= t && x.a > t - c.days);
          if (hit) used.push(dates[hit.a] as string, hit.e.publishedAt);
          return hit !== undefined;
        };
      }
      case 'prob_change': {
        const ps = series.find((s) => s.id === c.seriesId);
        if (!ps) return () => false;
        const pd = ps.points.map((p) => p.date);
        const dp = probChange(ps, c.h);
        return (t, used) => {
          const j = lastOnOrBefore(pd, dates[t] as string);
          if (j < 0) return false;
          used.push(pd[j] as string);
          const v = dp[j];
          return v !== undefined && v >= c.ppMin;
        };
      }
    }
  });
  return { dates, values: target.points.map((p) => p.value), r, fns };
}

export interface Hit {
  signal: string;
  entry: string | null;
  exit: string | null;
  forward: number | null;
}

export interface RuleResult {
  hits: Hit[];
  summary: Summary;
  withoutForward: number;
  evaluated: number;
}

function forwardReturn(values: (number | null)[], entry: number, exit: number): number | null {
  const a = values[entry];
  const b = values[exit];
  if (a === null || a === undefined || b === null || b === undefined || a === 0) return null;
  return b / a - 1;
}

/** Sessions where every condition holds, using only information available at each session. */
export function evaluateRule(
  rule: Rule,
  series: readonly Series[],
  events: readonly MarketEvent[],
): RuleResult {
  const P = prepare(rule, series, events);
  const hits: Hit[] = [];
  for (let t = 0; t < P.dates.length; t += 1) {
    const used: string[] = [];
    if (!P.fns.every((f) => f(t, used))) continue;
    const signal = P.dates[t] as string;
    assertNoLookahead(`rule "${rule.name}"`, signal, used);
    const entryI = t + 1;
    const exitI = t + 1 + rule.horizon;
    if (exitI >= P.dates.length) {
      hits.push({ signal, entry: P.dates[entryI] ?? null, exit: null, forward: null });
      continue;
    }
    assertEntryAfterSignal(`rule "${rule.name}"`, signal, P.dates[entryI] as string);
    hits.push({
      signal,
      entry: P.dates[entryI] as string,
      exit: P.dates[exitI] as string,
      forward: forwardReturn(P.values, entryI, exitI),
    });
  }
  const fwd = hits.map((h) => h.forward).filter((v): v is number => v !== null);
  return {
    hits,
    summary: summarize(fwd),
    withoutForward: hits.length - fwd.length,
    evaluated: P.dates.length,
  };
}

export interface Trade {
  signal: string;
  entry: string;
  exit: string;
  gross: number;
  net: number;
  period: 'train' | 'test';
  crossesSplit: boolean;
}

export interface PeriodStats {
  trades: number;
  meanNet: number;
  medianNet: number;
  hitRate: number;
  compounded: number;
  maxDrawdown: number;
  buyHold: number;
  sessions: number;
  badges: string[];
}

export interface BacktestResult {
  trades: Trade[];
  train: PeriodStats;
  test: PeriodStats;
  skippedWhileInPosition: number;
  split: string;
  costBps: number;
}

function periodStats(
  trades: Trade[],
  values: (number | null)[],
  dates: string[],
  from: number,
  to: number,
): PeriodStats {
  const nets = trades.map((t) => t.net);
  let equity = 1;
  let peak = 1;
  let dd = 0;
  for (const n of nets) {
    equity *= 1 + n;
    peak = Math.max(peak, equity);
    dd = Math.min(dd, equity / peak - 1);
  }
  let first = from;
  while (first <= to && (values[first] === null || values[first] === undefined)) first += 1;
  let last = to;
  while (last >= first && (values[last] === null || values[last] === undefined)) last -= 1;
  const bh = first < last ? (values[last] as number) / (values[first] as number) - 1 : Number.NaN;
  const sessions = Math.max(0, to - from + 1);
  const badges: string[] = [];
  if (trades.length < 10) badges.push('very few trades');
  else if (trades.length < 30) badges.push('few trades');
  if (sessions < 60) badges.push('short period');
  void dates;
  return {
    trades: trades.length,
    meanNet: nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : Number.NaN,
    medianNet: median(nets),
    hitRate: nets.length ? nets.filter((n) => n > 0).length / nets.length : Number.NaN,
    compounded: equity - 1,
    maxDrawdown: dd,
    buyHold: bh,
    sessions,
    badges,
  };
}

export function backtest(
  rule: Rule,
  series: readonly Series[],
  events: readonly MarketEvent[],
  split: string,
  costBps: number,
): BacktestResult {
  const P = prepare(rule, series, events);
  const c = Math.max(0, Math.min(500, costBps)) / 10_000;
  const trades: Trade[] = [];
  let busyUntil = -1;
  let skipped = 0;
  for (let t = 0; t < P.dates.length; t += 1) {
    const used: string[] = [];
    if (!P.fns.every((f) => f(t, used))) continue;
    const signal = P.dates[t] as string;
    assertNoLookahead(`backtest "${rule.name}"`, signal, used);
    if (t < busyUntil) {
      skipped += 1;
      continue;
    }
    const entryI = t + 1;
    const exitI = t + 1 + rule.horizon;
    if (exitI >= P.dates.length) break;
    const gross = forwardReturn(P.values, entryI, exitI);
    if (gross === null) continue;
    const entry = P.dates[entryI] as string;
    const exit = P.dates[exitI] as string;
    assertEntryAfterSignal(`backtest "${rule.name}"`, signal, entry);
    const period = entry < split ? 'train' : 'test';
    trades.push({
      signal,
      entry,
      exit,
      gross,
      net: (1 - c) * (1 - c) * (1 + gross) - 1,
      period,
      crossesSplit: period === 'train' && exit >= split,
    });
    busyUntil = exitI;
  }
  const splitIdx = P.dates.findIndex((d) => d >= split);
  const lastTrain = splitIdx === -1 ? P.dates.length - 1 : splitIdx - 1;
  return {
    trades,
    train: periodStats(
      trades.filter((t) => t.period === 'train'),
      P.values,
      P.dates,
      0,
      lastTrain,
    ),
    test: periodStats(
      trades.filter((t) => t.period === 'test'),
      P.values,
      P.dates,
      lastTrain + 1,
      P.dates.length - 1,
    ),
    skippedWhileInPosition: skipped,
    split,
    costBps: c * 10_000,
  };
}
