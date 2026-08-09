# Purge Pros project handoff

**Current as of:** August 9, 2026

**Production website:** <https://itspurgepros.com/>

**Active quote system:** Purge Pros v3 transparent-price quote and service-request widget

## System summary

- The website remains in GoHighLevel.
- The public widget is served by the existing Cloudflare `purge-lead-relay` Worker.
- The owner deploys the complete file at `dist/COPY-PASTE-INTO-purge-lead-relay.js` through the Cloudflare dashboard.
- The browser posts accepted final submissions to `POST /submit`.
- Cloudflare validates and recalculates the request before forwarding it to GoHighLevel.
- Route-day approval remains manual.
- Housecall Pro is used after route approval for customer/job setup and the secure card request.
- No database, Netlify app, payment form, automatic route optimizer, or local owner-side build process is required.

## Current customer journey

1. Check ZIP availability.
2. Choose dog count, service frequency, named service areas, yard size, and last-cleaned timing.
3. See a standard per-visit price or a clearly labeled custom-estimate result before providing contact details.
4. Request service, request a quote copy, or ask a question.
5. Choose the preferred contact method.
6. Text requires the unchecked service/quote SMS permission; email and phone do not.
7. Service requests require Terms acceptance.
8. Review and submit.
9. A service conversion fires only after validation and GoHighLevel acceptance.

## Final workflow stages

| Payload stage | Meaning | Service conversion |
|---|---|---:|
| `service_requested` | Standard-price service request | Yes |
| `estimate_requested` | Custom-price service request | Yes |
| `quote_requested` | Copy of the displayed quote | No |
| `question_submitted` | Customer question | No |

The transparent-price widget does not send the legacy partial-funnel stages `phone_captured`, `quote_updated`, or `out_of_area`. It does not use `/submit-true`.

## Paid-ad landing behavior

The production paid-ad destination is:

```text
https://itspurgepros.com/?open_quote=1
```

The latest widget captures UTM and click-ID attribution, opens the quote interface, removes only the one-time `open_quote` instruction from the visible URL, and retains the attribution values for an accepted request. This behavior is covered by `tests/widget.test.mjs`.

## Conversion contract

Accepted `service_requested` and `estimate_requested` submissions fire:

- Google `generate_lead`
- Google Ads conversion `AW-17767139897/g9smCM7pkL4cELmUhJhC`
- Meta browser `Lead`
- Meta CAPI `Lead` using the same event ID for deduplication

No service conversion fires on widget open, ZIP check, price display, contact entry, quote-copy request, question, validation failure, or failed GoHighLevel delivery.

## Current recurring-service offer

- Initial cleanup fee: waived for qualifying new recurring customers.
- The offer does not apply to one-time cleanups.
- The offer card disappears when One-time cleanup is selected.
- The default factual minimum is `$39.99+`; a time-based example must be labeled as an example rather than a guaranteed savings amount.
- Cloudflare `PROMO_*` variables can change or disable the campaign without redesigning the widget.

## Authoritative files

| File | Purpose |
|---|---|
| `widget/purge-quote.js` | UI, pricing, validation, accessibility, attribution, and browser analytics source |
| `worker/worker.js` | Server validation, price recalculation, GHL delivery, reviews, and Meta CAPI source |
| `tools/build-dist.js` | Maintainer artifact generator |
| `dist/COPY-PASTE-INTO-purge-lead-relay.js` | Complete owner copy/paste deployment file |
| `docs/OWNER-DASHBOARD-LAUNCH-GUIDE.md` | Detailed operational implementation guide |
| `docs/ads-tracking-setup.md` | Exact analytics contract and identifiers |
| `docs/facebook-ads/META-ADS-LAUNCH-GUIDE.md` | Current Meta launch structure, budget, and evaluation rules |

## Security boundaries

- Secrets remain Cloudflare bindings and are never committed.
- Do not store customer information, card information, private webhook URLs, or access tokens in Git.
- Preserve browser/server Meta deduplication by keeping the shared event ID.
- Do not mark an opportunity Won until route approval and Housecall Pro/payment setup are complete.
