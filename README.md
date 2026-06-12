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
   coverage is multi-select (Back / Front / Side(s) plus a one-tap **Yard+** that selects
   everything): one area = base rate, any two = +$2.50/visit, all three = +$5/visit.
   Selecting **10+ dogs**, **Over 1 acre**, or **Custom Booking** switches to the custom
   path (typed dog count, kennel/commercial sizes, notes, no instant price). Selecting
   **One-Time** shows an inline note that it's a flat base rate + time on site.
3. **Phone gate** — price stays hidden until a valid 10-digit phone is entered. The
   reveal shows the per-visit breakdown (never a monthly figure), the freebies, the
   **first-visit deep clean ON US** banner with explainer popup, and only now the
   WYSIWash add-on and coupon row.
4. **Details** — name, email, address, consent checkbox → "Book My First Visit".
   One-time cleans get a deposit/overtime reminder here.
5. **Confirmation** — then (optionally) an automatic redirect to your conversion page.

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
  "lastCleaned": "2 Weeks", "addons": "WYSIWash Treatment",
  "coupon": "", "perVisitPrice": "53.98",
  "phone": "3175551234", "firstName": "", "lastName": "", "email": "",
  "street": "", "city": "", "state": "IN",
  "notes": "", "question": "", "consent": "yes",
  "ts": "2026-06-12T01:00:00.000Z", "page": "https://itspurgepros.com/"
}
```

## Conversion tracking (Google / Facebook)

Configured in `PQ_CONFIG.tracking`:

- **`redirectUrl`** (default `https://itspurgepros.com/submit-true`): after the
  confirmation screen, the browser redirects there — the exact same page-visit mechanism
  the Housecall Pro flow used, so **existing Google and Facebook conversions keep firing
  with zero pixel changes**. Set `""` to disable.
- **`firePixelEvents`** (default on): if `gtag`, `fbq`, or `dataLayer` exist on the page,
  the widget also fires events directly:
  - `quote_unlocked` / fbq `QuoteUnlocked` — the moment a phone number unlocks the price.
    Import this into Google Ads / Meta as a *secondary* conversion and you can optimize
    campaigns toward "lead captured," not just "booked."
  - `generate_lead` / fbq `Lead` / dataLayer `pq_booking` — on final submit.
- **`trackCustomBookings`**: whether custom-estimate requests also count as conversions.

Longer term you can move to server-side conversions (Google Enhanced Conversions / Meta
CAPI fed from GHL workflows), which survives ad blockers — the webhook already carries
everything needed. Not required to launch.

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

1. Open `widget/purge-quote.js`, set at the top of `PQ_CONFIG`:
   ```js
   leadEndpoint:    "https://purge-lead-relay.YOU.workers.dev",
   reviewsEndpoint: "https://purge-lead-relay.YOU.workers.dev/reviews",
   ```
2. Host the file anywhere public. Easiest: Cloudflare dashboard → **Workers & Pages →
   Create → Pages → Upload assets** → drag the `widget` folder in. You get
   `https://something.pages.dev/purge-quote.js`. (GHL's media library also works if it
   serves raw `.js` files.)

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
   State ← `state`. GHL upserts by phone, so all later stages enrich the same contact.
3. **Actions: Update Contact Field** — one per custom field from section A, mapped from
   the webhook values. Always write `Quote Stage` ← `stage`.
4. **Action: If/Else on `stage`** with five branches:

   | Branch                | Actions                                                                 |
   |-----------------------|-------------------------------------------------------------------------|
   | `phone_captured`      | Add tag `quote-unlocked` · Create opportunity in *Quote Funnel* → stage *Quote Unlocked* |
   | `question_submitted`  | Add tag `question-asked`                                                |
   | `service_requested`   | Add tag `service-requested` · Move opportunity → *Booked*               |
   | `estimate_requested`  | Add tag `estimate-requested` · Move opportunity → *Custom Estimate*     |
   | `out_of_area`         | Add tag `out-of-area`                                                   |

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

- Action 1: **If/Else on `Quote Frequency`**:
  - equals `One-Time Clean` → SMS → **message 7** (one-time + deposit version)
  - everything else → SMS → **message 6** (recurring version)
- Action 2: **Internal notification** (**message 11**) to you/your team — this is your
  cue to schedule the job (and create it in Housecall Pro while that's still your
  scheduling system).
- Action 3 (optional): confirmation **email** (**message 12**) — receipts feel more
  official with an email behind them.

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

- You're already texting from GHL, so your A2P 10DLC registration should cover this —
  but the volume will rise; if you ever see carrier filtering, check your registered
  use-case throughput.
