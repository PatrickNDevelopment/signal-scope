/** Exploratory rule builder and a basic historical backtest. Descriptive observations only. */
import { useMemo } from 'react';
import {
  backtest,
  evaluateRule,
  evidenceOf,
  LookaheadError,
  ruleProblems,
  type BacktestResult,
  type Condition,
  type MarketEvent,
  type PeriodStats,
  type Rule,
  type RuleResult,
  type Series,
} from '../engine';
import { download } from '../lib/files';
import { DISCLAIMER, pct } from '../lib/format';
import { hitsCsv, tradesCsv } from '../lib/exports';

const TYPES: { type: Condition['type']; label: string }[] = [
  { type: 'event_recent', label: 'Event published recently' },
  { type: 'volume_shock', label: 'Volume shock (z-score)' },
  { type: 'rsi_below', label: 'RSI below' },
  { type: 'rsi_above', label: 'RSI above' },
  { type: 'return_below', label: 'Trailing return at or below' },
  { type: 'prob_change', label: 'Probability change at or above' },
];

function defaultCondition(type: Condition['type'], probId: string): Condition {
  switch (type) {
    case 'event_recent':
      return { type, kind: 'catalyst', direction: 'any', days: 3 };
    case 'volume_shock':
      return { type, n: 20, zMin: 1 };
    case 'rsi_below':
      return { type, level: 30 };
    case 'rsi_above':
      return { type, level: 70 };
    case 'return_below':
      return { type, h: 5, pct: -5 };
    case 'prob_change':
      return { type, seriesId: probId, h: 5, ppMin: 5 };
  }
}

function NumIn(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  int?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (!Number.isFinite(raw) || e.target.value === '') return;
          const v = props.int ? Math.round(raw) : raw;
          props.onChange(Math.min(props.max, Math.max(props.min, v)));
        }}
      />
    </label>
  );
}

