# Conversion Tracking Setup — Google Ads & Meta, Click by Click

This walks you through everything, in order, assuming you haven't touched the inner
workings of either platform in a while. Do Part 0 first, then Google and Meta in
either order. Budget ~45 minutes total.

**The big picture before you click anything:** both platforms need two things —
(1) a small **base tag** installed on every page of your site (Google's `gtag.js`,
Meta's pixel), and (2) a **conversion definition** on the platform telling it which
event counts as a win. The widget already fires the events; your job is making sure
the base tags exist and creating the conversion definitions, then pasting one ID
into the widget config.

---

## Part 0 — Check what's already on your site (5 min)

Your old `/submit-true` tracking means *something* is installed already. Find out what:

1. Open `itspurgepros.com` in Chrome.
2. Right-click → **View Page Source** → Ctrl+F and search for:
   - `googletagmanager.com/gtag/js?id=AW-` → the **Google Ads tag** is installed.
     Note the `AW-XXXXXXXXXX` number — that's your *conversion ID*.
   - `googletagmanager.com/gtm.js` → you have **Google Tag Manager** instead (fine —
     the GTM container usually loads the Ads tag; you'll confirm in step 3).
   - `connect.facebook.net/en_US/fbevents.js` → the **Meta pixel** is installed.
     Search for `fbq('init'` to see your pixel ID (a long number).
3. Optional but recommended: install the **Google Tag Assistant** (tagassistant.google.com,
   no extension needed) and the **Meta Pixel Helper** Chrome extension. Visit your site —
   both will list every tag they detect.

**If a base tag is missing**, install it in GHL once, sitewide:
GHL → **Sites → your website → Settings (gear) → Custom Code → Head Tracking Code** —
paste the snippet(s) there and save/republish:

- Google snippet: Google Ads → Goals → Conversions → (after Part 1 you'll be offered
  it) or Tools → **Google tag** → Installation instructions → "Install manually".
- Meta snippet: Events Manager → your pixel → **Settings → Install manually** (or
  Data Sources → Add → Web → Connect manually).

---

## Part 1 — Google Ads (15 min)

### 1a. Create the "Quote Booked" conversion action

1. Sign in at [ads.google.com](https://ads.google.com).
2. Left sidebar → **Goals → Conversions → Summary** (older UI: Tools & Settings →
   Measurement → Conversions).
3. Click **+ New conversion action**.
4. Choose **Website**. Enter `itspurgepros.com` → **Scan**.
5. Ignore the automatic suggestions — click **+ Add a conversion action manually**.
6. Fill it in:
   - **Goal and action optimization:** category = **Submit lead form**
   - **Conversion name:** `Quote Booked`
   - **Value:** "Don't use a value" (clean start; you can add values later)
   - **Count:** **One** (a person booking twice in a window is still one new customer)
   - **Click-through conversion window:** 30 days · **Engaged-view / view-through:**
     defaults are fine
   - **Attribution model:** Data-driven
7. **Done** → **Save and continue**.

### 1b. Grab the conversion label

1. On the next screen ("set up the tag"), choose the **"Use Google Tag Manager"** or
   **"Install the tag yourself"** view — either shows an **event snippet** containing:
   ```js
   gtag('event', 'conversion', {'send_to': 'AW-123456789/AbC-dEfGhIjK'});
   ```
2. Copy the `AW-123456789/AbC-dEfGhIjK` part. **You do NOT paste this snippet anywhere
   on your site** — the widget fires it for you. You just need the ID.
3. If you closed the screen: Goals → Conversions → click `Quote Booked` → **Tag setup
   → Use Google tag / Install yourself** → the snippet is there.

### 1c. (Recommended) Create a second action: "Quote Unlocked"

Repeat 1a/1b with:
- Conversion name: `Quote Unlocked`
- Category: **Submit lead form** (or *Contact*)
- After saving, open it → **Settings → Primary/Secondary → set to Secondary.**
  Secondary actions are recorded and visible but don't steer bidding — perfect while
  you decide. If booking volume is ever too thin for Smart Bidding, flip this to
  Primary and `Quote Booked` keeps running alongside.

### 1d. Paste both labels into the widget

In `widget/purge-quote.js`, `PQ_CONFIG.tracking`:

```js
googleAdsSendTo:       "AW-123456789/AbC-dEfGhIjK",   // Quote Booked label
googleAdsSendToUnlock: "AW-123456789/XyZ-aBcDeFgH",   // Quote Unlocked label
```

(Re-upload the file to wherever you host it.)

### 1e. Test it

1. Go to [tagassistant.google.com](https://tagassistant.google.com) → **Add domain** →
   your site → it opens your site in a connected window.
2. Walk the funnel: open the quote popup, enter a phone number (use your own), book.
3. In the Tag Assistant window, select your `AW-` tag → **Output** → you should see a
   `conversion` hit when the price unlocked and another at the booking click.
4. In Google Ads, the conversion action's **Status** column flips from "Inactive" to
   **"Recording conversions"** — this can lag up to a few hours; the Tag Assistant
   check is the real-time confirmation.

---

## Part 2 — Meta (15 min)

### 2a. Confirm the pixel and find your Pixel ID

1. Go to [business.facebook.com/events_manager](https://business.facebook.com/events_manager).
2. **Data Sources** → you should see a pixel (a name + long numeric ID). Copy the ID.
3. Click it → **Overview** should show recent activity (PageView events from your
   site). If there is no pixel or no activity, install the base code (Part 0) first.

### 2b. Verify your domain (one-time hygiene)

1. [business.facebook.com](https://business.facebook.com) → **Settings → Brand safety
   and suitability → Domains** (path varies slightly by account age).
2. If `itspurgepros.com` isn't listed/verified: **Add → meta-tag verification** →
   paste the provided `<meta>` tag into GHL's Head Tracking Code → **Verify**.

### 2c. Generate the Conversions API token (server-side backup)

1. Events Manager → your pixel → **Settings** tab → scroll to **Conversions API**.
2. Under "Set up direct integration" → **Generate access token** → copy it
   (long string, treat it like a password).
3. Add both to the worker:
   ```bash
   cd worker
   npx wrangler secret put META_PIXEL_ID      # paste the numeric pixel ID
   npx wrangler secret put META_CAPI_TOKEN    # paste the token
   ```
   (Dashboard alternative: Workers & Pages → purge-lead-relay → Settings → Variables
   and Secrets → add both as **secrets**.)

### 2d. Test it live (this part is genuinely satisfying)

1. Events Manager → your pixel → **Test Events** tab. You'll see a **test code** like
   `TEST12345`.
2. Temporarily give it to the worker so *server* events show up in the test stream:
   ```bash
   npx wrangler secret put META_TEST_EVENT_CODE   # paste TEST12345
   ```
3. In the Test Events tab, enter your website URL → open the site → walk the funnel
   and book with your own info.
4. Watch the stream: you'll see **Lead** arrive twice — once "from Browser" (the
   pixel) and once "from Server" (the worker) — with the **same event ID**, and Meta
   marks them **deduplicated**. That's the whole architecture working.
5. Clean up: delete the test code so production server events flow normally:
   ```bash
   npx wrangler secret delete META_TEST_EVENT_CODE
   ```
6. Ongoing check: pixel → your **Lead** event → **Event ID coverage / deduplication**
   stats show the browser+server pairing rate.

### 2e. Create the "Quote Unlocked" custom conversion

1. Events Manager → left sidebar → **Custom Conversions → Create custom conversion**.
2. Name: `Quote Unlocked` · Data source: your pixel · **Event: QuoteUnlocked**
   (it appears in the dropdown after it has fired at least once — do a test run
   through the phone gate first if it's missing).
3. Category: **Lead** → Create.

### 2f. Point your campaigns at the right event

1. Ads Manager → **+ Create** → objective **Leads** (or Sales — both expose website
   conversions; Leads is the natural fit here).
2. Ad set level → **Conversion location: Website** → **Performance goal: Maximize
   number of conversions** → **Conversion event: Lead**.
3. **Never choose Purchase** — it's an e-commerce event; the widget doesn't fire it
   and Meta would optimize against nothing.
4. If volume is thin early (Meta's learning phase wants ~50 events/week per ad set):
   switch the ad set's conversion event to the **Quote Unlocked** custom conversion.
   It fires at phone capture, so it's several times more frequent and still a real
   captured lead. Move back to **Lead** once bookings can carry the learning phase.

---

## Part 4 — The optimization ladder (what an agency would do)

Ad algorithms learn from whatever event you optimize on, and they're volume-hungry:
Meta's learning phase wants ~50 events/week per ad set; Google Smart Bidding gets
unstable below ~15–30 conversions/month. A new local-service account rarely produces
that many *bookings* — but phone captures run several times higher. So:

1. **Launch optimizing on phone capture.**
   - Meta: ad set conversion event = the `Quote Unlocked` custom conversion.
   - Google: `Quote Unlocked` = **Primary**, `Quote Booked` = **Secondary**.
     (Google blends every Primary action into bidding — keep exactly one primary,
     or unlock+book from the same person counts twice.)
2. **Track both events regardless** — already wired; the choice above only changes
   what steers bidding, not what gets recorded.
3. **Climb down when ads drive ~10–15 bookings/week:** Meta ad sets → `Lead`;
   Google → swap which action is Primary. Expect a 1–2 week re-learning wobble;
   don't panic-edit during it.

**Managing the price-shopper risk** of optimizing on captures: the nurture sequence
exists to close the capture→booking gap, and the scorecard is the **GHL pipeline,
not the platform dashboards**. Weekly: spend per campaign vs. opportunities moved to
*Won*, plus each campaign's **unlock→book ratio** — cheap captures with a bad ratio
means the creative attracts tire kickers; kill the creative, not the strategy.

And anchor on **cost per booked customer**, never cost per lead: a weekly customer at
~$25/visit is $1,300+/year, so even $75 per booked customer is a great trade.

- [ ] Tag Assistant shows the `AW-` conversion firing at unlock and at booking
- [ ] Google Ads: both conversion actions exist; `Quote Booked` = Primary,
      `Quote Unlocked` = Secondary
- [ ] Widget config has both `googleAdsSendTo` values and is re-uploaded
- [ ] Meta Test Events showed Lead from Browser + Server, deduplicated
- [ ] `META_TEST_EVENT_CODE` deleted after testing
- [ ] Custom conversion `Quote Unlocked` exists
- [ ] Active/future ad sets optimize for **Lead** (or Quote Unlocked while ramping)
- [ ] Domain verified in Meta Business settings

## If something doesn't fire

| Symptom | Check |
|---|---|
| Tag Assistant sees no `AW-` tag at all | Base Google tag missing from GHL Head Tracking Code (Part 0) |
| `conversion` event missing but tag present | `googleAdsSendTo` empty/typo'd in the widget config, or you're testing an old cached copy of `purge-quote.js` — hard-refresh / bump the hosted file |
| Google Ads status stuck "Inactive" | Wait a few hours after a real test conversion; the dashboard lags |
| No browser Lead in Test Events | Pixel missing (Part 0), or an ad blocker on your own browser — test in a clean profile |
| No server Lead in Test Events | Worker secrets unset/typo'd, or `META_TEST_EVENT_CODE` not set during the test |
| Two Leads counted (not deduped) | Browser and server event IDs differ — make sure you're on the current widget + worker from this repo |
| Events fire but conversions don't attribute to ads | Click the ad → land with `?gclid=`/`?fbclid=` — the widget stores these; attribution needs the ad click to happen on the same browser/device as the booking, or relies on Meta's hashed-data matching |
