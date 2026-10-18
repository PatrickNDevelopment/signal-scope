import { describe, expect, it } from 'vitest';
import {
  addDays,
  anchorIndex,
  assertEntryAfterSignal,
  assertNoLookahead,
  backtest,
  buildSampleMarket,
  correlations,
  cumulative,
  daysBetween,
  DEFAULT_STUDY,
  evaluateRule,
  eventStudy,
  firstAfter,
  isIsoDate,
  lastOnOrBefore,
  LookaheadError,
  mean,
  median,
  pearson,
  probChange,
  returns,
  rsi,
  ruleProblems,
  sd,
  summarize,
  uncertaintyBadge,
  volumeShock,
  type MarketEvent,
  type Rule,
  type Series,
} from '../src/engine';

const prov = {
  source: 'test',
  access: 'synthetic' as const,
  retrievedAt: '2026-01-01',
  note: '',
  sample: true,
};

function series(
  id: string,
  values: (number | null)[],
  volumes?: (number | null)[],
  start = '2024-01-01',
): Series {
  return {
    id,
    name: id,
    kind: 'price',
    provenance: prov,
    points: values.map((v, i) => ({
      date: addDays(start, i),
      value: v,
      volume: volumes ? (volumes[i] ?? null) : null,
    })),
  };
}

describe('dates', () => {
  it('validates ISO dates including leap years', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(isIsoDate('1900-02-29')).toBe(false);
    expect(isIsoDate('2000-02-29')).toBe(true);
    expect(isIsoDate('2024-13-01')).toBe(false);
    expect(isIsoDate('2024-1-01')).toBe(false);
  });
  it('counts and adds days across month ends', () => {
    expect(daysBetween('2024-01-31', '2024-03-01')).toBe(30);
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
  });
  it('finds the first session strictly after a date', () => {
    const d = ['2024-01-02', '2024-01-03', '2024-01-05'];
    expect(firstAfter(d, '2024-01-03')).toBe(2);
    expect(firstAfter(d, '2024-01-04')).toBe(2);
    expect(firstAfter(d, '2024-01-01')).toBe(0);
    expect(firstAfter(d, '2024-01-05')).toBe(-1);
    expect(lastOnOrBefore(d, '2024-01-04')).toBe(1);
    expect(lastOnOrBefore(d, '2024-01-01')).toBe(-1);
    expect(lastOnOrBefore(d, '2030-01-01')).toBe(2);
  });
});

describe('calculations', () => {
  it('computes simple returns and treats missing prices as undefined', () => {
    const r = returns(series('X', [100, 110, null, 99]));
    expect(r[0]).toBeUndefined();
    expect(r[1]).toBeCloseTo(0.1, 12);
    expect(r[2]).toBeUndefined();
    expect(r[3]).toBeUndefined();
  });
  it('compounds cumulative returns and rejects bad ranges', () => {
    const r = returns(series('X', [100, 110, 121]));
    expect(cumulative(r, 1, 2)).toBeCloseTo(0.21, 12);
    expect(cumulative(r, 0, 2)).toBeUndefined();
    expect(cumulative(r, 2, 1)).toBeUndefined();
  });
  it('mean, sample sd and median', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(Number.isNaN(sd([1]))).toBe(true);
  });
  it('Wilder RSI: 100 on only gains, 0 on only losses, 50 when flat', () => {
    const up = rsi(
      series(
        'U',
        Array.from({ length: 20 }, (_, i) => 100 + i),
      ),
    );
    expect(up[13]).toBeUndefined();
    expect(up[14]).toBe(100);
    const down = rsi(
      series(
        'D',
        Array.from({ length: 20 }, (_, i) => 100 - i),
      ),
    );
    expect(down[19]).toBe(0);
    const flat = rsi(
      series(
        'F',
        Array.from({ length: 20 }, () => 100),
      ),
    );
    expect(flat[19]).toBe(50);
  });
  it('volume z-score uses only prior sessions', () => {
    const vols = [...Array.from({ length: 20 }, (_, i) => 1000 + (i % 2) * 100), 5000];
    const z = volumeShock(
      series(
        'V',
        vols.map(() => 10),
        vols,
      ),
      20,
    );
    expect(z[19]).toBeUndefined();
    expect(z[20] as number).toBeGreaterThan(50);
  });
  it('probability change is in percentage points', () => {
    const s: Series = { ...series('P', [0.3, 0.35, 0.5]), kind: 'probability' };
    expect(probChange(s, 2)[2]).toBeCloseTo(20, 9);
  });
  it('Pearson and lagged correlations', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
    expect(Number.isNaN(pearson([1, 1, 1], [1, 2, 3]))).toBe(true);
    // b copies a with a one-session delay: the correlation peaks at lag +1.
    const vals = [100, 103, 101, 106, 104, 108, 107, 111, 109, 115, 112, 116];
    const a = series('A', vals);
    const b = series('B', [100, ...vals.slice(0, -1)]);
    const c = correlations(a, b, 2);
    const best = c.reduce((x, y) => (y.r > x.r ? y : x));
    expect(best.lag).toBe(1);
    expect(best.r).toBeCloseTo(1, 9);
  });
  it('summaries carry sample-size badges', () => {
    expect(uncertaintyBadge(5)).toBe('very small sample');
    expect(uncertaintyBadge(29)).toBe('small sample');
    expect(uncertaintyBadge(30)).toBe('sample size ok');
    const s = summarize([0.01, 0.02, 0.03]);
    expect(s.n).toBe(3);
    expect(s.low95).toBeLessThan(s.mean);
    expect(s.sharePositive).toBe(1);
  });
});

