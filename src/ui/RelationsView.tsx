/** Indicators for one series and lagged correlations between two series. Descriptive only. */
import { useMemo, useState } from 'react';
import {
  correlations,
  returns,
  rollingVol,
  rsi,
  uncertaintyBadge,
  volumeShock,
  type Series,
} from '../engine';
import { download } from '../lib/files';
import { DISCLAIMER, num, pct } from '../lib/format';
import { indicatorsCsv } from '../lib/exports';
import { CorrBars } from './charts';

function last<T>(xs: readonly (T | undefined)[]): { v: T | undefined; i: number } {
  for (let i = xs.length - 1; i >= 0; i -= 1) if (xs[i] !== undefined) return { v: xs[i], i };
  return { v: undefined, i: -1 };
}

export function RelationsView(props: { series: Series[] }) {
  const all = props.series;
  const [aId, setA] = useState<string | null>(null);
  const [bId, setB] = useState<string | null>(null);
  const [maxLag, setMaxLag] = useState(5);
  const a = all.find((s) => s.id === aId) ?? all[0];
  const b = all.find((s) => s.id === bId) ?? all.find((s) => s.id !== a?.id) ?? all[0];

  const ind = useMemo(() => {
    if (!a) return null;
    const r = returns(a);
    return {
      vol: last(rollingVol(r, 20)),
      rsi: last(rsi(a, 14)),
      z: last(volumeShock(a, 20)),
      missing: r.filter((x) => x === undefined).length - 1,
    };
  }, [a]);
  const corr = useMemo(
    () => (a && b && a.id !== b.id ? correlations(a, b, maxLag) : []),
    [a, b, maxLag],
  );

  if (!a || !ind) {
    return (
      <section aria-labelledby="rel-h">
        <h2 id="rel-h">Indicators and relationships</h2>
        <div className="card empty">
          <p>Load series on the Data page first.</p>
          <a href="#/data">Go to Data</a>
        </div>
      </section>
    );
  }
  const at = (i: number): string => a.points[i]?.date ?? '—';
  const n0 = corr.find((c) => c.lag === 0)?.n ?? 0;

  return (
    <section aria-labelledby="rel-h">
      <h2 id="rel-h">Indicators and relationships</h2>
      <div className="card">
        <div className="row-between">
          <h3>Indicators</h3>
          <div className="inline-group">
            <label className="inline">
              Series
              <select value={a.id} onChange={(e) => setA(e.target.value)}>
                {all.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                download(
                  `signal-scope-indicators-${a.id}.csv`,
                  indicatorsCsv(a, 20, 14, 20),
                  'text/csv',
                )
              }
            >
              Export indicators CSV
            </button>
          </div>
        </div>
        <dl className="kv">
          <div>
            <dt>Rolling volatility (20 sessions, daily sd)</dt>
            <dd>
              {pct(ind.vol.v)} <span className="muted small">at {at(ind.vol.i)}</span>
            </dd>
          </div>
          <div>
            <dt>RSI (Wilder, 14)</dt>
            <dd>
              {num(ind.rsi.v, 1)} <span className="muted small">at {at(ind.rsi.i)}</span>
            </dd>
          </div>
          <div>
            <dt>Volume shock (z vs prior 20 sessions)</dt>
            <dd>
              {a.points.some((p) => p.volume !== null) ? (
                <>
                  {num(ind.z.v, 2)} <span className="muted small">at {at(ind.z.i)}</span>
                </>
              ) : (
                'no volume in this series'
              )}
            </dd>
          </div>
          <div>
            <dt>Sessions without a computable return</dt>
            <dd>{ind.missing}</dd>
          </div>
        </dl>
        <p className="small muted">
          Latest defined values. The CSV export has every session; undefined values are left blank,
          never zero.
        </p>
      </div>

      <div className="card">
        <h3>Lagged correlation of daily returns</h3>
        {all.length < 2 ? (
          <p className="muted">Load a second series to compare.</p>
        ) : (
          <>
            <div className="inline-group">
              <label className="inline">
                A
                <select value={a.id} onChange={(e) => setA(e.target.value)}>
                  {all.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline">
                B
                <select value={b?.id} onChange={(e) => setB(e.target.value)}>
                  {all.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline">
                Max lag
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={maxLag}
                  onChange={(e) =>
                    setMaxLag(Math.min(20, Math.max(0, Math.round(Number(e.target.value)) || 0)))
                  }
                />
              </label>
            </div>
            {a.id === b?.id ? (
              <p className="notice warn">Choose two different series.</p>
            ) : (
              <>
                <CorrBars
                  data={corr}
                  label={`Pearson correlation between ${a.id} and ${b?.id} daily returns for lags −${maxLag} to +${maxLag}`}
                />
                <p className="notice info small">
                  Lag k pairs {a.id}&apos;s return on a day with {b?.id}&apos;s return k sessions
                  later (matched by date). This describes co-movement in this sample only (n = {n0}{' '}
                  matched days at lag 0, {uncertaintyBadge(n0)}). It does not show that one market
                  causes the other, and a lagged correlation in history is not a forecast.{' '}
                  {DISCLAIMER}
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Lag</th>
                        <th scope="col">r</th>
                        <th scope="col">n</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corr.map((c) => (
                        <tr key={c.lag}>
                          <th scope="row">{c.lag}</th>
                          <td className="num">{num(c.r, 3)}</td>
                          <td className="num">{c.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
