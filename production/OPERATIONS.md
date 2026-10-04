# Production maintenance

## Boundaries

Website content is edited in GHL using the corresponding page/shared custom-code fragment. Static assets are served by `purge-pros-site-assets`; the quote form and relay are served by `purge-lead-relay`. Source synchronization does not publish either service.

Before any future deployment, reconcile current native state and owner changes. The checked-in configurations document nonsecret settings only, not a complete export of Cloudflare runtime bindings. Preserve existing secret values, Durable Object namespaces, routes, feature flags and runtime metadata. Never blindly deploy the partial config to replace account settings. Production QA must separately cover quote pricing, unsupported ZIP handling, consent, saved-plan links, attribution and dispatch.

## Quote build

`quote/build.mjs` inserts the editable widget and landing page into the Worker template using JSON string literals. Initial output matches the exact September 21 icon release bundle. Regression compares 1,000 pricing cases and protected validation, payload, submission and tracking blocks against the immediately preceding approved production bundle. The fixture is historical test data, not an alternative deployment artifact.

## Blog index

The checked-in index reflects the last verified September 30 publication: 44 cards. Outdoor Toys published later but remains absent from this index and sitemap as of October 4. Do not recreate the article to fix its listing.

After a native post publishes or changes, reconcile the complete native Published inventory. Update only the public card fields in `website/blog/published-cards.json`, preserving owner changes and unique slugs. Run `npm run build:blog`, then validate the templates. Replace only the existing Home header/index custom-code fragment, save and publish in GHL. Preserve the hidden native Blog Posts block and all native article records. Verify card count, title/summary search, category filters, cover/alt, canonical and desktop/mobile rendering. Record article publication and index publication separately.

If the public sitemap omits a published article, use the existing GHL blog XML sitemap selection and Generate & Save. Preserve its current selections; do not add duplicate custom URLs. Sitemap inclusion does not establish Google indexing.

## Assets and content

Keep existing immutable hashed assets available while adding new versions. The asset folder preserves installed historical hashes as well as current ones so older references continue resolving. Review/test routes and rejected mockups are excluded. GHL-hosted images remain referenced by their existing URLs.

Full blog article records, scheduling and page metadata remain in GHL; public article snapshots and metadata are captured separately when available. The private workspace retains native record mappings and deployment receipts. No customer data or credentials belong in this public repository.
