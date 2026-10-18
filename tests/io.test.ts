import { describe, expect, it } from 'vitest';
import {
  buildSampleMarket,
  csvCell,
  emptyWorkspace,
  importEventsCsv,
  importSeriesCsv,
  parseCsv,
  parseWorkspaceJson,
  toCsv,
  validateWorkspace,
  WORKSPACE_SCHEMA,
  WORKSPACE_VERSION,
} from '../src/engine';

const prov = {
  source: 'my file',
  access: 'public' as const,
  retrievedAt: '2026-10-01',
  note: '',
  sample: false,
};

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, CRLF, a BOM and blank lines', () => {
    const text = `${String.fromCharCode(0xfeff)}a,b\r\n"x, y","he said ""hi"""\r\n\r\n"multi\nline",2\n`;
    const r = parseCsv(text);
    expect(r.error).toBeNull();
    expect(r.rows.map((x) => x.cells)).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['multi\nline', '2'],
    ]);
    expect(r.rows[2]?.line).toBe(4);
  });
  it('reports an unclosed quote with its line', () => {
    expect(parseCsv('a\n"oops\n').error).toBe('line 2: a quoted field is not closed');
  });
});

describe('importSeriesCsv', () => {
  it('imports a single price series sorted by date', () => {
    const r = importSeriesCsv('date,close,volume\n2024-01-03,11,100\n2024-01-02,10,200\n', {
      kind: 'price',
      symbol: 'ABC',
      provenance: prov,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.points.map((p) => p.date)).toEqual(['2024-01-02', '2024-01-03']);
    expect(r.value[0]?.provenance.sample).toBe(false);
  });
  it('splits multi-symbol files and converts probability_pct', () => {
    const r = importSeriesCsv(
      'date,symbol,probability_pct\n2024-01-02,pm1,40\n2024-01-03,PM1,55\n',
      { kind: 'probability', provenance: prov },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value[0]?.points.map((p) => p.value)).toEqual([0.4, 0.55]);
  });
  it('rejects bad rows with line numbers and imports nothing', () => {
    const r = importSeriesCsv(
      'date,close\n2024-01-02,10\n2024-01-03,10.5\n2024-02-30,11\n2024-01-04,-1\n2024-01-05,abc\n',
      { kind: 'price', symbol: 'ABC', provenance: prov },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      'line 4: date "2024-02-30" is not YYYY-MM-DD',
      'line 5: a price must be positive',
      'line 6: value "abc" is not a number',
    ]);
  });
  it('rejects duplicate dates, missing columns and missing symbols', () => {
    const dup = importSeriesCsv('date,close\n2024-01-02,10\n2024-01-02,11\n', {
      kind: 'price',
      symbol: 'ABC',
      provenance: prov,
    });
    expect(dup.ok ? [] : dup.errors).toEqual(['ABC: the date 2024-01-02 appears twice']);
    const cols = importSeriesCsv('day,price\n', { kind: 'price', provenance: prov });
    expect(cols.ok ? [] : cols.errors.length).toBe(3);
  });
});

describe('importEventsCsv', () => {
  const head = 'id,kind,label,symbols,event_date,published_at,direction,source,access\n';
  it('imports events with provenance', () => {
    const r = importEventsCsv(
      `${head}fil-1,disclosure,"Official buys, filed late",ABC;XYZ,2024-01-02,2024-02-01,buy,House PTR,public\n`,
      '2026-10-01',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]).toMatchObject({
      symbols: ['ABC', 'XYZ'],
      direction: 'buy',
      provenance: { source: 'House PTR', access: 'public' },
    });
  });
  it('rejects publication before the event, buy on a catalyst and duplicate ids', () => {
    const r = importEventsCsv(
      `${head}e1,catalyst,News,ABC,2024-01-05,2024-01-04,,src,public\ne2,catalyst,News,ABC,2024-01-05,2024-01-05,buy,src,public\ne3,catalyst,ok,ABC,2024-01-05,2024-01-05,up,src,public\ne3,catalyst,ok,ABC,2024-01-05,2024-01-05,up,src,public\n`,
      '2026-10-01',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      'line 2: published_at is before event_date',
      'line 3: buy/sell is only for disclosures',
      'line 5: id "e3" is used twice',
    ]);
  });
});

describe('CSV export', () => {
  it('neutralises formula-looking text but keeps numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csvCell('-0.5')).toBe('-0.5');
    expect(csvCell(-0.5)).toBe('-0.5');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell('a,b')).toBe('"a,b"');
  });
  it('writes provenance comments and CRLF lines that parse back', () => {
    const out = toCsv(['Source: sample\nline'], ['a', 'b'], [[1, 'x']]);
    expect(out).toBe('# Source: sample line\r\na,b\r\n1,x\r\n');
  });
});

describe('workspace', () => {
  const m = buildSampleMarket();
  const ws = { ...emptyWorkspace(), series: m.series, events: m.events };
  it('round-trips the sample market', () => {
    const r = parseWorkspaceJson(JSON.stringify(ws));
    expect(r.ok).toBe(true);
    expect(ws.schema).toBe(WORKSPACE_SCHEMA);
    expect(ws.version).toBe(WORKSPACE_VERSION);
  });
  it('rejects unknown keys, wrong versions, bad JSON and duplicates', () => {
    expect(validateWorkspace({ ...ws, extra: 1 }).ok).toBe(false);
    expect(validateWorkspace({ ...ws, version: 2 }).ok).toBe(false);
    expect(parseWorkspaceJson('{nope').ok).toBe(false);
    const dup = validateWorkspace({ ...ws, series: [m.series[0], m.series[0]] });
    expect(dup.ok ? [] : dup.errors).toEqual(['series SMPL-A: duplicate id']);
  });
  it('rejects decreasing dates and out-of-range probabilities', () => {
    const s = m.series[0];
    if (!s) throw new Error('no series');
    const bad = { ...s, points: [...s.points.slice(0, 3)].reverse() };
    expect(validateWorkspace({ ...ws, series: [bad] }).ok).toBe(false);
    const pm = m.series.find((x) => x.kind === 'probability');
    if (!pm) throw new Error('no pm');
    const badP = { ...pm, points: pm.points.map((p, i) => (i === 0 ? { ...p, value: 1.5 } : p)) };
    expect(validateWorkspace({ ...ws, series: [badP] }).ok).toBe(false);
  });
  it('rejects event publication before the event date', () => {
    const e = m.events[0];
    if (!e) throw new Error('no event');
    expect(validateWorkspace({ ...ws, events: [{ ...e, publishedAt: '2000-01-01' }] }).ok).toBe(
      false,
    );
  });
});
