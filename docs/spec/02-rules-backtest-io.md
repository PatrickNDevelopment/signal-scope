# Spec 02: exploratory rules, backtest, import and export

## Rule builder

A rule is the AND of 2 to 6 conditions, evaluated on each session `t` of a target price series using
only information available at the end of `t` (spec 00 rule 3). Condition types:

| Type           | Parameters                          | True on `t` when                                                                                                    |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `volume_shock` | `n`, `zMin`                         | `z_t(n) >= zMin` on the target series                                                                               |
| `rsi_below`    | `level`                             | `RSI_t < level`                                                                                                     |
| `rsi_above`    | `level`                             | `RSI_t > level`                                                                                                     |
| `return_below` | `h`, `pct`                          | cumulative return over the last `h` sessions `<= pct`                                                               |
| `event_recent` | `kind`, `direction` or any, `days`  | an event of that kind (and direction) for the target has its anchor within the last `days` sessions (anchor `<= t`) |
| `prob_change`  | probability series id, `h`, `ppMin` | `dp_t(h) >= ppMin` (percentage points) on that series, latest value dated **before** `t` (spec 00 rule 3)           |

Rules need **at least two evidence types** (the task is to cross evidence, not to fire on one
indicator). Output: every session where the rule fires, and for each, the forward return over the
next `H` sessions starting at the close of `t + 1` (spec 00 rule 4). Reported as descriptive
statistics (n, mean, median, share positive, 95 % normal-approximation interval) with the same
uncertainty badges, and the heading "Historical observations in this sample. Not a forecast."

## Backtest

Same rule; a split date divides the sessions into **train** (`t < split`) and **test** (`t >= split`).
Trades: signal on `t`, enter at the close of `t + 1`, exit at the close of `t + 1 + H`; no overlapping
positions (a signal while in a position is skipped and counted); cost `c` basis points per side, so a
trade's net return = `(1 - c/10000)^2 * (1 + gross) - 1`. A trade whose exit would cross the split is
assigned to the period of its entry and flagged. Reported per period: trades, mean and median net
return, hit rate, compounded return, maximum drawdown of the compounded equity, and badges for small
samples and short test periods. A **buy-and-hold** line over the same period is shown for context.

No-look-ahead assertions run on every trade: the signal date is before the entry date, every input
date used is `<= signal date`, and every event used has its anchor `<= signal date`.

## CSV import

Prices: header `date,close,volume` (volume optional), or `date,symbol,close,volume` for several
series in one file. Probabilities: `date,probability` (0 to 1, or 0 to 100 with a `%` column header
`probability_pct`). Events: `id,kind,label,symbols,event_date,published_at,direction,source,access`
(`symbols` separated by `;`). Line-level errors (line number and reason) are reported and the import is
all-or-nothing per file. Limits: 5 MB per file, 20,000 rows per series, 2,000 events. Empty values in
`close` or `volume` become `null` (missing), never zero. Dates must be ISO `YYYY-MM-DD`.

## Export and saved configurations

- Event-study table CSV (one row per event, with anchor date, delay, baseline n, CAR pre/post, reason
  for exclusion) plus an aggregate block; indicator CSV; rule-hit CSV; backtest trade CSV.
- Every export starts with comment lines (`# ...`) stating the data provenance, the parameters and
  "Descriptive historical calculation. Not investment advice." A comment line is always a single
  cell: commas in it become `;` and double quotes `'`, so user text (a source, a rule name) cannot
  open a new spreadsheet cell.
- Spreadsheet-formula guard: a text cell starting (after optional whitespace) with `=`, `+`, `-`,
  `@`, their full-width forms, tab or CR that is not a plain number is prefixed with `'`.
- Saved configurations (study parameters, rules, backtest settings) live in `localStorage` with a
  schema version; a workspace (data + configurations) can be exported and imported as JSON.
