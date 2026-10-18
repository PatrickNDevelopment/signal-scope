/** CSV import and export (docs/spec/02-rules-backtest-io.md). All-or-nothing per file, line errors. */
import { isIsoDate } from './dates';
import {
  LIMITS,
  type Access,
  type Direction,
  type EventKind,
  type MarketEvent,
  type Provenance,
  type Series,
  type SeriesPoint,
} from './types';

/** RFC 4180 parser: quoted fields, doubled quotes, CRLF/CR/LF, leading BOM. Returns rows with line numbers. */
export function parseCsv(text: string): {
  rows: { line: number; cells: string[] }[];
  error: string | null;
} {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      cells.push(cell);
      rows.push({ line: rowLine, cells });
      cells = [];
      cell = '';
      line += 1;
      rowLine = line;
    } else cell += ch;
  }
  if (quoted) return { rows, error: `line ${rowLine}: a quoted field is not closed` };
  if (cell !== '' || cells.length > 0) {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
  }
  return {
    rows: rows.filter((r) => !(r.cells.length === 1 && (r.cells[0] ?? '').trim() === '')),
    error: null,
  };
}

export type ImportResult<T> =
  { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

const SYMBOL = /^[A-Z0-9][A-Z0-9._-]{0,19}$/;
const EVENT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

function num(s: string): number | null | 'bad' {
  const t = s.trim();
  if (t === '') return null;
  if (!/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return 'bad';
  const v = Number(t);
  return Number.isFinite(v) ? v : 'bad';
}

/** Prices or probabilities. Single-series files need `symbol`; multi-series files carry a symbol column. */
export function importSeriesCsv(
  text: string,
  opts: { kind: 'price' | 'probability'; symbol?: string; name?: string; provenance: Provenance },
): ImportResult<Series[]> {
  if (new TextEncoder().encode(text).length > LIMITS.fileBytes)
    return { ok: false, errors: ['The file is larger than 5 MB.'] };
  const parsed = parseCsv(text);
  if (parsed.error) return { ok: false, errors: [parsed.error] };
  const [head, ...body] = parsed.rows;
  if (!head) return { ok: false, errors: ['The file is empty.'] };
  const cols = head.cells.map((c) => c.trim().toLowerCase());
  const at = (name: string): number => cols.indexOf(name);
  const iDate = at('date');
  const iSym = at('symbol');
  const iClose =
    opts.kind === 'price'
      ? at('close')
      : at('probability') >= 0
        ? at('probability')
        : at('probability_pct');
  const pct = opts.kind === 'probability' && at('probability') < 0 && at('probability_pct') >= 0;
  const iVol = at('volume');
  const errors: string[] = [];
  if (iDate < 0) errors.push('line 1: missing a "date" column');
  if (iClose < 0)
    errors.push(`line 1: missing a "${opts.kind === 'price' ? 'close' : 'probability'}" column`);
  if (iSym < 0 && !(opts.symbol && SYMBOL.test(opts.symbol))) {
    errors.push('Give a symbol (A-Z, 0-9, . _ -; up to 20) or include a "symbol" column.');
  }
  if (errors.length) return { ok: false, errors };
  const bySymbol = new Map<string, SeriesPoint[]>();
  for (const row of body) {
    const c = row.cells;
    const date = (c[iDate] ?? '').trim();
    const sym = iSym >= 0 ? (c[iSym] ?? '').trim().toUpperCase() : (opts.symbol as string);
    if (!isIsoDate(date)) {
      errors.push(`line ${row.line}: date "${date}" is not YYYY-MM-DD`);
      continue;
    }
    if (!SYMBOL.test(sym)) {
      errors.push(`line ${row.line}: symbol "${sym}" is not valid`);
      continue;
    }
    let v = num(c[iClose] ?? '');
    if (v === 'bad') {
      errors.push(`line ${row.line}: value "${c[iClose] ?? ''}" is not a number`);
      continue;
    }
    if (v !== null && pct) v = v / 100;
    if (v !== null && opts.kind === 'price' && !(v > 0)) {
      errors.push(`line ${row.line}: a price must be positive`);
      continue;
    }
    if (v !== null && opts.kind === 'probability' && !(v >= 0 && v <= 1)) {
      errors.push(
        `line ${row.line}: a probability must be between 0 and 1 (or 0 and 100 in probability_pct)`,
      );
      continue;
    }
    let vol: number | null = null;
    if (iVol >= 0) {
      const raw = num(c[iVol] ?? '');
      if (raw === 'bad' || (raw !== null && (raw < 0 || !Number.isSafeInteger(raw)))) {
        errors.push(
          `line ${row.line}: volume "${c[iVol] ?? ''}" must be a whole number from 0 to 9007199254740991`,
        );
        continue;
      }
      vol = raw;
    }
    const list = bySymbol.get(sym) ?? [];
    list.push({ date, value: v, volume: vol });
    bySymbol.set(sym, list);
    if (errors.length > 50) break;
  }
  const out: Series[] = [];
  for (const [sym, pts] of bySymbol) {
    pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (let i = 1; i < pts.length; i += 1) {
      if ((pts[i] as SeriesPoint).date === (pts[i - 1] as SeriesPoint).date) {
        errors.push(`${sym}: the date ${(pts[i] as SeriesPoint).date} appears twice`);
        break;
      }
    }
    if (pts.length < 2) errors.push(`${sym}: at least two rows are needed`);
    if (pts.length > LIMITS.points) errors.push(`${sym}: more than ${LIMITS.points} rows`);
    out.push({
      id: sym,
      name: iSym >= 0 || !opts.name ? sym : opts.name,
      kind: opts.kind,
      provenance: opts.provenance,
      points: pts,
    });
  }
  if (out.length === 0 && errors.length === 0) errors.push('The file has no data rows.');
  return errors.length
    ? { ok: false, errors: errors.slice(0, 50) }
    : { ok: true, value: out, warnings: [] };
}

const KINDS: readonly EventKind[] = ['catalyst', 'disclosure', 'prediction'];
const ACCESS: readonly Access[] = ['public', 'licensed', 'restricted', 'synthetic'];

export function importEventsCsv(
  text: string,
  retrievedAt: string,
  sample = false,
): ImportResult<MarketEvent[]> {
  if (new TextEncoder().encode(text).length > LIMITS.fileBytes)
    return { ok: false, errors: ['The file is larger than 5 MB.'] };
  const parsed = parseCsv(text);
  if (parsed.error) return { ok: false, errors: [parsed.error] };
  const [head, ...body] = parsed.rows;
  if (!head) return { ok: false, errors: ['The file is empty.'] };
  const cols = head.cells.map((c) => c.trim().toLowerCase());
  const need = [
    'id',
    'kind',
    'label',
    'symbols',
    'event_date',
    'published_at',
    'direction',
    'source',
    'access',
  ];
  const missing = need.filter((n) => !cols.includes(n));
  if (missing.length)
    return { ok: false, errors: [`line 1: missing column(s): ${missing.join(', ')}`] };
  const get = (cells: string[], name: string): string => (cells[cols.indexOf(name)] ?? '').trim();
  const errors: string[] = [];
  const events: MarketEvent[] = [];
  const ids = new Set<string>();
  for (const row of body) {
    const c = row.cells;
    const id = get(c, 'id');
    const kind = get(c, 'kind') as EventKind;
    const label = get(c, 'label');
    const symbols = get(c, 'symbols')
      .split(';')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const eventDate = get(c, 'event_date');
    const publishedAt = get(c, 'published_at');
    const dirRaw = get(c, 'direction').toLowerCase();
    const access = get(c, 'access').toLowerCase() as Access;
    const source = get(c, 'source');
    const problems: string[] = [];
    if (!EVENT_ID.test(id)) problems.push(`id "${id}" must be lower-case letters, digits and -`);
    else if (ids.has(id)) problems.push(`id "${id}" is used twice`);
    if (!KINDS.includes(kind)) problems.push(`kind must be ${KINDS.join(', ')}`);
    if (label === '' || label.length > 120) problems.push('label must be 1 to 120 characters');
    if (symbols.length === 0 || symbols.length > 8 || symbols.some((s) => !SYMBOL.test(s)))
      problems.push('symbols must be 1 to 8 valid symbols separated by ;');
    if (!isIsoDate(eventDate)) problems.push(`event_date "${eventDate}" is not YYYY-MM-DD`);
    if (!isIsoDate(publishedAt)) problems.push(`published_at "${publishedAt}" is not YYYY-MM-DD`);
    if (isIsoDate(eventDate) && isIsoDate(publishedAt) && publishedAt < eventDate)
      problems.push('published_at is before event_date');
    const direction: Direction = dirRaw === '' ? null : (dirRaw as Direction);
    if (!['', 'up', 'down', 'buy', 'sell'].includes(dirRaw))
      problems.push('direction must be up, down, buy, sell or empty');
    if ((dirRaw === 'buy' || dirRaw === 'sell') && kind !== 'disclosure')
      problems.push('buy/sell is only for disclosures');
    if (!ACCESS.includes(access)) problems.push(`access must be ${ACCESS.join(', ')}`);
    if (source === '' || source.length > 120) problems.push('source must be 1 to 120 characters');
    if (problems.length) {
      errors.push(`line ${row.line}: ${problems.join('; ')}`);
      if (errors.length > 50) break;
      continue;
    }
    ids.add(id);
    events.push({
      id,
      kind,
      label,
      symbols,
      eventDate,
      publishedAt,
      direction,
      provenance: { source, access, retrievedAt, note: '', sample },
    });
  }
  if (events.length > LIMITS.events) errors.push(`more than ${LIMITS.events} events`);
  if (events.length === 0 && errors.length === 0) errors.push('The file has no data rows.');
  return errors.length
    ? { ok: false, errors: errors.slice(0, 50) }
    : { ok: true, value: events, warnings: [] };
}

/** One CSV cell: quoted when needed; formula-looking text is neutralised with a leading quote. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
  let s = typeof v === 'number' ? String(v) : v;
  // Also catches leading whitespace and full-width = + - @, which some spreadsheets normalise.
  if (typeof v === 'string' && /^\s*[=+\-@\t\r＝＋－＠]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s))
    s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A comment line must stay ONE cell that starts with "#". A comma would open a new cell in a
 * spreadsheet, where user text such as a source "x,=HYPERLINK(...)" would become a formula, and a
 * double quote could change how the line is split. Commas become ";" and double quotes "'".
 */
export function commentText(c: string): string {
  return c
    .replace(/[\r\n]+/g, ' ')
    .replace(/,/g, ';')
    .replace(/"/g, "'");
}

export function toCsv(
  comments: string[],
  header: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = comments.map((c) => `# ${commentText(c)}`);
  lines.push(header.map(csvCell).join(','));
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
