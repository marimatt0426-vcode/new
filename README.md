# Purge Pros — production website and quote form

The current approved source is in **`production/`**. The previous August implementation is preserved under `legacy/` for history only; do not deploy it. The original dirty local checkout was left untouched.

This October 4, 2026 reconciliation brings the approved September website rollout, September 23 navigation/Welcome/FAQ corrections, September 21 quote icons and September 30 blog index into version control. The rejected October 2 Impeccable mockups are excluded and must not be published.

## Source map

- `production/website/pages/`: all 27 GHL body fragments, including city pages and current FAQ/Welcome.
- `production/website/shared/`: current global header, footer, Head and Body snippets.
- `production/website/blog/`: native template fragments, public card inventory and index tools.
- `production/site-assets/`: existing hosted static styles, scripts and quote artwork.
- `production/quote/src/`: editable widget JavaScript, standalone landing HTML and Worker template.
- `production/quote/dist/worker.mjs`: deterministically rebuilt approved Worker bundle.
- `production/SOURCE-MANIFEST.json`: source provenance and exact hashes.
- `production/OPERATIONS.md`: maintenance, deployment boundaries and known gaps.

## Verify locally

Requires Node.js 20+; no package installation needed.

```sh
npm run build
npm run check
npm test
```

These commands do not deploy, submit a lead or send a customer message. No deployment automation is installed in this repository. A GitHub commit is not a live GHL or Cloudflare change.

GHL remains authoritative for native page settings, blog records and scheduled content. This source snapshot captures the last verified installed templates; it is not a CRM export. Native GHL access was unavailable at reconciliation. The live Outdoor Toys article still needs to be added to the custom 44-card blog index and sitemap; that gap is preserved, not silently represented as fixed.

Secrets, customer records, owner tracking-test details and private Obsidian notes are excluded. Existing runtime secrets and bindings must be preserved during any separately authorized future deployment.
