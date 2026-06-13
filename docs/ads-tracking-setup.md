# Conversion Tracking — Purge Pros Live Setup (Google Ads + Meta)

This is the complete, click-by-click setup for YOUR account specifically. Your real
IDs are baked into every step — no placeholders. Where the guide says paste, you can
paste verbatim.

## What you already have (verified from your site header)

| Thing | Status | Value |
|---|---|---|
| Google Ads tag (gtag.js), sitewide | ✅ installed | `AW-17767139897` |
| Meta Pixel, sitewide, PageView firing | ✅ installed | `770811879146972` |
| Widget script, sitewide | ✅ installed | `https://purge-quote.purgepros.workers.dev/purge-quote.js` |
| Google campaign | 🟢 ACTIVE — keep it running; we edit, not rebuild (Part 1e) |
| Meta campaign | ⏸️ paused — we'll build a fresh one (Part 2f) |
| Site buttons → `#quote` | ⬜ not yet — LAST step, after tracking verifies (Part 3) |

**Order of operations (don't shuffle):**
1. Google: create the two conversion actions, get the labels (Part 1a–1d)
2. Paste the labels into the purge-quote worker and deploy (Part 1f)
3. Meta: CAPI token + worker secrets + custom conversion (Part 2a–2e)
4. Verify everything on the live site — *before* any visitor can see the widget (Part 1g, 2d)
5. Only then: point your site buttons at `#quote` and do the campaign edits (Part 3, 1e, 2f)

---

## Part 1 — Google Ads

### 1a. First, audit what's there (5 min — do not skip)

Your current conversion comes from visits to `/submit-true`. Find it:

1. [ads.google.com](https://ads.google.com) → left sidebar **Goals → Conversions →
   Summary**.
2. You'll see a table of conversion actions. Identify the one tied to the
   `/submit-true` page (likely a "Page view" / website conversion — note its exact
   name; we'll call it the **legacy action**).
3. Note its **Primary/Secondary** status (column "Action optimization" or similar) —
   it's almost certainly Primary today.
4. Also scan for any OTHER Primary actions you forgot about (calls from ads, etc.).
   Every Primary action feeds your campaign's bidding. Know your full list before
   adding more.

**Leave the legacy action exactly as it is for now.** It keeps recording your
Housecall Pro flow until the buttons flip in Part 3. Touch it only at cutover.

### 1b. Create conversion action #1: "Quote Booked"

1. Still in Goals → Conversions → Summary → **+ New conversion action**.
2. **Website** → enter `itspurgepros.com` → Scan.
3. Ignore the suggestions → click **+ Add a conversion action manually**.
4. Settings:
   - Goal category: **Submit lead form**
   - Conversion name: `Quote Booked` (exact — you'll thank yourself later)
   - Value: **Don't use a value** (you can add values once you trust the data)
   - Count: **One**
   - Click-through window: **30 days** · Engaged-view/view-through: defaults
   - Attribution model: **Data-driven**
5. **Done → Save and continue.**
6. On the tag-setup screen pick any "see the tag/snippet" option. The event snippet
   contains your label:
   ```js
   gtag('event', 'conversion', {'send_to': 'AW-17767139897/XXXXXXXXXXX'});
   ```
   Copy the full `AW-17767139897/XXXXXXXXXXX` string somewhere — that's the **Quote
   Booked label**. (Do NOT paste the snippet into your site — the widget fires it.)
   If you closed the screen: click the action → **Tag setup → Use the Google tag /
   install yourself** → it's there.

### 1c. Create conversion action #2: "Quote Unlocked"

Repeat 1b exactly, with name `Quote Unlocked` (category Submit lead form or Contact —
either is fine). Copy its label too. You now have two labels, both starting
`AW-17767139897/`.

### 1d. Set Primary/Secondary (the optimization ladder, applied)

Per the ladder in Part 4: at your booking volume, the algorithm should chase phone
captures first.

1. Open `Quote Unlocked` → set to **Primary**.
2. Open `Quote Booked` → set to **Secondary** (recorded + visible everywhere, doesn't
   steer bidding — yet).
3. Legacy `/submit-true` action: **leave Primary for now** (it's still your only
   live conversion source until the buttons flip).

### 1e. Your ACTIVE campaign: edit or rebuild?

**Keep it. Do not create a new campaign, do not pause it.** Conversion actions live
at the *account* level; campaigns just choose which ones to optimize toward. Two
possibilities — check which applies:

1. Campaign → **Settings → Goals** (sometimes "Conversion goals").
2. If it says it uses **account-default goals**: you're done — Primary actions
   automatically feed it. Your only job is managing which actions are Primary (1d
   and the cutover in Part 3).
3. If it has **campaign-specific goals** selected: add the "Submit lead form" goal
   (which contains your two new actions) to its list so the new Primaries count.

**What to expect after the cutover changes bidding signals:** when the legacy action
goes Secondary and `Quote Unlocked` becomes the live Primary (Part 3), Smart Bidding
enters a re-learning period — typically 1–2 weeks of wobblier CPCs/volume. This is
normal and unavoidable when changing conversion goals. Do not panic-edit, do not
change budgets or bids during the wobble, and make all the goal changes in ONE
sitting rather than dribbling them out (each change restarts learning).

### 1f. Put the labels into the widget (via the hosting worker)

You configure this in the **purge-quote worker's editable box**, not in any source
file:

1. Cloudflare → Workers & Pages → **purge-quote** → Edit code.
2. At the top, fill in both lines with YOUR labels from 1b/1c:
   ```js
   const GOOGLE_ADS_SEND_TO = "AW-17767139897/XXXXXXXXXXX";        // Quote Booked
   const GOOGLE_ADS_SEND_TO_UNLOCK = "AW-17767139897/YYYYYYYYYYY"; // Quote Unlocked
   ```
   (Don't swap them: SEND_TO fires at booking, SEND_TO_UNLOCK at phone capture.)
3. **Deploy.** The widget JS is edge-cached ~5 minutes; wait that out before testing.

### 1g. Verify on the LIVE site (not the demo page — important)

⚠️ **The demo page (`purge-quote.purgepros.workers.dev`) has NO Google tag and NO
Meta pixel** — those live only in your GHL site's header. Pixel events can never
fire on the demo page, so all tag verification happens on **itspurgepros.com**. Since
your buttons aren't wired yet, open the widget by hand:

1. Go to [tagassistant.google.com](https://tagassistant.google.com) → **Add domain**
   → `itspurgepros.com` → it opens your site in a connected debug window.
2. In that window, open the browser console (F12 → Console tab) and run:
   ```js
   PurgeProsQuote.open()
   ```
   The quote popup opens on your live site, with your live tags present.
3. Walk the funnel: ZIP `46032` → build a plan → enter your real cell → **watch Tag
   Assistant**: the `AW-17767139897` tag should log a `conversion` event the moment
   the price unlocks (that's Quote Unlocked).
4. Finish the booking → a second `conversion` event fires at the click of "Lock In
   My Spot" (that's Quote Booked), plus a `generate_lead`.
5. In Google Ads, the actions' Status will flip from "Inactive/No recent conversions"
   to **"Recording conversions"** — this lags hours; Tag Assistant is your real-time
   truth. The conversions themselves can take up to a day to appear in reports.

---

## Part 2 — Meta

### 2a. Confirm the pixel in Events Manager (2 min)

1. [business.facebook.com/events_manager](https://business.facebook.com/events_manager)
   → **Data Sources** → pixel `770811879146972`.
2. Overview should show steady **PageView** activity from your site (your header
   fires it). If activity is there, the pixel side is healthy — nothing to install.

### 2b. Verify your domain (one-time, if not already done)

1. Business Settings → **Brand safety and suitability → Domains** (location varies
   slightly).
2. If `itspurgepros.com` isn't verified: Add → **Meta-tag verification** → copy the
   `<meta>` tag → paste it into GHL's **Head Tracking Code** (same box as your
   pixel) → save/republish → back in Meta, click **Verify**.

### 2c. Conversions API token → worker secrets (the server-side backup)

1. Events Manager → pixel `770811879146972` → **Settings** tab → scroll to
   **Conversions API** → under "Set up direct integration" → **Generate access
   token** → copy it (long string; treat like a password).
2. Add both secrets to the **purge-lead-relay** worker (NOT purge-quote — the relay
   is the one that talks to Meta). Dashboard path: Workers & Pages →
   **purge-lead-relay** → Settings → Variables and Secrets → add as **secrets**:
   - `META_PIXEL_ID` = `770811879146972`
   - `META_CAPI_TOKEN` = the token
   (Terminal alternative: `npx wrangler secret put META_PIXEL_ID` etc. from the
   `worker/` folder.)

It activates automatically — every booking the relay receives is re-reported to Meta
server-side with the same event ID as the browser pixel, and Meta dedupes the pair.

### 2d. Watch it work, live (Test Events)

1. Events Manager → pixel → **Test Events** tab → note the test code (`TEST#####`).
2. Temporarily add it to **purge-lead-relay** as a secret: `META_TEST_EVENT_CODE` =
   `TEST#####`. (This makes the *server* events show in the test stream.)
3. In the Test Events tab, connect your website → on `itspurgepros.com`, console →
   `PurgeProsQuote.open()` → run a full booking with your own info.
4. Watch the stream: **Lead** arrives twice — "from Browser" and "from Server" —
   with the same event ID, marked **deduplicated**. You should also see the
   **QuoteUnlocked** custom event when the price unlocked. That's the entire
   architecture proving itself.
5. **Clean up:** delete the `META_TEST_EVENT_CODE` secret from the relay worker.
   (Leaving it set quarantines real server events into test mode — they won't count.)
6. Ongoing health check anytime: pixel → Lead event → **Event ID coverage /
   deduplication** stats.

### 2e. Create the "Quote Unlocked" custom conversion

1. Events Manager → left sidebar → **Custom Conversions → Create custom conversion**.
2. Name `Quote Unlocked` · Data source: pixel `770811879146972` · Event:
   **QuoteUnlocked** (appears in the dropdown only after it has fired at least once —
   your 2d test run takes care of that).
3. Category: **Lead** → Create.

### 2f. Build the NEW Meta campaign (your paused one stays retired)

Since you anticipated redoing things and paused — correct call. Build fresh so the
ad sets are natively wired to the new events (editing a paused campaign's
optimization event resets learning anyway, so fresh costs nothing):

1. Ads Manager → **+ Create** → objective **Leads**.
2. Ad set level:
   - Conversion location: **Website**
   - Performance goal: **Maximize number of conversions**
   - Pixel: `770811879146972`
   - **Conversion event: `Quote Unlocked`** (your custom conversion — per the
     ladder; switch this to **Lead** once bookings reach ~10–15/week from ads)
3. **Never select Purchase** — the widget doesn't fire it; the ad set would optimize
   against nothing.
4. Audience/budget/creative as you like. Learning phase wants ~50 conversion events
   per week per ad set — another reason `Quote Unlocked` is the right starting event.
5. Leave it OFF until the Part 3 cutover is done.

---

## Part 3 — The cutover (the order that prevents headaches)

Everything above can be done with zero risk while your site still runs Housecall Pro,
because the widget is invisible until a button points at it. Flip in this order:

1. ✅ Both Google labels live in the purge-quote worker (1f) and verified (1g)
2. ✅ Meta CAPI verified deduping, test code deleted (2d)
3. **Flip the site buttons**: in the GHL builder, change your "Get a Quote"/booking
   buttons' Link URL to `#quote`. Start with one button on one page if you want a
   soft launch; flip the rest once a real visitor lead lands cleanly.
4. **Same sitting, in Google Ads:** set the legacy `/submit-true` action to
   **Secondary**. (Widget bookings never visit that page, so once HCP is out of the
   funnel the legacy action records nothing — leaving it Primary just confuses Smart
   Bidding with silence. Don't delete it; its history is useful.)
5. **Turn on the new Meta campaign.**
6. Expect the Google learning wobble (1e) for 1–2 weeks. Judge nothing during it
   except whether events are flowing (Tag Assistant / Events Manager / GHL pipeline).

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

And anchor on **cost per booked customer (CAC), never cost per lead.** In pet waste
removal, $150+ CAC is normal and healthy: a weekly customer at ~$25/visit is $1,300+/
year, so $150 pays back in about 6 weeks of service and returns ~8x in year one.
Practical implications: don't kill a campaign over an "expensive" $30–50 cost per
capture if the unlock→book ratio is healthy — that math can still land at a $150 CAC
that's winning. Kill creative when the *ratio* is broken (cheap captures, no
bookings), scale when CAC ≤ ~$150 with steady volume, and treat anything under $100
as a scale-it-now signal, not a reason to bank the savings.

---

## Part 5 — Sanity checklist

- [ ] Google: `Quote Booked` + `Quote Unlocked` actions exist; Unlocked = Primary,
      Booked = Secondary; legacy `/submit-true` action identified (Secondary after
      cutover)
- [ ] Campaign Settings → Goals checked (account-default, or new goal added)
- [ ] Both labels in the purge-quote worker's box, deployed, 5-min cache waited out
- [ ] Tag Assistant on itspurgepros.com (via `PurgeProsQuote.open()` in console)
      shows `conversion` at unlock AND at booking
- [ ] Relay worker has `META_PIXEL_ID` + `META_CAPI_TOKEN` secrets
- [ ] Test Events showed Lead from Browser + Server, deduplicated; QuoteUnlocked seen
- [ ] `META_TEST_EVENT_CODE` secret DELETED after testing
- [ ] Custom conversion `Quote Unlocked` created
- [ ] New Meta campaign built (Leads → Website → Quote Unlocked), off until cutover
- [ ] Cutover executed in Part 3 order

## Part 6 — If something doesn't fire

| Symptom | Check |
|---|---|
| Tag Assistant sees no `AW-17767139897` tag at all | You're testing the demo page (no tags there!) or the GHL header code didn't publish — view page source on itspurgepros.com |
| Tag present but no `conversion` event at unlock/booking | Labels missing/typo'd in the purge-quote worker box; or you tested within the 5-min JS cache after deploying — hard-refresh and retry |
| `PurgeProsQuote.open()` says "not defined" | The widget script tag isn't on this page/didn't load — check the header embed published, and the worker URL responds in a new tab |
| Console shows leads but GHL gets nothing | That's the relay/`LEAD_ENDPOINT` side, not ads — see the main README troubleshooting |
| No browser Lead in Test Events | Ad blocker in your own browser — test in a clean/incognito profile with blockers off |
| No server Lead in Test Events | Relay secrets typo'd, or `META_TEST_EVENT_CODE` not set during the test |
| Two Leads counted, not deduped | Browser and server event IDs differ — make sure the deployed widget and relay are both current from this repo |
| Google action stuck "Inactive" for days | Verify with Tag Assistant first (real-time truth); if events fire there, the dashboard is just lagging — up to 24–48h for first attribution |
| Conversions fire but don't attribute to your campaign | Attribution needs the ad click (gclid) in the same browser as the conversion; cross-device relies on Google's modeling — judge volume over weeks, not single clicks |
| QuoteUnlocked missing from custom conversion dropdown | The event must fire once first — run the 2d test, then refresh Events Manager |
