/** Event study: pre/post cumulative abnormal returns around publication-anchored events. */
import { useMemo } from 'react';
import {
  eventStudy,
  LookaheadError,
  type EventKind,
  type Series,
  type StudyParams,
  type StudyResult,
  type Summary,
  type Workspace,
} from '../engine';
import { download } from '../lib/files';
import { DISCLAIMER, pct } from '../lib/format';
import { studyCsv } from '../lib/exports';
import { PathChart, PriceChart } from './charts';

const KINDS: EventKind[] = ['catalyst', 'disclosure', 'prediction'];

function clampInt(v: string, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function SummaryCard(props: { title: string; s: Summary; testId: string }) {
  const { s } = props;
  return (
    <div className="stat" data-testid={props.testId}>
      <h4>{props.title}</h4>
      <p className="big">{pct(s.mean)}</p>
      <p className="small">
        median {pct(s.median)} · {s.n ? `${Math.round(s.sharePositive * 100)} % positive` : '—'}
      </p>
      <p className="small">
        95 % interval (normal approx.){' '}
        {s.n >= 2 ? `${pct(s.low95)} to ${pct(s.high95)}` : 'needs 2+ events'}
      </p>
      <p>
        <span className={`badge n-${s.badge.replace(/ /g, '-')}`}>
          n = {s.n} · {s.badge}
        </span>
      </p>
    </div>
  );
}

export function StudyView(props: {
  ws: Workspace;
  series: Series | null;
  priceSeries: Series[];
  params: StudyParams;
  onSeries: (id: string) => void;
  onParams: (p: StudyParams) => void;
}) {
  const { series, params } = props;
  const computed = useMemo((): { res: StudyResult | null; error: string | null } => {
    if (!series) return { res: null, error: null };
    try {
      return { res: eventStudy(series, props.ws.events, params), error: null };
    } catch (e) {
      if (e instanceof LookaheadError) return { res: null, error: e.message };
      throw e;
    }
  }, [series, props.ws.events, params]);

  if (!series) {
    return (
      <section aria-labelledby="study-h">
        <h2 id="study-h">Event study</h2>
        <div className="card empty">
          <p>
            Load at least one price series (and some events) on the Data page to run an event study.
          </p>
          <a href="#/data">Go to Data</a>
        </div>
      </section>
    );
  }
  const { res, error } = computed;
  const set = (patch: Partial<StudyParams>) => props.onParams({ ...params, ...patch });

  return (
    <section aria-labelledby="study-h">
      <div className="row-between">
        <h2 id="study-h">Event study</h2>
        <button
          type="button"
          disabled={!res}
          onClick={() =>
            res &&
            download(`signal-scope-event-study-${series.id}.csv`, studyCsv(res, series), 'text/csv')
          }
        >
          Export study CSV
        </button>
      </div>
      <fieldset className="card controls">
        <legend>Parameters</legend>
        <label>
          Price series
          <select value={series.id} onChange={(e) => props.onSeries(e.target.value)}>
            {props.priceSeries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Event kinds" className="checks">
          {KINDS.map((k) => (
            <label key={k} className="check">
              <input
                type="checkbox"
                checked={params.kinds.includes(k)}
                disabled={params.kinds.length === 1 && params.kinds.includes(k)}
                onChange={(e) =>
                  set({
                    kinds: e.target.checked
                      ? [...params.kinds, k]
                      : params.kinds.filter((x) => x !== k),
                  })
                }
              />
              {k}
            </label>
          ))}
        </div>
        <label>
          Direction
          <select
            value={params.direction ?? 'any'}
            onChange={(e) => set({ direction: e.target.value as StudyParams['direction'] })}
          >
            <option value="any">any</option>
            <option value="up">up</option>
            <option value="down">down</option>
            <option value="buy">buy (disclosures)</option>
            <option value="sell">sell (disclosures)</option>
          </select>
        </label>
        <label>
          Estimation window (sessions)
          <input
            type="number"
            min={20}
            max={500}
            value={params.estimation}
            onChange={(e) =>
              set({ estimation: clampInt(e.target.value, 20, 500, params.estimation) })
            }
          />
        </label>
        <label>
          Pre-window (sessions)
          <input
            type="number"
            min={1}
            max={60}
            value={params.pre}
            onChange={(e) => set({ pre: clampInt(e.target.value, 1, 60, params.pre) })}
          />
        </label>
        <label>
          Post-window (sessions after day 0)
          <input
            type="number"
            min={0}
            max={60}
            value={params.post}
            onChange={(e) => set({ post: clampInt(e.target.value, 0, 60, params.post) })}
          />
        </label>
      </fieldset>

      <div className="notice info">
        <strong>How to read this.</strong> Day 0 is the first trading session strictly after an
        event was published, so nothing is measured from before the information was public. The
        baseline is the {params.estimation} sessions ending {params.pre + 1} sessions before day 0;
        an abnormal return is the daily return minus that baseline mean. Pre CAR sums days −
        {params.pre} to −1, post CAR sums day 0 to +{params.post}. {DISCLAIMER}
      </div>

      {error ? (
        <div className="notice danger" role="alert">
          <strong>Information-time check failed.</strong> {error}
        </div>
      ) : null}

      {res ? (
        <>
          <div className="stats">
            <SummaryCard
              title={`Pre CAR (days −${params.pre} to −1)`}
              s={res.pre}
              testId="car-pre"
            />
            <SummaryCard
              title={`Post CAR (day 0 to +${params.post})`}
              s={res.post}
              testId="car-post"
            />
            <div className="stat">
              <h4>Events</h4>
              <p className="big">
                {res.included.length} / {res.rows.length}
              </p>
              <p className="small">included / matching</p>
              <p className="small">
                {res.included.filter((r) => r.overlaps).length} with overlapping windows
              </p>
            </div>
          </div>
          {res.rows.length === 0 ? (
            <p className="notice warn">No events match this series and filter.</p>
          ) : null}
          <div className="card">
            <h3>Mean cumulative abnormal return by session offset</h3>
            <PathChart
              pre={params.pre}
              meanPath={res.meanPath}
              paths={res.included.map((r) => r.path)}
              label={`Mean cumulative abnormal return of ${res.included.length} events from day −${params.pre} to +${params.post}; thin lines are single events; the shaded band starts at day 0`}
            />
            <p className="legend small">
              Thick line: mean across included events. Thin lines: single events. Shaded: day 0
              onward (after publication). Sample size n = {res.included.length}; with so few events
              the mean is fragile.
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <caption>
                Per-event calculation (all matching events, including excluded ones)
              </caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Event / txn</th>
                  <th scope="col">Published</th>
                  <th scope="col">Delay</th>
                  <th scope="col">Day 0</th>
                  <th scope="col">Baseline (n)</th>
                  <th scope="col">Pre CAR</th>
                  <th scope="col">Post CAR</th>
                  <th scope="col">Raw post</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={r.event.id} data-row={r.event.id}>
                    <th scope="row">
                      {r.event.id}
                      <span className="muted small"> {r.event.kind}</span>
                    </th>
                    <td>{r.event.eventDate}</td>
                    <td>{r.event.publishedAt}</td>
                    <td className="num">{r.delayDays} d</td>
                    <td data-testid={`study-day0-${r.event.id}`}>{r.anchorDate ?? '—'}</td>
                    <td>
                      {r.baselineFrom ? `${r.baselineFrom} to ${r.baselineTo} (${r.nBase})` : '—'}
                    </td>
                    <td className="num">{pct(r.carPre)}</td>
                    <td className="num" data-testid={`study-post-${r.event.id}`}>
                      {pct(r.carPost)}
                    </td>
                    <td className="num">{pct(r.rawPost)}</td>
                    <td>
                      {r.excluded ? (
                        <span className="badge warn">
                          excluded: {r.excluded.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      ) : (
                        'included'
                      )}
                      {r.overlaps ? <span className="badge warn">overlaps</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>{series.name}</h3>
            <PriceChart
              series={series}
              events={res.rows.map((r) => r.event)}
              selectedId={null}
              label={`${series.name} with the studied events marked: dots at the event or transaction date, vertical lines at day 0`}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
