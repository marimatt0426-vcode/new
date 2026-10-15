# Production maintenance

## Log line for a failed GoHighLevel hand-off (deployed October 15, 2026)

Approved by the owner on October 15, 2026, because three refusals on October 14 could not be diagnosed. When the quote Worker's request ledger cannot hand a request to GoHighLevel, it writes one line to the Worker log, `ghl_handoff_failed`, with six fields in this order: `event`, `requestId` (the reference the customer also sees), `reason`, `httpStatus`, `redirectHost` and `errorName`. The reasons are `http_status` (GoHighLevel answered without success; `httpStatus` holds its reply code), `network_error` (the call failed; `errorName` holds the error's name, such as `TypeError`), `timeout` (the 10 second limit ran out; `errorName` is `AbortError`) and `internal_error` (something inside the Worker failed after the hand-off may have started, such as a ledger record that could not be saved; `errorName` holds the error's name). A refusal followed by a failed save writes both lines. `redirectHost` is filled only for a 3xx reply whose Location header is an http or https address, and holds that address's host name alone (never sign-in details, a path or a query); a relative Location shows as `x.invalid`, a placeholder rather than a host GoHighLevel named, and a Location of any other kind gives null. The line never holds the request or any field of it other than the request id, the webhook address, a reply body, any other header, an error message, a secret, an IP address or a user agent. Nothing else changes: the customer's answer, the stored ledger record, saved plans, pricing, consent, attribution and the Meta copy are byte for byte as before, and a failure to log is swallowed. The regression test pins the helper and its three calls to their reviewed text and places and compares every case with the October 5 reference. State: deployed with the owner's approval on October 15, 2026 at 7:28 AM Eastern as the only traffic version (bundle SHA-256 `06b43e9d...e50f`; the version before it, with the October 13 bundle `235713cd...2300` and the October 14 Terms label, is the rollback). One labelled test request afterwards was accepted, reached GoHighLevel and wrote no `ghl_handoff_failed` line, as designed. Workers Logs: the checked-in configuration does not switch them on; the owner approved switching them on for this Worker on October 15 as a dashboard setting outside this repository. Upload with `wrangler versions upload` and `wrangler versions deploy`, which leave that setting as it is; a plain `wrangler deploy` from a configuration without `observability` switches Workers Logs off (wrangler 4.147).

## Dated Terms revision 2026-10-14 (published October 14, 2026)

The Terms carry "Last updated: October 14, 2026" and the label `2026-10-14-no-start-up-fee`, approved by the owner on October 13. What changed for a customer: a visit lost to a locked gate is normally refunded the same day, and a household that keeps leaving the gate locked is talked to first, given leeway within reason, and may then be charged for the missed visit, always told first; the $10 obstruction fee is charged at most once per visit and only after the customer is told which condition led to it; restart cleanups are named and explained in one place; the FAQ gained one question on fees and its refund sentence names the locked-gate exception (also on Dog Waste Removal). Prices, allowances and time limits are unchanged; Privacy and Quote wording are unchanged.

Live on October 14, 2026, each step checked from outside: the file host serves the new folder `v5-20261014` beside every older folder (all older addresses unchanged); the quote Worker runs the October 13 bundle with `CURRENT_TERMS_VERSION` set to the new label (an older label is still accepted and flagged for the team; accepted-request retries keep their receipt); the Terms, FAQ and Dog Waste Removal pages, the shared footer, the Welcome footer and both blog footers were pasted and published, and all public pages passed their checks. Pricing, consent, request identity, saved plans, attribution and integrations are unchanged. The superseded Terms text and the revision record stay in the private release archive. The Terms label date is stored in the legacy-named `switchDay` pin; the original launch date remains October 11.

This commit also carries the Yard Guide card of the post published on October 14 (the index blocks, the article footer's related row, `covers.json` and the card's thumbnail), live since that morning.

## Boundaries

Website content is edited in GHL using the corresponding page/shared custom-code fragment. Static assets are served by `purge-pros-site-assets`; the quote form and relay are served by `purge-lead-relay`. Source synchronization does not publish either service.

Before any future deployment, reconcile current native state and owner changes. The checked-in configurations document nonsecret settings only, not a complete export of Cloudflare runtime bindings. Preserve existing secret values, Durable Object namespaces, routes, feature flags and runtime metadata. Never blindly deploy the partial config to replace account settings. Production QA must separately cover quote pricing, unsupported ZIP handling, consent, saved-plan links, attribution and dispatch.

## Rebuilt website (v5)

State of everything in this section on October 10, 2026: **prepared and locally tested. Not installed in GHL, not uploaded to Cloudflare.** The website that is live is still the September one, kept in `legacy/2026-09-website/`. Nothing here is installed until the owner approves the switch.

### What is here

| Where | What |
|---|---|
| `website/pages/` | The body blocks of 38 website pages (47 files): one Custom Code block per page; four large pages (`index`, `additional`, `indianapolis`, `dog-waste-removal`) are two blocks (`.1.html`, `.2.html`) and a page-data file (`.schema.html`); `faq` is one block and a page-data file, by the setting `pageDataInOwnFile` in `site/directions/coverstory/_work/ghl/fragments.config.json`, so that every profile packages it the same way whatever the length of its addresses. With the two blog templates that makes 40 pages: 30 approved by the owner on October 9, and nine town pages (Camby, Cicero, Lapel, Markleville, Mooresville, Pendleton, Pittsboro, Whitestown, Zionsville) and the page-not-found page added on October 10. |
| `website/shared/` | `header.html`, `footer.html` (the two Global Sections), `welcome-header.html`, `welcome-footer.html` (the Welcome page's own), `site-head.html`, `site-body.html` (the website's head and body code). `head.html` and `body.html` are the September site code and stay: the packaging tool copies the Google and Meta tags from `head.html` byte for byte. |
| `website/blog/blocks/` | The blocks of the two blog templates and the blog's head and body code. The Yard Guide index is several blocks, because one GHL code element takes 65,000 characters: `home-1-header-and-index.1.html` (header and hero), `.2.html` (the library with the newest cards), `.older-N.html` (older cards, 36 to a block counted from the oldest; a small script at the end of each block moves its cards into the library's grid), `.schema.html` (page data). The packaging tool makes the cut (`site/directions/coverstory/_work/ghl/split-guide.mjs`) and `BLOCKS-MANIFEST.json` gives the order of the elements in the template. The two `NATIVE` text files mark where GHL's own element stays. |
| `website/FIELDS.md`, `website/fields.json` | The field sheet: per page what is typed (path, title, description, canonical, share image, robots tag, schema) and what is pasted, in order. |
| `website/BLOCKS-MANIFEST.json` | Every block with size and hash, and the list of the 441 hosted files the blocks name. |
| `site/` | The source the blocks are made from, in the folder tree the tools expect, which is also the tree of the hosted files: `site/shared/` (the price engine `pp-quote-core.js`, its guide, tests and checkers), `site/assets/` (pictures and icons), `site/directions/coverstory/` (the 40 built pages, `css/`, `js/`, and `_work/`: page sources, partials, the page builder, the checkers and the packaging tool `_work/ghl/`). |

