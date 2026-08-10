# Purge Pros v3 conversion tracking contract

**Updated:** August 9, 2026

This file is the focused analytics companion to `OWNER-DASHBOARD-LAUNCH-GUIDE.md`.

## Known production identifiers retained in code

- Google tag account ID: `AW-17767139897`
- Accepted service/custom-request conversion: `AW-17767139897/g9smCM7pkL4cELmUhJhC`
- Meta Pixel binding: existing Cloudflare secret `META_PIXEL_ID`
- Meta CAPI token: existing Cloudflare secret `META_CAPI_TOKEN`

The v3 copy/paste file already contains the full Google Ads `send_to` value. The owner does not look it up, edit generated code, or create a replacement conversion.

The old phone-unlock label `AW-17767139897/vX_bCO_4kL4cELmUhJhC` is intentionally absent from v3. Transparent pricing has no quote-unlock action.

## When a conversion fires

Only after Cloudflare validates the form and HighLevel accepts it:

| Final submission | Google `generate_lead` | Google direct conversion | Meta browser Lead | Meta CAPI Lead |
|---|---:|---:|---:|---:|
| `service_requested` | Yes | Yes | Yes | Yes |
| `estimate_requested` | Yes | Yes | Yes | Yes |
| `quote_requested` | No | No | No | No |
| `question_submitted` | No | No | No | No |

No conversion fires on widget open, ZIP check, price view, contact entry, SMS checkbox, a failed submission, or `/submit-true`.

## Meta ad destination and URL parameters

For an ad that should open the quote tool immediately, use these two separate Meta ad fields:

**Website URL**

```text
https://itspurgepros.com/?open_quote=1
```

**URL parameters**

```text
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

In Ads Manager, the Website URL is under the ad's **Destination** section. The URL-parameter field is normally under **Tracking** or **Build a URL parameter** in that same ad. Paste only the parameter string into that field; do not add another `?` and do not paste the Website URL a second time.

Meta replaces the brace values when someone clicks. The widget stores the resulting platform, campaign, ad, and ad-set names in session storage and sends them with an accepted request. These labels do not alter the customer-facing quote or count as conversions.

The `open_quote=1` instruction opens the responsive quote tool after the branded website loads. The widget then removes only that instruction from the visible address while retaining the UTM values. Do not use the `workers.dev` preview as the ad destination; production CAPI intentionally ignores preview-origin submissions unless a Meta test-event code is present.

## Deduplication

The browser and server Meta events share the same `requestId:stage` event ID. Meta receives a browser Lead and CAPI Lead as the two sides of one deduplicated conversion.

Google receives the request ID as `transaction_id` to reduce repeat counting.

## Existing bindings

Keep these values in the existing `purge-lead-relay` Worker:

- `META_PIXEL_ID`
- `META_CAPI_TOKEN`
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID`
- `GHL_WEBHOOK_URL`

Do not reveal or regenerate a working secret. A Cloudflare code deployment preserves the bindings.

`META_TEST_EVENT_CODE` is optional and temporary. Add it only while deliberately testing in Meta Events Manager; remove it afterward. Without a test code, the v3 relay suppresses CAPI submissions originating from the `workers.dev` preview so dashboard testing does not pollute production Meta results.

## QA

On a website preview that includes the real site tags:

1. Submit one clearly marked service test.
2. Confirm HighLevel received one request ID.
3. Confirm the Google conversion request uses the retained service label.
4. Confirm Meta shows browser and server Lead events with the same event ID.
5. Confirm Meta marks them deduplicated.
6. Submit a quote-copy test and verify no service conversion.
7. Submit a question test and verify no service conversion.
8. Verify event parameters contain no name, phone, email, street, or customer question.

Do not change campaigns, bidding, budgets, audiences, pixels, tags, or historical conversion actions during the code cutover. First prove the preserved event contract, then evaluate campaign-goal cleanup separately.

## Official references

- Google Ads conversion event snippets: <https://support.google.com/google-ads/answer/7548399>
- Google Ads transaction IDs: <https://support.google.com/google-ads/answer/6386790>
- Meta Conversions API: <https://developers.facebook.com/docs/marketing-api/conversions-api/>
