# Production maintenance

## Boundaries

Website content is edited in GHL using the corresponding page/shared custom-code fragment. Static assets are served by `purge-pros-site-assets`; the quote form and relay are served by `purge-lead-relay`. Source synchronization does not publish either service.

Before any future deployment, reconcile current native state and owner changes. The checked-in configurations document nonsecret settings only, not a complete export of Cloudflare runtime bindings. Preserve existing secret values, Durable Object namespaces, routes, feature flags and runtime metadata. Never blindly deploy the partial config to replace account settings. Production QA must separately cover quote pricing, unsupported ZIP handling, consent, saved-plan links, attribution and dispatch.

## Quote build

State of the checked-in bundle: a prepared candidate, locally tested, not deployed. The live Worker is still the October 5 release until the owner approves a deployment; that release is kept byte for byte as `quote/tests/fixtures/2026-10-05-live-worker.mjs` (SHA-256 `113ce3be...a95c`).

`quote/build.mjs` inserts `quote/src/launcher.js` into the Worker template as a JSON string literal. The candidate carries the owner decisions of October 5 to 9, 2026:

- **First cleanup.** A new recurring household's first cleanup is billed at the regular per-visit price with up to 120 minutes included; time beyond 120 minutes is $1 per minute and only after the customer agrees before work starts. A returning household, or one whose history is unclear, gets a restart cleanup: the quoted rate includes 30 minutes, then $1 per minute billed after. A one-time cleanup is $89.99 for the first 30 minutes, then $1 per minute. Ordinary recurring visits are never billed by the minute. The team note, the Voice AI instruction, `offerVersion` and `cleanupPolicyVersion` (`2026-10-08-no-start-up-fee-120`) say this. Two forwarded keys are new: `newCustomerCleanupIncludedMinutes` and `newCustomerExtraTimeRequiresAgreement`. `promotionalAdditionalMinuteCents` keeps its name and is always null.
- **The bundled widget and landing page are retired** (kept as history in `legacy/2026-10-quote-widget/`). `GET /purge-quote.js` serves the small launcher, which sends old quote buttons, `PurgeProsQuote.open()` and `?open_quote=1` addresses to the quote page. `GET /`, `/quote`, `/quote/`, `/demo` and `/demo.html` answer 302 to the quote page with the query string kept. The target is configuration only; nothing a visitor sends can change it. A browser carries `#resume=...` across the forward, so saved links already sent keep working.
- **Meta server copy.** Meta's answer is written to the Worker log as one line (`meta_capi_result`: HTTP status, events received, trace id, error code; never the event or personal data).
- Prices, the ZIP list, validation, consent handling, the request ledger (a double submit is forwarded once), seven-day saved plans, attribution capture, `schemaVersion`, `pricingVersion` and the name of every key already forwarded are unchanged.

### Variables added in the candidate (all optional)

| Variable | Default when unset | Effect |
|---|---|---|
| `QUOTE_PAGE_URL` | `https://itspurgepros.com/quote` | Where the forward and the launcher send visitors. Must be a plain `https` address; anything else falls back to the default. |
| `SAVED_LINK_BASE` | `https://itspurgepros.com/quote` | Base of a new saved-plan link (`<base>#resume=<token>`). Set it to `https://quote.itspurgepros.com/` to keep the link form of the October 5 release. The quote builder must accept whichever form is in use. |
| `CURRENT_TERMS_VERSION` | unset: any version is recorded, as before | The Terms version a service request is expected to carry. |
| `TERMS_VERSION_MODE` | `flag` | Only read when `CURRENT_TERMS_VERSION` is set. `flag`: a request with another version is accepted and the team note gains one line naming the version accepted. `refuse`: it is answered 400 with code `TERMS_VERSION_OUTDATED` and `fields: ["termsAccepted"]`, and nothing is forwarded. Using `refuse` is the owner's decision. |
| `META_TEST_EVENT_CODE` | unset | When set, the Meta copy carries `test_event_code` and appears only under Meta's Test Events. Remove it after a test. |
| `STAGING` | unset | `"1"` marks a staging copy: the Meta copy is sent only when `META_TEST_EVENT_CODE` is also set. Never set on the production Worker. |

