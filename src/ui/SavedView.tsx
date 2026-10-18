/** Saved configurations and workspace import/export; the About page. */
import { useId, useState } from 'react';
import { parseWorkspaceJson, type SavedConfig, type Workspace } from '../engine';
import { download } from '../lib/files';
import { DISCLAIMER } from '../lib/format';

export function SavedView(props: {
  ws: Workspace;
  current: Omit<SavedConfig, 'name' | 'savedAt'>;
  onSave: (name: string) => void;
  onLoad: (c: SavedConfig) => void;
  onDelete: (name: string) => void;
  onReplace: (ws: Workspace, msg: string) => void;
  onClear: () => void;
}) {
  const fileId = useId();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const trimmed = name.trim();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (f.size > 20_000_000) return setErrors(['The file is larger than 20 MB.']);
    const r = parseWorkspaceJson(await f.text());
    if (!r.ok) return setErrors(r.errors);
    setErrors([]);
    props.onReplace(
      r.workspace,
      `Imported workspace ${f.name}: ${r.workspace.series.length} series, ${r.workspace.events.length} events, ${r.workspace.configs.length} saved configurations.`,
    );
  }

  return (
    <section aria-labelledby="saved-h">
      <h2 id="saved-h">Saved configurations</h2>
      <form
        className="card inline-group"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) {
            props.onSave(trimmed.slice(0, 80));
            setName('');
          }
        }}
      >
        <label className="inline">
          Name
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Catalysts, 60/5/5"
          />
        </label>
        <button type="submit" disabled={!trimmed}>
          Save current settings
        </button>
        <p className="small muted">
          Saves the study series and parameters, the rule, the split date ({props.current.split})
          and the cost ({props.current.costBps} bps). A configuration with the same name is
          replaced.
        </p>
      </form>
      {props.ws.configs.length === 0 ? (
        <p className="muted">No saved configurations yet.</p>
      ) : (
        <ul className="config-list">
          {props.ws.configs.map((c) => (
            <li key={c.name} className="card">
              <div>
                <strong>{c.name}</strong>
                <span className="muted small">
                  {' '}
                  · {c.seriesId} · {c.study.estimation}/{c.study.pre}/{c.study.post} · rule &quot;
                  {c.rule.name}&quot; ({c.rule.conditions.length} conditions) · saved{' '}
                  {c.savedAt.slice(0, 16).replace('T', ' ')}
                </span>
              </div>
              <div className="inline-group">
                <button
                  type="button"
                  onClick={() => props.onLoad(c)}
                  aria-label={`Load configuration ${c.name}`}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => props.onDelete(c.name)}
                  aria-label={`Delete configuration ${c.name}`}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3>Workspace file</h3>
      <div className="card inline-group">
        <button
          type="button"
          onClick={() =>
            download(
              'signal-scope-workspace.json',
              `${JSON.stringify(props.ws, null, 2)}\n`,
              'application/json',
            )
          }
        >
          Export workspace JSON
        </button>
        <label htmlFor={fileId} className="inline">
          Import workspace JSON (replaces the current one)
          <input id={fileId} type="file" accept=".json,application/json" onChange={onFile} />
        </label>
        {confirmClear ? (
          <span className="inline-group">
            <span>Remove all data and saved configurations from this browser?</span>
            <button
              type="button"
              className="danger"
              onClick={() => {
                setConfirmClear(false);
                props.onClear();
              }}
            >
              Yes, clear
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="secondary" onClick={() => setConfirmClear(true)}>
            Clear workspace
          </button>
        )}
      </div>
      {errors.length ? (
        <div className="notice danger" role="alert">
          <strong>The workspace was not imported:</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function About() {
  return (
    <section aria-labelledby="about-h" className="prose">
      <h2 id="about-h">About SignalScope</h2>
      <p>
        SignalScope is an educational tool for historical event studies. It runs entirely in your
        browser: nothing is uploaded, there is no account, no live market feed and no trading.{' '}
        {DISCLAIMER}
      </p>
      <h3>The information-time rule</h3>
      <p>
        Every event has two dates: when it happened (for a disclosure, the transaction) and when it
        was published. Studies and rules only use an event from{' '}
        <strong>day 0, the first trading session strictly after publication</strong>. A same-day
        publication is treated as after that day&apos;s close because the data carry dates, not
        times. Rule signals are computed at a session&apos;s close and act from the next session.
        Each calculation asserts this and refuses to show results if it is broken.
      </p>
      <h3>What the numbers are</h3>
      <ul>
        <li>
          Returns are simple daily returns; a missing price makes the neighbouring returns undefined
          (never zero).
        </li>
        <li>
          Abnormal return = return minus the mean return over the estimation window before the
          event.
        </li>
        <li>
          Uncertainty badges: under 10 observations is a very small sample, under 30 a small sample.
        </li>
        <li>
          The 95 % interval uses a normal approximation, which is weak for small or skewed samples.
        </li>
        <li>Correlations describe co-movement in the loaded sample. They do not show causation.</li>
      </ul>
      <h3>Sample data</h3>
      <p>
        The sample market is synthetic and generated from a fixed seed. The companies, officials,
        measures and prices are invented; any resemblance to real securities is coincidental. Sample
        items carry a Sample badge everywhere they appear.
      </p>
      <h3>Not in this version</h3>
      <p>
        No live or authorized market-data connections, no intraday timestamps, no wallet or identity
        labels, and no recommendations. See the project&apos;s docs/backlog.md.
      </p>
    </section>
  );
}