The blocks are the **production profile**: live mode, the live quote Worker's addresses, the Google and Meta tags in the site head code only.

### The hosted files' folder and the switch day

Every hosted address in the blocks reads `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-20261013/...`.

The first folder, `v5-20261011`, carried the switch day, October 11, 2026, and went live that day. The day was set on the evening of October 10, 2026 in the owner's private workspace, where the picture masters and the legal-text tools are, together with the two other things that waited for it: the Terms version label a service request records (`site/shared/terms-version.json`: `2026-10-11-no-start-up-fee`, `switchDay` `2026-10-11`) and the publication date line of the Terms and the Privacy Policy. Both are unchanged since.

On October 12, 2026 a corrected set of hosted files was uploaded beside the first as `v5-20261012` (441 files: the price builder with "Start over", two stylesheets and three Yard Guide thumbnails are new or changed, everything else is byte for byte the first folder), and the blocks that changed were pasted, published and checked on the public pages. One file of the new folder, the price builder's script, was replaced about ninety minutes after the upload, before any public page named the folder. Twelve blocks differ from the October 11 set in the folder name only and were not pasted again; the live website serves their October 11 text, which loads the same bytes from `v5-20261011`: `pages/page-not-found.html`, `privacy-policy.html`, `terms-conditions.html`, the page-data files of `additional`, `dog-waste-removal` and `indianapolis`, `shared/site-head.html`, `site-body.html`, the two bridge files, and the blog's own head and body code. Both folders stay on the file host. The result was copied here again, the manifest updated and the tests run.

