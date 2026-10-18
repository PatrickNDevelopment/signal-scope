/** Small hand-built SVG charts. Every chart also has a table or text equivalent next to it. */
import {
  anchorIndex,
  lastOnOrBefore,
  type Correlation,
  type MarketEvent,
  type Series,
} from '../engine';
import { pct } from '../lib/format';

const W = 760;

function ticks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + i * step);
}

export function PriceChart(props: {
  series: Series;
  events: readonly MarketEvent[];
  selectedId: string | null;
  label: string;
}) {
  const { series, events, selectedId } = props;
  const H = 260;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const pts = series.points;
  const vals = pts.map((p) => p.value).filter((v): v is number => v !== null);
  if (pts.length < 2 || vals.length < 2) return <p className="muted">Not enough points to draw.</p>;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const x = (i: number): number => pad.l + (i / (pts.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number): number => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  // Break the line at missing values instead of joining across gaps.
  let d = '';
  let pen = false;
  pts.forEach((p, i) => {
    if (p.value === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    pen = true;
  });
  const dates = pts.map((p) => p.date);
  const fmt = (v: number): string =>
    series.kind === 'probability' ? `${Math.round(v * 100)} %` : v.toFixed(v >= 100 ? 0 : 2);
  const marks = events
    .filter((e) => e.symbols.includes(series.id))
    .map((e) => ({ e, ti: lastOnOrBefore(dates, e.eventDate), ai: anchorIndex(dates, e) }))
    .filter((m) => m.ti >= 0 || m.ai >= 0);
  const yearTicks: { i: number; label: string }[] = [];
  dates.forEach((dt, i) => {
    if (i === 0 || dt.slice(0, 4) !== (dates[i - 1] as string).slice(0, 4))
      yearTicks.push({ i, label: dt.slice(0, 4) });
  });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label}>
      <title>{props.label}</title>
      {ticks(lo, hi).map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis">
            {fmt(v)}
          </text>
        </g>
      ))}
      {yearTicks.map((t) => (
        <text key={t.i} x={x(t.i)} y={H - 8} className="axis" textAnchor="start">
          {t.label}
        </text>
      ))}
      {marks.map(({ e, ti, ai }) => {
        const sel = e.id === selectedId;
        const cls = `mark mark-${e.kind}${sel ? ' sel' : ''}`;
        const top = pad.t + 2;
        return (
          <g key={e.id} className={cls}>
            {ti >= 0 && ai >= 0 && ai !== ti ? (
              <line x1={x(ti)} x2={x(ai)} y1={top + 4} y2={top + 4} className="delay" />
            ) : null}
            {ti >= 0 ? <circle cx={x(ti)} cy={top + 4} r={sel ? 5 : 3.5} className="txn" /> : null}
            {ai >= 0 ? (
              <line x1={x(ai)} x2={x(ai)} y1={top} y2={H - pad.b} className="anchor" />
            ) : null}
          </g>
        );
      })}
      <path d={d} className="line" />
    </svg>
  );
}

export function PathChart(props: {
  pre: number;
  meanPath: number[];
  paths: number[][];
  label: string;
}) {
  const { pre, meanPath, paths } = props;
  const H = 240;
  const pad = { l: 56, r: 12, t: 12, b: 30 };
  if (meanPath.length < 2) return <p className="muted">No included events to draw.</p>;
  const all = [...meanPath, ...paths.flat(), 0];
  const lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi === lo) hi = lo + 0.01;
  const n = meanPath.length;
  const x = (k: number): number => pad.l + (k / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number): number => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = (p: number[]): string =>
    p.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label}>
      <title>{props.label}</title>
      {ticks(lo, hi).map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis">
            {pct(v, 1)}
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="zero" />
      <rect
        x={x(pre) - (x(1) - x(0)) / 2}
        y={pad.t}
        width={W - pad.r - x(pre) + (x(1) - x(0)) / 2}
        height={H - pad.t - pad.b}
        className="postband"
      />
      {meanPath.map((_, k) => (
        <text key={k} x={x(k)} y={H - 10} textAnchor="middle" className="axis">
          {k - pre}
        </text>
      ))}
      {paths.map((p, i) => (
        <path key={i} d={line(p)} className="thin" />
      ))}
      <path d={line(meanPath)} className="line" />
    </svg>
  );
}

export function CorrBars(props: { data: Correlation[]; label: string }) {
  const H = 200;
  const pad = { l: 44, r: 12, t: 12, b: 30 };
  const n = props.data.length;
  if (n === 0) return null;
  const bw = (W - pad.l - pad.r) / n;
  const y = (v: number): number => pad.t + (1 - (v + 1) / 2) * (H - pad.t - pad.b);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label}>
      <title>{props.label}</title>
      {[-1, -0.5, 0, 0.5, 1].map((v) => (
        <g key={v}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(v)}
            y2={y(v)}
            className={v === 0 ? 'zero' : 'grid'}
          />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis">
            {v}
          </text>
        </g>
      ))}
      {props.data.map((c, i) => {
        const r = Number.isFinite(c.r) ? c.r : 0;
        const top = Math.min(y(r), y(0));
        return (
          <g key={c.lag}>
            <rect
              x={pad.l + i * bw + bw * 0.15}
              width={bw * 0.7}
              y={top}
              height={Math.abs(y(r) - y(0))}
              className={c.lag === 0 ? 'bar bar-zero' : 'bar'}
            />
            <text x={pad.l + i * bw + bw / 2} y={H - 10} textAnchor="middle" className="axis">
              {c.lag}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
