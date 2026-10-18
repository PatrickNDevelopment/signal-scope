# Spec 01: calculations

All statistics are computed in IEEE double precision and displayed rounded (returns and volatility in
percent with 2 decimals, z-scores and RSI with 1 decimal). No money changes hands in this app;
transaction costs in the backtest are basis points applied to returns.

Notation: sessions of one series indexed `0..N-1`, values `P_i` (may be `null`).

## Returns

`r_i = P_i / P_{i-1} - 1` for `i >= 1` when both values are present; otherwise undefined.
Cumulative return over sessions `a..b` (inclusive, `a >= 1`) = `prod(1 + r_i) - 1`, undefined if any
`r_i` in the range is undefined.

## Rolling volatility

`vol_i(n)` = sample standard deviation (denominator `n - 1`) of `r_{i-n+1} .. r_i`; undefined if any is
undefined or `i - n + 1 < 1`. Annualised volatility = `vol * sqrt(252)` (shown with that label).
Default `n = 20`.

## Volume shock

`z_i(n)` = `(V_i - mean(V_{i-n} .. V_{i-1})) / sd(V_{i-n} .. V_{i-1})` (trailing window that excludes
day `i`; sample sd). Undefined if any volume in the window or `V_i` is missing, or the sd is 0.
Default `n = 20`. A shock is `z >= 2` by default.

## RSI (Wilder, period 14)

Gains `g_i = max(P_i - P_{i-1}, 0)`, losses `l_i = max(P_{i-1} - P_i, 0)`. The first average gain and
loss are simple means over the first `p` changes; then `avg_i = (avg_{i-1} * (p - 1) + x_i) / p`.
`RSI = 100 - 100 / (1 + avgGain / avgLoss)`; `RSI = 100` when `avgLoss = 0` and `avgGain > 0`; `50`
when both are 0. A missing price resets the computation (the next `p` changes seed it again).

## Event study

Inputs: price series, events (filtered by kind, symbol, direction), estimation window length `E`
(default 60), pre window `[-K, -1]` (default K = 5), post window `[0, +M]` (default M = 5).

For each event with anchor `i0` (spec 00 rule 2):

- **Baseline (estimation) window**: sessions `i0 - K - E .. i0 - K - 1`. Expected daily return
  `mu` = mean of the defined returns in it; `sigma` = their sample sd; `nBase` = their count. If
  `nBase < 20` the event is excluded with reason `SHORT_BASELINE`.
- **Abnormal return** on session `i`: `ar_i = r_i - mu`.
- **CAR pre** = sum of `ar_i` for `i in i0-K .. i0-1`; **CAR post** = sum for `i in i0 .. i0+M`.
  Raw cumulative pre and post returns are reported too.
- An event is excluded (with a reason shown) when its window runs off the series
  (`OUT_OF_RANGE`), contains an undefined return (`MISSING_DATA`), or when no session follows its
  publication (`NOT_YET_TRADABLE`).
- Overlapping events are kept and flagged `OVERLAPS` (their windows share sessions).

Aggregate over included events: `n`, mean, median and sample sd of CAR pre and CAR post, standard
error `sd / sqrt(n)`, an approximate 95 % interval `mean +/- 1.96 * se`, and the share of positive
CAR post. Uncertainty badge: `n < 10` "very small sample", `n < 30` "small sample", otherwise
"sample size n". The interval is a normal approximation and says so.

## Cross-market relationship

Pearson correlation of daily returns of two series over the sessions where both have a defined
return (matched by date), with `n` shown, plus correlations at lags -5..+5 sessions. Displayed with
the sentence "Correlation describes co-movement in this sample; it does not show that one causes the
other."

## Prediction-probability change

For a probability series, `dp_i(h) = p_i - p_{i-h}` in percentage points (undefined if either missing).
