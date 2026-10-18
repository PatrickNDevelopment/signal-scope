/** Display formatting. Undefined or non-finite values render as an em dash, never as 0. */

export function pct(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  const s = (v * 100).toFixed(digits);
  return `${v > 0 ? '+' : ''}${s} %`;
}

export function num(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function int(v: number): string {
  return Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—';
}

export const DISCLAIMER = 'Descriptive historical calculation. Not investment advice.';