`ALLOWED_ORIGINS` is unchanged. A staging copy gets its page origin through that variable.

### Regression

`npm test` runs `quote/tests/regression.mjs`. It loads the October 5 reference and the candidate in plain Node (the Cloudflare-only import is replaced in the test loader, with stand-ins for every outgoing call and for the ledger and plan store) and sends both the same seeded requests, more than 1,000 of them: every request type, valid and invalid input, out-of-area ZIPs, repeated and simultaneous submissions, saved plans, Voice AI pricing, the legacy intake address and every page address. Status, headers, body and everything forwarded must be identical apart from a printed list of approved differences, each asserted to equal its approved value. It also checks 1,000 server price combinations and six fixed prices, the ZIP list, seven protected code blocks byte for byte, the new behaviour above, and that no retired first-cleanup wording remains in the bundle. `fixtures/pre-icons-worker.mjs` (September 21) is kept as history only. Neither fixture is a deployment artifact.

### Staging copy (`quote/wrangler.staging.json`)

A configuration file only; committing it deploys nothing. It describes a separate Worker, `purge-lead-relay-v5-staging`, on its `workers.dev` address: no route, no custom domain, and its own request ledger declared with `new_sqlite_classes`, so it can never read or write the live ledger. Replace the three `.invalid` placeholders (`QUOTE_PAGE_URL`, `SAVED_LINK_BASE`, `ALLOWED_ORIGINS`) with the staging page's address and origin before use. The file carries no secrets.

Secrets are never stored in this repository and are entered only by the owner, in Cloudflare, one at a time:

| Secret | On the staging copy |
|---|---|
| `GHL_WEBHOOK_URL_V3` | Only a staging-only address: a test workflow that just records what arrives, or a stand-in receiver. Never the live webhook address. Without it every `POST /submit` answers "Relay not configured". |
| `GHL_WEBHOOK_URL` | Not needed. Leave unset. |
| `VOICE_AI_QUOTE_TOKEN` | Optional: a new staging-only value, never the live token. Without it `/voice-quote` answers "Voice pricing is not configured." |
| `META_PIXEL_ID`, `META_CAPI_TOKEN` | Leave unset. For one labelled test only, the owner adds both together with the variable `META_TEST_EVENT_CODE`, and removes all three afterwards. With `STAGING` set to `"1"` nothing is sent to Meta without the test code. |
| `GOOGLE_PLACES_API_KEY` | Not needed. Leave unset. |

The production Worker is never deployed from either checked-in configuration (see Boundaries). Production keeps its existing variables and secrets; the new variables are added to it only as the owner approves.

## Blog index

The checked-in index reflects the last verified September 30 publication: 44 cards. Outdoor Toys published later but remains absent from this index and sitemap as of October 4. Do not recreate the article to fix its listing.

After a native post publishes or changes, reconcile the complete native Published inventory. Update only the public card fields in `website/blog/published-cards.json`, preserving owner changes and unique slugs. Run `npm run build:blog`, then validate the templates. Replace only the existing Home header/index custom-code fragment, save and publish in GHL. Preserve the hidden native Blog Posts block and all native article records. Verify card count, title/summary search, category filters, cover/alt, canonical and desktop/mobile rendering. Record article publication and index publication separately.

If the public sitemap omits a published article, use the existing GHL blog XML sitemap selection and Generate & Save. Preserve its current selections; do not add duplicate custom URLs. Sitemap inclusion does not establish Google indexing.

## Assets and content

Keep existing immutable hashed assets available while adding new versions. The asset folder preserves installed historical hashes as well as current ones so older references continue resolving. Review/test routes and rejected mockups are excluded. GHL-hosted images remain referenced by their existing URLs.

Full blog article records, scheduling and page metadata remain in GHL; public article snapshots and metadata are captured separately when available. The private workspace retains native record mappings and deployment receipts. No customer data or credentials belong in this public repository.
