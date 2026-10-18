/** Calendar dates as `YYYY-MM-DD` strings. Comparison is plain string order (same length, ISO). */

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string): boolean {
  const m = RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] ?? 0;
  return d <= days;
}

function utcDays(s: string): number {
  const m = RE.exec(s);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(utcDays(b) - utcDays(a));
}

export function addDays(s: string, n: number): string {
  const d = new Date((utcDays(s) + n) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Index of the first date strictly after `date` in a sorted list, or -1. Binary search. */
export function firstAfter(dates: readonly string[], date: string): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((dates[mid] as string) <= date) lo = mid + 1;
    else hi = mid;
  }
  return lo < dates.length ? lo : -1;
}

/** Index of the last date `<= date`, or -1. */
export function lastOnOrBefore(dates: readonly string[], date: string): number {
  const i = firstAfter(dates, date);
  return i === -1 ? dates.length - 1 : i - 1;
}