function ConditionEditor(props: {
  c: Condition;
  index: number;
  probSeries: Series[];
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const { c } = props;
  const probId = props.probSeries[0]?.id ?? '';
  return (
    <fieldset className="condition">
      <legend>
        Condition {props.index + 1}{' '}
        <span className={`badge ev-${evidenceOf(c)}`}>{evidenceOf(c)}</span>
      </legend>
      <label>
        Type
        <select
          value={c.type}
          onChange={(e) =>
            props.onChange(defaultCondition(e.target.value as Condition['type'], probId))
          }
        >
          {TYPES.map((t) => (
            <option
              key={t.type}
              value={t.type}
              disabled={t.type === 'prob_change' && props.probSeries.length === 0}
            >
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {c.type === 'event_recent' ? (
        <>
          <label>
            Kind
            <select
              value={c.kind}
              onChange={(e) => props.onChange({ ...c, kind: e.target.value as typeof c.kind })}
            >
              <option value="catalyst">catalyst</option>
              <option value="disclosure">disclosure</option>
              <option value="prediction">prediction</option>
            </select>
          </label>
          <label>
            Direction
            <select
              value={c.direction ?? 'any'}
              onChange={(e) =>
                props.onChange({ ...c, direction: e.target.value as typeof c.direction })
              }
            >
              <option value="any">any</option>
              <option value="up">up</option>
              <option value="down">down</option>
              <option value="buy">buy</option>
              <option value="sell">sell</option>
            </select>
          </label>
          <NumIn
            label="Within sessions after day 0"
            value={c.days}
            min={1}
            max={250}
            int
            onChange={(days) => props.onChange({ ...c, days })}
          />
        </>
      ) : null}
      {c.type === 'volume_shock' ? (
        <>
          <NumIn
            label="Lookback sessions"
            value={c.n}
            min={5}
            max={250}
            int
            onChange={(n) => props.onChange({ ...c, n })}
          />
          <NumIn
            label="z at least"
            value={c.zMin}
            min={-10}
            max={10}
            step={0.1}
            onChange={(zMin) => props.onChange({ ...c, zMin })}
          />
        </>
      ) : null}
      {c.type === 'rsi_below' || c.type === 'rsi_above' ? (
        <NumIn
          label="RSI level"
          value={c.level}
          min={0}
          max={100}
          onChange={(level) => props.onChange({ ...c, level })}
        />
      ) : null}
      {c.type === 'return_below' ? (
        <>
          <NumIn
            label="Over sessions"
            value={c.h}
            min={1}
            max={250}
            int
            onChange={(h) => props.onChange({ ...c, h })}
          />
          <NumIn
            label="Return % at most"
            value={c.pct}
            min={-100}
            max={1000}
            step={0.5}
            onChange={(p) => props.onChange({ ...c, pct: p })}
          />
        </>
      ) : null}
      {c.type === 'prob_change' ? (
        <>
          <label>
            Probability series
            <select
              value={c.seriesId}
              onChange={(e) => props.onChange({ ...c, seriesId: e.target.value })}
            >
              {props.probSeries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          </label>
          <NumIn
            label="Over sessions"
            value={c.h}
            min={1}
            max={250}
            int
            onChange={(h) => props.onChange({ ...c, h })}
          />
          <NumIn
            label="Change (pp) at least"
            value={c.ppMin}
            min={-100}
            max={100}
            step={0.5}
            onChange={(ppMin) => props.onChange({ ...c, ppMin })}
          />
        </>
      ) : null}
      <button
        type="button"
        className="secondary small"
        onClick={props.onRemove}
        aria-label={`Remove condition ${props.index + 1}`}
      >
        Remove
      </button>
    </fieldset>
  );
}

function StatsRow(props: { name: string; s: PeriodStats }) {
  const { s } = props;
  return (
    <tr data-testid={`bt-${props.name}`}>
      <th scope="row">{props.name}</th>
      <td className="num">{s.trades}</td>
      <td className="num">{pct(s.meanNet)}</td>
      <td className="num">{pct(s.medianNet)}</td>
      <td className="num">
        {Number.isFinite(s.hitRate) ? `${Math.round(s.hitRate * 100)} %` : '—'}
      </td>
      <td className="num">{pct(s.compounded)}</td>
      <td className="num">{pct(s.maxDrawdown)}</td>
      <td className="num">{pct(s.buyHold)}</td>
      <td>
        {s.badges.length ? (
          s.badges.map((b) => (
            <span key={b} className="badge warn">
              {b}
            </span>
          ))
        ) : (
          <span className="badge">n ok</span>
        )}
      </td>
    </tr>
  );
}

export function RulesView(props: {
  series: Series[];
  events: MarketEvent[];
  rule: Rule;
  split: string;
  costBps: number;
  onRule: (r: Rule) => void;
  onSplit: (s: string) => void;
  onCost: (c: number) => void;
}) {
  const { rule, series, events } = props;
  const priceSeries = series.filter((s) => s.kind === 'price');
  const probSeries = series.filter((s) => s.kind === 'probability');
  const problems = useMemo(() => ruleProblems(rule, series), [rule, series]);
  const target = series.find((s) => s.id === rule.targetId);

  const out = useMemo((): {
    hits: RuleResult | null;
    bt: BacktestResult | null;
    error: string | null;
  } => {
    if (problems.length) return { hits: null, bt: null, error: null };
    try {
      return {
        hits: evaluateRule(rule, series, events),
        bt: backtest(rule, series, events, props.split, props.costBps),
        error: null,
      };
    } catch (e) {
      if (e instanceof LookaheadError) return { hits: null, bt: null, error: e.message };
      throw e;
    }
  }, [problems, rule, series, events, props.split, props.costBps]);

  if (priceSeries.length === 0) {
    return (
      <section aria-labelledby="rules-h">
        <h2 id="rules-h">Rule explorer and backtest</h2>
        <div className="card empty">
          <p>Load a price series on the Data page first.</p>
          <a href="#/data">Go to Data</a>
        </div>
      </section>
    );
  }
  const setC = (i: number, c: Condition) =>
    props.onRule({ ...rule, conditions: rule.conditions.map((x, j) => (j === i ? c : x)) });
  const first = target?.points[0]?.date ?? '';
  const lastD = target?.points[target.points.length - 1]?.date ?? '';

  return (
    <section aria-labelledby="rules-h">
      <h2 id="rules-h">Rule explorer and backtest</h2>
      <div className="notice warn">
        This explores what happened historically when several kinds of evidence lined up. It does
        not forecast, does not trade, and a good-looking history is often luck, overfitting or a
        small sample. {DISCLAIMER}
      </div>
      <fieldset className="card">
        <legend>Rule</legend>
        <div className="form-grid">
          <label>
            Name
            <input
              value={rule.name}
              maxLength={80}
              onChange={(e) => props.onRule({ ...rule, name: e.target.value })}
            />
          </label>
          <label>
            Target price series
            <select
              value={rule.targetId}
              onChange={(e) => props.onRule({ ...rule, targetId: e.target.value })}
            >
              {priceSeries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          </label>
          <NumIn
            label="Holding horizon (sessions)"
            value={rule.horizon}
            min={1}
            max={60}
            int
            onChange={(horizon) => props.onRule({ ...rule, horizon })}
          />
        </div>
        <p className="small muted">
          All conditions must hold at a session&apos;s close (the signal). Entry is the next
          session; exit is {rule.horizon} sessions after entry. Conditions only see data dated on or
          before the signal, and events only from their day 0.
        </p>
        <div className="conditions">
          {rule.conditions.map((c, i) => (
            <ConditionEditor
              key={i}
              c={c}
              index={i}
              probSeries={probSeries}
              onChange={(nc) => setC(i, nc)}
              onRemove={() =>
                props.onRule({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) })
              }
            />
          ))}
        </div>
        <button
          type="button"
          className="secondary"
          disabled={rule.conditions.length >= 6}
          onClick={() =>
            props.onRule({
              ...rule,
              conditions: [
                ...rule.conditions,
                defaultCondition('rsi_below', probSeries[0]?.id ?? ''),
              ],
            })
          }
        >
          Add condition
        </button>
        {problems.length ? (
          <div className="notice danger" role="alert">
            <strong>The rule cannot run yet:</strong>
            <ul>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </fieldset>

      {out.error ? (
        <div className="notice danger" role="alert">
          <strong>Information-time check failed; no results are shown.</strong> {out.error}
        </div>
      ) : null}

      {out.hits ? (
        <div className="card">
          <div className="row-between">
            <h3>Historical observations</h3>
            <button
              type="button"
              onClick={() =>
                out.hits &&
                download(
                  `signal-scope-rule-hits-${rule.targetId}.csv`,
                  hitsCsv(rule, out.hits, series, events),
                  'text/csv',
                )
              }
            >
              Export hits CSV
            </button>
          </div>
          <p data-testid="hits-summary">
            The rule fired on <strong>{out.hits.hits.length}</strong> of {out.hits.evaluated}{' '}
            sessions. Forward {rule.horizon}-session return after entry: mean{' '}
            {pct(out.hits.summary.mean)}, median {pct(out.hits.summary.median)},{' '}
            {out.hits.summary.n
              ? `${Math.round(out.hits.summary.sharePositive * 100)} % positive`
              : 'no complete observations'}{' '}
            <span className="badge">
              n = {out.hits.summary.n} · {out.hits.summary.badge}
            </span>
            {out.hits.withoutForward
              ? ` (${out.hits.withoutForward} recent signals have no complete forward window yet.)`
              : ''}
          </p>
          <p className="small ok-text">
            Information-time check passed for every signal: inputs dated on or before the signal,
            entry strictly after it.
          </p>
        </div>
      ) : null}

      <fieldset className="card">
        <legend>Backtest settings</legend>
        <div className="form-grid">
          <label>
            Train / test split date
            <input
              type="date"
              value={props.split}
              min={first}
              max={lastD}
              onChange={(e) => e.target.value && props.onSplit(e.target.value)}
            />
          </label>
          <NumIn
            label="Cost per side (bps)"
            value={props.costBps}
            min={0}
            max={500}
            onChange={props.onCost}
          />
        </div>
        <p className="small muted">
          Trades that enter before the split are &quot;train&quot;, the rest &quot;test&quot;. Treat
          train as where you looked for the rule and test as the only fairer check. Costs are
          charged on entry and exit. One position at a time; signals while in a position are
          skipped.
        </p>
      </fieldset>

      {out.bt ? (
        <div className="card">
          <div className="row-between">
            <h3>Backtest (historical, simplified)</h3>
            <button
              type="button"
              onClick={() =>
                out.bt &&
                download(
                  `signal-scope-backtest-${rule.targetId}.csv`,
                  tradesCsv(rule, out.bt, series, events),
                  'text/csv',
                )
              }
            >
              Export trades CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Trades</th>
                  <th scope="col">Mean net</th>
                  <th scope="col">Median net</th>
                  <th scope="col">Hit rate</th>
                  <th scope="col">Compounded</th>
                  <th scope="col">Max drawdown</th>
                  <th scope="col">Buy and hold</th>
                  <th scope="col">Uncertainty</th>
                </tr>
              </thead>
              <tbody>
                <StatsRow name="train" s={out.bt.train} />
                <StatsRow name="test" s={out.bt.test} />
              </tbody>
            </table>
          </div>
          <p className="small muted">
            {out.bt.skippedWhileInPosition} signals skipped while in a position.{' '}
            {out.bt.trades.filter((t) => t.crossesSplit).length} train trades exit after the split.
            Buy and hold is the same period&apos;s price change, before costs, for comparison.
          </p>
          {out.bt.trades.length ? (
            <details>
              <summary>Trades ({out.bt.trades.length})</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Period</th>
                      <th scope="col">Signal</th>
                      <th scope="col">Entry</th>
                      <th scope="col">Exit</th>
                      <th scope="col">Gross</th>
                      <th scope="col">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {out.bt.trades.map((t) => (
                      <tr key={t.signal}>
                        <td>{t.period}</td>
                        <th scope="row">{t.signal}</th>
                        <td>{t.entry}</td>
                        <td>{t.exit}</td>
                        <td className="num">{pct(t.gross)}</td>
                        <td className="num">{pct(t.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : (
            <p className="muted">No trades in this history.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
