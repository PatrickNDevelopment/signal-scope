import { useEffect, useMemo, useState } from 'react';
import {
  buildSampleMarket,
  DEFAULT_STUDY,
  emptyWorkspace,
  type Rule,
  type SavedConfig,
  type StudyParams,
  type Workspace,
} from './engine';
import { download } from './lib/files';
import { DISCLAIMER } from './lib/format';
import { loadSettings, loadWorkspace, saveSettings, saveWorkspace } from './lib/storage';
import { DataView } from './ui/DataView';
import { RelationsView } from './ui/RelationsView';
import { RulesView } from './ui/RulesView';
import { About, SavedView } from './ui/SavedView';
import { StudyView } from './ui/StudyView';

type Route = 'data' | 'study' | 'relations' | 'rules' | 'saved' | 'about';
const ROUTES: { id: Route; label: string }[] = [
  { id: 'data', label: 'Data' },
  { id: 'study', label: 'Event study' },
  { id: 'relations', label: 'Indicators' },
  { id: 'rules', label: 'Rules & backtest' },
  { id: 'saved', label: 'Saved' },
  { id: 'about', label: 'About' },
];

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.some((r) => r.id === h) ? (h as Route) : 'data';
}

interface Settings {
  seriesId: string;
  study: StudyParams;
  rule: Rule;
  split: string;
  costBps: number;
}

function defaultRule(targetId: string): Rule {
  return {
    name: 'Catalyst with a volume shock',
    targetId,
    horizon: 5,
    conditions: [
      { type: 'event_recent', kind: 'catalyst', direction: 'any', days: 3 },
      { type: 'volume_shock', n: 20, zMin: 1 },
    ],
  };
}

function initialSettings(): Settings {
  const s = loadSettings();
  if (s)
    return {
      seriesId: s.seriesId,
      study: s.study,
      rule: s.rule,
      split: s.split,
      costBps: s.costBps,
    };
  return {
    seriesId: '',
    study: DEFAULT_STUDY,
    rule: defaultRule(''),
    split: '1900-01-01',
    costBps: 10,
  };
}

type Boot = { ws: Workspace; notice: { raw: string; errors: string[] } | null };

function boot(): Boot {
  const r = loadWorkspace();
  if (r.kind === 'ok') return { ws: r.workspace, notice: null };
  if (r.kind === 'recovered')
    return { ws: emptyWorkspace(), notice: { raw: r.raw, errors: r.errors } };
  return { ws: emptyWorkspace(), notice: null };
}

