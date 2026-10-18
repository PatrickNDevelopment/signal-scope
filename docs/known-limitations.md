# Known limitations

- **Daily data only.** No intraday timestamps or time zones; a publication is assumed to come after
  the close of its date. A release before the open would be studied one session late (conservative).
- **No exchange calendar.** Sessions are whatever dates the price file contains. The sample market
  uses all weekdays, including public holidays.
- **No corporate actions.** Prices are used as given; splits and dividends must already be adjusted.
- **Constant-mean baseline.** Abnormal returns do not remove market moves (no market model or
  index adjustment). Compare against an index series by hand on the Indicators page.
- **Statistics are simple.** The 95 % interval is a normal approximation; with the small samples
  typical here it is optimistic. No multiple-testing correction for trying many rules.
- **Backtest is basic.** One position at a time, fixed horizon, fixed cost per side, no slippage
  model, no position sizing, no shorting, close-to-close prices.
- **Overlapping windows are flagged, not corrected.**
- **Storage is per browser.** `localStorage` limits (about 5 MB in most browsers) bound workspace
  size; the app reports a failed save and asks you to export JSON.
- **No live or authorized data adapters**; all data are imported files or the synthetic sample.
- CI and the Pages workflow exist but have never run, because the repository has no remote.
- **Same-day cross-market data is held back one session.** Prediction-market probabilities dated on
  a signal session are not used until the next session (dates carry no time). For a market that
  closes with the target this is one session conservative.
- **"Load sample market" is offered only on an empty workspace.** To add the sample next to your
  own data, export your workspace, clear it, load the sample, then re-import your files.
- **A period with no trades shows a compounded return and drawdown of 0 %** (no position, so no
  change), flagged "very few trades"; it is not evidence that the rule avoided losses.
- **The train/test split assigns trades by entry date**, so a signal on the last train session whose
  entry falls after the split counts as test. There is no walk-forward evaluation.
