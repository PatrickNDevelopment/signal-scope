# Architecture

SignalScope is a static single-page app: Vite + React 19 + TypeScript (strict), zod for validation,
no backend. The production build is served under `/signal-scope/` (GitHub Pages project path) with
hash routing, so deep links work without server rewrites.

```
src/
  engine/        pure, framework-free domain logic (unit tested)
    types.ts       data model and limits
    dates.ts       ISO date helpers, binary search for "first session after"
    calc.ts        returns, cumulative, mean/sd/median, rolling vol, volume z, RSI, prob change,
                   lagged Pearson correlations, summaries with badges
    lookahead.ts   LookaheadError, assertNoLookahead, assertEntryAfterSignal
    study.ts       event anchoring (day 0) and the event study
    rules.ts       rule conditions, evidence types, rule evaluation, backtest
    csv.ts         RFC 4180 parser, series/event import, formula-safe CSV export
    sample.ts      seeded synthetic sample market
    workspace.ts   versioned workspace schema and validation
  lib/           browser glue: storage, downloads, formatting, CSV export builders
  ui/            views: Data, Event study, Indicators, Rules & backtest, Saved/About; SVG charts
  App.tsx        state, routing, persistence
```

## Decisions

- **Information time is enforced in the engine, not the UI.** Day 0 is computed by `anchorIndex`
  (first session strictly after `publishedAt`). Each rule condition records the dates it read;
  `assertNoLookahead` throws if any is after the decision session, and `assertEntryAfterSignal` if an
  entry is not strictly later. The UI catches `LookaheadError` and shows the failure instead of any
  numbers.
- **Dates, not timestamps.** Inputs are daily. Treating publication as after the close of its date is
  the conservative choice when times are unknown.
- **`undefined` is "not defined".** Missing prices give undefined returns, which propagate; windows
  that touch them are excluded with a reason rather than filled.
- **Constant-mean abnormal returns.** Simple and explainable; a market-model baseline is in the
  backlog. The 95 % interval is a normal approximation and is labelled as one.
- **Rules must cross evidence types** (event, volume, momentum, price, prediction) to steer users away
  from single-indicator curve fitting; results are framed as historical observations.
- **Backtest is deliberately basic:** one position at a time, next-session entry, fixed horizon, cost
  per side, a date split into train and test. No sizing, leverage or shorting.
- **Persistence:** one validated workspace in `localStorage` (`signal-scope.workspace.v1`), saved on
  every change; current settings separately (`signal-scope.settings.v1`). A workspace that fails
  validation is kept under a `.corrupt` key and offered as a download.
- **Charts are hand-built SVG** (no chart library) with `role="img"` labels; every chart has a table
  or text equivalent next to it.
- **Sample data** is generated from fixed seeds with no transcendental functions, so it is identical
  on every machine; it is marked `sample: true` and `access: synthetic`, which drives the banner and
  badges.
