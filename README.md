# Purge Pros — Instant Quote Widget

A self-contained popup quote funnel for [itspurgepros.com](https://itspurgepros.com) that
captures **leads** (not just bookings) into GoHighLevel. The price is the bait; the phone
number is the gate. The moment a visitor types a valid 10-digit number, their price is
revealed *and* the lead — with full quote context — lands in GHL, even if they never
click another button.

```
widget/purge-quote.js   The whole widget: UI, pricing engine, lead sender (no dependencies)
widget/demo.html        Local demo page — open in a browser to try the funnel
worker/worker.js        Cloudflare Worker that relays leads to your GHL inbound webhook
worker/wrangler.toml    Worker config
```

## The funnel

1. **Check your area** — ZIP gate. Out-of-area visitors hit a "Notify Me" email capture
   (tagged `out_of_area` in GHL — that's your expansion waitlist).
2. **Build your plan** — dogs → frequency → yard areas → yard size → last cleaned.
   No personal info needed, so visitors click through freely. Selecting **10+ dogs**,
   **Over 1 acre**, or **Custom Booking** switches to the custom path (typed dog count,
   kennel/commercial sizes, notes, no instant price).
3. **Phone gate** — price stays hidden until a valid 10-digit phone is entered. The
   reveal shows the per-visit breakdown (no monthly figure, per your pay-per-visit model),
   the freebies, the **$99+ initial deep-clean WAIVED** banner with the "What's this?"
   explainer popup, optional WYSIWash add-on, and the "Have Questions?" panel.
4. **Almost there** — name, email, address, consent checkbox → "Start My Service".
5. **Confirmation** — "You're on the schedule!" (or "Request received!" for custom).

## How lead capture works (and why it won't spam your API)

The widget **never sends keystrokes** — it sends state transitions, debounced and deduped:

| Stage                | Fires when                                                | Typical count |
|----------------------|-----------------------------------------------------------|---------------|
| `phone_captured`     | A valid 10-digit phone is fully typed (800 ms debounce)  | 1 per number  |
| `quote_updated`      | Options change *after* the price was unlocked (2.5 s lazy)| 0–2           |
| `question_submitted` | "Send My Question" clicked                                | 0–1           |
| `service_requested`  | "Start My Service" clicked (standard path)                | 0–1           |
| `estimate_requested` | "Send My Request" clicked (custom path)                   | 0–1           |
| `out_of_area`        | "Notify Me" clicked with a valid email                    | 0–1           |

Identical payloads for a stage are never re-sent (content hashing), so a complete lead
costs **2–4 requests total**. Price math is 100% client-side — zero API calls to show or
update the price.

## Setup

### 1. Deploy the relay worker (free Cloudflare account)

```bash
cd worker
npx wrangler deploy
npx wrangler secret put GHL_WEBHOOK_URL   # paste your GHL inbound webhook URL
```

Optionally lock it to your domain by setting `ALLOWED_ORIGINS` in `wrangler.toml`.
Note the deployed URL, e.g. `https://purge-lead-relay.YOURNAME.workers.dev`.

### 2. Configure the widget

Open `widget/purge-quote.js` — everything editable is in `PQ_CONFIG` at the top:

- `leadEndpoint`: your worker URL from step 1 (leave `""` to test — leads log to console)
- `brand.phoneDisplay` / `phoneHref`: **TODO — placeholder right now**, set your real line
- `brand.chips`: trust badges (set your real Google review count when you want it shown)
- `serviceZips`, `frequencies`, `areas`, `yardSizes`, `addons`: your live pricing table
- `coupons`: empty (row hidden). Add e.g. `SCOOP10: { type: "percent", value: 10, label: "10% off" }`
- `copy.consent`: the TCPA consent line — this is your cover for texting leads who typed
  a number but never submitted. Keep it visible.

### 3. Embed in your GHL site

Host `purge-quote.js` anywhere public (Cloudflare Pages is free; GHL's media library also
works if it serves raw JS). Then in the GHL site builder:

1. **Settings → Custom Code → Footer** (or a per-page footer code block), add:
   ```html
   <script src="https://YOUR-HOST/purge-quote.js" defer></script>
   ```
2. Point any button at `#quote` (Link URL: `#quote`), or add `data-purge-quote` to any
   element. The widget intercepts the click and opens the popup. You can also call
   `window.PurgeProsQuote.open()` from your own code.

### 4. Wire up GoHighLevel

Create one workflow: **Trigger → Inbound Webhook**. Use its URL as `GHL_WEBHOOK_URL`.
Send a test lead from the demo page so GHL learns the payload shape, then:

1. **Create/Update Contact** mapped from `phone`, `email`, `firstName`, `lastName`,
   `street`, `city`, `state` (GHL upserts by phone, so step-3 and step-4 events land on
   the same contact).
2. Create **custom fields** and map them: `quote_zip`, `quote_dogs`, `quote_frequency`,
   `quote_areas`, `quote_yard_size`, `quote_last_cleaned`, `quote_addons`,
   `quote_price_per_visit`, `quote_stage`, `quote_question`, `quote_notes`.
3. **If/Else on `stage`** → apply tags: `quote-phone-captured`, `quote-question`,
   `service-requested`, `estimate-requested`, `out-of-area`.

Then build your automations off those tags, all inside GHL (no Make needed):

- **Abandoned quote**: trigger on tag `quote-phone-captured` → wait 45–60 min → if
  contact does NOT have `service-requested` → SMS: *"Hey {{first_name | default:'there'}},
  you were checking weekly service for {{quote_dogs}} dogs at ${{quote_price_per_visit}}/visit —
  want me to grab you a spot this week?"* → drip from there.
- **New service**: tag `service-requested` → confirmation SMS + your onboarding pipeline
  (and your Housecall Pro handoff, until/unless GHL fully takes over scheduling).
- **Custom estimate**: tag `estimate-requested` → internal notification + SMS ack.
- **Expansion waitlist**: tag `out-of-area` → store ZIP, notify on launch.

## Testing locally

Open `widget/demo.html` in a browser. In-area ZIP: `46032`. Out-of-area: `85701`.
With `leadEndpoint` empty, every would-be lead is logged to the dev console so you can
inspect exactly what GHL will receive.

## Pricing sanity checks (from the source spreadsheet)

- Weekly, 2 dogs, Front & Back, Medium ¼ acre → 22.49 + 2.50 + 4.00 = **$28.99/visit**
- Twice Weekly, 9 dogs, all sides, 1 acre → 27.99 + 5.00 + 12.00 = **$44.99/visit**
- Every Other Week caps at 4 dogs; Weekly at 5; Twice Weekly at 9; beyond → Custom
- One-Time: **$89.99 flat** any dog count, surcharges waived, 30 min labor included then
  $1/min, base-rate deposit at scheduling
- WYSIWash add-on: $19.99 (2x/wk), $24.99 (weekly), $29.99 (bi-weekly), $29.99 (one-time)
- "Last cleaned" never affects price — informational only
- Initial deep-clean fee ($99+) waived for new recurring customers; explainer popup
  reproduces the $39.99 base + ~$60 labor → $0.00 math; not valid for one-time cleans