describe('information time', () => {
  it('throws LookaheadError for future inputs', () => {
    expect(() => assertNoLookahead('x', '2024-01-02', ['2024-01-02', '2024-01-01'])).not.toThrow();
    expect(() => assertNoLookahead('x', '2024-01-02', ['2024-01-03'])).toThrow(LookaheadError);
    expect(() => assertEntryAfterSignal('x', '2024-01-02', '2024-01-02')).toThrow(LookaheadError);
  });
  it('anchors an event at the first session strictly after publication', () => {
    const dates = ['2024-01-02', '2024-01-03', '2024-01-04'];
    const ev = { publishedAt: '2024-01-03' } as MarketEvent;
    expect(anchorIndex(dates, ev)).toBe(2);
  });
});

describe('sample market', () => {
  const m = buildSampleMarket();
  it('is deterministic and labelled as sample', () => {
    const again = buildSampleMarket();
    expect(JSON.stringify(again)).toBe(JSON.stringify(m));
    expect(m.series.every((s) => s.provenance.sample && s.provenance.access === 'synthetic')).toBe(
      true,
    );
    expect(m.events.every((e) => e.provenance.sample)).toBe(true);
    const a = m.series.find((s) => s.id === 'SMPL-A') as Series;
    expect(a.points).toHaveLength(760);
    expect(
      a.points.every((p) => {
        const dow = new Date(`${p.date}T00:00:00Z`).getUTCDay();
        return dow !== 0 && dow !== 6;
      }),
    ).toBe(true);
  });

  it('journey 2: a disclosure is studied from publication, not from the transaction date', () => {
    const a = m.series.find((s) => s.id === 'SMPL-A') as Series;
    const ev = m.events.find((e) => e.id === 'disclosure-1') as MarketEvent;
    const res = eventStudy(a, [ev], DEFAULT_STUDY);
    const row = res.rows[0];
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.delayDays).toBe(31);
    expect(row.excluded).toBeNull();
    expect((row.anchorDate as string) > ev.publishedAt).toBe(true);
    // The rally (sessions 302-305) happens before publication, so it falls before day 0.
    const rallyEnd = a.points[305]?.date as string;
    expect(rallyEnd < (row.anchorDate as string)).toBe(true);
    // Measured from the transaction date the move would look large; measured honestly it is not there.
    const naive = eventStudy(a, [{ ...ev, publishedAt: ev.eventDate }], DEFAULT_STUDY).rows[0];
    expect(naive?.carPost as number).toBeGreaterThan(0.08);
    expect(Math.abs(row.carPost)).toBeLessThan(0.03);
  });

  it('event study includes catalysts, flags exclusions and reports n', () => {
    const a = m.series.find((s) => s.id === 'SMPL-A') as Series;
    const res = eventStudy(a, m.events, { ...DEFAULT_STUDY, kinds: ['catalyst'] });
    expect(res.rows).toHaveLength(5);
    expect(res.included.length).toBe(5);
    expect(res.post.n).toBe(5);
    expect(res.post.badge).toBe('very small sample');
    for (const r of res.included) expect(r.nBase).toBeGreaterThanOrEqual(20);
  });

  it('excludes events that are out of range or not yet tradable', () => {
    const a = m.series.find((s) => s.id === 'SMPL-A') as Series;
    const last = a.points[a.points.length - 1]?.date as string;
    const base = m.events[0] as MarketEvent;
    const res = eventStudy(
      a,
      [
        {
          ...base,
          id: 'early',
          eventDate: a.points[10]?.date as string,
          publishedAt: a.points[10]?.date as string,
        },
        { ...base, id: 'late', eventDate: last, publishedAt: last },
      ],
      DEFAULT_STUDY,
    );
    expect(res.rows.map((r) => r.excluded)).toEqual(['OUT_OF_RANGE', 'NOT_YET_TRADABLE']);
  });

  it('flags overlapping event windows', () => {
    const a = m.series.find((s) => s.id === 'SMPL-A') as Series;
    const base = m.events[0] as MarketEvent;
    const d = (i: number): string => a.points[i]?.date as string;
    const res = eventStudy(
      a,
      [
        { ...base, id: 'o1', eventDate: d(200), publishedAt: d(200) },
        { ...base, id: 'o2', eventDate: d(204), publishedAt: d(204) },
        { ...base, id: 'o3', eventDate: d(400), publishedAt: d(400) },
      ],
      DEFAULT_STUDY,
    );
    expect(res.included.map((r) => r.overlaps)).toEqual([true, true, false]);
  });
});

