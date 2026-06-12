# Purge Pros — Instant Quote Widget

A self-contained popup quote funnel for [itspurgepros.com](https://itspurgepros.com) that
captures **leads** (not just bookings) into GoHighLevel. The price is the bait; the phone
number is the gate. The moment a visitor types a valid 10-digit number, their price is
revealed *and* the lead — with full quote context — lands in GHL, even if they never
click another button.

```
widget/purge-quote.js        The whole widget: UI, pricing engine, lead sender (no dependencies)
widget/demo.html             Local demo page (needs purge-quote.js next to it)
widget/demo-standalone.html  Single-file demo — double-click to open, widget embedded inside
worker/worker.js             Cloudflare Worker: lead relay to GHL + live Google reviews
worker/wrangler.toml         Worker config (Place ID already set)
tools/place-id-from-url.js   Derives a Google Place ID from a full Maps URL
```

**Contents:** [The funnel](#the-funnel) · [Lead capture design](#how-lead-capture-works) ·
[Conversion tracking](#conversion-tracking-google--facebook) · [Live review chip](#live-google-review-chip) ·
[Deployment, step by step](#deployment-step-by-step) · [GHL build-out](#gohighlevel-build-out) ·
[Message copy library](#message-copy-library) · [Testing & go-live checklist](#testing--go-live-checklist) ·
[Troubleshooting](#troubleshooting)

---

## The funnel

1. **ZIP gate** — out-of-area visitors hit a "Keep Me Posted" email capture
   (stage `out_of_area` in GHL — that's your expansion waitlist).
2. **Build your plan** — dog count (dropdown) → frequency → yard coverage → yard size →
   last cleaned. **No dollar amounts appear anywhere before the phone gate.** Yard
   coverage is multi-select with **no preselection** — every chip toggles freely on/off
   (Back / Front / Side(s) plus a one-tap **Yard+** that selects everything): one area =
   base rate, any two = +$2.50/visit, all three = +$5/visit. The price won't render
   until at least one area is chosen, with a prompt pointing at the chips.
   Selecting **10+ dogs**, **Over 1 acre**, or **Custom Booking** switches to the custom
   path (typed dog count, kennel/commercial sizes, notes, no instant price). Selecting
   **One-Time** shows an inline note that it's a flat base rate + time on site.
3. **Phone gate** — price stays hidden until a valid 10-digit phone is entered. The
   reveal shows the per-visit breakdown (never a monthly figure), the freebies, the
   **"Initial Deep-Clean Fee ($99+ value): WAIVED"** banner with explainer popup
   (precise wording matters: lead with WAIVED; the visit itself is billed at the
   normal per-visit rate), and only now the
   WYSIWash treatment and coupon row. **Treatments are deliberately excluded from the
   per-visit total** — they're shown as "+$X/treatment" in their own block ("billed
   per treatment, only when you book one — never added to every visit; most yards do
   about one a month"), because customers aren't locked into a treatment every visit
   and folding it into the per-visit price would misstate what they'll be charged.
4. **Details** — name, email, address, an optional **"When would you like us to
   start?"** dropdown (ASAP / within a week / next few weeks / just looking — feeds
   route planning and lets you triage hot leads), consent checkbox → "Lock In My Spot".
   Recurring plans see a **"nothing is charged today"** reassurance (card on file
   comes later, charged per visit on service day); one-time cleans get the
   deposit/overtime reminder instead.
5. **Confirmation** — deliberately worded around how scheduling actually works: *the
   rate is locked, a real person now checks routes near you and texts to set your first
   visit day; sign-ups outside business hours hear back first thing.* Nothing promises
   an instant slot. Then (optionally) an automatic redirect to your conversion page.

An in-progress quote is saved in the browser for 24 hours, so someone who closes the
popup and comes back resumes where they left off instead of starting over.

## How lead capture works

The widget **never sends keystrokes** — it sends state transitions, debounced and deduped:

| Stage                | Fires when                                                 | Typical count |
|----------------------|------------------------------------------------------------|---------------|
| `phone_captured`     | A valid 10-digit phone is fully typed (800 ms debounce)   | 1 per number  |
| `quote_updated`      | Options change *after* the price was unlocked (2.5 s lazy) | 0–2           |
| `question_submitted` | "Send My Question" clicked                                 | 0–1           |
| `service_requested`  | "Book My First Visit" clicked (standard path)              | 0–1           |
| `estimate_requested` | "Request My Estimate" clicked (custom path)                | 0–1           |
| `out_of_area`        | "Keep Me Posted" clicked with a valid email                | 0–1           |

Identical payloads for a stage are never re-sent (content hashing), so a complete lead
costs **2–4 requests total**. Price math is 100% client-side — zero API calls to show or
update the price.

Every payload carries the full quote context:

```json
{
  "stage": "phone_captured",
  "zip": "46032", "dogs": "2", "frequency": "Weekly",
  "areas": "Back & Front Yard", "yardSize": "Medium · ¼ acre",
  "lastCleaned": "2 Weeks", "startTiming": "As soon as possible",
  "addons": "WYSIWash Treatment",
  "coupon": "", "perVisitPrice": "53.98",
  "phone": "3175551234", "firstName": "", "lastName": "", "email": "",
  "street": "", "city": "", "state": "IN",
  "notes": "", "question": "", "consent": "yes",
  "ts": "2026-06-12T01:00:00.000Z", "page": "https://itspurgepros.com/"
}
```

## Conversion tracking (Google / Facebook)

> **Hands-on setup guide:** [docs/ads-tracking-setup.md](docs/ads-tracking-setup.md)
> walks both platforms click by click — creating the conversion actions, grabbing the
> labels, CAPI token, live testing, and which event to optimize campaigns on.

**Design principle: no redirects, no waiting.** A page redirect after booking loses
conversions — people close the tab or lock their phone the second they see the
confirmation, and a page-load over a mobile connection is a gamble. Instead, events
fire **in place, at the millisecond of the submit click**, before the confirmation
even renders, using beacon transport (the browser delivers the hit even if the tab
closes immediately after). A server-side backup covers the rest.

Three layers, most reliable wins:

1. **Browser events at submit click** (`PQ_CONFIG.tracking`):
   - Google Ads: set **`googleAdsSendTo`** to your conversion label
     (`"AW-123456789/AbC-dEfGhIjK"`). To create it: Google Ads → **Goals → Conversions →
     + New conversion action → Website → enter your URL → "Add a conversion action
     manually"** → category *Submit lead form*, count *One*. On the "use Google tag"
     screen, choose the option that shows the **tag snippet / event snippet** — the
     `send_to` value inside it is what you paste into the config. Requires the Google
     tag (`gtag.js`) installed sitewide, which you already have if conversions fire
     today.
   - Meta: nothing to configure — if the Meta pixel (`fbq`) is on the page, the widget
     fires a standard **Lead** event with a unique `eventID`.
   - A generic `generate_lead` (GA4) and a `dataLayer` push fire too, for GTM users.

2. **Server-side Meta CAPI backup (recommended):** the worker re-sends the same Lead
   to Meta's Conversions API with the **same `eventID`**, so Meta deduplicates the
   pair automatically — the server event only "wins" when the browser one was lost
   (instant tab close, ad blocker, iOS privacy). User data is SHA-256-hashed
   (phone/email) per Meta's spec, plus `fbp`/`fbc` cookies and click IDs the widget
   captures from ad-click URLs. Setup: Meta **Events Manager → your pixel → Settings →
   Conversions API → Generate access token**, then:
   ```bash
   npx wrangler secret put META_PIXEL_ID
   npx wrangler secret put META_CAPI_TOKEN
   ```
   That's it — it activates automatically and never slows a lead down.

3. **Google server-side (optional, later):** the widget captures `gclid` from ad
   landings (stored 90 days, sent with every lead). Map it to a `Quote GCLID` contact
   field in the intake workflow and you can use **Google Ads offline conversion
   import / Enhanced Conversions for Leads** — e.g. only count bookings you actually
   scheduled (opportunity → Won) as conversions. Nice upgrade once volume justifies it;
   layer 1 is plenty to launch.

Also fired (layer 1 only): `quote_unlocked` / fbq `QuoteUnlocked` the moment a phone
number unlocks the price. Import it as a *secondary* conversion in Google Ads / Meta
and you can optimize campaigns toward "lead captured," not just "booked."

**`redirectUrl`** still exists for the legacy `/submit-true` page-visit mechanism but
defaults to `""` — leave it off. If you ever set it, it redirects *after* the events
above have already fired, so it can only add, never lose.

**`trackCustomBookings`**: whether custom-estimate requests also count as conversions
(default yes — a kennel lead is worth more than a 1-dog booking).

## Live Google review chip

The first trust chip shows your **live rating and review count** from your Google
Business Profile, e.g. "5.0★ Google · 102 reviews".

The worker's `GET /reviews` route calls the Google Places API (New) for just `rating`
and `userRatingCount`, caches the answer at the Cloudflare edge for 6 hours, and
visitors' browsers cache it another 12. Google sees roughly **4 API calls per day**
regardless of traffic — comfortably inside the free tier ($0).

Your Place ID is already configured in `worker/wrangler.toml`:
`ChIJwxBb4j_CQ2IRKXPCYz1Nk78` (Purge Pros - Pet Waste Removal).
If anything fails (quota, outage, misconfig), the chip silently falls back to the static
text — the funnel never breaks over a badge.

---

## Deployment, step by step

### Step 1 — Google Cloud API key (~5 min, $0)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with
   the Google account that manages your business.
2. Top bar → project dropdown → **New Project** → name it `purge-pros-web` → Create.
3. Left menu → **APIs & Services → Library** → search **"Places API (New)"** → Enable.
   (Make sure it says "(New)" — there's an older one with the same name.)
4. **APIs & Services → Credentials → + Create Credentials → API key.** Copy the key.
5. Click the new key to edit it → under **API restrictions** choose *Restrict key* →
   tick only **Places API (New)** → Save. (The key lives server-side as a worker
   secret, so it never appears in your page source — but restricting it is free
   insurance.)
6. Billing must be enabled on the project (Google requires a card on file), but at
   ~120 calls/month you will never be charged — the free tier is thousands of calls.

### Step 2 — GHL inbound webhook (~2 min)

1. In your GHL sub-account: **Automation → Workflows → + Create Workflow → Start from
   scratch.** Name it **`Quote Widget — Intake`**.
2. Add Trigger → **Inbound Webhook**. GHL displays a unique URL like
   `https://services.leadconnectorhq.com/hooks/XXXX/webhook-trigger/YYYY` — copy it.
3. Leave this workflow open in a tab; you'll finish building it in the
   [GHL build-out](#gohighlevel-build-out) section after sending a test payload.

> If your plan doesn't show the Inbound Webhook trigger (it's a Workflow Premium
> feature), say so — the worker can be switched to call the GHL Contacts API directly
> with a Private Integration token instead. Same result, slightly different setup.

### Step 3 — Deploy the Cloudflare Worker (~10 min, $0)

Terminal path (needs Node.js installed):

```bash
cd worker
npx wrangler login          # opens a browser to authorize (free Cloudflare account)
npx wrangler deploy         # prints your URL, e.g. https://purge-lead-relay.YOU.workers.dev
npx wrangler secret put GHL_WEBHOOK_URL          # paste the URL from Step 2
npx wrangler secret put GOOGLE_PLACES_API_KEY    # paste the key from Step 1
```

No-terminal path: [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers &
Pages → Create → Create Worker** → name it `purge-lead-relay` → Deploy → **Edit code** →
replace the contents with `worker/worker.js` → Deploy. Then **Settings → Variables and
Secrets**: add secret `GHL_WEBHOOK_URL`, secret `GOOGLE_PLACES_API_KEY`, and plain-text
variable `GOOGLE_PLACE_ID` = `ChIJwxBb4j_CQ2IRKXPCYz1Nk78`.

Sanity-check the reviews route in a browser:
`https://purge-lead-relay.YOU.workers.dev/reviews` → should show
`{"rating":5,"count":102}` (your live numbers).

### Step 4 — Configure & host the widget

**Which worker is which:** `purge-lead-relay` is the back office — it *receives* leads
and review lookups, so both endpoints below point at it. The hosting worker
(`purge-quote`) is just a file server — its URL only ever appears in the site's
script tag and as the live demo address, never as an endpoint.

1. Set the endpoints. With the paste-in hosting worker (recommended, step 2 below)
   this happens in the labeled box at the top of that worker's code — you do NOT need
   to edit the source file:
   ```js
   const LEAD_ENDPOINT    = "https://purge-lead-relay.YOU.workers.dev";
   const REVIEWS_ENDPOINT = "https://purge-lead-relay.YOU.workers.dev/reviews";
   ```
   (Only if hosting some other way — e.g. Cloudflare Pages — set the same two values
   as `leadEndpoint`/`reviewsEndpoint` in `PQ_CONFIG` at the top of
   `widget/purge-quote.js` and rebuild with `node tools/build-dist.js`.)
2. Host the file anywhere public. **Easiest path — a second Worker (no Pages needed):**
   in the Cloudflare dashboard create a Worker (e.g. `purge-quote`) → **Edit code** →
   select all → paste the entire contents of **`dist/purge-quote-host.worker.js`** →
   **Deploy**. That worker then serves:
   - `https://purge-quote.YOU.workers.dev/purge-quote.js` — the widget, for your site's
     script tag
   - `https://purge-quote.YOU.workers.dev/` — a live demo page you can open anywhere,
     including your phone

   The paste-in file is **generated** — after any edit to `widget/purge-quote.js`
   (config, copy, pricing), run `node tools/build-dist.js` and re-paste. Changes go
   live within ~5 minutes (the JS is edge-cached briefly).

   Alternative: Cloudflare **Pages** (Workers & Pages → Create → the *Pages* tab →
   Upload assets → drag the `widget` folder) gives a `*.pages.dev` URL — same result,
   different UI.

### Step 5 — Embed in your GHL site

1. GHL site builder → your site → **Settings → Custom Code** (or the page's footer
   tracking code box) → add:
   ```html
   <script src="https://YOUR-HOST/purge-quote.js" defer></script>
   ```
2. Edit your existing "Get a Quote" button → set its **Link URL to `#quote`**. That's
   it — the widget intercepts the click and opens the popup. Any number of buttons can
   point at `#quote`. (Alternatively add attribute `data-purge-quote` to any element,
   or call `window.PurgeProsQuote.open()` from code.)
3. Remove/retire the old Housecall Pro booking embed whenever you're confident.

---

## GoHighLevel build-out

Build these in order. Total time: roughly an evening.

### A. Custom fields (Settings → Custom Fields → Contact)

Create these **text** fields (exact names keep the mapping obvious):

| Field label            | What lands in it                       |
|------------------------|----------------------------------------|
| `Quote ZIP`            | `zip`                                  |
| `Quote Dogs`           | `dogs`                                 |
| `Quote Frequency`      | `frequency` (e.g. "Weekly")            |
| `Quote Areas`          | `areas` (e.g. "Back & Front Yard")     |
| `Quote Yard Size`      | `yardSize`                             |
| `Quote Last Cleaned`   | `lastCleaned`                          |
| `Quote Start Timing`   | `startTiming` ("As soon as possible" …)|
| `Quote Addons`         | `addons`                               |
| `Quote Price Per Visit`| `perVisitPrice` (e.g. "28.99")         |
| `Quote Stage`          | `stage` (latest stage seen)            |
| `Quote Question`       | `question`                             |
| `Quote Notes`          | `notes` (custom bookings)              |

### B. Tags

`quote-unlocked` · `question-asked` · `service-requested` · `estimate-requested` ·
`out-of-area` · `quote-abandoned` (optional bookkeeping) · `nurture-stop` (manual
escape hatch — add it to any contact to silence the nurture sequence).

### C. Pipeline (optional but recommended)

**Opportunities → Pipelines → + New**: name `Quote Funnel`, stages:
**Quote Unlocked → In Nurture → Booked → Custom Estimate → Won → Lost.**
You'll move opportunities in the workflows below. This gives you a one-screen view of
how many captured quotes are sitting unbooked right now.

### D. Workflow 1 — `Quote Widget — Intake` (Inbound Webhook trigger)

This is the router. It writes data and applies tags; the tag-triggered workflows below
do the actual messaging. Keeping messaging out of this workflow makes it easy to edit
copy later without touching the plumbing.

1. **Send a test payload first** so GHL learns the field names: open the demo page with
   `leadEndpoint` pointed at your worker, walk the funnel with your own phone number.
   In the trigger's mapping screen the JSON keys (`zip`, `dogs`, `frequency`…) appear.
2. **Action: Create/Update Contact** — map Phone ← `phone`, Email ← `email`,
   First Name ← `firstName`, Last Name ← `lastName`, Address ← `street`, City ← `city`,
   State ← `state`, Postal Code ← `zip`. GHL upserts by phone, so all later stages
   enrich the same contact. (`zip` is mapped twice on purpose: Postal Code completes
   the standard address; the `Quote ZIP` custom field in step 3 is what the message
   templates reference and preserves the ZIP they quoted with.)
3. **Actions: Update Contact Field** — one per custom field from section A, mapped from
   the webhook values. Always write `Quote Stage` ← `stage`.
4. **Action: If/Else on `stage`** with five branches:

   | Branch                | Actions                                                                 |
   |-----------------------|-------------------------------------------------------------------------|
   | `phone_captured`      | Add tag `quote-unlocked` · **Find Opportunity** (*Quote Funnel*) → If/Else: **not found** → **Create Opportunity** (stage *Quote Unlocked*, name/source/value); **found** → nothing (guards against duplicate cards and against demoting someone already Booked/Won) |
   | `question_submitted`  | Add tag `question-asked`                                                |
   | `service_requested`   | Add tag `service-requested` · **Find Opportunity** (*Quote Funnel*, most recent) → **Update Opportunity** → stage *Booked* (the Find puts the card "in context" — without it the Update has nothing to act on and silently does nothing) |
   | `estimate_requested`  | Add tag `estimate-requested` · **Find Opportunity** (*Quote Funnel*, most recent) → **Update Opportunity** → stage *Custom Estimate* |
   | `out_of_area`         | Add tag `out-of-area`                                                   |

   If the action exposes them (sometimes behind a "show advanced/add fields"
   expander), set opportunity name `{{inboundWebhookRequest.frequency}} ·
   {{inboundWebhookRequest.dogs}} dogs · {{inboundWebhookRequest.zip}}`, source
   `quote-widget`, value `{{inboundWebhookRequest.perVisitPrice}}` — but these are
   cosmetic/reporting niceties; skip them if the new actions don't offer the fields.
   (GHL's legacy **Create/Update Opportunity** action also works with duplicates off
   and previous-stage moves off, but it's marked for deprecation — new builds should
   use Find/Create/Update.)

   (`quote_updated` needs no branch — steps 2–3 already refreshed the fields.)

### E. Workflow 2 — `Instant Quote Text` (trigger: tag `quote-unlocked` added)

The crown jewel. The lead gets their price **in writing, by text, within a minute of
typing their number** — even if they close the popup one second later. They now carry
your quote in their pocket with a one-word path to booking.

- Workflow settings: **allow re-entry OFF** (one instant text per contact).
- Action 1: **Wait 1 minute** (feels human, not robotic).
- Action 2: **SMS → message 1** from the [copy library](#message-copy-library).
- Action 3 (optional): **Internal notification** to you — new hot lead with all fields.

When they reply "YES", it lands in your GHL conversation inbox — close it by hand, or
add a reply-trigger workflow later once volume justifies it.

### F. Workflow 3 — `Abandoned Quote Nurture` (trigger: tag `quote-unlocked` added)

- Workflow settings: re-entry OFF, and set **operating hours 9:00–19:30** so waits never
  release a text at 2 a.m.
- **Goal Event** (the workflow's exit door): *Contact tag added* = `service-requested`.
  The instant they book, GHL pulls them out of this sequence mid-wait. Add the same goal
  for tag `nurture-stop`.

Sequence (each If/Else checks "has tag `service-requested` OR `estimate-requested`" →
end, as a belt-and-suspenders backup to the goal):

| Step | Wait      | Action                                  |
|------|-----------|------------------------------------------|
| 1    | 45 min    | SMS → **message 2** (gentle nudge + free deep clean) |
| 2    | 1 day     | SMS → **message 3** (social proof)       |
| 3    | 2 days    | SMS → **message 4** (route scarcity)     |
| 4    | 3 days    | SMS → **message 5** (30-day breakup) · Add tag `quote-abandoned` · Move opportunity → *Lost* |

Four touches over ~6 days, then silence. More than that burns numbers and goodwill.

### G. Workflow 4 — `Booking Confirmation` (trigger: tag `service-requested` added)

**Important context:** submitting the form does NOT put anyone on the schedule. You
check your routes first and confirm the visit day by text. Everything below is written
around that — the automated text confirms the *rate* and the *request*, sets the
expectation that a human is checking routes, and invites them to reply with preferred
days. The actual scheduling conversation is yours, in the GHL inbox.

- Action 1: **If/Else on `Quote Frequency`**:
  - equals `One-Time Clean` → SMS → **message 7** (one-time + deposit version)
  - everything else → SMS → **message 6** (recurring version)
- Action 2: **Internal notification** (**message 11**) to you/your team. This is your
  cue to do the route check.
- Action 3 (optional): confirmation **email** (**message 12**) — receipts feel more
  official with an email behind them. The email also repeats the "we'll text you to set
  your day" expectation so nobody sits waiting for a calendar invite.

**The human scheduling loop (your part):**

1. Notification arrives with everything you need: address, ZIP, dog count, frequency,
   price, and **Quote Start Timing** (their own urgency — "As soon as possible" gets
   handled before "Just looking for now").
2. Check your routes for that ZIP/neighborhood.
3. Open the contact's conversation in GHL — messages 6/7 are already sitting in the
   thread — and send **message 13** (saved as a GHL Snippet) with the route days and
   next opening filled in.
4. Once the date is agreed, send **message 14** (the full onboarding message: card-on-
   file link coming, night-before reminder, day-of ETA text, portal), send the secure
   payment link, create the job in Housecall Pro (while that's still your scheduling
   system), and move the opportunity to **Won**.

**Response-time guardrails:** the confirmation texts promise "usually quick during
business hours; evenings/weekends you'll hear from us first thing." Hold yourself to
that — a captured booking that waits a day starts shopping again.

### G2. Workflow 4b (optional) — `Scheduling Reminder` (trigger: tag `service-requested` added)

A safety net so no booking slips through on a busy day:

- Wait **4 hours** (with operating hours set, so an 11 p.m. booking checks at ~1 p.m.
  next day).
- **If/Else:** opportunity still in stage *Booked* (i.e., you haven't moved it to *Won*)
  → send yourself another internal notification: *"⏰ Still unscheduled:
  {{contact.first_name}} · {{contact.phone}} · {{contact.quote_zip}} — booked 4+ hours
  ago, route check pending."*

### H. Workflow 5 — `Custom Estimate Request` (trigger: tag `estimate-requested` added)

- Action 1: SMS → **message 8** (acknowledgment with a real-person promise).
- Action 2: Internal notification (**message 11** works, retitled) — custom requests are
  high-value (kennels, acreage, commercial); call these back personally and fast.

### I. Workflow 6 — `Question Asked` (trigger: tag `question-asked` added)

- Action 1: SMS → **message 9** (instant "real human is on it" ack).
- Action 2: Internal notification including `Quote Question` + all quote fields. Reply
  from the GHL conversation view — the thread is already open with their full context.

### J. Workflow 7 — `Out-of-Area Waitlist` (trigger: tag `out-of-area` added)

- Action 1: **Email** → **message 10** (no SMS — they gave email only, and consent
  language matters).
- When you expand: Contacts → Smart List filtered by tag `out-of-area` + `Quote ZIP` =
  the new ZIPs → bulk email "we just launched in your area" with the quote link.

### A2P/compliance notes

- **Point-of-collection consent:** the phone field carries explicit consent language
  ("By entering your number, you agree to receive texts… Msg & data rates may apply;
  msg frequency varies. Reply STOP to opt out, HELP for help."). This is the disclosure
  carriers look for — **screenshot the phone-gate step and keep it on file**; A2P 10DLC
  campaign reviews ask you to show exactly where and how opt-in happens. A checkbox is
  NOT required at the point of collection — clear disclosure + the affirmative act of
  entering the number is the accepted pattern (and a checkbox there would tax your
  highest-converting moment). The express-consent checkbox at checkout is the second,
  stronger layer.
- You're already texting from GHL, so your A2P 10DLC registration should cover this —
  but volume will rise; if you ever see carrier filtering, check your registered
  use-case throughput. If you update your campaign registration, describe the opt-in
  as: "Customer enters phone number on itspurgepros.com quote form after on-screen
  consent disclosure; express consent checkbox at booking."
- GHL handles STOP/UNSUBSCRIBE automatically (marks the contact DND) and HELP replies.
  Never message around DND.
- Operating hours on every messaging workflow: 9:00–19:30 local. Nobody books from a
  10 p.m. text; some people report them.

### Running ads against this funnel

- **Meta: optimize for Leads, never Purchase.** Purchase is an e-commerce event;
  miscategorizing hurts Meta's optimization and benchmarks. Run a sales/conversions
  campaign optimizing for the **Lead** event (fires at booking, browser + CAPI deduped).
- **If booking volume is too low for learning** (Meta wants ~50 events/week/ad set):
  create a **custom conversion from the `QuoteUnlocked` event** in Events Manager and
  optimize on that — it fires at phone capture, so it's more frequent and still
  represents a real captured lead. Switch optimization to Lead once volume supports it.
- **Google Ads:** the conversion action you created (`googleAdsSendTo`) is the primary
  goal; you can additionally import `quote_unlocked` via GA4/GTM as a secondary action.
- These are *self-qualified* website leads — they walked your whole pricing flow before
  converting. Expect higher cost-per-lead than instant forms but far higher close rates;
  judge campaigns on booked customers, not raw lead count.

---

## Message copy library

Paste-ready. `{{...}}` are GHL merge fields — after you create the custom fields,
GHL's merge-field picker shows them under *Contact → Custom Fields* (the internal keys
will look like `{{contact.quote_frequency}}`; verify the exact key from the picker
rather than typing blind). Adjust the sign-off name to whoever actually answers texts.

**1 — Instant quote (Workflow 2, ~1 min after phone capture)**

> Hey, it's Matt with Purge Pros 🐾 Here's the quote you just built:
> {{contact.quote_dogs}} dog(s) · {{contact.quote_frequency}} ·
> ${{contact.quote_price_per_visit}} per visit. No contracts, no monthly bills — you
> only ever pay per visit. And your first visit? We waive the $99+ initial yard prep,
> so it's just your regular rate. Whenever you're ready, reply YES and I'll grab your
> spot on the route. Reply STOP to opt out.

**2 — Nurture touch 1 (45 min)**

> Still thinking it over? Totally fine — your quote is saved:
> ${{contact.quote_price_per_visit}}/visit for {{contact.quote_dogs}} dog(s),
> {{contact.quote_frequency}}. And the $99+ initial deep-clean fee stays waived with
> any recurring plan — your first visit costs just your regular rate. Reply YES
> whenever you're ready and consider it handled. — Matt @ Purge Pros

**3 — Nurture touch 2 (next day)**

> Morning! Matt with Purge Pros again 👋 Quick thought — the families who rate us
> 5 stars on Google mostly say the same thing: "I never think about the yard anymore."
> That's the whole product. Your {{contact.quote_frequency}} spot is still
> ${{contact.quote_price_per_visit}}/visit. Reply YES and your yard becomes our problem,
> not yours.

**4 — Nurture touch 3 (day 3)**

> Heads up — we're locking in next week's routes around {{contact.quote_zip}} right now.
> If you want your yard on the schedule before the weekend, today's the day: reply YES
> and you're in. The $99+ initial deep-clean fee is still waived — your first visit
> (the big catch-up clean) costs just your regular per-visit rate. — Purge Pros 🐾

**5 — Nurture touch 4, breakup + closer offer (day 6)**

> Last text from me, promise 🙂 Two things before I leave you alone: (1) your
> ${{contact.quote_price_per_visit}}/visit quote stays on file for 30 days — if the
> yard ever gets away from you, just text this number. (2) If you start your plan this
> week, your SECOND visit is on us. First visit deep-cleans the yard at your regular
> rate, second one's free, and by then you'll get why people stay. Reply YES to grab
> it. — Matt @ Purge Pros 🐾

**6 — Booking confirmation, recurring (Workflow 4)**

> 🎉 Got it — your rate is locked: ${{contact.quote_price_per_visit}}/visit for
> {{contact.quote_frequency}} service at {{contact.address1}}. We build each week
> around routes, so I'm checking which days we're in your neighborhood right now —
> your visit-day options are coming in my next text. If you signed up outside business
> hours, you'll hear from me first thing. And just so you know: nothing is charged
> today. — Matt @ Purge Pros 🐾

**7 — Booking confirmation, one-time (Workflow 4)**

> 🎉 Got your one-time clean request for {{contact.address1}}! Quick recap: $89.99 base
> covers your first 30 minutes of labor, then $1/min until the yard is spotless — waste
> hauled away included. I'm checking our routes for your area now and I'll text you back
> with available days plus a secure link for the base-rate deposit that locks your slot.
> Signed up after hours? You'll hear from me first thing. Got a day that works best?
> Reply with it. — Matt @ Purge Pros

**8 — Custom estimate acknowledgment (Workflow 5)**

> Got your request! Bigger properties deserve a real number, not a guess — I'm looking
> at your details now ({{contact.quote_dogs}} dogs, {{contact.quote_yard_size}}) and
> you'll have a personalized estimate by text today. Anything you want to add, just
> reply here. — Matt @ Purge Pros

**9 — Question acknowledgment (Workflow 6)**

> Got your question — a real human (me) is on it, not a bot 🙂 You'll have an answer
> shortly. Your quote details came through with it, so no need to repeat anything.
> — Matt @ Purge Pros

**10 — Out-of-area waitlist email (Workflow 7)**

> **Subject:** You're on the Purge Pros launch list 🐾
>
> Hey there — thanks for checking on ZIP {{contact.quote_zip}}! We're not scooping your
> neighborhood quite yet, but we're expanding around the Indy area fast and you're now
> first in line. The moment we launch in your area, you'll get an email from us with
> founding-customer pricing. Until then: may your shoes stay clean.
> — The Purge Pros Team · itspurgepros.com

**11 — Internal notification (Workflows 4/5, to you)**

> 🔔 NEW {{contact.quote_stage}} — ROUTE CHECK NEEDED: {{contact.first_name}}
> {{contact.last_name}} · {{contact.phone}} · {{contact.address1}}, {{contact.city}}
> {{contact.quote_zip}} · {{contact.quote_dogs}} dogs · {{contact.quote_frequency}} ·
> ${{contact.quote_price_per_visit}}/visit · Wants to start:
> {{contact.quote_start_timing}} · Add-ons: {{contact.quote_addons}} ·
> Last cleaned: {{contact.quote_last_cleaned}} · Notes: {{contact.quote_notes}}

**12 — Booking confirmation email (optional, Workflow 4)**

> **Subject:** Your Purge Pros rate is locked in 🎉
>
> Hi {{contact.first_name}},
>
> Your Purge Pros rate is locked in. Here's your plan:
>
> - **Service:** {{contact.quote_frequency}} · {{contact.quote_dogs}} dog(s)
> - **Coverage:** {{contact.quote_areas}} · {{contact.quote_yard_size}}
> - **Your rate:** ${{contact.quote_price_per_visit}} per visit — billed per visit,
>   never monthly, no contracts
> - **First visit:** initial deep clean — the $99+ fee is waived; you're billed just
>   your regular per-visit rate
>
> **What happens next:** we build our weeks around routes, so we're checking which day
> we're in your neighborhood — you'll get a text shortly to set your first visit day
> (if you signed up in the evening or on a weekend, expect it first thing). After that,
> you'll get a heads-up text before every visit and a gate photo when we're done.
> Questions? Just reply to the text thread or this email.
>
> — The Purge Pros Team · (317) 961-5865 · itspurgepros.com

**13 — Manual dispatch: route check result (you send this, Workflow 4 step 3)**

Save as a **Snippet** in GHL (Conversations → Snippets) so it's one click with
blanks to fill. Message 6 already thanked them, so this one gets straight to it:

> Alright, routes checked! We're in your area on **[DAYS]** — the next opening is
> **[DATE]**. Would that work for your first service? — Matt @ Purge Pros

**14 — Manual dispatch: officially scheduled (you send this once the date is agreed)**

Also save as a Snippet. This is the full onboarding message:

> Awesome, thank you! You are officially on the schedule for **[DAY, MM/DD]** 🐾
>
> Here's what to expect next:
>
> 💳 Payment: I'm sending a separate text with a secure link to add your card on file
> before your first service. No monthly bills — we only charge per visit, on the day
> of service, once our ETA text goes out.
>
> ⏱️ Timing: Your online portal may show a placeholder time, but our routes change
> daily. We'll text you the night before as a reminder, then on the day with an exact
> ETA when we're on the way, and again the moment we're finished!
>
> 📱 Your Portal: Check your email for your portal link — past/future appointments,
> invoices, and service photos (like proof of a locked gate) all live there.
>
> Thank you for choosing Purge Pros! Save this number — we're here 24/7/365. Have a
> wonderful day!

### Offer strategy — discounts that don't attract ghosts

Two rules learned the hard way (yours and every agency's):

1. **Never discount the first visit.** Visit #1 is your most expensive visit (the deep
   clean) — a "$9.99 first visit" or "free first clean" hands your costliest labor to
   exactly the people most likely to take it and vanish. You already got hosed by this
   once; the structure was the problem, not the customers.
2. **Discount visit #2, not visit #1.** "Start this week and your second visit is on
   us" is ghost-proof: they pay full rate for the expensive deep-clean visit, the card
   is already on file, and the freebie only exists *after* they've paid once. It costs
   you ~one routine visit (~$25 of labor) and lands right when the habit is forming.
   That's why it sits in **message 5 only** — the final touch, so you never give it to
   the majority who book without it. Don't move it earlier: an offer in touch 1 trains
   every future lead to wait for the discount.

The deep-clean fee waiver IS your headline offer — a real $99+ value with built-in
ghost protection (it requires starting a recurring plan and paying the per-visit
rate). Frame it as the deal everywhere; hold the visit-2-free card for closers and,
later, win-back campaigns on 30+ day-old `quote-abandoned` contacts.

Writing tips baked into the above, if you edit: lead with their number ("your quote",
"$28.99/visit") not your pitch; one idea per text; always end with the single action
(reply YES); sign a human name — reply rates to "Matt" beat reply rates to "Purge Pros";
never send two texts without a reply in between except across nurture days.

---

## Testing & go-live checklist

**Local (before deploying anything):**
- [ ] Open `widget/demo-standalone.html` → walk the funnel with ZIP `46032`
- [ ] F12 console shows leads firing at the right moments and *not* on keystrokes
- [ ] ZIP `85701` shows the out-of-area path
- [ ] One-Time, Custom Booking, and 10+ dogs paths all behave

**After worker deploy:**
- [ ] `https://YOUR-WORKER/reviews` returns your live rating/count in a browser
- [ ] Walk the demo with `leadEndpoint` set, using your own phone number
- [ ] Contact appears in GHL with all custom fields populated
- [ ] You receive message 1 (~1 min later)
- [ ] Don't book; confirm message 2 arrives after ~45 min
- [ ] Re-walk and book; confirm message 6 arrives AND nurture stops (goal exit)
- [ ] Meta Events Manager → **Test Events**: book once and watch the Lead arrive —
      with CAPI configured you'll see browser + server events deduped into one
- [ ] Google: with `googleAdsSendTo` set, use Tag Assistant (tagassistant.google.com)
      to confirm the conversion event fires at the submit click

**Go-live:**
- [ ] `purge-quote.js` hosted, `leadEndpoint`/`reviewsEndpoint` set to production worker
- [ ] `googleAdsSendTo` set with your Google Ads conversion label
- [ ] `META_PIXEL_ID` / `META_CAPI_TOKEN` secrets on the worker (server-side backup)
- [ ] Script tag in GHL site footer; quote buttons point at `#quote`
- [ ] `ALLOWED_ORIGINS` set on the worker (locks the lead endpoint to your domain)
- [ ] Old Housecall Pro booking embed retired
- [ ] Watch the *Quote Funnel* pipeline for the first week and tune nurture copy

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Button does nothing | Script tag missing/404, or button link isn't exactly `#quote` |
| Leads in console but not GHL | `leadEndpoint` empty, worker secret `GHL_WEBHOOK_URL` unset, or `ALLOWED_ORIGINS` doesn't include the page's exact origin (www vs non-www counts) |
| Contact created but fields empty | Intake workflow field mapping — re-send a test payload and re-map |
| Review chip stays static | `reviewsEndpoint` unset, or `/reviews` returns an error (open it in a browser; check key restriction = Places API (New), billing enabled) |
| Texts not sending | Workflow operating hours, contact DND, or A2P registration/throughput |
| Two contacts for one person | They used different phone numbers at the gate vs. checkout — GHL upserts by phone; merge by hand, rare in practice |
| Funnel "stuck" mid-state while testing | The 24 h resume feature — finish a booking or test in an incognito window to start fresh |
