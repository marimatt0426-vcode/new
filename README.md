# Purge Pros transparent-price quote widget

This repository contains the tested Purge Pros v3 quote/service-request widget and its owner-ready launch package.

## Start here

- Documentation index: `docs/README.md`
- Current-state project handoff: `docs/PROJECT-HANDOFF.md`
- Owner implementation guide: `docs/OWNER-DASHBOARD-LAUNCH-GUIDE.md`
- Complete Cloudflare copy/paste file: `dist/COPY-PASTE-INTO-purge-lead-relay.js`
- Complete GHL quote-loader paste block: `dist/PASTE-INTO-GHL-QUOTE-LOADER.html`
- Verified GHL email-domain and deliverability guide: `docs/email-deliverability.md`
- Meta/Facebook launch guide: `docs/facebook-ads/META-ADS-LAUNCH-GUIDE.md`
- SEO audit and roadmap: `docs/audits/SEO-AUDIT-2026-08-09.md`
- New-customer welcome page: `onboarding/pp-new-customer-welcome-widget.html`
- Post-approval onboarding guide and message templates: `docs/onboarding/CUSTOMER-ONBOARDING-GHL-GUIDE.md`

The owner does not run PowerShell, a terminal, NPM, Node, Wrangler, migrations, or a local build. The generated copy/paste file is installed unchanged through the Cloudflare dashboard.

## Final architecture

- The GHL website remains in place.
- The existing `purge-lead-relay` Cloudflare Worker is upgraded with one complete paste.
- Its old `POST /` submission route and existing `GHL_WEBHOOK_URL` secret remain compatible with the current widget/workflows.
- The v3 widget is served at `GET /purge-quote.js` and sends final requests to `POST /submit`.
- A separate `GHL_WEBHOOK_URL_V3` secret sends v3 requests to one new GHL workflow.
- A new clean `Purge Pros — Quote Funnel v3` pipeline keeps new opportunities separate from legacy history.
- Contact deduplication remains on: one person keeps one contact/conversation record, while property-specific opportunity fields allow separate quotes for multiple relatives or service addresses.
- The existing `purge-quote` Worker stays unchanged for immediate rollback.
- Route-day selection stays manual.
- Housecall Pro remains the post-approval system for customer/job setup and its secure card request.

No Netlify app, React app, database, SQL migration, queue, HCP API build, automated routing, or new payment form is required.

## Customer experience

1. Enter ZIP; Enter works the same as **Check availability**.
2. Choose dogs, frequency, named service areas, yard size, and last-cleaned timing.
   - Twice weekly supports up to 9 dogs, Weekly up to 5, and Every Other Week up to 4.
   - Ineligible frequency cards are visibly disabled rather than silently producing a custom result.
   - **Custom booking** handles 10+ dogs, over-one-acre yards, kennels, commercial work, and other manually priced requests.
   - One-time cleanup retains its published base/time model for any dog count on yards up to one acre.
3. See the real standard price or a clearly labeled custom-estimate result before entering contact information.
4. Choose **Request service**, **Send me this quote**, or **Ask a question**.
5. Choose Text, Email, or Phone call when applicable.
6. Text shows one unchecked service/quote SMS permission. Email/Call do not collect SMS permission.
7. Service requests separately require Terms acceptance.
8. Review and submit.
9. Conversion events fire only after Cloudflare validates the submission and GHL accepts it.

The recurring-customer offer defaults to **Initial cleanup fee ($39.99+ value): WAIVED**. It uses the factual minimum fee and a clearly labeled 60-minute example rather than claiming that every yard is worth $99. The main offer card explicitly says the promotion is for recurring service and does not apply to one-time cleanups; the card also disappears when One-time cleanup is selected. Cloudflare `PROMO_*` dashboard variables can disable or change the campaign without rebuilding the funnel.

Desktop uses a polished overlay. Mobile uses the same responsive experience full-screen. Existing site CTAs use `#quote`, `#get-quote`, or `data-purge-quote`; no separate mobile link is required. Paid-ad and other direct landing links can use `https://itspurgepros.com/?open_quote=1` to open the quote tool automatically on the branded website. The widget consumes that one-time instruction while preserving UTM and click-ID attribution.

## Final payload stages

| Stage | Meaning | Service conversion |
|---|---|---:|
| `service_requested` | Standard-price service request | Yes |
| `estimate_requested` | Custom-price service request | Yes |
| `quote_requested` | Copy of displayed quote | No |
| `question_submitted` | Customer question | No |

The new widget never sends the old partial-funnel stages `phone_captured`, `quote_updated`, or `out_of_area`. Ineligible ZIPs are handled before contact collection.

## Analytics contract

For accepted service/custom-estimate requests only, v3 fires:

- Google `generate_lead`;
- the retained Google Ads service conversion `AW-17767139897/g9smCM7pkL4cELmUhJhC`;
- Meta browser `Lead`;
- Meta CAPI `Lead` with the same event ID for deduplication.

The old phone-unlock Google label is intentionally absent because pricing is no longer phone-gated. `/submit-true` is not used.

## Main source and generated files

| Path | Purpose |
|---|---|
| `widget/purge-quote.js` | Branded UI, pricing, validation, accessibility, and browser analytics source |
| `worker/worker.js` | Server validation, price recalculation, GHL forwarding, reviews, and Meta CAPI source |
| `tools/build-dist.js` | Maintainer-only artifact generator |
| `dist/COPY-PASTE-INTO-purge-lead-relay.js` | Exact owner paste file |
| `dist/PASTE-INTO-GHL-QUOTE-LOADER.html` | Exact global GHL HEAD block that gives ad visitors immediate loading feedback before the external widget arrives |
| `dist/purge-pros-quote-v3.worker.js` | Identical tested combined artifact |
| `widget/demo-standalone.html` | Generated offline visual demo |
| `docs/OWNER-DASHBOARD-LAUNCH-GUIDE.md` | Authoritative pipeline, workflow, Cloudflare, analytics, cutover, and rollback guide |
| `tests/` | Build, compatibility, UI contract, routing, price, consent, and payload tests |

Generated artifacts are not edited by hand. A maintainer edits source, regenerates, runs the tests, and gives the owner a new complete paste file.

## Production boundaries

- Never commit webhook URLs, Meta tokens, Google API keys, customer exports, or card data.
- Keep secrets in Cloudflare bindings.
- Send operational quote/service texts only when `consent=yes`. This widget does not collect promotional-SMS permission.
- Do not mark an opportunity Won until route day is approved and HCP/payment setup is complete.
- Keep the legacy Worker/workflows during the initial rollback and workflow-drain window.
