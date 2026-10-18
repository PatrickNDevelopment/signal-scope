# Test report

## Builder's report (2026-10-18)

Windows 10, Node 20+, Playwright 1.64 with the installed Microsoft Edge (`msedge` channel). CI is
configured for Chromium on Ubuntu but has never run (no remote).

### Full gate

`powershell -File scripts\verify.ps1`, exit code **0** (`ALL CHECKS PASSED`):

| Step             | Command                | Result                                                          |
| ---------------- | ---------------------- | --------------------------------------------------------------- |
| install          | `npm ci`               | ok                                                              |
| format           | `npm run format:check` | ok                                                              |
| lint             | `npm run lint`         | ok, 0 problems                                                  |
| types            | `npm run typecheck`    | ok                                                              |
| unit tests       | `npm test`             | 38 passed (2 files)                                             |
| production build | `npm run build`        | ok, 383 kB JS (115 kB gzip)                                     |
| secret scan      | `npm run secrets`      | no findings                                                     |
| e2e              | `npm run e2e`          | 12 passed, production build under `/signal-scope/` on port 4177 |

### What the unit tests cover

- Dates: ISO validation with leap years, day arithmetic, "first session strictly after" search.
- Calculations against hand-computed references: returns with missing prices, compounding, sample sd,
  median, Wilder RSI (all gains 100, all losses 0, flat 50), volume z-score from prior sessions only,
  probability change in percentage points, Pearson (±1, constant input), lagged correlation peaking
  at the true lag, sample-size badges.
- Information time: `LookaheadError` on future inputs and on entry not after the signal; day 0
  anchoring.
- Sample market: deterministic across runs, labelled sample, weekdays only.
- Journey 2 in the engine: `disclosure-1` (31-day delay) anchors after publication and its post CAR is
  under 3 %, while the same event treated as published on the transaction date shows over 8 %.
- Event study: inclusion, n and badges, OUT_OF_RANGE and NOT_YET_TRADABLE exclusions, overlap flags,
  CAR paths consistent with pre and post CAR.
- Rules: two-evidence-type requirement, price target, missing probability series; signals only after
  publication; entries strictly after signals; a disclosure rule never fires before day 0.
- Backtest: train/test assignment by entry date, cost on both legs, no overlapping positions, cost
  clamped to 0..500 bps, small-sample badges.
- CSV: RFC 4180 parsing (quotes, doubled quotes, CRLF, BOM, multi-line fields, line numbers),
  all-or-nothing imports with line errors, duplicate dates, multi-symbol files, `probability_pct`,
  event validation (publication before event, buy on a catalyst, duplicate ids), formula guard.
- Workspace: round trip; rejects unknown keys, wrong version, bad JSON, duplicate ids, decreasing
  dates, probabilities outside 0..1, publication before the event.

### Defects found while building (fixed)

- The first sample market did not show the late-filing contrast clearly: noise put a +5.9 % post CAR
  after the real publication. The rally was moved to start two sessions after the transaction and
  the seed and volatility were chosen so the contrast is clear (unit test above).
- At 375 px the Data page scrolled sideways by 641 px: visually hidden table headers were absolutely
  positioned outside their scroll container. Fixed with a containing block; covered by the mobile
  e2e test.
- On phones the charts were too small to read; they now keep a 560 px minimum width and scroll inside
  their card.

### Playwright journeys (production build under `/signal-scope/`)

1. Journey 1: import `examples/demo-prices.csv` and `examples/demo-catalysts.csv`, study with n = 3,
   filter by direction, export the study CSV and check comments, header and rows.
2. Journey 2: load the sample, set `disclosure-1` publication to the transaction date (post CAR
   above +8 %), restore the real date (day 0 2024-03-29, post CAR under 3 %), refuse publication
   before the transaction, and confirm that a disclosure rule's exported hits all fall after the
   publication.
3. Invalid CSV rows reported with line numbers; nothing imported.
4. Source required before import; buy/sell on a catalyst rejected.
5. Rules need two evidence types (results hidden until fixed); backtest badges; trades CSV.
6. Saved configuration, reload persistence, loading a configuration.
7. Workspace JSON export, clear, broken import rejected, re-import.
8. Corrupted stored workspace kept aside and reported.
9. Indicators and correlation page with the no-causation note; indicators CSV.
10. Empty states link to Data.
11. No horizontal page scroll at 375 px on all six pages.
12. Screenshots in `docs/screenshots` (desktop data, study, rules; mobile study; dark study), which
    were inspected.

### Not tested

- Firefox and Safari; screen readers (labels and roles were checked through Playwright locators
  only).
- CI and Pages workflows (no remote).
- Very large imports near the 20,000-row and 5 MB limits (the limits are enforced in code and the
  size checks are unit tested only for the error message path).
