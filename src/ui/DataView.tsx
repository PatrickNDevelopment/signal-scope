/** Data: import, provenance, and the event timeline with publication versus transaction dates. */
import { useId, useState } from 'react';
import {
  arrivalDelay,
  anchorIndex,
  importEventsCsv,
  importSeriesCsv,
  isIsoDate,
  LIMITS,
  type Access,
  type MarketEvent,
  type Series,
  type Workspace,
} from '../engine';
import { int } from '../lib/format';
import { PriceChart } from './charts';

/** Today's date in the user's own time zone (toISOString would give the UTC date). */
function localToday(now: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

async function readFile(
  input: HTMLInputElement,
): Promise<{ name: string; text: string; tooLarge: boolean } | null> {
  const f = input.files?.[0];
  if (!f) return null;
  if (f.size > LIMITS.fileBytes) return { name: f.name, text: '', tooLarge: true };
  return { name: f.name, text: await f.text(), tooLarge: false };
}

function Errors(props: { title: string; errors: string[] }) {
  if (props.errors.length === 0) return null;
  return (
    <div className="notice danger" role="alert">
      <strong>{props.title}</strong>
      <ul>
        {props.errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

function SeriesImport(props: { ws: Workspace; onChange: (ws: Workspace, msg: string) => void }) {
  const id = useId();
  const [kind, setKind] = useState<'price' | 'probability'>('price');
  const [symbol, setSymbol] = useState('');
  const [source, setSource] = useState('');
  const [access, setAccess] = useState<Access>('public');
  const [retrievedAt, setRetrievedAt] = useState(localToday());
  const [errors, setErrors] = useState<string[]>([]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = await readFile(input);
    input.value = '';
    if (!file) return;
    const pre: string[] = [];
    if (source.trim() === '')
      pre.push('Enter the data source before importing (for example the vendor or file origin).');
    if (!isIsoDate(retrievedAt)) pre.push('Enter the retrieval date as YYYY-MM-DD.');
    if (file.tooLarge) pre.push('The file is larger than 5 MB.');
    if (pre.length) return setErrors(pre);
    const r = importSeriesCsv(file.text, {
      kind,
      symbol: symbol.trim().toUpperCase() || undefined,
      provenance: {
        source: source.trim().slice(0, 120),
        access,
        retrievedAt,
        note: `Imported from ${file.name}`.slice(0, 300),
        sample: false,
      },
    });
    if (!r.ok) return setErrors(r.errors);
    const ids = new Set(r.value.map((s) => s.id));
    const kept = props.ws.series.filter((s) => !ids.has(s.id));
    if (kept.length + r.value.length > LIMITS.series)
      return setErrors([`At most ${LIMITS.series} series can be loaded.`]);
    setErrors([]);
    const replaced = props.ws.series.length - kept.length;
    props.onChange(
      { ...props.ws, series: [...kept, ...r.value] },
      `Imported ${r.value.length} series (${r.value.map((s) => `${s.id}: ${s.points.length} rows`).join(', ')})${replaced ? `, replacing ${replaced} with the same symbol` : ''}.`,
    );
  }

  return (
    <fieldset className="card">
      <legend>Import prices or probabilities (CSV)</legend>
      <p className="muted small">
        Columns: <code>date,close[,volume][,symbol]</code> for prices; <code>date,probability</code>{' '}
        (0 to 1) or <code>probability_pct</code> for prediction markets. Dates are YYYY-MM-DD; an
        empty value is missing, never zero.
      </p>
      <div className="form-grid">
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as 'price' | 'probability')}>
            <option value="price">Price</option>
            <option value="probability">Event probability</option>
          </select>
        </label>
        <label>
          Symbol (if the file has no symbol column)
          <input
            value={symbol}
            maxLength={20}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g. ACME"
          />
        </label>
        <label>
          Source
          <input
            value={source}
            maxLength={120}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Where the data came from"
          />
        </label>
        <label>
          Access
          <select value={access} onChange={(e) => setAccess(e.target.value as Access)}>
            <option value="public">Public</option>
            <option value="licensed">Licensed</option>
            <option value="restricted">Restricted</option>
            <option value="synthetic">Synthetic (invented data)</option>
          </select>
        </label>
        <label>
          Retrieved on
          <input
            value={retrievedAt}
            onChange={(e) => setRetrievedAt(e.target.value)}
            placeholder="YYYY-MM-DD"
          />
        </label>
        <label htmlFor={id}>
          CSV file
          <input id={id} type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
      </div>
      <Errors title="Nothing was imported. Fix these and try again:" errors={errors} />
    </fieldset>
  );
}

function EventsImport(props: { ws: Workspace; onChange: (ws: Workspace, msg: string) => void }) {
  const id = useId();
  const [retrievedAt, setRetrievedAt] = useState(localToday());
  const [errors, setErrors] = useState<string[]>([]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = await readFile(input);
    input.value = '';
    if (!file) return;
    if (!isIsoDate(retrievedAt)) return setErrors(['Enter the retrieval date as YYYY-MM-DD.']);
    if (file.tooLarge) return setErrors(['The file is larger than 5 MB.']);
    const r = importEventsCsv(file.text, retrievedAt);
    if (!r.ok) return setErrors(r.errors);
    const ids = new Set(r.value.map((x) => x.id));
    const kept = props.ws.events.filter((x) => !ids.has(x.id));
    if (kept.length + r.value.length > LIMITS.events)
      return setErrors([`At most ${LIMITS.events} events can be loaded.`]);
    setErrors([]);
    const replaced = props.ws.events.length - kept.length;
    props.onChange(
      { ...props.ws, events: [...kept, ...r.value] },
      `Imported ${r.value.length} events${replaced ? `, replacing ${replaced} with the same id` : ''}.`,
    );
  }

  return (
    <fieldset className="card">
      <legend>Import catalysts, disclosures or prediction events (CSV)</legend>
      <p className="muted small">
        Columns: <code>id,kind,label,symbols,event_date,published_at,direction,source,access</code>.{' '}
        <code>event_date</code> is when it happened (for a disclosure, the transaction);{' '}
        <code>published_at</code> is when it became public. Studies only use an event from the first
        session after <code>published_at</code>.
      </p>
      <div className="form-grid">
        <label>
          Retrieved on
          <input
            value={retrievedAt}
            onChange={(e) => setRetrievedAt(e.target.value)}
            placeholder="YYYY-MM-DD"
          />
        </label>
        <label htmlFor={id}>
          CSV file
          <input id={id} type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
      </div>
      <Errors title="Nothing was imported. Fix these and try again:" errors={errors} />
    </fieldset>
  );
}

function ProvenanceTag(props: { p: Series['provenance'] }) {
  return (
    <span className="prov">
      {props.p.sample ? <span className="badge sample">Sample</span> : null}
      <span className={`badge access-${props.p.access}`}>{props.p.access}</span> {props.p.source}
      <span className="muted"> · retrieved {props.p.retrievedAt}</span>
    </span>
  );
}

function EventEditor(props: {
  ev: MarketEvent;
  onSave: (ev: MarketEvent) => void;
  onCancel: () => void;
}) {
  const [eventDate, setEventDate] = useState(props.ev.eventDate);
  const [publishedAt, setPublishedAt] = useState(props.ev.publishedAt);
  const problems: string[] = [];
  if (!isIsoDate(eventDate)) problems.push('The event date must be a real date (YYYY-MM-DD).');
  if (!isIsoDate(publishedAt))
    problems.push('The publication date must be a real date (YYYY-MM-DD).');
  if (problems.length === 0 && publishedAt < eventDate)
    problems.push('Publication cannot be before the event itself.');
  return (
    <form
      className="editor"
      aria-label={`Edit dates of ${props.ev.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (problems.length === 0) props.onSave({ ...props.ev, eventDate, publishedAt });
      }}
    >
      <label>
        {props.ev.kind === 'disclosure' ? 'Transaction date' : 'Event date'}
        <input value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </label>
      <label>
        Published
        <input value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
      </label>
      <button type="submit" disabled={problems.length > 0}>
        Apply
      </button>
      <button type="button" className="secondary" onClick={props.onCancel}>
        Cancel
      </button>
      {problems.length ? (
        <p className="error-text" role="alert">
          {problems.join(' ')}
        </p>
      ) : null}
    </form>
  );
}

export function DataView(props: {
  ws: Workspace;
  onChange: (ws: Workspace, msg: string) => void;
  onLoadSample: () => void;
  chartSeriesId: string | null;
  onChartSeries: (id: string) => void;
}) {
  const { ws } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const chartSeries = ws.series.find((s) => s.id === props.chartSeriesId) ?? ws.series[0];
  const events = [...ws.events].sort((a, b) =>
    a.publishedAt < b.publishedAt ? -1 : a.publishedAt > b.publishedAt ? 1 : a.id < b.id ? -1 : 1,
  );

  return (
    <section aria-labelledby="data-h">
      <h2 id="data-h">Data and provenance</h2>
      {ws.series.length === 0 && ws.events.length === 0 ? (
        <div className="card empty">
          <p>
            <strong>No data loaded.</strong> Import your own historical CSV files below, or load the
            seeded sample market (synthetic, clearly labelled) to explore.
          </p>
          <button type="button" onClick={props.onLoadSample}>
            Load sample market
          </button>
        </div>
      ) : null}
      <div className="two-col">
        <SeriesImport ws={ws} onChange={props.onChange} />
        <EventsImport ws={ws} onChange={props.onChange} />
      </div>

      {ws.series.length > 0 ? (
        <>
          <h3>Series ({ws.series.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Symbol</th>
                  <th scope="col">Name</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Missing</th>
                  <th scope="col">Range</th>
                  <th scope="col">Provenance</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ws.series.map((s) => (
                  <tr key={s.id}>
                    <th scope="row">{s.id}</th>
                    <td>{s.name}</td>
                    <td>{s.kind}</td>
                    <td className="num">{int(s.points.length)}</td>
                    <td className="num">{int(s.points.filter((p) => p.value === null).length)}</td>
                    <td>
                      {s.points[0]?.date} to {s.points[s.points.length - 1]?.date}
                    </td>
                    <td>
                      <ProvenanceTag p={s.provenance} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="secondary small"
                        aria-label={`Remove series ${s.id}`}
                        onClick={() =>
                          props.onChange(
                            { ...ws, series: ws.series.filter((x) => x.id !== s.id) },
                            `Removed series ${s.id}.`,
                          )
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {chartSeries ? (
        <div className="card">
          <div className="row-between">
            <h3>Timeline</h3>
            <label className="inline">
              Series
              <select value={chartSeries.id} onChange={(e) => props.onChartSeries(e.target.value)}>
                {ws.series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <PriceChart
            series={chartSeries}
            events={ws.events}
            selectedId={selected}
            label={`${chartSeries.name}: values over time with event dates (dots), first tradable session after publication (vertical lines) and the data-arrival delay between them`}
          />
          <p className="legend small">
            <span className="key key-txn" /> event or transaction date{' '}
            <span className="key key-delay" /> data-arrival delay{' '}
            <span className="key key-anchor" /> day 0, first session after publication
          </p>
        </div>
      ) : null}

      {ws.events.length > 0 ? (
        <>
          <h3>Events ({ws.events.length}), ordered by publication</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Label</th>
                  <th scope="col">Symbols</th>
                  <th scope="col">Event / transaction</th>
                  <th scope="col">Published</th>
                  <th scope="col">Delay (days)</th>
                  <th scope="col">Day 0 ({chartSeries?.id ?? 'series'})</th>
                  <th scope="col">Direction</th>
                  <th scope="col">Provenance</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const dates = chartSeries?.points.map((p) => p.date) ?? [];
                  const ai =
                    chartSeries && e.symbols.includes(chartSeries.id) ? anchorIndex(dates, e) : -2;
                  return (
                    <tr
                      key={e.id}
                      className={selected === e.id ? 'selected' : undefined}
                      data-event={e.id}
                    >
                      <th scope="row">
                        <button
                          type="button"
                          className="link"
                          onClick={() => setSelected(selected === e.id ? null : e.id)}
                          aria-pressed={selected === e.id}
                        >
                          {e.id}
                        </button>
                      </th>
                      <td>{e.kind}</td>
                      <td>{e.label}</td>
                      <td>{e.symbols.join(', ')}</td>
                      {editing === e.id ? (
                        <td colSpan={4}>
                          <EventEditor
                            ev={e}
                            onCancel={() => setEditing(null)}
                            onSave={(next) => {
                              setEditing(null);
                              props.onChange(
                                { ...ws, events: ws.events.map((x) => (x.id === e.id ? next : x)) },
                                `Updated ${e.id}: event ${next.eventDate}, published ${next.publishedAt} (delay ${arrivalDelay(next)} days).`,
                              );
                            }}
                          />
                        </td>
                      ) : (
                        <>
                          <td>{e.eventDate}</td>
                          <td>{e.publishedAt}</td>
                          <td className="num" data-testid={`delay-${e.id}`}>
                            {arrivalDelay(e)}
                          </td>
                          <td data-testid={`day0-${e.id}`}>
                            {ai === -2 ? 'n/a' : ai < 0 ? 'not yet tradable' : dates[ai]}
                          </td>
                        </>
                      )}
                      <td>{e.direction ?? '—'}</td>
                      <td>
                        <ProvenanceTag p={e.provenance} />
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="secondary small"
                          aria-label={`Edit dates of ${e.id}`}
                          onClick={() => setEditing(e.id)}
                        >
                          Edit dates
                        </button>
                        <button
                          type="button"
                          className="secondary small"
                          aria-label={`Remove event ${e.id}`}
                          onClick={() =>
                            props.onChange(
                              { ...ws, events: ws.events.filter((x) => x.id !== e.id) },
                              `Removed event ${e.id}.`,
                            )
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
