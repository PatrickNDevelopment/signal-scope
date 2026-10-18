# Demo script

Run `npm run dev` and open http://localhost:5176/signal-scope/.

## Journey 1: import, study, compare, export

1. **Data** page. In "Import prices or probabilities": symbol `DEMO`, source
   `Example file (invented)`, then choose `examples/demo-prices.csv`. The status line reports
   250 rows; the series table shows one missing value.
2. In "Import catalysts...", choose `examples/demo-catalysts.csv` (3 events). The events table shows
   day 0 one session after each publication.
3. **Event study.** Three catalysts are included; the cards compare pre CAR (days −5 to −1) with
   post CAR (day 0 to +5), each with n and a "very small sample" badge. The table shows each event's
   baseline window and n.
4. **Export study CSV.** The file starts with provenance, parameter and disclaimer comments, then one
   row per event and an aggregate block.

## Journey 2: a late filing cannot be used early

1. **Data → Load sample market.** A yellow banner marks the data as synthetic.
2. In the events table, `disclosure-1` was traded on 2024-02-26 and published 31 days later; day 0 is
   2024-03-29. The chart shows the rally between the transaction and publication.
3. **Edit dates** of `disclosure-1` and set Published to `2024-02-26`. In **Event study** (only the
   disclosure kind checked) its post CAR jumps above +8 %: that is what a study that ignored
   publication dates would claim.
4. Set Published back to `2024-03-28`. Day 0 moves to 2024-03-29 and the post CAR falls near zero:
   the move happened before anyone could know.
5. Try Published `2024-02-01`: the editor refuses a publication before the transaction.
6. **Rules & backtest:** set condition 1 to a disclosure, direction buy, within 10 sessions, and
   condition 2 to RSI above 0. The first hit is 2024-03-29; the information-time check line confirms
   every signal used only data available at the time.
