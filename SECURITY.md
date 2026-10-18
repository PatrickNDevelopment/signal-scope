# Security notes

SignalScope is a static, browser-only app. It has no server, no accounts, no network calls, no
market-data connections and no secrets. Nothing you import leaves the browser.

| Input                   | Treated as                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| CSV files               | Untrusted. 5 MB cap, row limits, strict date and number formats, symbol and id patterns; all-or-nothing per file.         |
| Workspace JSON          | Untrusted. 20 MB cap, strict zod schema (unknown keys rejected), schema name and version checked, duplicate ids rejected. |
| `localStorage` contents | Untrusted. Re-validated on load; an unreadable copy is kept aside and can be downloaded.                                  |
| Typed text              | Rendered as React text nodes, never as HTML.                                                                              |

CSV exports neutralise spreadsheet formulas: a text cell that starts with `=`, `+`, `-`, `@`, tab or
carriage return and is not a number gets a leading apostrophe. Comment lines carry provenance.

## Ethics

- No trading, no order routing, no recommendations, no promises of returns.
- Disclosures and prediction-market data keep their publication date and access label; the app never
  uses them before day 0.
- The app attaches no identities or wallet labels to anything. Sample officials and companies are
  invented.

Report problems through a private security advisory on the repository once it is published, or by
contacting the owner.