export function App() {
  const [start] = useState(boot);
  const [ws, setWs] = useState<Workspace>(start.ws);
  const [recovered, setRecovered] = useState(start.notice);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [message, setMessage] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const [chartSeriesId, setChartSeriesId] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    document.title = `${ROUTES.find((r) => r.id === route)?.label ?? ''} · SignalScope`;
  }, [route]);

  const priceSeries = useMemo(() => ws.series.filter((s) => s.kind === 'price'), [ws.series]);
  const studySeries = priceSeries.find((s) => s.id === settings.seriesId) ?? priceSeries[0] ?? null;
  const rule = useMemo(
    () =>
      priceSeries.some((s) => s.id === settings.rule.targetId)
        ? settings.rule
        : { ...settings.rule, targetId: priceSeries[0]?.id ?? '' },
    [priceSeries, settings.rule],
  );
  const split = useMemo(() => {
    const t = priceSeries.find((s) => s.id === rule.targetId);
    if (!t || t.points.length < 2) return settings.split;
    const first = t.points[0]?.date as string;
    const last = t.points[t.points.length - 1]?.date as string;
    if (settings.split > first && settings.split <= last) return settings.split;
    return t.points[Math.floor(t.points.length * 0.7)]?.date ?? settings.split;
  }, [priceSeries, rule.targetId, settings.split]);

  const current = useMemo(
    () => ({
      seriesId: studySeries?.id ?? '',
      study: settings.study,
      rule: { ...rule, name: rule.name.trim().slice(0, 80) || 'Untitled rule' },
      split,
      costBps: settings.costBps,
    }),
    [studySeries, settings.study, rule, split, settings.costBps],
  );
  useEffect(() => {
    saveSettings({ name: 'current', savedAt: '', ...current });
  }, [current]);

  const anySample =
    ws.series.some((s) => s.provenance.sample) || ws.events.some((e) => e.provenance.sample);

  /** Every workspace change is saved immediately; a storage failure is shown, not hidden. */
  function commitWs(next: Workspace) {
    setWs(next);
    setStorageError(saveWorkspace(next));
  }

  function change(next: Workspace, msg: string) {
    commitWs(next);
    setMessage(msg);
  }

  function loadSample() {
    const m = buildSampleMarket();
    const sids = new Set(m.series.map((s) => s.id));
    const eids = new Set(m.events.map((e) => e.id));
    commitWs({
      ...ws,
      series: [...ws.series.filter((s) => !sids.has(s.id)), ...m.series],
      events: [...ws.events.filter((e) => !eids.has(e.id)), ...m.events],
    });
    setSettings((s) => ({ ...s, seriesId: 'SMPL-A', rule: defaultRule('SMPL-A') }));
    setMessage(
      `Loaded the synthetic sample market: ${m.series.length} series and ${m.events.length} events.`,
    );
  }

  function saveConfig(name: string) {
    const c: SavedConfig = { name, savedAt: new Date().toISOString(), ...current };
    const others = ws.configs.filter((x) => x.name !== name);
    if (others.length >= 50)
      return setMessage('At most 50 configurations can be saved; delete one first.');
    change({ ...ws, configs: [c, ...others] }, `Saved configuration "${name}".`);
  }

  function loadConfig(c: SavedConfig) {
    setSettings({
      seriesId: c.seriesId,
      study: c.study,
      rule: c.rule,
      split: c.split,
      costBps: c.costBps,
    });
    const missing = [c.seriesId, c.rule.targetId].filter(
      (id) => !priceSeries.some((s) => s.id === id),
    );
    setMessage(
      `Loaded configuration "${c.name}".${missing.length ? ` Series ${[...new Set(missing)].join(', ')} is not loaded, so the first price series is used instead.` : ''}`,
    );
  }

  return (
    <div className="app">
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          // Hash routing: following "#main" would replace the route and open the Data page.
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="top">
        <div className="brand">
          <h1>SignalScope</h1>
          <p className="small muted">Historical event studies with publication-time discipline</p>
        </div>
        <nav aria-label="Sections">
          <ul>
            {ROUTES.map((r) => (
              <li key={r.id}>
                <a href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {anySample ? (
        <div className="sample-banner" role="note" data-testid="sample-banner">
          <strong>Sample data loaded.</strong> Synthetic, seeded markets and invented events, not
          real prices, filings or prediction markets.
        </div>
      ) : null}
      {recovered ? (
        <div className="notice danger" role="alert">
          <strong>The saved workspace could not be read and was not loaded.</strong> A copy was kept
          in browser storage.
          <ul>
            {recovered.errors.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              download('signal-scope-recovered.json', recovered.raw, 'application/json')
            }
          >
            Download the unreadable copy
          </button>{' '}
          <button type="button" className="secondary" onClick={() => setRecovered(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {storageError ? (
        <div className="notice warn" role="alert">
          {storageError}
        </div>
      ) : null}
      <p className="status" role="status" aria-live="polite">
        {message}
      </p>
      <main id="main" tabIndex={-1}>
        {route === 'data' ? (
          <DataView
            ws={ws}
            onChange={change}
            onLoadSample={loadSample}
            chartSeriesId={chartSeriesId}
            onChartSeries={setChartSeriesId}
          />
        ) : null}
        {route === 'study' ? (
          <StudyView
            ws={ws}
            series={studySeries}
            priceSeries={priceSeries}
            params={settings.study}
            onSeries={(id) => setSettings((s) => ({ ...s, seriesId: id }))}
            onParams={(p) => setSettings((s) => ({ ...s, study: p }))}
          />
        ) : null}
        {route === 'relations' ? <RelationsView series={ws.series} /> : null}
        {route === 'rules' ? (
          <RulesView
            series={ws.series}
            events={ws.events}
            rule={rule}
            split={split}
            costBps={settings.costBps}
            onRule={(r) => setSettings((s) => ({ ...s, rule: r }))}
            onSplit={(d) => setSettings((s) => ({ ...s, split: d }))}
            onCost={(c) => setSettings((s) => ({ ...s, costBps: c }))}
          />
        ) : null}
        {route === 'saved' ? (
          <SavedView
            ws={ws}
            current={current}
            onSave={saveConfig}
            onLoad={loadConfig}
            onDelete={(name) =>
              change(
                { ...ws, configs: ws.configs.filter((c) => c.name !== name) },
                `Deleted configuration "${name}".`,
              )
            }
            onReplace={change}
            onClear={() => change(emptyWorkspace(), 'Cleared the workspace.')}
          />
        ) : null}
        {route === 'about' ? <About /> : null}
      </main>
      <footer className="foot small muted">
        <p>
          {DISCLAIMER} No trading, no recommendations, no live data. Everything stays in this
          browser. <a href="#/about">How the numbers work</a>
        </p>
      </footer>
    </div>
  );
}
