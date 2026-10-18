/**
 * Clearly labelled synthetic sample markets. Generated from a fixed seed with only + - * / and sqrt,
 * so every run and every machine produces the same numbers. Nothing here is real market data; the
 * names are invented and the "officials" are placeholders.
 */
import { addDays } from './dates';
import type { MarketEvent, Provenance, Series, SeriesPoint } from './types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximately standard normal: sum of 12 uniforms minus 6 (no transcendental functions). */
function normal(rng: () => number): number {
  let s = 0;
  for (let i = 0; i < 12; i += 1) s += rng();
  return s - 6;
}

export const SAMPLE_PROVENANCE: Provenance = {
  source: 'SignalScope synthetic sample generator (seeded)',
  access: 'synthetic',
  retrievedAt: '2026-01-01',
  note: 'Invented data for demonstration. Not real prices, filings or markets.',
  sample: true,
};

/** Weekday sessions from start, count of them. */
export function sessions(start: string, count: number): string[] {
  const out: string[] = [];
  let d = start;
  while (out.length < count) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

interface Shock {
  /** first session index affected */
  at: number;
  /** total log-free drift added over `len` sessions, as a fraction */
  move: number;
  len: number;
  volMult: number;
}

function priceSeries(
  id: string,
  name: string,
  dates: string[],
  seed: number,
  start: number,
  dailyVol: number,
  shocks: Shock[],
  common: number[],
): Series {
  const rng = mulberry32(seed);
  const points: SeriesPoint[] = [];
  let p = start;
  for (let i = 0; i < dates.length; i += 1) {
    let r = dailyVol * normal(rng) + 0.6 * (common[i] ?? 0) + 0.0002;
    let volMult = 1;
    for (const s of shocks) {
      if (i >= s.at && i < s.at + s.len) {
        r += s.move / s.len;
        volMult = Math.max(volMult, s.volMult);
      }
    }
    if (i > 0) p = Math.max(1, p * (1 + r));
    const volume = Math.round(1_000_000 * volMult * (0.75 + 0.5 * rng()));
    points.push({ date: dates[i] as string, value: Math.round(p * 100) / 100, volume });
  }
  return { id, name, kind: 'price', provenance: SAMPLE_PROVENANCE, points };
}

export interface SampleMarket {
  series: Series[];
  events: MarketEvent[];
}

export function buildSampleMarket(): SampleMarket {
  const dates = sessions('2023-01-02', 760);
  const crng = mulberry32(99);
  const common = dates.map(() => 0.008 * normal(crng));
  const at = (i: number): string => dates[i] as string;

  // Catalysts for SMPL-A: product news published on the day; price reacts from the next session.
  const catalystIdx = [140, 260, 380, 500, 620];
  const catalystMoves = [0.06, -0.05, 0.07, 0.05, -0.06];
  const shocksA: Shock[] = catalystIdx.map((i, k) => ({
    at: i + 1,
    move: catalystMoves[k] as number,
    len: 3,
    volMult: 3,
  }));
  // A disclosed purchase: the transaction (day 300) precedes a rally (days 302-305); the filing
  // is published 31 calendar days after the transaction, i.e. after the move (days 302-305).
  shocksA.push({ at: 302, move: 0.1, len: 4, volMult: 2.5 });

  const idx = priceSeries(
    'SMPL-IDX',
    'Sample Index (synthetic)',
    dates,
    7,
    1000,
    0.006,
    [],
    common,
  );
  const a = priceSeries(
    'SMPL-A',
    'Sample Alpha Corp (synthetic)',
    dates,
    23,
    50,
    0.011,
    shocksA,
    common,
  );
  const b = priceSeries(
    'SMPL-B',
    'Sample Beta Ltd (synthetic)',
    dates,
    13,
    80,
    0.012,
    [{ at: 451, move: -0.07, len: 4, volMult: 3 }],
    common,
  );

  // A prediction-market probability for a fictional measure, rising ahead of a vote.
  const prng = mulberry32(17);
  let prob = 0.3;
  const pm: Series = {
    id: 'SMPL-PM',
    name: 'Sample measure passes (synthetic market probability)',
    kind: 'probability',
    provenance: SAMPLE_PROVENANCE,
    points: dates.map((d, i) => {
      const drift = i > 430 && i < 450 ? 0.02 : 0;
      prob = Math.min(0.97, Math.max(0.03, prob + drift + 0.01 * normal(prng)));
      return { date: d, value: Math.round(prob * 1000) / 1000, volume: null };
    }),
  };

  const events: MarketEvent[] = catalystIdx.map((i, k) => ({
    id: `catalyst-${k + 1}`,
    kind: 'catalyst',
    label: `Sample product announcement ${k + 1} (synthetic)`,
    symbols: ['SMPL-A'],
    eventDate: at(i),
    publishedAt: at(i),
    direction: (catalystMoves[k] as number) > 0 ? 'up' : 'down',
    provenance: SAMPLE_PROVENANCE,
  }));
  events.push(
    {
      id: 'disclosure-1',
      kind: 'disclosure',
      label: 'Sample Official 1 reports a purchase of SMPL-A (synthetic)',
      symbols: ['SMPL-A'],
      eventDate: at(300),
      publishedAt: addDays(at(300), 31),
      direction: 'buy',
      provenance: SAMPLE_PROVENANCE,
    },
    {
      id: 'disclosure-2',
      kind: 'disclosure',
      label: 'Sample Official 2 reports a sale of SMPL-B (synthetic)',
      symbols: ['SMPL-B'],
      eventDate: at(440),
      publishedAt: addDays(at(440), 20),
      direction: 'sell',
      provenance: SAMPLE_PROVENANCE,
    },
    {
      id: 'prediction-1',
      kind: 'prediction',
      label: 'Sample measure probability passes 60 % (synthetic)',
      symbols: ['SMPL-B', 'SMPL-IDX'],
      eventDate: at(447),
      publishedAt: at(447),
      direction: 'up',
      provenance: SAMPLE_PROVENANCE,
    },
  );
  return { series: [a, b, idx, pm], events };
}
