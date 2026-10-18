/** Event anchoring and the event study (docs/spec/00 rule 2, spec/01 "Event study"). */
import { cumulative, mean, returns, sd, summarize, type Num, type Summary } from './calc';
import { daysBetween, firstAfter } from './dates';
import { assertNoLookahead } from './lookahead';
import type { Direction, EventKind, MarketEvent, Series } from './types';

/** Day 0: the first session strictly after publication. -1 when no such session exists. */
export function anchorIndex(dates: readonly string[], ev: MarketEvent): number {
  return firstAfter(dates, ev.publishedAt);
}

export function arrivalDelay(ev: MarketEvent): number {
  return daysBetween(ev.eventDate, ev.publishedAt);
}

export interface StudyParams {
  estimation: number;
  pre: number;
  post: number;
  kinds: EventKind[];
  direction: Direction | 'any';
}

export const DEFAULT_STUDY: StudyParams = {
  estimation: 60,
  pre: 5,
  post: 5,
  kinds: ['catalyst', 'disclosure', 'prediction'],
  direction: 'any',
};

export type Exclusion = 'SHORT_BASELINE' | 'OUT_OF_RANGE' | 'MISSING_DATA' | 'NOT_YET_TRADABLE';

export interface StudyRow {
  event: MarketEvent;
  delayDays: number;
  anchorDate: string | null;
  baselineFrom: string | null;
  baselineTo: string | null;
  nBase: number;
  mu: number;
  sigma: number;
  carPre: number;
  carPost: number;
  rawPre: number;
  rawPost: number;
  excluded: Exclusion | null;
  overlaps: boolean;
  /** Cumulative abnormal return at offsets -pre..post (index 0 is offset -pre); empty when excluded. */
  path: number[];
}

export interface StudyResult {
  rows: StudyRow[];
  included: StudyRow[];
  pre: Summary;
  post: Summary;
  /** Mean cumulative abnormal return across included events at offsets -pre..post. */
  meanPath: number[];
  params: StudyParams;
  seriesId: string;
}

export function eventsFor(
  series: Series,
  events: readonly MarketEvent[],
  p: StudyParams,
): MarketEvent[] {
  return events.filter(
    (e) =>
      e.symbols.includes(series.id) &&
      p.kinds.includes(e.kind) &&
      (p.direction === 'any' || e.direction === p.direction),
  );
}

export function eventStudy(
  series: Series,
  events: readonly MarketEvent[],
  params: StudyParams,
): StudyResult {
  const dates = series.points.map((x) => x.date);
  const r = returns(series);
  const { estimation: E, pre: K, post: M } = params;
  const rows: StudyRow[] = eventsFor(series, events, params).map((event) => {
    const base: StudyRow = {
      event,
      delayDays: arrivalDelay(event),
      anchorDate: null,
      baselineFrom: null,
      baselineTo: null,
      nBase: 0,
      mu: Number.NaN,
      sigma: Number.NaN,
      carPre: Number.NaN,
      carPost: Number.NaN,
      rawPre: Number.NaN,
      rawPost: Number.NaN,
      excluded: null,
      overlaps: false,
      path: [],
    };
    const i0 = anchorIndex(dates, event);
    if (i0 < 0) return { ...base, excluded: 'NOT_YET_TRADABLE' };
    base.anchorDate = dates[i0] ?? null;
    // The anchor is strictly after publication: the study never starts before the news was public.
    assertNoLookahead(`event ${event.id}`, base.anchorDate ?? '', [event.publishedAt]);
    const b0 = i0 - K - E;
    const b1 = i0 - K - 1;
    if (b0 < 1 || i0 + M >= dates.length) return { ...base, excluded: 'OUT_OF_RANGE' };
    base.baselineFrom = dates[b0] ?? null;
    base.baselineTo = dates[b1] ?? null;
    const baseReturns: number[] = [];
    for (let i = b0; i <= b1; i += 1) {
      const v = r[i];
      if (v !== undefined) baseReturns.push(v);
    }
    base.nBase = baseReturns.length;
    if (base.nBase < 20) return { ...base, excluded: 'SHORT_BASELINE' };
    const mu = mean(baseReturns);
    const sigma = sd(baseReturns);
    const sumAr = (a: number, b: number): Num => {
      let s = 0;
      for (let i = a; i <= b; i += 1) {
        const v = r[i];
        if (v === undefined) return undefined;
        s += v - mu;
      }
      return s;
    };
    const carPre = sumAr(i0 - K, i0 - 1);
    const carPost = sumAr(i0, i0 + M);
    const rawPre = cumulative(r, i0 - K, i0 - 1);
    const rawPost = cumulative(r, i0, i0 + M);
    if (
      carPre === undefined ||
      carPost === undefined ||
      rawPre === undefined ||
      rawPost === undefined
    ) {
      return { ...base, mu, sigma, excluded: 'MISSING_DATA' };
    }
    const path: number[] = [];
    let acc = 0;
    for (let i = i0 - K; i <= i0 + M; i += 1) {
      acc += (r[i] as number) - mu;
      path.push(acc);
    }
    return { ...base, mu, sigma, carPre, carPost, rawPre, rawPost, path };
  });

  // Overlap flags among included rows: windows [i0-K, i0+M] sharing a session.
  const included = rows.filter((x) => x.excluded === null);
  const spans = included.map((x) => {
    const i0 = dates.indexOf(x.anchorDate ?? '');
    return [i0 - K, i0 + M] as const;
  });
  included.forEach((row, i) => {
    const [a, b] = spans[i] as readonly [number, number];
    row.overlaps = spans.some(([c, d], j) => j !== i && a <= d && c <= b);
  });

  return {
    rows,
    included,
    pre: summarize(included.map((x) => x.carPre)),
    post: summarize(included.map((x) => x.carPost)),
    meanPath: included.length
      ? (included[0] as StudyRow).path.map(
          (_, k) => included.reduce((a, x) => a + (x.path[k] as number), 0) / included.length,
        )
      : [],
    params,
    seriesId: series.id,
  };
}
