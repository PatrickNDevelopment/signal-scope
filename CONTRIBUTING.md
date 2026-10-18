# Contributing

1. Read `docs/spec` first; behaviour is defined there.
2. `npm ci`, then `npm run verify` before you push. It runs format, lint, strict types, unit tests,
   the production build, the secret scan and the Playwright suite.
3. The information-time rule is the core invariant. Any new condition, indicator or calculation must
   record every date it reads so `assertNoLookahead` can check it, and must come with a test that
   fails if it peeks forward.
4. Never turn a missing value into zero. `undefined` means "not defined here" throughout
   `src/engine`.
5. Keep the language descriptive: no trade instructions or return promises in the UI.
6. Add a regression test for every bug you fix.
7. Bundled data must be synthetic and labelled as sample data.