On October 13, 2026 a third folder, `v5-20261013`, was uploaded beside the two (452 files: the price builder `2026-10-13c`, the price engine, two stylesheets and eleven thumbnails of scheduled Yard Guide posts are new or changed), the quote Worker of this tree was deployed first, and then the 20 blocks that changed or that load a changed file were pasted, published and checked on the public pages: the shared header and footer, Welcome with its own header and footer, Carmel, Indianapolis, About, Additional, Dog Waste Removal, FAQ, and both blog templates. The other 44 blocks differ from the live ones in the folder name only and were not pasted again; the live website serves their earlier text, which loads the same bytes from `v5-20261012` or `v5-20261011`. All three folders stay on the file host.

Before the day was set the folder read `v5-DATE`, a placeholder and not a real address. **A block that says `v5-DATE` must not be pasted**; `npm test` prints the placeholder whenever one is in use. A folder that is on the file host is never overwritten: a corrected set of hosted files gets a new name, with a letter after the day.

`website/shared/bridge-site-head.html` and `bridge-site-body.html` are the website's site code for the switch evening only: the new site code first and whole, then the September lines the old pages still need, behind a guard that keeps them from running on a new page. `site-head.html` and `site-body.html` are the site code once every page is new. `site/directions/coverstory/_work/ghl/bridge.mjs` makes and checks the bridge files.

### Tests

- `npm run test:engine` runs the price engine's own suite (340 tests): prices against the live tool, ZIPs, validation, consent, the request form, saved plans, attribution, tracking events and the send switch.
- `npm run test:site` (`site/verify-blocks.mjs`) packages the built pages again and requires every block, the field sheet and the block manifest in `website/` to be byte for byte what the tool makes; then it runs the packaging tool's checker (visible text, links, picture addresses, tracking tags, the settings object, robots, block sizes). It writes only to `site/rollout/`, which git ignores.
- `node production/verify-manifest.mjs` requires 40 pages, every block at its packaged hash and in the manifest, and every hosted file at the hash the blocks were packaged with.
- Both are part of `npm test`.

Checkers under `site/shared/verify/` run with plain Node from the repository (for example `node production/site/shared/verify/contract-check.mjs`, the engine against the pinned live Worker source, and `candidate-check.mjs`, the engine against `quote/src`).

### What is not here, and what does not run here

- The picture masters (full-size covers, logo masters, about 40 MB) and the city research data. `site/directions/coverstory/_work/build-site.mjs` therefore reports missing or older derived pictures here and does not reproduce the built pages; with the masters present it reproduces all 40 byte for byte. The built pages are checked in for that reason. `site/spec/cities.json` is a reduced copy holding only the ZIP table one engine test compares with.
- The tools that set the switch day, derive pictures, minify, or generate a city page from research data.
- A headless-browser helper. `check-site.mjs`, `check-layout.mjs`, `check-map.mjs`, `compare-builds.mjs`, `audit-contact-icons.mjs`, `_work/ghl/simulate.mjs` and `_work/ghl/packaged-send-check.mjs` need one (`PP_PPTR_DIR`, `PP_PLAYWRIGHT_DIR`, `PP_CHROME`) and are kept as source; they are run in the private workspace.
- The built pages are the **review build**: each footer ends with a "Review build" line. The packaging tool reads their rollout form, which is the same page without that line; no block carries it (`_work/ghl/prove-rollout-form.mjs`).
- The staging profile in `_work/ghl/fragments.config.json` holds `.invalid` placeholders. Staging addresses and page ids are kept out of this repository. `POLICY-WORDING.md` is the public edition (the rule and the approved wording only).

### Updating

1. Change the page source or shared piece in the private workspace, build, check and package there.
2. Copy the result here (the same file list as before; nothing private).
3. `node production/update-manifest.mjs --source "<where the change comes from and why>"`, then `npm run build`, `npm run check`, `npm test`.