describe('rules and backtest', () => {
  const m = buildSampleMarket();
  const rule: Rule = {
    name: 'catalyst + volume',
    targetId: 'SMPL-A',
    horizon: 5,
    conditions: [
      { type: 'event_recent', kind: 'catalyst', direction: 'any', days: 3 },
      { type: 'volume_shock', n: 20, zMin: 1 },
    ],
  };

  it('requires two different evidence types and a price target', () => {
    expect(ruleProblems(rule, m.series)).toEqual([]);
    const same: Rule = {
      ...rule,
      conditions: [
        { type: 'rsi_below', level: 30 },
        { type: 'rsi_above', level: 10 },
      ],
    };
    expect(ruleProblems(same, m.series)).toContain(
      'A rule must cross at least two different evidence types.',
    );
    expect(ruleProblems({ ...rule, targetId: 'SMPL-PM' }, m.series)).toContain(
      'Choose a price series as the target.',
    );
    const missing: Rule = {
      ...rule,
      conditions: [...rule.conditions, { type: 'prob_change', seriesId: 'NOPE', h: 5, ppMin: 5 }],
    };
    expect(ruleProblems(missing, m.series)).toContain('Probability series "NOPE" is not loaded.');
  });

  it('signals only after publication and enters on the next session', () => {
    const res = evaluateRule(rule, m.series, m.events);
    expect(res.hits.length).toBeGreaterThan(0);
    const a = m.series.find((s) => s.id === 'SMPL-A') as Series;
    const pubs = m.events.filter((e) => e.kind === 'catalyst').map((e) => e.publishedAt);
    for (const h of res.hits) {
      expect(pubs.some((p) => p < h.signal)).toBe(true);
      if (h.entry) expect(h.entry > h.signal).toBe(true);
    }
    expect(res.evaluated).toBe(a.points.length);
  });

  it('a disclosure rule cannot fire before the filing is public', () => {
    const r: Rule = {
      ...rule,
      conditions: [
        { type: 'event_recent', kind: 'disclosure', direction: 'buy', days: 10 },
        { type: 'rsi_above', level: 0 },
      ],
    };
    const ev = m.events.find((e) => e.id === 'disclosure-1') as MarketEvent;
    const res = evaluateRule(r, m.series, m.events);
    expect(res.hits.length).toBeGreaterThan(0);
    for (const h of res.hits) expect(h.signal > ev.publishedAt).toBe(true);
  });

  it('backtest splits train/test, applies cost on both legs, and never overlaps positions', () => {
    const split = m.series[0]?.points[500]?.date as string;
    const bt = backtest(rule, m.series, m.events, split, 10);
    expect(bt.trades.length).toBeGreaterThan(0);
    for (const t of bt.trades) {
      expect(t.net).toBeCloseTo(0.999 * 0.999 * (1 + t.gross) - 1, 12);
      expect(t.period).toBe(t.entry < split ? 'train' : 'test');
    }
    for (let i = 1; i < bt.trades.length; i += 1) {
      // A new signal is only taken at or after the previous exit session, so entry is strictly later.
      expect((bt.trades[i]?.entry as string) > (bt.trades[i - 1]?.exit as string)).toBe(true);
    }
    expect(bt.train.trades + bt.test.trades).toBe(bt.trades.length);
    expect(bt.train.badges).toContain('very few trades');
    const zero = backtest(rule, m.series, m.events, split, 0);
    expect(zero.trades[0]?.net).toBeCloseTo(zero.trades[0]?.gross as number, 12);
  });

  it('clamps cost to 0..500 bps', () => {
    const split = m.series[0]?.points[500]?.date as string;
    expect(backtest(rule, m.series, m.events, split, 9999).costBps).toBe(500);
    expect(backtest(rule, m.series, m.events, split, -5).costBps).toBe(0);
  });
});

describe('event-study path', () => {
  it('ends at carPre + carPost and averages across included events', () => {
    const m = buildSampleMarket();
    const a = m.series.find((s) => s.id === 'SMPL-A') as Series;
    const res = eventStudy(a, m.events, { ...DEFAULT_STUDY, kinds: ['catalyst'] });
    for (const r of res.included) {
      expect(r.path).toHaveLength(DEFAULT_STUDY.pre + DEFAULT_STUDY.post + 1);
      expect(r.path[DEFAULT_STUDY.pre - 1]).toBeCloseTo(r.carPre, 12);
      expect(r.path[r.path.length - 1]).toBeCloseTo(r.carPre + r.carPost, 12);
    }
    expect(res.meanPath[res.meanPath.length - 1]).toBeCloseTo(res.pre.mean + res.post.mean, 12);
  });
});
