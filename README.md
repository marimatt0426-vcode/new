# Purge Pros — production website and quote form

The current approved source is in **`production/`**. The previous August implementation is preserved under `legacy/` for history only; do not deploy it. The original dirty local checkout was left untouched.

This October 4, 2026 reconciliation brings the approved September website rollout, September 23 navigation/Welcome/FAQ corrections, September 21 quote icons and September 30 blog index into version control. The rejected October 2 Impeccable mockups are excluded and must not be published.

## Source map

The rebuilt website (v5) was brought in on October 10, 2026 and frozen that evening for the switch day, October 11, 2026: **prepared and locally tested, not installed**. Until the owner approves the switch, the live website is the September one, now in `legacy/2026-09-website/`. Every hosted address in the v5 blocks names the folder `v5-20261011`; see `production/OPERATIONS.md`.

- `production/website/pages/`: the body blocks of the 38 rebuilt website pages (GHL Custom Code blocks).
- `production/website/shared/`: the rebuilt header and footer sections, the Welcome page's own, the site head and body code; `bridge-site-head.html` and `bridge-site-body.html` are the site code of the switch evening only; `head.html` and `body.html` are the September site code the tracking tags are copied from.
- `production/website/FIELDS.md`, `fields.json`, `BLOCKS-MANIFEST.json`: what is typed and pasted per page; every block and hosted file with its hash.
- `production/website/blog/`: `blocks/` holds the rebuilt blog template blocks; the rest is the September index (templates, card inventory, tools) and the public article snapshots.
- `production/site/`: the source of the rebuilt site: the price engine with its tests and checkers, the built pages, page sources, partials, styles, scripts, the page builder, the packaging tool, and the pictures and icons the pages use.
- `production/site-assets/`: the hosted static styles, scripts and quote artwork that are live today.
- `production/quote/src/`: the Worker template and the small quote launcher script. The widget and landing page bundled until October 2026 are history in `legacy/2026-10-quote-widget/`.
- `production/quote/dist/worker.mjs`: deterministically rebuilt Worker bundle. As of October 9, 2026 it is a prepared candidate, not the deployed release; see `production/OPERATIONS.md`.
- `production/SOURCE-MANIFEST.json`: source provenance and exact hashes (`production/update-manifest.mjs` rewrites it; `production/verify-manifest.mjs` checks it).
- `production/OPERATIONS.md`: maintenance, deployment boundaries and known gaps.

## Verify locally

Requires Node.js 20+; no package installation needed.

```sh
npm run build
npm run check
npm test
```

`npm test` runs the quote Worker regression, the September blog index check, the price engine's suite (`npm run test:engine`), the block check (`npm run test:site`: the blocks equal a fresh packaging of the built pages) and the manifest check. It takes about a minute.

These commands do not deploy, submit a lead or send a customer message. No deployment automation is installed in this repository. A GitHub commit is not a live GHL or Cloudflare change.

GHL remains authoritative for native page settings, blog records and scheduled content. This source snapshot captures the last verified installed templates; it is not a CRM export. Native GHL access was unavailable at reconciliation. The live Outdoor Toys article still needs to be added to the custom 44-card blog index and sitemap; that gap is preserved, not silently represented as fixed.

Secrets, customer records, owner tracking-test details and private Obsidian notes are excluded. Existing runtime secrets and bindings must be preserved during any separately authorized future deployment.