The hosted files are uploaded beside the files already live, never in place of them (see Assets and content). The upload folder is put together from `site/` by the list in `website/BLOCKS-MANIFEST.json` (`uploadList`); `site-assets/public/` holds only the files that are live today. The footer blocks carry the script loader, so the footer is pasted again after every repackaging.

### Blog index after the switch

`website/blog/prepared/`, `published-cards.json` and `refresh-index.mjs` make the September index. After the switch the index is the Yard Guide page of the rebuilt site (`website/blog/blocks/`, made from `site/directions/coverstory/yard-guide.html` and `site/assets/covers/covers.json`), and the September index must not be pasted again. The September tools stay in the tree until the owner retires them. `validate-prep.mjs` no longer requires the blog head code to load `purge-quote.js`.

## Optional referral request detail (live since October 13, 2026)

The compatible Worker forwards a nonempty string `referredBy` after removing C0/C1 controls and line separators, trimming and cutting to 60 UTF-16 units. Absent, blank and non-string values add no key and never invalidate an otherwise valid request. Existing validation, pricing, fingerprint/ledger, saved plans, attribution and Meta are unchanged. The previous Worker accepts but drops unknown keys, so deploy this Worker before builder 2026-10-13a. The team sees the name without any workflow change: when a name was given, the Worker's team summary (`quoteSummary`, which the intake workflow already prints in the contact note, the owner text and the tasks) gains one line under the customer history line, `Who sent them (as typed by the customer, not verified): <name>`; without a name the summary is byte for byte as before. A contact field for the value is optional and would be mapped from the top-level key. No live workflow is changed by this source patch. The current regression pins the exact approved forward-source additions and compares all old keys and Meta outputs; manifest provenance must be refreshed with production/update-manifest.mjs after npm run build.

## Quote build

State of the checked-in bundle: the hand-off log bundle (SHA-256 `06b43e9d...e50f`, see the first section), live since October 15, 2026 with the owner's approval. Before it the Worker ran the bundle deployed on October 13, 2026 with the owner's approval (SHA-256 `235713cd...2300`: ZIP 46290, the optional referral detail, the read-only request status); before that the October 11 candidate was live. The October 5 release stays in the tree as the regression reference, byte for byte, as `quote/tests/fixtures/2026-10-05-live-worker.mjs` (SHA-256 `113ce3be...a95c`).

`quote/build.mjs` inserts `quote/src/launcher.js` into the Worker template as a JSON string literal. The candidate carries the owner decisions of October 5 to 9, 2026:

- **First cleanup.** A new recurring household's first cleanup is billed at the regular per-visit price with up to 120 minutes included; time beyond 120 minutes is $1 per minute and only after the customer agrees before work starts. A returning household, or one whose history is unclear, gets a restart cleanup: the quoted rate includes 30 minutes, then $1 per minute billed after. A one-time cleanup is $89.99 for the first 30 minutes, then $1 per minute. Ordinary recurring visits are never billed by the minute. The Voice AI one-time price answer says when the base is charged in the approved words: "The $89.99 base is charged when we text that we are on the way." The team note, the Voice AI instruction, `offerVersion` and `cleanupPolicyVersion` (`2026-10-08-no-start-up-fee-120`) say this. Two forwarded keys are new: `newCustomerCleanupIncludedMinutes` (120) and `newCustomerExtraTimeRequiresAgreement` (true). Both are set only for a recurring, non-custom request from a household that said it is new (`offerEligibility` `new_customer_review`); for a returning or unsure household, a one-time cleanup and a custom request they are null, so nothing downstream can show 120 minutes to a household that gets a restart. A self-reported new household is still verified by the team. The "First visit:" line of the team note names the case (new household, one-time cleanup, custom review; unchanged for a returning or unsure household). `promotionalAdditionalMinuteCents` keeps its name and is always null.
- **The bundled widget and landing page are retired** (kept as history in `legacy/2026-10-quote-widget/`). `GET /purge-quote.js` serves the small launcher, which sends old quote buttons, `PurgeProsQuote.open()` and `?open_quote=1` addresses to the quote page. `GET /`, `/quote`, `/quote/`, `/demo` and `/demo.html` answer 302 to the quote page with the query string kept. The target is configuration only; nothing a visitor sends can change it. A browser carries `#resume=...` across the forward, so saved links already sent keep working. The Worker must not be given a route on the quote page's own host: there these five addresses answer 404 rather than forward to themselves.
- **Meta server copy.** Meta's answer is written to the Worker log as one line (`meta_capi_result`: HTTP status, events received, trace id, error code; never the event or personal data).
- Prices, the ZIP list, validation, consent handling, the request ledger (a double submit is forwarded once), seven-day saved plans, attribution capture, `schemaVersion`, `pricingVersion` and the name of every key already forwarded are unchanged.

