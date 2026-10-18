# Spec 00: data model and the information-time rule

SignalScope is an educational tool for looking at what happened around past events. It never trades,
never recommends, and never promises returns. Everything it reports is a description of history in
the data you loaded.

## Series

A series is a daily time series for one instrument:

| Field        | Rule                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| `id`         | `^[A-Z0-9][A-Z0-9._-]{0,19}$` (the symbol), unique                                         |
| `name`       | 1 to 80 characters                                                                         |
| `kind`       | `price` (close and optional volume) or `probability` (a market-implied probability 0 to 1) |
| `provenance` | `{ source, access, retrievedAt, note, sample }` (see Provenance)                           |
| `points`     | 2 to 20,000 rows `{ date, value, volume }`, dates strictly increasing                      |

`date` is a calendar date `YYYY-MM-DD` (the session the value closes). `value` is a positive finite
number for prices, or between 0 and 1 for probabilities, or `null` when missing. `volume` is a
non-negative integer or `null`. Rows only exist for sessions; weekends and holidays are simply absent.

## Events

An event is something that happened, with **two different times**:

| Field         | Rule                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `id`          | `^[a-z0-9][a-z0-9-]{0,39}$`, unique                                                                |
| `kind`        | `catalyst`, `disclosure`, `prediction`                                                             |
| `label`       | 1 to 120 characters                                                                                |
| `symbols`     | 1 to 8 series ids the event concerns                                                               |
| `eventDate`   | when it happened (for a disclosure: the transaction date)                                          |
| `publishedAt` | when it became public (for a disclosure: the filing / publication date), `YYYY-MM-DD`              |
| `direction`   | `up`, `down`, `buy`, `sell` or `null` (meaning depends on kind; `buy`/`sell` only for disclosures) |
| `provenance`  | as for series                                                                                      |

Rule: `publishedAt >= eventDate`. An event published before it happened is refused.

**Data-arrival delay** = number of calendar days from `eventDate` to `publishedAt`. It is shown for
every event.

## The information-time rule (no look-ahead)

1. Information is **available** from the end of its `publishedAt` date (we do not know the hour, so we
   assume it arrived after the close). For a series point, information is available at the end of its
   own `date`.
2. The **anchor** (day 0) of an event is the first session in the chosen price series whose date is
   **strictly after** `publishedAt`. Events are never anchored on `eventDate`. The UI shows
   `eventDate` on the timeline for context only.
3. A rule evaluated on session `t` may only use points of the **target** series with `date <= t`,
   points of **other** series (prediction-market probabilities) with `date < t`, and events whose
   anchor session is `<= t` (that is, `publishedAt` strictly before `t`). Another market's daily
   value carries a date but no time; a market that trades around the clock can record its value for
   day `t` after the target's close on `t`, so, as with publications, it is only used from the next
   session. (Changed by the 05B acceptance review; before, same-date probabilities were used.)
4. A trade signalled on session `t` enters at the close of the **next** session `t + 1`.
5. Every engine function that produces a signal, a study row or a trade records the latest information
   date it used, and `assertNoLookahead` checks it against the decision date. A violation is a bug and
   throws; it is never silently corrected.

Consequence (journey 2): moving a disclosure's `publishedAt` past a price move moves its anchor past
the move, so the move appears in the **pre-event** window and cannot be used by a rule before
publication.

## Provenance

`{ source: 1..120 chars, access: "public" | "licensed" | "restricted" | "synthetic", retrievedAt:
YYYY-MM-DD, note: 0..300 chars, sample: boolean }`. Provenance is shown wherever the data is shown and
is copied into every export (the event-study CSV has `source`, `access` and `sample` per event). An
export that contains `restricted` data is disabled until the user ticks an explicit "Include
restricted data" box next to it, and the file then starts with a `CONTAINS DATA LABELLED RESTRICTED`
comment; this applies to the four CSV exports and the workspace JSON. This app never fetches data,
it only labels what you import.

## Missing data

A `null` value makes the return on that session and the next one undefined. Calculations that need a
window skip windows containing an undefined value and report how many were skipped. Nothing is
interpolated.
