/** Data model (docs/spec/00-data-and-time.md). */

export type Access = 'public' | 'licensed' | 'restricted' | 'synthetic';

export interface Provenance {
  source: string;
  access: Access;
  retrievedAt: string;
  note: string;
  sample: boolean;
}

export interface SeriesPoint {
  date: string;
  value: number | null;
  volume: number | null;
}

export interface Series {
  id: string;
  name: string;
  kind: 'price' | 'probability';
  provenance: Provenance;
  points: SeriesPoint[];
}

export type EventKind = 'catalyst' | 'disclosure' | 'prediction';
export type Direction = 'up' | 'down' | 'buy' | 'sell' | null;

export interface MarketEvent {
  id: string;
  kind: EventKind;
  label: string;
  symbols: string[];
  eventDate: string;
  publishedAt: string;
  direction: Direction;
  provenance: Provenance;
}

export const LIMITS = {
  points: 20_000,
  events: 2_000,
  series: 20,
  fileBytes: 5_000_000,
} as const;

export const TRADING_DAYS_PER_YEAR = 252;
