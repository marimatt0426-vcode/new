# Retired October 2026: the bundled quote widget and its landing page

`widget.js` and `landing.html` were bundled into the quote Worker until the October 5, 2026 release (bundle SHA-256 `113ce3be...a95c`, kept as `production/quote/tests/fixtures/2026-10-05-live-worker.mjs`). They are history only: the Worker no longer serves them, `GET /purge-quote.js` now serves `production/quote/src/launcher.js`, and the quote host forwards to the quote page. Do not deploy from this folder.
