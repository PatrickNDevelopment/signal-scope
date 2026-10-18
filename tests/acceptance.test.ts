/**
 * Regression and reference tests added by the independent acceptance review (Part 1 of
 * docs/test-report.md). Reference values were computed by hand / independently in Python.
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  backtest,
  buildSampleMarket,
  csvCell,
  emptyWorkspace,
  evaluateRule,
  eventStudy,
  importEventsCsv,
  importSeriesCsv,
  parseCsv,
  returns,
  rollingVol,
  rsi,
  toCsv,
  validateWorkspace,
  volumeShock,
  type MarketEvent,
  type Rule,
  type Series,
} from '../src/engine';
import { hasRestricted, hitsCsv, studyCsv, tradesCsv } from '../src/lib/exports';

const prov = {
  source: 'test',
  access: 'public' as const,
  retrievedAt: '2026-01-01',
  note: '',
  sample: false,
};

function series(
  id: string,
  values: (number | null)[],
  volumes?: (number | null)[],
  kind: Series['kind'] = 'price',
): Series {
  return {
    id,
    name: id,
    kind,
    provenance: prov,
    points: values.map((v, i) => ({
      date: addDays('2024-01-01', i),
      value: v,
      volume: volumes ? (volumes[i] ?? null) : null,
    })),
  };
}

describe('indicator reference cases (hand / independently computed)', () => {
  const closes = [
    44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28,
    46.28, 46.0,
  ];
  it('Wilder RSI 14 matches an independent computation', () => {
    const x = rsi(series('R', closes), 14);
    expect(x[13]).toBeUndefined();
    expect(x[14]).toBeCloseTo(72.98387096774191, 10);
    expect(x[15]).toBeCloseTo(68.80116959064324, 10);
  });
  it('Wilder RSI on a tiny series (period 2): 100, 50, 75', () => {
    // changes +1 +1 -1 +1: seed avgG 1, avgL 0 -> 100; then (0.5, 0.5) -> 50; then (0.75, 0.25) -> 75
    const x = rsi(series('T', [1, 2, 3, 2, 3]), 2);
    expect(x.slice(2)).toEqual([100, 50, 75]);
  });
  it('rolling volatility is the sample sd of the last n returns', () => {
    // returns 0.1, -0.1, 0.1 -> mean 1/30, sample sd sqrt(0.0266667/2) = 0.115470
    const v = rollingVol(returns(series('V', [100, 110, 99, 108.9])), 3);
    expect(v[2]).toBeUndefined();
    expect(v[3]).toBeCloseTo(0.11547005383792514, 12);
  });
  it('volume z uses the prior n sessions only', () => {
    // prior 1,2,3,4: mean 2.5, sd sqrt(5/3); (10 - 2.5) / 1.290994 = 5.809475
    const z = volumeShock(series('Z', [1, 1, 1, 1, 1], [1, 2, 3, 4, 10]), 4);
    expect(z[3]).toBeUndefined();
    expect(z[4]).toBeCloseTo(5.809475019311125, 10);
  });
  it('CAR against a constant-mean baseline on a drifting series', () => {
    // Every return is +1 % except day 0 (+5 %): baseline mean 1 %, AR on day 0 = 4 %, others 0.
    const n = 40;
    const vals: number[] = [100];
    for (let i = 1; i < n; i += 1) vals.push((vals[i - 1] as number) * (i === 30 ? 1.05 : 1.01));
    const s = series('C', vals);
    const pub = s.points[29]?.date as string; // day 0 = session 30
    const ev: MarketEvent = {
      id: 'c1',
      kind: 'catalyst',
      label: 'c',
      symbols: ['C'],
      eventDate: pub,
      publishedAt: pub,
      direction: 'up',
      provenance: prov,
    };
    const res = eventStudy(s, [ev], {
      estimation: 20,
      pre: 2,
      post: 2,
      kinds: ['catalyst'],
      direction: 'any',
    });
    const row = res.rows[0];
    expect(row?.excluded).toBeNull();
    expect(row?.anchorDate).toBe(s.points[30]?.date);
    expect(row?.mu).toBeCloseTo(0.01, 12);
    expect(row?.carPre).toBeCloseTo(0, 12);
    expect(row?.carPost).toBeCloseTo(0.04, 12);
    expect(row?.rawPost).toBeCloseTo(1.05 * 1.01 * 1.01 - 1, 12);
  });
});

describe('numbers at the edges', () => {
  it('an overflowing return is undefined, not Infinity', () => {
    const r = returns(series('H', [1e-300, 1e300, 1]));
    expect(r[1]).toBeUndefined();
    expect(r[2]).toBeCloseTo(-1, 12);
  });
  it('decimals: probability_pct, exponents, negative zero and commas', () => {
    const p = importSeriesCsv(
      'date,probability_pct\n2024-01-01,7\n2024-01-02,-0\n2024-01-03,1e1\n2024-01-04,100\n',
      { kind: 'probability', symbol: 'PM', provenance: prov },
    );
    expect(p.ok && p.value[0]?.points.map((x) => x.value)).toEqual([0.07, -0, 0.1, 1]);
    const comma = importSeriesCsv('date,close\n2024-01-01,"1,5"\n2024-01-02,2\n', {
      kind: 'price',
      symbol: 'X',
      provenance: prov,
    });
    expect(comma.ok).toBe(false);
    const neg0 = importSeriesCsv('date,close\n2024-01-01,-0\n2024-01-02,2\n', {
      kind: 'price',
      symbol: 'X',
      provenance: prov,
    });
    expect(!neg0.ok && neg0.errors[0]).toBe('line 2: a price must be positive');
  });
  it('a volume the workspace cannot store is refused at import (it used to corrupt the save)', () => {
    const r = importSeriesCsv('date,close,volume\n2024-01-01,1,1e300\n2024-01-02,2,5\n', {
      kind: 'price',
      symbol: 'X',
      provenance: prov,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toContain('line 2: volume');
  });
  it('everything a CSV import accepts also validates as a stored workspace', () => {
    const s = importSeriesCsv(
      'date,close,volume\n2024-01-03,1e308,9007199254740991\n2024-01-01,0.0001,0\n2024-01-02,,\n',
      { kind: 'price', symbol: 'EDGE', provenance: prov },
    );
    const e = importEventsCsv(
      'id,kind,label,symbols,event_date,published_at,direction,source,access\n' +
        `e1,disclosure,${'x'.repeat(120)},EDGE;A;B;C;D;E;F;G,2024-01-01,2024-01-06,sell,${'s'.repeat(120)},restricted\n`,
      '2026-01-01',
    );
    expect(s.ok && e.ok).toBe(true);
    if (!s.ok || !e.ok) return;
    const ws = { ...emptyWorkspace(), series: s.value, events: e.value };
    expect(validateWorkspace(JSON.parse(JSON.stringify(ws)))).toMatchObject({ ok: true });
  });
  it('unsorted input is sorted; duplicated observations are refused', () => {
    const u = importSeriesCsv('date,close\n2024-01-03,3\n2024-01-01,1\n2024-01-02,2\n', {
      kind: 'price',
      symbol: 'X',
      provenance: prov,
    });
    expect(u.ok && u.value[0]?.points.map((p) => p.date)).toEqual([
      '2024-01-01',
      '2024-01-02',
      '2024-01-03',
    ]);
  });
});

describe('information time at the edges', () => {
  const m = buildSampleMarket();
  const a = m.series.find((s) => s.id === 'SMPL-A') as Series;
  const last = a.points[a.points.length - 1]?.date as string;
  const evs = importEventsCsv(
    'id,kind,label,symbols,event_date,published_at,direction,source,access\n' +
      'sat,catalyst,weekend,SMPL-A,2023-07-08,2023-07-08,up,s,public\n' +
      `late,catalyst,after the last session,SMPL-A,${last},${last},up,s,public\n`,
    '2026-01-01',
  );
  it('a weekend publication anchors on the next session; one on the last session is not tradable', () => {
    expect(evs.ok).toBe(true);
    if (!evs.ok) return;
    const res = eventStudy(a, evs.value, {
      estimation: 60,
      pre: 5,
      post: 5,
      kinds: ['catalyst'],
      direction: 'any',
    });
    expect(res.rows.map((r) => [r.event.id, r.anchorDate, r.excluded])).toEqual([
      ['sat', '2023-07-10', null],
      ['late', null, 'NOT_YET_TRADABLE'],
    ]);
  });

  it('a probability dated on the signal day is not used at that close (time-zone safe)', () => {
    // The probability jumps by 50 pp on day 3. A 24/7 market's day-3 value can postdate the
    // target's day-3 close, so the rule may fire on day 4 at the earliest.
    const target = series(
      'T',
      Array.from({ length: 10 }, () => 100),
      Array.from({ length: 10 }, () => 100),
    );
    const pm = series(
      'PM',
      [0.2, 0.2, 0.2, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7],
      undefined,
      'probability',
    );
    const rule: Rule = {
      name: 'p',
      targetId: 'T',
      horizon: 1,
      conditions: [
        { type: 'prob_change', seriesId: 'PM', h: 1, ppMin: 40 },
        { type: 'return_below', h: 1, pct: 1 }, // always true here: the probability decides
      ],
    };
    const hits = evaluateRule(rule, [target, pm], []).hits.map((h) => h.signal);
    expect(hits).toEqual([target.points[4]?.date]);
  });
});

describe('export safety and provenance', () => {
  it('neutralises formulas behind whitespace and full-width signs', () => {
    expect(csvCell(' =1+1')).toBe("' =1+1");
    expect(csvCell('＝1+1')).toBe("'＝1+1");
    expect(csvCell('-1e5')).toBe("'-1e5");
    expect(csvCell('-0.5')).toBe('-0.5');
  });
  it('a comment line stays one cell: user text cannot start a formula cell', () => {
    const out = toCsv(['Series X: x,=HYPERLINK("http://e")'], ['a'], [['1']]);
    const first = parseCsv(out).rows[0]?.cells ?? [];
    expect(first).toHaveLength(1);
    expect(first[0]?.startsWith('#')).toBe(true);
    expect(out).not.toMatch(/,=/);
  });
  const m = buildSampleMarket();
  const a = m.series[0] as Series;
  const evil: Series = {
    ...a,
    provenance: {
      ...a.provenance,
      source: 'Vendor,=HYPERLINK("http://e","x")',
      access: 'restricted',
    },
  };
  const rule: Rule = {
    name: 'r,=1+1',
    targetId: a.id,
    horizon: 5,
    conditions: [
      { type: 'event_recent', kind: 'catalyst', direction: 'any', days: 3 },
      { type: 'volume_shock', n: 20, zMin: 1 },
    ],
  };
  it('every export: comment lines are single cells, restricted data is announced', () => {
    const study = eventStudy(evil, m.events, {
      estimation: 60,
      pre: 5,
      post: 5,
      kinds: ['catalyst', 'disclosure', 'prediction'],
      direction: 'any',
    });
    const outs = [
      studyCsv(study, evil),
      hitsCsv(rule, evaluateRule(rule, [evil], m.events), [evil], m.events),
      tradesCsv(rule, backtest(rule, [evil], m.events, '2025-01-01', 10), [evil], m.events),
    ];
    for (const out of outs) {
      for (const row of parseCsv(out).rows.filter((r) => (r.cells[0] ?? '').startsWith('#'))) {
        expect(row.cells).toHaveLength(1);
      }
      expect(out).toContain('CONTAINS DATA LABELLED RESTRICTED');
      expect(out).not.toMatch(/(^|,)\s*=/m);
    }
    expect(hasRestricted([evil])).toBe(true);
    expect(hasRestricted(m.series, m.events)).toBe(false);
  });
  it('the study CSV carries each event publication date and access label', () => {
    const study = eventStudy(a, m.events, {
      estimation: 60,
      pre: 5,
      post: 5,
      kinds: ['disclosure'],
      direction: 'any',
    });
    const rows = parseCsv(studyCsv(study, a)).rows.filter((r) => !r.cells[0]?.startsWith('#'));
    const head = rows[0]?.cells ?? [];
    const d1 = rows.find((r) => r.cells[0] === 'disclosure-1')?.cells ?? [];
    expect(d1[head.indexOf('published_at')]).toBe('2024-03-28');
    expect(d1[head.indexOf('access')]).toBe('synthetic');
    expect(d1[head.indexOf('sample')]).toBe('yes');
  });
});