### Variables added in the candidate (all optional)

| Variable | Default when unset | Effect |
|---|---|---|
| `QUOTE_PAGE_URL` | `https://itspurgepros.com/quote` | Where the forward and the launcher send visitors. Must be a plain `https` address; anything else falls back to the default. |
| `SAVED_LINK_BASE` | `https://quote.itspurgepros.com/` | Base of a new saved-plan link (`<base>#resume=<token>`). The default is the link form of the October 5 release, byte for byte, and the only form the quote builder accepts when it creates a link; the quote host forwards it to the quote page. Leave it unset. Set another `https` base only after the quote builder has been changed to accept that form, and publish both together. A value that is not a plain `https` address falls back to the default. |
| `CURRENT_TERMS_VERSION` | unset: any version is recorded, as before | The Terms version a service request is expected to carry. The rule is accept and flag (owner decision, October 9, 2026): a service request that carries another version is accepted exactly as normal, with the same answer and the same forwarded keys, and the team note gains one line after "Terms accepted", naming the version the customer accepted and the current one, so the team confirms the current Terms before approval. No request is turned away for its Terms version; the earlier mode setting and its 400 answer were removed and no variable brings them back. The version text is put on that line as plain single-line text. A retried, already accepted request is answered from the request ledger as before, whatever this variable holds at the time. |
| `META_TEST_EVENT_CODE` | unset | When set, the Meta copy carries `test_event_code` and appears only under Meta's Test Events. Remove it after a test. |
| `STAGING` | unset | Marks a staging copy: the Meta copy is sent only when `META_TEST_EVENT_CODE` is also set (a blank code does not count). Any value other than empty, `0` or `false` is a staging mark, so a slip such as `true` still protects. Never set on the production Worker. |

`ALLOWED_ORIGINS` is unchanged. A staging copy gets its page origin through that variable.

### Regression

`npm test` runs `quote/tests/regression.mjs`. It loads the October 5 reference and the candidate in plain Node (the Cloudflare-only import is replaced in the test loader, with stand-ins for every outgoing call and for the ledger and plan store) and sends both the same seeded requests, more than 1,000 of them: every request type, valid and invalid input, out-of-area ZIPs, repeated and simultaneous submissions, saved plans, Voice AI pricing, the legacy intake address and every page address. Status, headers, body and everything forwarded must be identical apart from a printed list of approved differences, each asserted to equal its approved value. It also checks 1,000 server price combinations and six fixed prices, the ZIP list, thirteen protected code blocks byte for byte, the new behaviour above, and that no retired first-cleanup wording remains in the bundle. Seven blocks are untouched code. The other five (the forward builder, request intake, the Voice AI price answer and the two halves of the router) carry approved edits: the test puts each approved line back and requires the rest to equal the October 5 release, so any further edit there fails until it is listed in the test as approved. The thirteenth block is the forward to the quote page, which is new code with no October 5 text: it is pinned to its reviewed text, and a separate case sends target-shaped values (`?to=`, `?url=` and others) and requires the forward to stay on the configured page with the value only riding along in the query string. Saved-plan links must equal the reference and match the one form the quote builder accepts. `fixtures/pre-icons-worker.mjs` (September 21) is kept as history only. Neither fixture is a deployment artifact.

### Staging copy (`quote/wrangler.staging.json`)

