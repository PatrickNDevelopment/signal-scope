# Handoff

**State:** v0.1, accepted by an independent review (prompt 05B, 2026-10-18) that fixed eight defects with regression tests (see Part 1 / "Independent acceptance" in
[test-report.md](test-report.md)). Published 2026-10-19: https://github.com/PatrickNDevelopment/signal-scope, branch `main`; demo
https://patrickndevelopment.github.io/signal-scope/. CI and Pages are green; the final cross-portfolio audit (2026-10-20) found no
P0 or P1 issue. The reviews were separate Claude Code sessions, not human audits.

## Run

```powershell
npm ci
npm run dev          # http://localhost:5176/signal-scope/
npm run verify       # full gate (or scripts\verify.ps1 / scripts/verify.sh)
npm test             # unit tests only
npm run e2e          # production build + Playwright on port 4177
```

## What works (covered by tests, see docs/test-report.md)

- CSV import of prices, probabilities and events with provenance and line-numbered errors; seeded
  synthetic sample market with a banner and badges.
- Event timeline with transaction date, publication date, delay and day 0; date editing with
  validation.
- Event study with baseline window and n per event, exclusions, overlap flags, CAR path chart,
  intervals and badges; CSV export.
- Indicators (rolling vol, RSI, volume z) with CSV export; lagged correlations with a no-causation
  note.
- Rule builder requiring two evidence types; rule hits; backtest with split, costs, badges; CSV
  exports; no-look-ahead assertions in every evaluation.
- Saved configurations, workspace JSON export/import, localStorage persistence with corruption
  recovery.

## What is absent

- Hosted demo: https://patrickndevelopment.github.io/signal-scope/ (static build). CI and Pages ran green on the first push (2026-10-19).
- No live or authorized data adapters (see docs/backlog.md).

## Publication

Published 2026-10-19 with the owner's approval (portfolio decision D-007): public repository
https://github.com/PatrickNDevelopment/signal-scope (MIT, branch `main`), GitHub Pages at https://patrickndevelopment.github.io/signal-scope/. The
first CI run (Linux, Chromium) and Pages deployment were green; a live check loaded the demo,
refreshed it and found no console errors and no requests to localhost.

## Gotchas

- `vite.config.ts` sets `base: '/signal-scope/'`; e2e runs the production build on port 4177.
- `npm run e2e` rewrites `docs/screenshots`; restore with `git checkout docs/screenshots` unless the
  UI changed.
- Changing `src/engine/sample.ts` changes the journey 2 numbers; the unit and e2e tests pin them.
- Rule conditions on another market's probabilities only see values dated **before** the signal
  session (spec 00 rule 3); keep that if you add cross-series conditions.
- Exports go through `src/ui/ExportButton.tsx`, which enforces the restricted-data opt-in; CSV
  comment text goes through `commentText` in `src/engine/csv.ts` (one cell, no commas or quotes).