- The widget collects consent ("service-related texts and emails," checkbox at booking,
  disclosure under the phone field). Keep "Reply STOP to opt out" in the **first**
  message of any thread (it's in the copy below), and GHL handles STOP automatically.
- Operating hours on every messaging workflow: 9:00–19:30 local. Nobody books from a
  10 p.m. text; some people report them.

---

## Message copy library

Paste-ready. `{{...}}` are GHL merge fields — after you create the custom fields,
GHL's merge-field picker shows them under *Contact → Custom Fields* (the internal keys
will look like `{{contact.quote_frequency}}`; verify the exact key from the picker
rather than typing blind). Adjust the sign-off name to whoever actually answers texts.

**1 — Instant quote (Workflow 2, ~1 min after phone capture)**

> Hey, it's Matt with Purge Pros 🐾 Here's the quote you just built at itspurgepros.com:
> {{contact.quote_dogs}} dog(s) · {{contact.quote_frequency}} ·
> ${{contact.quote_price_per_visit}} per visit. You pay per visit — never a monthly
> bill, no contracts. Your first-visit deep clean ($99+ value) is on us. Want it? Just
> reply YES and I'll get you on the schedule. Reply STOP to opt out.

**2 — Nurture touch 1 (45 min)**

> Still thinking it over? Totally fine — your quote is saved:
> ${{contact.quote_price_per_visit}}/visit for {{contact.quote_dogs}} dog(s),
> {{contact.quote_frequency}}. The free first-visit deep clean stays on the table when
> you start any recurring plan. Reply YES whenever you're ready and consider it handled.
> — Matt @ Purge Pros

**3 — Nurture touch 2 (next day)**

> Morning! Matt with Purge Pros again 👋 Quick thought — the families who rate us
> 5 stars on Google mostly say the same thing: "I never think about the yard anymore."
> That's the whole product. Your {{contact.quote_frequency}} spot is still
> ${{contact.quote_price_per_visit}}/visit. Reply YES and your yard becomes our problem,
> not yours.

**4 — Nurture touch 3 (day 3)**

> Heads up — we're locking in next week's routes around {{contact.quote_zip}} right now.
> If you want your yard on the schedule before the weekend, today's the day: reply YES
> and you're in. First visit (the big catch-up clean) is free with your plan.
> — Purge Pros 🐾

**5 — Nurture touch 4, breakup (day 6)**

> Last text from me, promise 🙂 I'll keep your ${{contact.quote_price_per_visit}}/visit
> quote on file for 30 days. If the yard ever gets away from you — vacation, busy
> season, new puppy chaos — just text this number and we'll reset it to zero.
> — Matt @ Purge Pros

**6 — Booking confirmation, recurring (Workflow 4)**

> 🎉 You're in! Got your request for {{contact.quote_frequency}} service at
> {{contact.address1}}. I'll text you shortly with your first visit day. What happens
> next: visit #1 is the full deep clean (free with your plan), then it's
> ${{contact.quote_price_per_visit}} per visit — you'll get a heads-up text before every
> arrival and a gate photo when we're done. Welcome aboard! — Matt @ Purge Pros 🐾

**7 — Booking confirmation, one-time (Workflow 4)**

> 🎉 Got your one-time clean request for {{contact.address1}}! Quick recap: $89.99 base
> covers your first 30 minutes of labor, then $1/min until the yard is spotless — waste
> hauled away included. I'll text you a secure link for the base-rate deposit to lock in
> your slot, and anything beyond the 30 minutes settles up after the job. Talk soon!
> — Matt @ Purge Pros

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

> 🔔 NEW {{contact.quote_stage}}: {{contact.first_name}} {{contact.last_name}} ·
> {{contact.phone}} · {{contact.address1}}, {{contact.city}} {{contact.quote_zip}} ·
> {{contact.quote_dogs}} dogs · {{contact.quote_frequency}} ·
> ${{contact.quote_price_per_visit}}/visit · Add-ons: {{contact.quote_addons}} ·
> Last cleaned: {{contact.quote_last_cleaned}} · Notes: {{contact.quote_notes}}

**12 — Booking confirmation email (optional, Workflow 4)**

> **Subject:** Your Purge Pros service is confirmed 🎉
>
> Hi {{contact.first_name}},
>
> You're officially on the Purge Pros schedule. Here's your plan:
>
> - **Service:** {{contact.quote_frequency}} · {{contact.quote_dogs}} dog(s)
> - **Coverage:** {{contact.quote_areas}} · {{contact.quote_yard_size}}
> - **Your rate:** ${{contact.quote_price_per_visit}} per visit — billed per visit,
>   never monthly, no contracts
> - **First visit:** full deep clean, on us
>
> Before every visit you'll get a text, and a gate photo when we're done. Questions?
> Just reply to the text thread or this email.
>
> — The Purge Pros Team · (317) 961-5865 · itspurgepros.com

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
- [ ] Booking redirect lands on `/submit-true` and your Google/FB conversions register

**Go-live:**
- [ ] `purge-quote.js` hosted, `leadEndpoint`/`reviewsEndpoint` set to production worker
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
