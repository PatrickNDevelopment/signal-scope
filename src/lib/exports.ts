/** CSV exports of calculation summaries. Each starts with provenance and parameter comments. */
import {
  rollingVol,
  returns,
  rsi,
  toCsv,
  volumeShock,
  type BacktestResult,
  type MarketEvent,
  type Rule,
  type RuleResult,
  type Series,
  type StudyResult,
} from '../engine';
import { DISCLAIMER } from './format';

const TIME_RULE =
  'Information time: day 0 is the first session strictly after publication; signals act from the next session.';

function provenanceLines(series: readonly Series[], events: readonly MarketEvent[]): string[] {
  const out = series.map(
    (s) =>
      `Series ${s.id}: ${s.provenance.source} (access ${s.provenance.access}, retrieved ${s.provenance.retrievedAt}${s.provenance.sample ? ', SAMPLE DATA' : ''})`,
  );
  const sources = new Map<string, string>();
  for (const e of events) {
    const k = `${e.provenance.source}|${e.provenance.access}|${e.provenance.sample}`;
    sources.set(
      k,
      `Events from ${e.provenance.source} (access ${e.provenance.access}${e.provenance.sample ? ', SAMPLE DATA' : ''})`,
    );
  }
  return [...out, ...sources.values()];
}

export function studyCsv(res: StudyResult, series: Series): string {
  const p = res.params;
  const comments = [
    'SignalScope event study',
    DISCLAIMER,
    TIME_RULE,
    ...provenanceLines(
      [series],
      res.rows.map((r) => r.event),
    ),
    `Parameters: series ${res.seriesId}; estimation ${p.estimation} sessions; pre ${p.pre}; post ${p.post} (day 0 to +${p.post}); kinds ${p.kinds.join('+')}; direction ${p.direction}`,
    'Abnormal return = simple return minus the mean return over the estimation window. CAR = sum of abnormal returns.',
  ];
  const header = [
    'event_id',
    'kind',
    'label',
    'event_date',
    'published_at',
    'delay_days',
    'day0',
    'baseline_from',
    'baseline_to',
    'baseline_n',
    'baseline_mean',
    'baseline_sd',
    'car_pre',
    'car_post',
    'raw_pre',
    'raw_post',
    'excluded',
    'overlaps',
  ];
  const rows: (string | number | null)[][] = res.rows.map((r) => [
    r.event.id,
    r.event.kind,
    r.event.label,
    r.event.eventDate,
    r.event.publishedAt,
    r.delayDays,
    r.anchorDate,
    r.baselineFrom,
    r.baselineTo,
    r.nBase,
    r.mu,
    r.sigma,
    r.carPre,
    r.carPost,
    r.rawPre,
    r.rawPost,
    r.excluded ?? '',
    r.overlaps ? 'yes' : 'no',
  ]);
  rows.push([]);
  rows.push([
    'aggregate',
    'n',
    'mean',
    'median',
    'sd',
    'low95',
    'high95',
    'share_positive',
    'badge',
  ]);
  for (const [name, s] of [
    ['car_pre', res.pre],
    ['car_post', res.post],
  ] as const) {
    rows.push([name, s.n, s.mean, s.median, s.sd, s.low95, s.high95, s.sharePositive, s.badge]);
  }
  return toCsv(comments, header, rows);
}

export function indicatorsCsv(series: Series, volN: number, rsiN: number, shockN: number): string {
  const r = returns(series);
  const vol = rollingVol(r, volN);
  const x = rsi(series, rsiN);
  const z = volumeShock(series, shockN);
  return toCsv(
    [
      'SignalScope indicators',
      DISCLAIMER,
      ...provenanceLines([series], []),
      `Rolling volatility ${volN} sessions (sample sd of daily returns); Wilder RSI ${rsiN}; volume z-score vs prior ${shockN} sessions`,
    ],
    ['date', 'value', 'volume', 'return', `vol_${volN}`, `rsi_${rsiN}`, `volume_z_${shockN}`],
    series.points.map((p, i) => [p.date, p.value, p.volume, r[i], vol[i], x[i], z[i]]),
  );
}

export function hitsCsv(
  rule: Rule,
  res: RuleResult,
  series: readonly Series[],
  events: readonly MarketEvent[],
): string {
  return toCsv(
    [
      'SignalScope rule hits',
      DISCLAIMER,
      TIME_RULE,
      ...provenanceLines(series, events),
      `Rule "${rule.name}" on ${rule.targetId}; horizon ${rule.horizon} sessions; conditions ${JSON.stringify(rule.conditions)}`,
    ],
    ['signal', 'entry', 'exit', 'forward_return'],
    res.hits.map((h) => [h.signal, h.entry, h.exit, h.forward]),
  );
}

export function tradesCsv(
  rule: Rule,
  bt: BacktestResult,
  series: readonly Series[],
  events: readonly MarketEvent[],
): string {
  const rows: (string | number | null)[][] = bt.trades.map((t) => [
    t.period,
    t.signal,
    t.entry,
    t.exit,
    t.gross,
    t.net,
    t.crossesSplit ? 'yes' : 'no',
  ]);
  rows.push([]);
  rows.push([
    'period',
    'trades',
    'mean_net',
    'median_net',
    'hit_rate',
    'compounded',
    'max_drawdown',
    'buy_hold',
    'badges',
  ]);
  for (const [name, s] of [
    ['train', bt.train],
    ['test', bt.test],
  ] as const) {
    rows.push([
      name,
      s.trades,
      s.meanNet,
      s.medianNet,
      s.hitRate,
      s.compounded,
      s.maxDrawdown,
      s.buyHold,
      s.badges.join('; '),
    ]);
  }
  return toCsv(
    [
      'SignalScope backtest',
      DISCLAIMER,
      TIME_RULE,
      ...provenanceLines(series, events),
      `Rule "${rule.name}" on ${rule.targetId}; horizon ${rule.horizon}; split ${bt.split} (trades entering before it are train); cost ${bt.costBps} bps per side; one position at a time`,
    ],
    ['period', 'signal', 'entry', 'exit', 'gross', 'net', 'crosses_split'],
    rows,
  );
}