A configuration file only; committing it deploys nothing. It describes a separate Worker, `purge-lead-relay-v5-staging`, on its `workers.dev` address: no route, no custom domain, and its own request ledger declared with `new_sqlite_classes`, so it can never read or write the live ledger. Replace the two `.invalid` placeholders (`QUOTE_PAGE_URL`, `ALLOWED_ORIGINS`) with the staging page's address and origin before use. The file carries no secrets. `SAVED_LINK_BASE` is deliberately not set: the quote builder accepts only the default link form, so a staging save answers a link on the live quote host. To test opening on staging, copy the `#resume=<token>` part onto the staging quote page's address; opened on the live host, the link reports that it is unavailable, because the plan is stored only in the staging ledger.

The staging file sits beside the live configuration (`quote/wrangler.json`, Worker `purge-lead-relay`), and wrangler reads `wrangler.json` when no file is named. Every wrangler command for the staging copy is therefore run from the repository root and names the file: `--config production/quote/wrangler.staging.json`. A command typed without `--config` inside `production/quote/` would act on the live Worker and is not allowed. Read the Worker name wrangler prints (`purge-lead-relay-v5-staging`) before confirming anything. The staging file has not yet been given to wrangler, not even as a dry run.

Secrets are never stored in this repository and are entered only by the owner, in Cloudflare, one at a time:

| Secret | On the staging copy |
|---|---|
| `GHL_WEBHOOK_URL_V3` | Only a staging-only address: a test workflow that just records what arrives, or a stand-in receiver. Never the live webhook address. Without it every `POST /submit` answers "Relay not configured". |
| `GHL_WEBHOOK_URL` | Not needed. Leave unset. |
| `VOICE_AI_QUOTE_TOKEN` | Optional: a new staging-only value, never the live token. Without it `/voice-quote` answers "Voice pricing is not configured." |
| `META_PIXEL_ID`, `META_CAPI_TOKEN` | Leave unset. For one labelled test only, the owner adds both together with the variable `META_TEST_EVENT_CODE`, and removes all three afterwards. With `STAGING` set to `"1"` nothing is sent to Meta without the test code. |
| `GOOGLE_PLACES_API_KEY` | Not needed. Leave unset. |

The production Worker is never deployed from either checked-in configuration (see Boundaries). Production keeps its existing variables and secrets; the new variables are added to it only as the owner approves. With none of them set, the candidate needs no new binding.

### Order at promotion

The candidate forwards the quote host and the old page addresses to the quote page. Promote it only after the quote page answers 200 and shows the builder; until then the forward lands on a not-found page. For the same reason, roll the Worker back first if the quote page is ever to be unpublished. The Voice AI script and the Worker change in the same sitting, since the Worker's instruction to the agent describes the 120-minute rule. No rebuilt page or blog template should still load `/purge-quote.js`: where the launcher loads before the quote builder, the builder stands down and the buttons go to the quote page instead of opening in place.

## Blog index

The checked-in index reflects the last verified September 30 publication: 44 cards. Outdoor Toys published later but remains absent from this index and sitemap as of October 4. Do not recreate the article to fix its listing.

After a native post publishes or changes, reconcile the complete native Published inventory. Update only the public card fields in `website/blog/published-cards.json`, preserving owner changes and unique slugs. Run `npm run build:blog`, then validate the templates. Replace only the existing Home header/index custom-code fragment, save and publish in GHL. Preserve the hidden native Blog Posts block and all native article records. Verify card count, title/summary search, category filters, cover/alt, canonical and desktop/mobile rendering. Record article publication and index publication separately.

If the public sitemap omits a published article, use the existing GHL blog XML sitemap selection and Generate & Save. Preserve its current selections; do not add duplicate custom URLs. Sitemap inclusion does not establish Google indexing.

## Assets and content

Keep existing immutable hashed assets available while adding new versions. The asset folder preserves installed historical hashes as well as current ones so older references continue resolving. Review/test routes and rejected mockups are excluded. GHL-hosted images remain referenced by their existing URLs.

Full blog article records, scheduling and page metadata remain in GHL; public article snapshots and metadata are captured separately when available. The private workspace retains native record mappings and deployment receipts. No customer data or credentials belong in this public repository.


## Job 9: ordinary referral retry identity

A sanitized nonempty referredBy is part of the request fingerprint. Same-ID changes/clears conflict; same-ID unchanged accepted requests replay; uncertain dispatch stays uncertain. Requests without the line retain identical fingerprint and ledger bytes. Prepared offline, not deployed.
