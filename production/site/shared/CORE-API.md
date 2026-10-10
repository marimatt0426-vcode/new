# PPQuoteCore: the price-builder engine

`shared/pp-quote-core.js` holds all of the price-builder logic and none of the presentation. Every page design in this release builds its own interface on it. This guide is what you code against. "Spec" below means `spec/BUILDER-SPEC.md`. "Brief" means `BRIEF.md`.

**State of this work: locally tested. Nothing is deployed, and nothing in a review build is sent anywhere.**

- **Changed 2026-10-10, engine 1.5.2: two fixes from the independent checks of the integrated build.** (1) Staging refuses every spelling of a production host. The guard compared host text, so `https://<production host>:443/submit` and `https://<production host>./submit` (a trailing dot) were not seen as production, and a browser resolves both to the production Worker. A staging request address must now be `https://` + a plain host name + `/submit` (letters, digits, dots and hyphens only: no port, user name, trailing dot, encoded character or backslash), and the production check itself ignores a port, a user name and trailing dots. Live mode is unchanged: it only ever uses an address the interface trusts (`rollout/integration/VERIFY-sending.md` finding 1; `tests/send-switch.test.mjs`). (2) A phone number written with a country code other than `+1` (`+52 55 1234 5678`) is kept as written (`+` and its digits, at most 15) and refused with the usual message; it used to be cut to its first ten digits and could pass as a US number. `+1` in any spelling is unchanged, and so is every number without a `+` (`VERIFY-xbrowser.md` N3; `tests/phone-formats.test.mjs`). No payload key, price, wording or event changed.
- **Changed 2026-10-09, engine 1.5.1: attribution privacy, and where the tests read the live source.** (1) A campaign tag value that looks like an email address (an `@` with a dot after it) or like a phone number (once spaces and the separators `( ) - . + _ /` are removed, the whole value is 7 to 15 digits) is dropped before it is stored or sent, as if the link had not carried that tag. Decided by the project lead after the ads verification found that a bad link could leave an address in the browser for 30 days. The phone rule looks at the whole value, not at digits inside it, because the playbook's own tags carry long ids inside names (`pp-leads-2026q4-1202...`, `adgroup_1234567890`) and those are kept. Nothing else about attribution changed: the nine keys, the 250-character cut, the session copy, the 30 days, the payload keys (section 14; `tests/attribution-privacy.test.mjs`). (2) The tests and the checkers read the live widget and Worker from a pinned copy of the October 5 release (commit `aa9f81d`) in `shared/tests/fixtures/live-2026-10-05/`, so they run from this folder whatever branch the production checkout is on; `PP_PRODUCTION_SRC` still points them elsewhere (section 16).
- **Changed 2026-10-09, engine 1.5.0: the send switch, and the phone field.** Two things. (1) A third mode, `"staging"`, and `PPQuoteCore.siteOptions(site, trusted)`, which turns the page's one settings object (`window.PPSite`) into options for `create()`: live sends to the production quote Worker from the real site's addresses only, staging sends to a staging Worker only and calls no Google or Meta tag of any kind, anything else is demo exactly as before. Staging alone accepts a saved-quote link on the staging page's own address. The whole contract, key by key, is section 13. The payload is unchanged: the same 47 keys, none added, and there is no key that marks a test request. (2) Audit finding B1: the phone field rule no longer carries `maxLength` (a browser applied it before the engine could remove "+1", and a pasted number became a wrong one), and `normalizePhone()` refuses a number whose area code or exchange starts with 0 or 1. A front-end rule only. Nothing is deployed; no request has been sent to any real address.
- **Changed 2026-10-09, engine 1.4.0: the measurement fleshed out, on the owner's go-ahead.** The owner asked for the form and site to be fully ready for ads and tracking before the site is installed, and gave his go-ahead on October 9, 2026. Eight additions, T16 to T23 (sections 8 and 14). The pixel count for a quote sent to the visitor is renamed `QuoteSent` (it was `QuoteTexted`, and it also fires for a quote sent by email), and it and `quote_requested` now say how the quote was sent: `method` is `text` or `email` (T16). A complete funnel goes to Google: `areas_selected` (T17), `frequency_selected` (T18), `request_step_viewed` and `request_step_completed` (T19), `form_validation_failed` with the KEYS of the fields that failed and never a value (T20), `builder_opened` and `builder_closed` (T21), and `contact_click`, with the pixel's standard event `Contact` (T22). The last non-empty set of attribution parameters is kept in the browser for 30 days, so a return visit still has its source (T23). **What an interface must now do:** report six moments through the new `store.trackUi(name, params)` (section 6.6); the engine fires everything else itself. A completed service request stays the only conversion: `Lead`, `generate_lead` and `conversion` are unchanged in name, timing, parameters and once-only behaviour. The request sent to the Worker has exactly the keys and versions it had; no price, option id, field or wording changed, and nothing a visitor sees or fills in changed. Approved is not live: nothing is deployed, and no event has been received by Google or Meta.

## Start here for interface builders

Read this section, then only the reference entries you need. Review builds run in demo mode, which is the default: nothing is sent anywhere, and it works from `file://`.

```js
const C = PPQuoteCore;
const store = C.shared();     // ONE store per page, shared by the hero builder, the pinned bar and any dialog
// A city page with one accepted ZIP: C.shared({ pageZip: "46074", pageCity: "Westfield" }) skips the ZIP question (section 12).
```

**Each step.** `store.getState().step` names the step on screen. Every answer goes through `store.set({ field: value })`; the engine applies the rules, saves the permitted fields and fires the events.

| Step | Show | On input |
|---|---|---|
| `dogs` | `C.DOG_OPTIONS`, each `{ id, label, group }` (`group` is `main` for 1 to 4, `more` for 5 to 10+) | `store.set({ dogCount: option.id })` |
| `zip` | A numeric input, and at once the answer from `store.checkZip()`: `{ status, inArea, community, message }`. For `out_of_area` show `C.OUT_OF_AREA_COPY`, keep the field and the phone number, ask nothing else. | `store.set({ zip: input.value })` |
| `yard` | `C.YARD_SIZES`, each `{ id, label, maxSquareFeet }` | `store.set({ yardSize: option.id })`; when the yard guide is opened, `store.track("yard_size_help_opened")` |
| `areas` | `C.AREAS`, each `{ id, label }`; pressed when `state.areas.includes(id)`; nothing preselected | `store.toggleArea(id)` |
| `frequency` | `store.frequencyOptions()`, each `{ id, label, sub, popular, selected, available, reason, priceText }`: one exact price each. Show unavailable ones disabled, with `reason` as visible text. | `store.set({ frequency: option.id })` |
| `price` | `store.quote()`: `{ priceText, lineItems: [{ label, amount }], note, custom, oneTime }`. `store.offerNote()`: `{ kind, title, paragraphs }`. `store.intentOptions()`: `{ id, label, selected, available, reason }`. | `store.set({ intent: option.id })`; the save link is `store.createSaveLink()` (section 6.5) |
| `request` | `store.fieldRules().filter((rule) => rule.shown && rule.key !== "termsAccepted")`. Each rule has `key`, `label`, `required`, `control`, `hint`, `maxLength`, `placeholder`; a choice field has `choices: [{ value, label, selected }]`. The text-consent box is `rule.lead` (bold) + `rule.body`, with `C.wording.consentAlternativeParts(state.intent !== "quote_delivery")` beside it. | `store.set({ [rule.key]: value })`. The phone is formatted as it is typed: write `state.phone` back into the field. |
| `confirm` | All on screen together: `store.planSummary()` rows `{ label, value, step }` (one-tap edit: `store.edit(row.step)`), the price, `store.requestSummary()` `{ name, replyBy, phone, email, serviceAddress, startTiming, lastCleaned, question }`, `C.PROMISES.requestNotBooking` and `C.PROMISES.nothingCharged`, and for a service request the terms checkbox with `C.wording.termsParts(store.quote().oneTime !== null)`. Other intents: `C.wording.otherIntentsParts()` and no box. | `store.set({ termsAccepted: checked })`, then `const sent = await store.submit()` |
| `done` | `state.receipt.requestId`, where the reply will arrive (`state.receipt.replyWhere`), and the promise again | "Start a new quote": `store.reset()` |

**Buttons.** `const flow = store.flow();`

- Primary action: `flow.primaryAction` is `"next"` (press calls `store.next()`), `"submit"` (press calls `store.submit()`) or `"none"` (show no button).
- Enabled or not: `button.disabled = flow.disablePrimary`. That one field. Why not: `flow.blockedReason` (one sentence) and `flow.blockedErrors` (`[{ field, step, message }]`).
- On `request` and `confirm` the button stays enabled and a refused press hands back the list to show: `const went = store.next(); if (!went.ok) showErrors(went.errors);` and `if (!sent.ok) showErrors(sent.fieldErrors.length ? sent.fieldErrors : [{ message: sent.message }]);`
- Back: `flow.back` is the step Back goes to, or `""` when there is none (hide the button). Press calls `store.back()`.
- Progress: `flow.steps`, each `{ id, complete, current, skipped, reachable }`.

**Subscribe, and re-render in place.**

```js
store.subscribe((state, info) => {     // called once for EVERY change, whatever caused it; never when nothing changed
  if (info.changed.includes("step")) showStep(state.step);              // build the new step once, move focus to its heading
  else info.changed.forEach((field) => updateControl(field, state));   // touch only what changed: focus and scroll stay put
  showNotices(info.notices);           // [{ code, field, message }]: the engine changed something by itself; say so beside it
  renderBar(store.priceBar());         // cheap, so do these every time
  renderButtons(store.flow());
});
```

`info.changed` names every state field that is now different, for example `["zip", "city", "termsAccepted"]`. When `smsConsent` or `termsAccepted` is in it, untick that box on screen. `info.reason` says what caused the change.

**Pinned bar.** `const bar = store.priceBar();` Show it only while `bar.visible`. Its text is `bar.headline` ("Weekly visits from $19.99", later "$28.99 per visit" or "Custom estimate") with `bar.detail` beside it ("2 dogs · Weekly · Up to ¼ acre"). Its Continue button calls `store.goTo(bar.continueStep)` and is disabled when `bar.continueEnabled` is false.

**The same builder as a dialog, from any button.**

```js
const hooks = C.installPageHooks(store, {
  open(result) { dialog.showModal(); heading.focus(); opener = result.trigger; },   // any launcher, hero ZIP form or ?open_quote=1
  close() { dialog.close(); if (opener) opener.focus(); },
  busy() { sendingStatus.focus(); }             // open or close was asked while a request is being sent: both are ignored
});
closeButton.onclick = () => hooks.close();      // returns false while sending; from the done step it also starts a new quote
dialog.addEventListener("cancel", (event) => { event.preventDefault(); hooks.close(); });   // Escape goes the same way
```

Any element with `data-purge-quote`, any link to `#quote` or `#get-quote`, and `window.PurgeProsQuote.open({ zip })` now open it. A `<form data-pp-zip-form>` with an input named `zip` opens it with that ZIP already answered. Keep focus inside the dialog while it is open. An inline builder makes the same call with `open() { builder.scrollIntoView(); heading.focus(); }` and no `close`. Saved links: first thing on the page, `const token = C.takeResumeToken(); if (token) store.resume(token);`.

**Report the six moments only your page can see** with `store.trackUi(name, params)` (section 6.6 has every call): your panel opening and the way in (`"builder_opened"`, `{ entry: "header_button" }`), each request screen showing and passed (`"request_step_viewed"` and `"request_step_completed"`, `{ request_step: "who" }`), a press your own check refused (`"form_validation_failed"`, field keys only), and every text, call or email link (`"contact_click"`, `{ method: "text", placement: "header" }`). The engine counts each once and builds the event. Pass nothing a visitor typed.

**Failure states, by demo switch.** Add to the address, or set while the page is open (`store.demo.submit = "timeout"`).

| To see | Use |
|---|---|
| The sending state, for four seconds | `?pp_demo=slow` |
| The server refusing a field | `?pp_demo=invalid&pp_demo_fields=phone,street` |
| The locked "please call" state | `?pp_demo=uncertain` or `?pp_demo=conflict` |
| A failure the visitor may retry | `?pp_demo=unavailable`, `timeout`, `network` or `forbidden` |
| Save-link failures | `?pp_demo_save=rate_limited`, `unavailable`, `invalid`, `timeout` or `bad_link` |
| Saved-plan screens | `store.resume("A".repeat(43))`, with `?pp_demo_resume=changed`, `expired`, `plan_unavailable`, `mismatch` or `timeout` |
| Out of area, or a ZIP handed over | `?zip=46201`, `?zip=46032` |
| No waiting | `?pp_demo_delay=0` |

After `submit()`, `sent.status` is `success`, `invalid`, `server_invalid`, `locked`, `unavailable`, `timeout`, `network`, `rejected`, `busy` or `blocked`, and `sent.message` is the sentence to show. While `state.submitting` is true, disable every control and announce `C.SUBMIT_MESSAGES.sending`. When `state.locked` is set, show `state.locked.message` with a call link and disable everything.

## 1. The rules

1. Do not re-implement pricing, eligibility, ZIP checks, validation, payloads, storage or tracking in page code. Ask the engine.
2. Review builds run in **demo mode**, which is the default. Demo mode never touches the network. Do not pass `mode: "live"` in this release.
3. Create **one store per page** and share it between the hero builder, the pinned bar and anything else (`PPQuoteCore.shared()` does this for you).
4. Never retype the consent or terms wording. Render the constants (sections 9 and 15).
5. When the engine hands you `notices`, show them. They are the engine telling the visitor why it changed something. `set()` returns them, and every subscriber receives them in `info.notices`, whatever caused the change.

## 2. Loading it

```html
<script src="../shared/pp-quote-core.js"></script>
<script>
  const store = PPQuoteCore.create();   // demo mode
</script>
```

One file, no dependencies, about 235 KB unminified. It works from `file://`. As a classic script it defines `window.PPQuoteCore` and nothing else. In Node, `require("./pp-quote-core.js")` returns the same object. It never reads or writes the DOM; the only page listeners are the opt-in hooks in section 11. The one thing it changes on the page without being asked is the address: a `?zip=` is taken out of it once it has been read (section 4).

## 3. Minimal wiring

The working page is `shared/examples/minimal-wiring.html`. Open it from disk and click through: dogs, ZIP, yard, areas, frequency, price, request, confirm, done. It was clicked through in headless Chrome with no console errors and no network requests. A test keeps the script below identical to that file.

It rebuilds the whole step on every change, which is fine for showing the wiring and wrong for a real interface: update in place so focus, scroll position and images stay put ("Subscribe, and re-render in place" above).

```js
const C = PPQuoteCore, store = C.create();        // demo mode is the default: nothing is sent
const app = document.getElementById("app");
let notices = [], problems = [], shown = store.getState().step;   // engine notices, the last press's errors, the step on screen

const h = (tag, text, props) => Object.assign(document.createElement(tag), { textContent: text || "" }, props || {});
const change = (patch) => { problems = []; store.set(patch); };
const tile = (label, pressed, onclick, disabled) => {
  const button = h("button", label, { type: "button", onclick, disabled: Boolean(disabled) });
  button.setAttribute("aria-pressed", String(Boolean(pressed)));
  return button;
};
const choices = (key, options) => options.map((o) => tile(o.label, store.getState()[key] === (o.value || o.id), () => change({ [key]: o.value || o.id })));
const typed = (key, props) => h("input", "", Object.assign({ name: key, value: store.getState()[key], oninput: (e) => change({ [key]: e.target.value }) }, props));
const ticked = (key, text) => {
  const label = h("label", " " + text);
  label.prepend(h("input", "", { type: "checkbox", name: key, checked: store.getState()[key], onchange: (e) => change({ [key]: e.target.checked }) }));
  return label;
};
const words = (parts) => parts.map((part) => part.text).join("");   // a real page renders part.href as a link

const screens = {
  dogs: () => choices("dogCount", C.DOG_OPTIONS),
  zip: () => [typed("zip", { inputMode: "numeric", maxLength: 5 }),
    h("p", store.checkZip().inArea ? "Good news: we serve " + store.checkZip().community + "." : store.checkZip().complete ? store.checkZip().message : "")],
  yard: () => choices("yardSize", C.YARD_SIZES),
  areas: (s) => C.AREAS.map((area) => tile(area.label, s.areas.includes(area.id), () => { problems = []; store.toggleArea(area.id); })),
  frequency: () => store.frequencyOptions().map((o) =>
    tile(o.label + ": " + (o.available ? o.priceText || "custom quote" : o.reason), o.selected, () => change({ frequency: o.id }), !o.available)),
  price: () => [h("h2", store.quote().priceText), ...store.quote().lineItems.map((item) => h("p", item.label + "  " + item.amount)),
    ...store.intentOptions().filter((intent) => intent.available).map((intent) => tile(intent.label, intent.selected, () => change({ intent: intent.id })))],
  request: (s) => store.fieldRules().filter((rule) => rule.shown && rule.key !== "termsAccepted").map((rule) => {
    const consentText = () => rule.lead + " " + rule.body + " " + words(C.wording.consentAlternativeParts(s.intent !== "quote_delivery"));
    if (rule.key === "smsConsent") return ticked("smsConsent", consentText());
    const label = h("label", rule.label + (rule.required ? " (required) " : " "));
    label.append(...(rule.choices ? choices(rule.key, rule.choices) : [typed(rule.key, { maxLength: rule.maxLength, placeholder: rule.placeholder || "" })]));
    return label;
  }),
  confirm: (s) => { const who = store.requestSummary(); return [   // plan, price, contact details and terms box, all on screen
    ...store.planSummary().map((row) => tile("Edit " + row.label + ": " + row.value, false, () => store.edit(row.step))),
    ...[who.name, "Reply by: " + who.replyBy, who.phone, who.email, who.serviceAddress, who.startTiming, who.question].filter(Boolean).map((line) => h("p", line)),
    h("p", C.PROMISES.requestNotBooking + " " + C.PROMISES.nothingCharged),
    s.intent === "service_request" ? ticked("termsAccepted", words(C.wording.termsParts(store.quote().oneTime !== null))) : h("p", words(C.wording.otherIntentsParts()))]; },
  done: (s) => [h("h2", "Request received"), h("p", "Reference: " + s.receipt.requestId), h("p", "We will reply in " + s.receipt.replyWhere + ". " + C.PROMISES.requestNotBooking), tile("Start a new quote", false, () => store.reset())]
};

async function send() {
  const sent = await store.submit();                // success needs nothing here: the subscriber below has already drawn the done step
  problems = sent.ok ? [] : sent.fieldErrors.length ? sent.fieldErrors : [{ message: sent.message }];
  if (!sent.ok) render();
}
function render() {
  const s = store.getState(), flow = store.flow(), bar = store.priceBar(), focused = document.activeElement && document.activeElement.name;
  const heading = h("h1", "Step: " + s.step, { tabIndex: -1 });
  app.replaceChildren(heading, ...notices.map((n) => h("p", n.message, { className: "notice" })),
    ...problems.map((p) => h("p", p.message, { className: "problem" })), ...screens[s.step](s));
  if (s.locked || s.submitting) app.append(h("p", s.locked ? s.locked.message : C.SUBMIT_MESSAGES.sending, { className: s.locked ? "problem" : "notice", role: "status" }));
  if (flow.back) app.append(tile("Back", false, () => store.back()));
  const goOn = () => { problems = []; const went = store.next(); if (!went.ok) { problems = went.errors; render(); } };
  if (flow.primaryAction === "next") app.append(tile("Continue", false, goOn, flow.disablePrimary), h("small", flow.disablePrimary ? flow.blockedReason : ""));   // ONE field decides; blockedReason says why
  if (flow.primaryAction === "submit") app.append(tile("Send my request", false, send, flow.disablePrimary));
  if (bar.visible) app.append(h("footer", bar.headline + (bar.detail ? "  (" + bar.detail + ")" : "")));
  const again = s.step !== shown ? heading : focused && app.querySelector('[name="' + focused + '"]');     // a new step takes the focus
  shown = s.step;
  if (again) { again.focus(); if (again.name && again.type !== "checkbox") again.setSelectionRange(again.value.length, again.value.length); }
}

store.subscribe((state, info) => { notices = info.notices || []; render(); });   // told once for EVERY change, whatever caused it
C.installPageHooks(store, { open: () => { app.scrollIntoView(); app.focus(); } });
render();
```

## 4. `PPQuoteCore.create(options)`

Returns a store. Every option is optional.

| Option | Default | What it does |
|---|---|---|
| `mode` | `"demo"` | `"demo"`, `"staging"` or `"live"`. A page does not pass it by hand: it comes from `PPQuoteCore.siteOptions(window.PPSite, …)` (section 13). |
| `pageZip` | none | A city page's own ZIP, for example `"46074"`. Pre-fills the ZIP and skips the ZIP question. Ignored unless it is an accepted ZIP. Pass it only on pages with ONE accepted ZIP (section 12). |
| `pageCity` | none | The city a city page is about, for example `"Lawrence"`. Used as the City pre-fill when it is a right name for the ZIP. |
| `presentation` | `"inline"` | Sent with `funnel_viewed`. Use `"modal"` if your builder opens as a dialog. |
| `frequencyLabels` | live labels | Rename frequencies on screen: `{ twice: "Twice a week", custom: "Custom quote" }`. Ids never change. Notices and reasons use your names. |
| `demo` | see section 10 | `{ submit, save, resume, delayMs, invalidFields }` |
| `uiVersion` | `"2026-10-07-site-rebuild-v5"` | The `ui_version` on every analytics event. |
| `endpoint`, `allowedOrigins`, `googleAdsSendTo`, `firePixelEvents`, `allowDemoOnLiveOrigin` | | Live-mode and tracking settings (sections 8 and 13). |
| `savedLinkBase`, `productionEndpoints` | none | Staging mode only (section 13): the staging page's own address as the base of a saved-quote link, and the production request addresses staging must refuse. Both are set by `siteOptions()`. Ignored in live and demo. |
| `storage`, `persistentStorage`, `fetch`, `now`, `uuid`, `random`, `readCookie`, `location`, `history`, `navigationType`, `console`, `wait`, `sinks` | the browser's | Replaceable for tests. `storage` stands in for `sessionStorage` and `persistentStorage` for `localStorage` (used for one key: section 14). `sinks` is `{ gtag, dataLayer, fbq }`. `navigationType` is a function returning `"navigate"`, `"reload"`, `"back_forward"` or `""`. |

`PPQuoteCore.shared(options)` creates the store on its first call and returns that same store on every later call.

At start-up the store, in this order: captures attribution from the URL; restores saved plan progress; applies `pageZip` if the visitor has no ZIP of their own; reconciles the restored answers; then reads `?zip=` from the URL. `store.initialNotices` holds any notice that reconciliation produced.

**`?zip=` is a one-time instruction.** A five-digit `?zip=` is treated like `open({ zip })` (section 6.1), and then:

- It is taken out of the address at once (`history.replaceState`; attribution parameters and the hash stay), so a refresh cannot apply it or count it a second time.
- It beats `pageZip`. It does not beat a ZIP the visitor already has from saved progress, unless the page load is clearly a new arrival: an open instruction beside it (`?open_quote=1`, `#quote`, `#get-quote`), or a browser that reports a fresh navigation.
- It is not applied at all when the browser reports that the page was refreshed or reached with Back or Forward.

So the order of precedence is: the visitor's own saved ZIP, then `?zip=`, then `pageZip`. The one exception: a `?zip=` that clearly arrives with a new page load beats the saved ZIP as well.

## 5. State

`store.getState()` returns a frozen snapshot. The same object is returned until something changes.

| Field | Values | Notes |
|---|---|---|
| `step` | `dogs`, `zip`, `yard`, `areas`, `frequency`, `price`, `request`, `confirm`, `done` | Always starts at `dogs`. Not stored. |
| `editReturn` | a step id or `""` | Where a one-tap edit returns to. |
| `zip` | 0 to 5 digits | The ONE ZIP: coverage and service address (spec section 14 item 7). |
| `zipSource` | `""`, `typed`, `open`, `url`, `page`, `storage`, `resume` | Where the ZIP came from. |
| `dogCount` | `""`, `"1"` to `"10"` | `"10"` means 10 or more. |
| `yardSize` | `""`, `s`, `m`, `l`, `xl`, `over` | |
| `areas` | array of `back`, `front`, `side` | In the order chosen. Never preselected. |
| `frequency` | `""`, `twice`, `weekly`, `biweekly`, `onetime`, `custom` | Always one the Worker allows for the dogs and yard. |
| `intent` | `service_request`, `quote_delivery`, `question` | Default `service_request`. |
| `customerStatus` | `""`, `new`, `returning`, `not_sure` | Asked in the request step. |
| `firstName`, `lastName`, `email`, `address`, `city`, `question` | text | Held to the live length limits. |
| `phone` | text | Kept formatted, `(317) 555-0100`. |
| `preferredContact` | `text`, `email`, `call` | Default `text`. |
| `smsConsent`, `smsConsentCapturedAt` | boolean, ISO time | Only ever true while `preferredContact` is `text`. |
| `cityAutoFilled` | boolean | True while `city` is the engine's suggestion for the ZIP. |
| `startTiming`, `lastCleaned` | exact option strings or `""` | |
| `termsAccepted`, `termsAcceptedAt` | boolean, ISO time | Service requests only. The time is never earlier than the last change the box covers. |
| `submitting` | boolean | True while a request is being sent. |
| `locked` | `null` or `{ code, message, requestId }` | Set by an "uncertain" or "conflict" reply. Only a page reload clears it. |
| `receipt` | `null` or `{ requestId, intent, stage, custom, oneTime, priceCents, priceText, frequencyId, preferredContact, replyWhere }` | Set by a successful submit. |
| `resumeLoading`, `resumeNotice` | boolean, text | Saved-plan opening (section 6.5). |
| `attribution` | object | The nine URL parameters. |

These are all the field names that can appear in `changed` lists.

## 6. Store methods

### 6.1 Changing answers

**`store.set(patch)`** is the one way answers change. `patch` may hold any of: `zip`, `dogCount`, `yardSize`, `areas`, `frequency`, `intent`, `customerStatus`, `firstName`, `lastName`, `phone`, `email`, `preferredContact`, `smsConsent`, `address`, `city`, `startTiming`, `lastCleaned`, `question`, `termsAccepted`.

Returns `{ ok, changed, notices, rejected, movedTo, state }`.

```js
store.set({ dogCount: "4" });
// { ok: true, changed: ["dogCount"], notices: [], rejected: [], movedTo: null, state }

store.set({ dogCount: "5" });            // "Every other week" was chosen
// { ok: true, changed: ["dogCount", "frequency"], movedTo: null, rejected: [],
//   notices: [{ code: "FREQUENCY_CLEARED", field: "frequency", goToStep: "frequency", previous: "biweekly", current: "",
//               message: "Every other week is available for up to 4 dogs, so it was cleared. Choose how often you would like service." }] }

store.set({ frequency: "biweekly" });    // not allowed for 5 dogs
// { ok: false, changed: [], rejected: [{ field: "frequency", value: "biweekly", reason: "Available for up to 4 dogs." }], ... }
```

- `changed`: the names of ALL state fields whose value is now different, not only the ones in the patch: for example `["zip", "city", "termsAccepted", "cityAutoFilled", "termsAcceptedAt"]`. The answers come first, in the order listed above, then the rest. Nothing changed means no save, no event and no call to subscribers.
- `rejected`: values the engine refused, with the reason. The state is untouched for those fields.
- `movedTo`: a step id when the change forced the visitor back to a question (see below).
- `notices`: things the engine changed by itself. Each has `code`, `field`, `message` and `goToStep`.

| Notice code | When |
|---|---|
| `CUSTOM_AUTO_SELECTED` | 10+ dogs or over 1 acre with no frequency chosen: Custom booking is selected. |
| `FREQUENCY_CLEARED` | The chosen frequency is not offered for the new dog count. The visitor must choose again. |
| `FREQUENCY_MOVED_TO_CUSTOM` | The chosen frequency is not allowed for 10+ dogs or over 1 acre: moved to Custom booking. |
| `CUSTOM_RELEASED` | Custom booking was needed and no longer is: cleared so the visitor chooses again. |
| `ZIP_OUT_OF_AREA` | A complete ZIP outside the service area was entered, typed or handed over with `open({ zip })`. |
| `CONSENT_CLEARED` | The reply method left Text: the consent box is unticked. |
| `TERMS_CLEARED` | Something changed after the terms box was ticked: it is unticked. Sent by `set()`, by `edit()` and by `open({ zip })` with a different ZIP. |
| `INTENT_RESET` | The plan became a custom estimate: the intent is back to a service request. |
| `CONTACT_CHANGED` | Quote delivery was chosen with Phone call: the reply method is now Text. |

What `set()` does for you, every time:

- **Reconciles the frequency** after a dog or yard change (spec 4.2.2), and explains every change. The live tool is silent and leaves Custom booking stuck.
- **Takes the visitor back** when they are on `price`, `request` or `confirm` and the plan is no longer complete: `step` becomes the question that needs an answer, `editReturn` remembers where they were, and `movedTo` tells you. Typing a ZIP in the request step does not move them mid-keystroke; only a complete out-of-area ZIP does.
- **Pre-fills the city** from the ZIP until the visitor types one.
- **Unticks consent** when the reply method leaves Text.
- **Keeps the terms box honest** (below).
- **Saves** the seven permitted plan fields, and **fires** the right events.

The terms box covers what is on screen at the moment it is ticked:

- Any other change after it was ticked unticks it, with a `TERMS_CLEARED` notice.
- A tick that arrives in the same `set()` call as another change counts from now: `termsAcceptedAt` becomes the time of that call, never the time of an earlier tick.
- It is never left ticked for a quote delivery or a question. `set({ intent: "question", termsAccepted: true })` changes the intent, refuses the tick (`rejected`) and leaves the box unticked.
- Unticking it yourself (`termsAccepted: false`) produces no notice.

`set()` refuses everything while `submitting` is true, after a locked reply, while a saved plan is loading, and on the `done` step.

**`store.toggleArea(id)`** turns one area on or off. **`store.toggleAllAreas()`** is the optional "all areas" shortcut: all three on, or all three off when all are already on. Both return what `set()` returns.

**`store.reset()`** clears every answer and the saved progress and starts again at `dogs`. Call it when the visitor leaves the done step. Returns `false` and does nothing while sending or after a locked reply.

**`store.subscribe(fn)`** calls `fn(state, info)` once for every change to the state, whatever caused it, and never when nothing changed. Returns an unsubscribe function. `info` is `{ reason, changed, notices, movedTo }`:

- `reason` is one of `set`, `goTo`, `edit`, `next`, `back`, `open`, `close`, `reset`, `submitting`, `submitted`, `submit_failed`, `resume_loading`, `resumed`, `resume_failed`.
- `changed` names every state field that is different from before the change (section 5 lists them). It is exact: a subscriber that copies only those fields is never out of date. After `reset()` it lists whatever the reset cleared, for example `["zip", "dogCount", "city", "zipSource", "cityAutoFilled", "step"]`.
- `notices` is always a list (often empty). `movedTo` is a step id or `null`.

Use `info.changed` to update only what changed: a subscriber that redraws the whole step on every keystroke takes focus away from the field being typed in. One call can cover several fields (opening a saved plan clears the form and sets the loading flag in one change); sending a request is two changes, so two calls (`submitting`, then `submitted` or `submit_failed`).

**`store.open({ zip })`** is for a ZIP the visitor typed somewhere else on purpose, such as a hero ZIP form (`installPageHooks` calls it for you). Five digits in area: accepted, and the ZIP question is skipped. Five digits out of area: `step` becomes `zip` and shows the out-of-area answer. Anything else: nothing changes. A different ZIP unticks the terms box and updates a pre-filled city; subscribers are told in the usual way. Returns `{ ok, zipStatus, step, reason }`. `ok` is false, with the `reason`, and nothing changes, while a request is being sent, after a locked reply, while a saved plan is loading and on the `done` step.

**`store.close()`** is for a builder shown as a dialog. It returns `{ ok, reason, startedOver }`. While a request is being sent it refuses (`ok: false`): nothing may hide a pending request. From the `done` step it starts a new quote (`startedOver: true`), as the live tool does. Otherwise nothing changes: every answer stays in memory, so reopening returns to the same step. `installPageHooks` calls it for you after your `close` handler. When the opening was reported (`store.trackUi("builder_opened", …)`, section 6.6), this is also where the closing is counted, with the step it was closed on.

### 6.2 The flow

Order in this rebuild: dogs, ZIP, yard size, areas, frequency, price, request, confirm, done.

**`store.flow()`** reports everything about where the visitor is:

```js
store.flow();    // on the dogs step, after choosing 2 dogs
// { current: "dogs",
//   steps: [{ id: "dogs", kind: "plan", complete: true, skipped: false, reachable: true, current: true }, ... 9 in all],
//   order: ["dogs", "zip", "yard", ...],     // without "zip" when it is skipped
//   zipSkipped: false,
//   firstIncomplete: "zip",                  // first plan question still unanswered, or ""
//   resumeAt: "zip",                         // where "Continue" should take a returning visitor
//   editReturn: "",
//   back: "",                                // the step Back goes to; "" when there is none
//   primaryAction: "next",                   // "next", "submit" (confirm step) or "none"
//   next: "zip",                             // where the primary action leads
//   disablePrimary: false,                   // THE answer for the button: button.disabled = flow.disablePrimary
//   canContinue: true,                       // would pressing it succeed right now
//   blockedReason: "",                       // why it would not, in plain words
//   blockedErrors: [] }                      // the full list: [{ field, step, code, message }]
```

- **`disablePrimary` is the one field to bind the button to.** It is true while a plan question (or the price step) is unanswered, and whenever `primaryAction` is `"none"` (sending, locked, loading a saved plan, done). It is false on `request` and `confirm` even when something is missing: keep the button enabled there, and on press show `blockedErrors` as a summary linked to the fields (spec 11.4).
- `canContinue` says whether a press would succeed. It is never true while `disablePrimary` is true. On `request` and `confirm` it can be false while the button is enabled.
- `blockedReason` is the sentence to show beside a disabled button (before answering: "Choose the number of dogs.").
- `zipSkipped` is true when an in-area ZIP came from the page (`pageZip`), from `?zip=` or from `open({ zip })`. The ZIP is still an answer the visitor can change: `store.edit("zip")`.
- `back` is `""` on the first step, while sending, after a locked reply and on `done`.
- `next` always goes to the first unanswered question. If every question is answered (progress carried from another page) it walks forward one step at a time, so the visitor sees each answer again.
- `flow(stepId)` answers for another step without moving.

**`store.next()`** takes the primary action when it is `"next"`. Returns `{ ok, step, reason, errors }`. On `confirm` use `submit()`.

**`store.back()`** returns `{ ok, step, reason }`.

**`store.goTo(stepId)`** returns `{ ok, step, reason, needs }`, the same four keys whether it moved or not. It refuses a step whose earlier questions are unanswered and names the step to finish first in `needs` (otherwise `""`). `confirm` needs a valid request form. `done` is only reached by a successful submit.

**`store.edit(stepId)`** is one-tap editing of an earlier answer. It remembers where the visitor was, so the next `next()` returns there once the plan is complete again (or goes to the first question the edit left unanswered). Editing from `confirm` returns to `confirm` if the request form is still valid, otherwise to `request`. Any edit unticks the terms box, and subscribers receive `termsAccepted` in `info.changed` with a `TERMS_CLEARED` notice. Returns `{ ok, step, reason, returnTo }`, the same four keys whether it moved or not; `returnTo` is `""` when it was refused (`reason` says why).

**`store.reportStepShown(stepId)`** is only for a design that shows `request` and `confirm` on one screen: call it for the step the visitor can now see so its event fires. Accepts `price`, `request`, `confirm`, and only once the plan is complete. It is safe to call on every render: each step is reported once per visit to the screen (until the engine next moves the visitor).

### 6.3 What to show

**`store.checkZip(zip?)`** checks a ZIP (the current one when called with no argument). Also available as `PPQuoteCore.checkZip(zip)`.

```js
PPQuoteCore.checkZip("46032");
// { status: "in_area", zip: "46032", complete: true, inArea: true, contactAllowed: true,
//   community: "Carmel", city: "Carmel", alternates: [], page: "/carmel", poBox: false, message: "" }
PPQuoteCore.checkZip("46201");
// { status: "out_of_area", inArea: false, contactAllowed: false, message: "We do not service ZIP 46201 yet.", ... }
```

`status` is `empty`, `incomplete`, `in_area` or `out_of_area`. Out of area never allows contact capture: every send path refuses. `community` names the service area; `city` is the value to pre-fill in the City field; `alternates` are other city names that are right for that ZIP.

**`store.frequencyOptions()`** returns all five frequencies for the current dogs, yard and areas. Each carries ONE exact price. There are no add-on amounts to show.

```js
store.frequencyOptions()[1];   // 5 dogs, quarter acre, back + front
// { id: "weekly", label: "Weekly", sub: "The most popular maintenance plan", popular: true, custom: false,
//   selected: false, available: true, reason: "", reasonCode: "",
//   priceCents: 3649, priceLabel: "$36.49", unit: "per visit", priceText: "$36.49 per visit", note: "" }
store.frequencyOptions()[2];
// { id: "biweekly", available: false, reason: "Available for up to 4 dogs", reasonCode: "TOO_MANY_DOGS", priceCents: null, priceText: "", ... }
```

`priceCents` is `null` for Custom booking, for an unavailable option, and for a recurring option while dogs, yard or areas are unanswered. One-time is always `8999` with `unit: "base price"` and `note` set to the 30-minute sentence. Show unavailable options disabled, with `reason` as visible text.

**`store.quote()`** is the final price object.

```js
store.quote();   // 2 dogs, weekly, quarter acre, back + front
// { ready: true, custom: false, priceCents: 2899, priceLabel: "$28.99", unit: "per visit", priceText: "$28.99 per visit",
//   lineItems: [{ label: "Weekly · 2 dogs", cents: 2249, amount: "$22.49" },
//               { label: "Back yard + Front yard", cents: 250, amount: "$2.50" },
//               { label: "Up to ¼ acre", cents: 400, amount: "$4.00" }],
//   totalCents: 2899, oneTime: null,
//   note: "Your recurring maintenance price. Final service-day availability is confirmed before secure payment setup.",
//   frequencyId: "weekly", frequencyLabel: "Weekly", dogsLabel: "2 dogs", yardLabel: "Up to ¼ acre",
//   areaLabels: ["Back yard", "Front yard"], zip: "46032", zipInArea: true,
//   customReasons: [], customReasonLabels: [], errors: [], pricingVersion: "2026-08-cloudflare-v1" }
```

- `lineItems` are for the final price summary only (spec 5.5). Never show them on options.
- One-time: `oneTime` is `{ baseCents: 8999, includedMinutes: 30, extraPerMinuteCents: 100, summary }`, `unit` is `"base price"`, and there is one line item.
- Custom estimate: `custom: true`, `priceCents: null`, `priceText: "Custom estimate"`, no line items, and `customReasons` such as `["CUSTOM_BOOKING_SELECTED", "DOG_COUNT_10_PLUS"]`. **Never show a price for a custom estimate.**
- Not ready: `ready: false` and `errors` says what is missing.

**`store.fromLine()`** returns `{ text: "Weekly visits from $19.99", cents: 1999, label: "$19.99" }`, or `null` when the line must not show: 6 or more dogs, a yard over 1 acre, an out-of-area ZIP, a frequency other than weekly already chosen, or once the exact price or a custom estimate is known.

**`store.priceBar()`** says what a pinned bar should display right now.

```js
store.priceBar();
// { visible: true, kind: "exact", headline: "$28.99 per visit", priceCents: 2899, priceLabel: "$28.99", unit: "per visit",
//   detail: "2 dogs · Weekly · Up to ¼ acre", continueStep: "price", continueEnabled: true }
```

`headline` is the bar's text and `detail` its small print. `kind` is `from`, `exact`, `custom`, `building` (no price to show yet) or `out_of_area`. `visible` is false until the visitor's first answer and on the done step. A city page's own ZIP is not an answer; progress carried from another page is. Its Continue button calls `store.goTo(bar.continueStep)`. The welcome page has no bar: simply do not render one there.

**`store.intentOptions()`** lists the three things a visitor can send, each `{ id, label, stage, selected, available, reason }`. The ids and labels are `service_request` "Request service", `quote_delivery` "Send me this quote" and `question` "Ask a question" (`PPQuoteCore.INTENTS`). For a custom estimate only the service request is available and its label is "Request my estimate".

**`store.contactOptions(intent?)`** lists the reply methods, each `{ id, label, selected, available, reason, needsConsent }`. Phone call is not available for a quote delivery.

**`store.fieldRules(intent?)`** lists the request-form fields for an intent: which to show, which are required, and their exact labels, hints and input attributes.

```js
store.fieldRules("service_request").find((rule) => rule.key === "phone");
// { key: "phone", shown: true, required: true, control: "tel", label: "Phone number",
//   hint: "Required for your service record. Providing a number does not opt you into texts.",
//   autocomplete: "tel", inputMode: "numeric", placeholder: "(317) 555-0123" }
// The phone rule has NO maxLength (audit finding B1): do not put a maxlength on the phone input.
// formatPhone() caps the digits after it has removed "+1" or a leading 1.
store.fieldRules("service_request").find((rule) => rule.key === "startTiming").choices[0];
// { value: "As soon as possible", label: "As soon as possible", selected: false }
```

Keys, in order: `customerStatus`, `firstName`, `lastName`, `preferredContact`, `phone`, `email`, `smsConsent`, `address`, `city`, `zip`, `startTiming`, `lastCleaned`, `question`, `termsAccepted`. `control` is `text`, `tel`, `email`, `zip`, `textarea`, `choice` or `checkbox`. Mark every field where `required` is true. You may order and group the fields differently.

Every choice field carries **`choices`**, one shape for all four of them: `[{ value, label, selected }]`. Render `label`, and on press call `store.set({ [rule.key]: choice.value })`. The raw list is also there as `options`, and its shape differs: `{ id, label }` objects for `customerStatus` and `preferredContact`, plain strings for `startTiming` and `lastCleaned` (the string is both the label and the value). Use `choices`.

The two checkbox rules carry their wording instead of a `label`: `smsConsent` has `lead`, `body` and `alternative`; `termsAccepted` has `text` and `otherwiseShow`. Render them with `PPQuoteCore.wording` (section 9), which turns the policy names into links.

| Intent | Shown |
|---|---|
| `service_request` | all except `question` |
| `quote_delivery` | `firstName`, `preferredContact` (text or email), `phone`, `email`, `smsConsent`, `lastCleaned` |
| `question` | the same, with Phone call offered, plus `question` |

`smsConsent` is shown only while the reply method is Text. `lastCleaned` is required for every intent.

**`store.planSummary()`** returns rows `{ key, label, value, step }` for dogs, ZIP, yard, areas, frequency and price. `step` is what to pass to `store.edit()`.

**`store.requestSummary(intent?)`** returns display values for the confirm step: `{ intent, name, replyBy, phone, email, serviceAddress, startTiming, lastCleaned, customerStatus, question, textConsentGiven }`. `replyBy` is in words ("Text message"). `serviceAddress` is one line, "123 Example St, Carmel, IN 46032", and is `""` for the other intents.

**`store.offerNote()`** says which offer note applies, in the live order (spec 6.1 and 6.3). It returns `{ kind, title, paragraphs, draftWording }`, plus `facts` for one kind. Print `title` and every entry of `paragraphs` as they are; do not retype, shorten or add to them.

| `kind` | When | What you get |
|---|---|---|
| `one_time` | One-time cleanup is chosen | `title: "One-time cleanup: $89.99 for the first 30 minutes."` (unchanged) and one paragraph: priced on its own, separately from recurring service; the $89.99 base is charged when we text that we are on the way; time beyond 30 minutes is billed after the cleanup at $1 per minute. |
| `custom_review` | Custom booking, or a yard over 1 acre | `title: "Your price needs a custom review."` and one paragraph: the price and first-cleanup terms are confirmed before the customer approves service; nothing is charged by the form. No amount is ever quoted. |
| `restart` | Customer status is returning or not sure | `title: "Restarting service: clear cleanup pricing."` and two paragraphs: the quoted rate (or "comes next" before a price exists) includes up to 30 minutes, time beyond 30 minutes is billed afterward at $1 per minute; the rate and terms are confirmed before approval, the base is charged when the on-the-way text goes out, later regular visits stay at the agreed rate, and the no-start-up-fee first cleanup is for households new to Purge Pros. |
| `new_recurring` | Everyone else | `title: "No start-up fee"`, three paragraphs, `draftWording: false`, and `facts`. |

**The wording is the owner's decision of 2026-10-08.** He set the first-cleanup allowance at 120 minutes and delegated the sentences; `POLICY-WORDING.md` in the release root is the single source for every one of them, and `tests/strings-and-tables.test.mjs` fails if the engine's text is not in that file word for word. The kinds and their order are still the live widget's. The sentences are no longer the live widget's; the numbers and timings of the restart and one-time notes are (30 minutes, $1 per minute, $89.99, charged when the on-the-way text goes out), and `tests/request-form.test.mjs` pins them. `draftWording` is `false` for every kind.

The three `new_recurring` paragraphs, in order:

1. "Your first cleanup is billed at your regular per-visit price, with up to two hours (120 minutes) of cleanup included, even when the yard has built up."
2. "If a yard looks like it needs longer, we tell you before we start and agree the extra time with you first, at $1 per minute."
3. "For households new to Purge Pros, once per household. No minimum number of visits and no cancellation fee."

Its `facts` say the same thing for an interface that needs the facts and not the sentences: `{ appliesTo, customerStatusKnown, oncePerHousehold, teamChecksHistoryFirst, noMinimumVisits, noCancellationFee, regularVisitsStayAtQuotedRate, firstCleanupMinutesAllowance }`. `firstCleanupMinutesAllowance` is `120`. `appliesTo` is "new recurring customers", for a line such as "No start-up fee for new recurring customers".

The hint of the `customerStatus` rule in `store.fieldRules()` is part of the same decision: "No start-up fee is for households new to Purge Pros, once per household. If you have had service before or are not sure, we check and confirm your first-visit price before anything is scheduled."

Rules for anyone editing these sentences: the numbers and timings may not change; nothing may promise a free or unlimited first cleanup; and "offer", "promotion", "waived" and "surcharge" are not used anywhere a visitor can read (tested for every note and every hint). None of this text is sent anywhere: the engine's payload does not carry it.

### 6.4 Validation

All three return `{ ok, errors, byField }`. Each error is `{ field, step, code, message }`; `byField` maps a field key to its message. `step` is where the visitor fixes it.

- **`store.validatePlan()`**: the five plan questions, in flow order. Fields: `dogCount`, `zip`, `yardSize`, `areas`, `frequency`.
- **`store.validateDetails(intent?)`**: the request form for an intent. Fields: `customerStatus`, `firstName`, `lastName`, `preferredContact`, `phone`, `email`, `smsConsent`, `address`, `city`, `zip`, `startTiming`, `lastCleaned`, `question`, `intent`.
- **`store.validateSubmit(intent?)`**: everything that must be right before sending: plan, form and, for a service request, `termsAccepted`. Each field appears once.

```js
store.validateDetails("quote_delivery").byField;
// { firstName: "Enter your first name.", phone: "Enter a valid 10-digit phone number.",
//   smsConsent: "To choose Text, select the service-text permission or choose Email.",
//   lastCleaned: "Choose when the yard was last fully cleaned." }
```

**The ZIP field of the request form.** The service-request form shows the ONE ZIP as an editable field. While the visitor is on `request` or `confirm` and that ZIP is unfinished (empty or fewer than five digits), it is a request-form error: `validateDetails().byField.zip` is "Enter a valid 5-digit ZIP code.", and the error in `next().errors`, `flow().blockedErrors` and `validateSubmit()` has `step: "request"`. Show it as a plain message beside that field; the visitor stays where they are. When the ZIP reaches five digits the coverage check runs again by itself: in area, the message goes and the city pre-fill follows; out of area, `set()` moves the visitor to the `zip` step with a `ZIP_OUT_OF_AREA` notice. Anywhere else, and for the intents whose form has no ZIP field, an unanswered ZIP is a plan error with `step: "zip"`.

**`store.mapServerFields(fields)`** (also `PPQuoteCore.mapServerFields`) turns the Worker's own field names into field keys, so a server-side rejection can highlight fields. `submit()` already does this for you.

```js
PPQuoteCore.mapServerFields(["phone", "street", "clientPriceCents"]);
// { fieldErrors: [{ field: "phone", step: "request", code: "SERVER_REJECTED", message: "Enter a valid 10-digit phone number.", serverField: "phone" },
//                 { field: "address", step: "request", ... }],
//   formErrors: ["Our prices or options changed while this page was open. Please reload the page ..."],
//   unknown: [] }
```

### 6.5 Sending

**`store.submit(intent?)`** returns a promise of one result. It never rejects.

```js
const sent = await store.submit();
// success:  { ok: true, status: "success", requestId, reference, httpStatus: 202, payload, demo: true }
// failure:  { ok: false, status, message, retryAllowed, locked, fieldErrors, formErrors, requestId, httpStatus, payload, demo }
```

| `status` | Meaning | What to show |
|---|---|---|
| `success` | Accepted. `step` is now `done`, `state.receipt` is set, saved progress is cleared. | The done screen with `reference`. |
| `invalid` | The engine's own checks failed. Nothing was built or sent. | `fieldErrors` as a summary linked to the fields. |
| `server_invalid` | The server rejected fields. | `message`, and highlight `fieldErrors`; `formErrors` are not tied to a field. |
| `locked` | "Uncertain" or "request-id conflict". `state.locked` is set. | `message` with a phone link. Disable submit and every edit. Only a reload clears it. |
| `unavailable` | Could not reach the team's system. | `message`. Retry allowed. |
| `timeout` | No reply in 15 seconds. | `message`. Retry allowed. |
| `network` | The request could not be made. | `message`. Retry allowed. |
| `rejected` | Any other refusal. | `message` (a plain sentence; the raw server text is in `serverMessage` for debugging only). |
| `busy` | A request is already being sent, or this request is complete. | Nothing. |
| `blocked` | This page may not send (section 13). | `message`. |

While sending, `state.submitting` is true and `flow().primaryAction` is `"none"`: disable every control and any close button, and show and announce `PPQuoteCore.SUBMIT_MESSAGES.sending`.

A retry of an unchanged request reuses the same `requestId` and timestamps. Any material change makes a new one. Closing and reopening the builder keeps a failed attempt, so the retry is still the same request. Nothing about a pending request survives a reload.

**`store.buildPayload(intent?)`** returns `{ ok: true, payload, reused }` or `{ ok: false, errors, byField }`. You rarely need it; `submit()` calls it. The payload is exactly what the Worker's `validateV3` accepts (spec 12.2).

**`store.createSaveLink()`** returns a promise of `{ ok, status, url, expiresAt, message, body, reused, demo }`. `status` is `created`, `not_ready`, `busy`, `stale`, `blocked`, `timeout`, `rate_limited`, `unavailable`, `rejected`, `bad_link` or `failed`. The body sent is exactly six keys and nothing personal. Asking again for the same plan returns the same link. Copying to the clipboard is your job; the status lines are in `PPQuoteCore.SAVE_LINK_MESSAGES` (section 15). Offer it only once the plan is complete. The engine counts a created link once (`quote_link_saved`, section 8); the same link handed back again, a failure and a discarded reply are not counted.

**`store.resume(token)`** opens a saved plan. Returns a promise of `{ ok, status, notice, pricingChanged }`. While loading, `state.resumeLoading` is true (show `RESUME_MESSAGES.loadingTitle` and `loadingDetail` in a `role="status"` region). On success `step` is `price` and `state.resumeNotice` holds the notice to show and focus. On failure `step` is `dogs` with the reason in `state.resumeNotice`. The notice clears itself when the visitor moves on or changes the plan, and `resumeNotice` is then in `info.changed`. Nothing personal is restored and customer status is never pre-selected. Get the token with `PPQuoteCore.takeResumeToken()` (section 11).

**`store.sendingBlockedReason()`** returns `""` when this page may send, otherwise why not.

### 6.6 Tracking and logs

**`store.track(name, params)`** is only for the two events the engine cannot see:

```js
store.track("yard_size_help_opened");                                        // the yard guide was opened
store.track("promotion_details_viewed", { promotion: "No start-up fee" });   // "How this works" was opened
```

Any other name is refused and returns `false`. The engine fires everything else itself (section 8).

Nothing a visitor typed may ride along, under any name:

- Parameters are an allow-list per event, `PPQuoteCore.EVENTS.uiParams`: `yard_size_help_opened` takes none, `promotion_details_viewed` takes `promotion` only. Any other parameter is dropped.
- The value is checked too. It is dropped unless it is a short plain string (100 characters at most), a number or a boolean, and it is dropped when it holds an `@`, five digits in a row, seven digits in all, or any of the visitor's own details (name, email, address, question, a city they typed).
- The event itself still fires and `track()` still returns `true`. `store.trackLog` records how many parameters were dropped (`channel: "rejected"`, `dropped: 2`), never their names or values.

**`store.trackUi(name, params)`** is for the six moments only a page can see. It returns `true` or `false`. The interface reports the moment; the engine decides whether it counts (each has a once-only rule), adds what it knows itself, builds the event and sends it. Added 2026-10-09 (T19 to T22, section 8).

```js
store.trackUi("builder_opened", { entry: "header_button" });                 // your panel or dialog opened: say which way in
store.trackUi("builder_opened", { entry: "plan_button", plan: "weekly" });   // a plan button also names its plan (a frequency id)
// Closing needs no call when you close through hooks.close() or store.close(). Otherwise: store.trackUi("builder_closed")
store.trackUi("request_step_viewed", { request_step: "who" });               // a request screen is showing: "who", "reach" or "where"
store.trackUi("request_step_completed", { request_step: "who" });            // the visitor got past it
store.trackUi("form_validation_failed", { request_step: "reach", fields: ["phone", "smsConsent"] });   // YOUR OWN refused press: field keys only
store.trackUi("contact_click", { method: "text", placement: "header" });     // a text, call or email link was pressed
```

| `name` | Call it when | `params` you pass | The engine adds | Counted |
|---|---|---|---|---|
| `builder_opened` | Your panel or dialog has opened. | `entry`, required: `hero_card`, `header_button`, `menu_button`, `page_button`, `plan_button`, `pinned_bar`, `summary_card`, `link` or `saved_link`. `plan`, optional and kept only with `plan_button`: a frequency id (`twice`, `weekly`, `biweekly`, `onetime`, `custom`). | `step` | Once, until the builder is closed |
| `builder_closed` | Only when you hide the builder without `hooks.close()` or `store.close()`. Those two count it themselves. | none | `step`, and `request_step` on the request step | Once per counted opening |
| `request_step_viewed` | A request screen is showing. Safe to call on every render. | `request_step`, required: `who`, `reach` or `where` | `choice` (the way forward) | Once per quote and way forward |
| `request_step_completed` | The visitor got past that screen. For the last screen: after `store.next()` returned `ok`. | `request_step`, required | `choice` | Once per quote and way forward |
| `form_validation_failed` | A press was refused by YOUR OWN check (a screen checked with `store.validateDetails()`). Not when `store.next()` or `store.submit()` refused: the engine has counted those. | `fields`, required: the KEYS of the fields that failed (each error's `field`), as an array or a comma-separated string. `request_step`, optional. | `form_step`, `error_count`, `checked_by` | Once per refusal; again only after something changed |
| `contact_click` | A text, call or email link was pressed, anywhere on the page. | `method`, required: `text`, `call` or `email`. `placement`, required: `header`, `menu`, `hero`, `section`, `closing`, `footer` or `builder`. | nothing | Every press; the same link twice within a second is one. The pixel's `Contact` at most once per page load |

The lists are fixed and exported: the names in `PPQuoteCore.EVENTS.trackUi`, the parameters of each in `EVENTS.trackUiParams`, and the values each parameter may hold in `EVENTS.trackUiValues` (`entry`, `plan`, `request_step`, `fields`, `method`, `placement`).

- Any other name is refused, and so is a call whose required parameter is missing or not on its list, or that comes at the wrong moment: `request_step_viewed` off the request step, `request_step_completed` anywhere but the request step or the confirm step it led to, `form_validation_failed` anywhere but the request and confirm steps. A refused call returns `false`, sends nothing, and writes a `channel: "rejected"` entry with the reason to `store.trackLog`.
- Any other parameter, and any value that is not on its list, is dropped. `fields` keeps only real field keys (`PPQuoteCore.FIELD_STEP` has them), so a phone number or a name handed over by mistake goes nowhere. Only how many were dropped is logged (`dropped: 2`), never a name or a value.
- `true` means the call was accepted, also when the moment had been counted already (a second `request_step_viewed` for the same screen, a `builder_opened` while it is open).
- `builder_opened`, `builder_closed` and `contact_click` are page-level: they are not an answer, so they never fire `funnel_viewed` and never count a city page's ZIP.
- What the `entry` values mean: `hero_card`, the visitor's first answer in the hero card opened the panel; `header_button` and `menu_button`, the button in the site header and the one in the phone menu; `page_button`, any other button or link in the body of the page; `plan_button`, a button that names a plan; `pinned_bar`, the pinned price bar; `summary_card`, the summary card in the hero or one of its chips; `link`, the page address asked for it (`?open_quote=1`, `#quote`) or a script called `PurgeProsQuote.open()`; `saved_link`, a saved quote was opened.
- Report `builder_opened` only when a panel or dialog really opened. A launcher that merely points at an inline builder opens nothing: reporting it would leave the engine waiting for a closing that never comes, and the next real opening would not be counted.
- What the `placement` values mean: `header`, the site header; `menu`, the phone menu; `hero`, the top block of a page; `section`, anywhere else in the body of a page; `closing`, the last call-to-action block before the footer; `footer`; `builder`, inside the price builder (the out-of-area answer, the "please call" state, a failure message).
- For a contact link, `method` and `placement` are yours to work out from the link and where it sits: `text` for an `sms:` link, `call` for `tel:`, `email` for `mailto:`. Never pass the number, the address or the link itself.

| Member | What it holds |
|---|---|
| `store.trackLog` | Every event, in order: `{ channel: "google" or "meta", event, params, sent, demo, at }`, plus `channel: "rejected"` entries for refused names and dropped parameters. In demo mode this is the only place events go. |
| `store.submissionLog` | Demo mode: every payload and save-link body built for sending. Live mode: request ids only, never a second copy of contact details. |
| `store.networkLog` | Every network request made. Always empty in demo mode. |
| `store.attributionSource()` | `{ source, capturedAt, keepDays }`: where the attribution in use came from. `source` is `"session"` (this visit's own parameters), `"kept"` (the 30-day copy, with `capturedAt` in milliseconds) or `"none"`. For a test page (section 14). |
| `store.initialNotices` | Notices from reconciling restored progress at start-up. |
| `store.mode`, `store.isDemo`, `store.isStaging` | `"demo"`, `"staging"` or `"live"`, and the two flags. |
| `store.endpoint` | The request address in use; `""` in demo mode. |
| `store.demo`, `store.setDemo(switches)` | The demo switches (section 10). |
| `store.frequencyLabels` | The frequency names in use. |

## 7. Building each step

### 7.1 Dogs

`PPQuoteCore.DOG_OPTIONS` is ten entries `{ id, count, label, group }`. `group` is `"main"` for 1 to 4 and `"more"` for 5 to 10+. Brief: 1 to 4 as large tiles, "5 or more" reveals the rest. On press: `store.set({ dogCount: option.id })`. Choosing 10+ selects Custom booking and returns a notice.

### 7.2 ZIP

Bind a numeric input to `store.set({ zip })`. Read `store.checkZip()` after each change and show the answer at once. For `out_of_area`, render the kind message, keep the correction field and the phone number, and ask for nothing else. Live wording is in `PPQuoteCore.OUT_OF_AREA_COPY` (section 15); its last sentence ("We will not collect your contact details in this form for an unsupported ZIP.") must stay.

### 7.3 Yard size and areas

`PPQuoteCore.YARD_SIZES` is `{ id, label, addCents, custom, maxSquareFeet }`. `over` is custom only: choosing it selects Custom booking with a notice. `maxSquareFeet` is the yard-guide table. `PPQuoteCore.AREAS` is `{ id, label }`. Areas use `store.toggleArea(id)`; nothing is preselected.

### 7.4 Frequency, price and intent

Render `store.frequencyOptions()`. On the price step render `store.quote()`, its `lineItems`, `store.offerNote()`, the three `store.intentOptions()` and the save link. Choose an intent with `store.set({ intent })`. The engine counts the choice itself (`price_choice_selected`, section 8): when a different intent is set on the price step, or when the visitor moves on with the one already selected. There is nothing to wire. All three intents must be reachable on a phone (the live tool hides two of them: spec 13 item 1).

### 7.5 Request, confirm and done

Render `store.fieldRules()`, using each choice field's `choices`. Bind inputs to `store.set()`. The phone is formatted as it is typed, so after `set({ phone })` show `state.phone` in the field. The ZIP shown here is the same `zip`: editing it re-checks coverage (section 6.4). Returning and not-sure customers see `offerNote()` of kind `restart`.

On confirm, everything is on screen together before the submit button: `store.planSummary()`, the price, `store.requestSummary()` (name, reply method, phone, email, service address, start timing, last cleanup, question), the promise that this is a request and not a booking, and for a service request the terms box. The example in section 3 does exactly this.

On done, show `state.receipt.requestId` and the reply wording from `state.receipt.replyWhere` ("your text messages", "your inbox", "your phone"), repeat the promise, then call `store.reset()` when the visitor leaves.

## 8. Tracking

In demo mode nothing reaches a real tag. Every would-be call is written to `store.trackLog` and to the console.

| Event | Fired by the engine when | Meta pixel |
|---|---|---|
| `funnel_viewed { presentation }` | The visitor's first action in the builder on this page load: their first answer, or the first later event of a visitor who only carries on with progress from another page. Once. It always comes before every other event of the page load except the ZIP result of a ZIP that was handed over, and except the three page-level events (`builder_opened`, `builder_closed`, `contact_click`), which are not answers and never fire it. | `QuoteFunnelViewed` |
| `service_area_eligible` / `service_area_ineligible` `{ zip_prefix, entry? }` | A ZIP is completed. `entry` is absent for a typed ZIP, `hero_zip` for `open({ zip })` or `?zip=`, `city_page` for a page-supplied ZIP. | `QuoteZipAccepted` / `QuoteZipOutOfArea`, once each |
| `dog_count_selected { dogs }`, `yard_size_selected { yard_size }` | Each change. | none |
| `areas_selected { areas_count }` | The visitor moves on with an areas answer: leaves the areas question for a later step, chooses how often, sends the request, or a later screen reports itself (`reportStepShown`). Not on a tile tap. `areas_count` is 1, 2 or 3. Again only when the number differs from the one counted last for this quote. Not for areas carried in from another page or a saved plan. Added 2026-10-09 (T17). | none |
| `frequency_selected { frequency }` | The visitor's own choice changes the frequency; `frequency` is the option id. Not for a repeat tap, a cleared or refused choice, or a frequency the engine changed by itself. Added 2026-10-09 (T18). | none |
| `price_viewed { frequency, custom, value }` | The price step shows a plan for the first time. Not again for the same plan. Never on resume. | `QuotePriceViewed`, once |
| `price_choice_selected { choice }` | The visitor chooses a way forward on the price step; `choice` is `service_request`, `quote_delivery` or `question`. Counted when the choice is first made: a different intent is set while the price step is on screen, or the visitor moves on from the price step with the intent already selected. Again only when the choice differs from the one counted last for this quote. Added 2026-10-09 (T15). | none |
| `quote_link_saved` | `createSaveLink()` created a link. Once per created link; not for the same link handed back, a failure, or a discarded reply. No parameters. Added 2026-10-09 (T14). | `QuoteLinkSaved`, once per created link (a count, not a milestone) |
| `funnel_step_viewed { step }` | Entering `price` (3), `request` (4), `confirm` (5), `done` (6). | 4: `QuoteDetailsViewed`, 5: `QuoteReviewViewed`, once each |
| `request_step_viewed { request_step, choice }`, `request_step_completed { request_step, choice }` | The interface reports a request screen through `store.trackUi()` (section 6.6). `request_step` is `who`, `reach` or `where`; the engine adds `choice`, the way forward. Each once per quote and way forward. Added 2026-10-09 (T19). | none |
| `form_validation_failed { form_step, request_step?, fields, error_count, checked_by }` | A press of Next or Send is refused on the request or confirm step: by `next()`, by `submit()`, by a server reply that names fields (`checked_by` is then `server`, otherwise `form`), or by the interface's own check reported through `store.trackUi()`. `fields` is the KEYS of the fields that failed, joined by commas (`"phone,smsConsent"`): never a value or a message. The same refusal with nothing changed is counted once. Added 2026-10-09 (T20). | none |
| `service_requested`, `estimate_requested`, `quote_requested`, `question_submitted` | Success. Since 2026-10-09 `quote_requested` also carries `method`, `text` or `email`: how the quote is sent (T16). | none, with one exception added 2026-10-09 (T13): after `quote_requested`, `QuoteSent { frequency, value, currency, method }`, once per accepted request (a count, not a milestone, never `Lead`) |
| `generate_lead`, `conversion` | Success of a SERVICE request only, once, with the shared `event_id`. | `Lead` with `eventID` |
| `yard_size_help_opened`, `promotion_details_viewed { promotion }` | The page calls `store.track()` (section 6.6). | none |
| `builder_opened { entry, plan?, step }`, `builder_closed { step, request_step? }` | The interface reports that the builder opened as a panel or dialog (`store.trackUi()`), with its entry point; the engine adds the step. Once until it is closed. The closing is counted by the engine inside `close()` (so through `hooks.close()` too), or when the interface reports it, once per counted opening. Page-level: neither fires `funnel_viewed`. Added 2026-10-09 (T21). | none |
| `contact_click { method, placement }` | The interface reports a press on a text, call or email link (`store.trackUi()`). The same link twice within a second is one press. Page-level. Added 2026-10-09 (T22). | The STANDARD event `Contact`, with no parameter at all, at most once per page load |

Rules the engine enforces: the five pixel milestones fire at most once per page load; no ZIP in any pixel event; only the 3-digit prefix goes to Google; no name, phone, email, address, city or question in any event, whatever the parameter is called; `Lead`, `generate_lead` and `conversion` only for a successful service request, once. Every measurement event added since 2026-10-09 (T13 to T22) carries only the parameters `PPQuoteCore.EVENTS.measurementParams` lists for it, with values of a fixed kind (an option id, a step, a request screen, an entry point, a placement, a field key, a count, the per-visit price that was sent, `USD`). They are built by the engine: `store.track()` refuses their names, and `store.trackUi()` takes only its six names with their listed parameters and values. None of them carries a request id, a ZIP or anything of the attribution. In live mode on a page that may not send, none of them calls a tag (T11). If the pixel has not loaded when `QuoteSent` or `QuoteLinkSaved` happens, that count is not sent later, exactly as with `Lead`; `Contact` goes with the next contact press instead.

The only conversion is a completed service request. `QuoteSent`, `QuoteLinkSaved`, `quote_link_saved`, `price_choice_selected` and every event of T17 to T22 are measurements: none of them is `Lead` or carries the Google Ads label. All of them are Google events or pixel CUSTOM events, with one exception: `Contact` is a pixel STANDARD event, because Meta has one for exactly this. It is still not a conversion, and no campaign should be set to optimise for it. The standard pixel events the engine can send are listed in full: `Lead` and `PPQuoteCore.EVENTS.pixelStandard` (`Contact`).

**The whole dictionary, by platform.** Google (through `gtag`, or the `dataLayer`), each with `ui_version` except `generate_lead` and `conversion`, which go out exactly as the live tool sends them: `funnel_viewed`, `service_area_eligible`, `service_area_ineligible`, `dog_count_selected`, `yard_size_selected`, `areas_selected`, `frequency_selected`, `price_viewed`, `price_choice_selected`, `quote_link_saved`, `funnel_step_viewed`, `request_step_viewed`, `request_step_completed`, `form_validation_failed`, `builder_opened`, `builder_closed`, `contact_click`, `yard_size_help_opened`, `promotion_details_viewed`, the four stage events, and for a service request `generate_lead` and `conversion`. Meta pixel, ten names: `QuoteFunnelViewed`, the five milestones (`PPQuoteCore.PIXEL_MILESTONES`), the two counts `QuoteSent` and `QuoteLinkSaved`, and the two standard events `Contact` and `Lead`.

Unchanged from the live tool, for the events it already had: the event names, their parameters (with the one addition of `method` on `quote_requested`, T16), the success events and their order (the stage event, `generate_lead`, `conversion`, `Lead`, then step 6), the shared `event_id`, `gtag` first and `dataLayer` as the fallback, and the pixel waiting for `fbq` to exist.

### Tracking changes approved by the owner on October 9, 2026

Every way this engine's tracking differs from the live tool is listed here, and nowhere else. The owner approved rows T1 to T15 on October 9, 2026: T1 to T12 as a group (`ADS-READINESS.md`, decision 3), and the three measurement events T13 to T15 (decisions 1 and 7). Each of those is marked in the source as `TRACKING CHANGE APPROVED BY THE OWNER 2026-10-09` with the same number. Rows T16 to T23 were added later the same day under his go-ahead to make whatever changes were best, when he asked for the measurement to be fully fleshed out before the site is installed. They follow his eight decisions (a completed service request is the only conversion; a quote sent is report-only; nothing a visitor fills in changes) and are marked in the source as `TRACKING CHANGE APPROVED BY THE OWNER'S GO-AHEAD 2026-10-09`. He has not read those eight row by row; this table is where he can. Approved means decided, not live: none of them reaches a real tag in a review build, nothing is deployed, and receipt by Google or Meta has not been tested.

| # | The live tool | This engine | Why | Approved |
|---|---|---|---|---|
| T1 | `funnel_viewed` and the `QuoteFunnelViewed` pixel event fire every time the dialog is opened, so several times on one page, and on the standalone page at load. | Once per page load, on the visitor's first action in the builder: the first answer; or, for a visitor who carries on with progress from another page or opens a saved plan, the first event after that (for example reaching the price). Never on page load. A ZIP handed over on purpose (`open({ zip })`, `?zip=`) is an action and fires it at once. A second quote after `reset()` does not fire it again. | The builder is always visible in the hero. Firing on page load would count every visitor (spec section 14 item 10). | October 9, 2026 |
| T2 | Has no city-page ZIP. A ZIP that is passed in fires `service_area_eligible` and the `QuoteZipAccepted` milestone immediately, with `entry: "hero_zip"`. | A ZIP supplied by the page (`pageZip`) is counted on the visitor's first action on that page, with `entry: "city_page"`. If the visitor types a different ZIP first, only the typed ZIP is counted. | Counting it on load would add every city-page visitor to the ZIP milestone (spec section 15). | October 9, 2026 |
| T3 | `presentation` is `hero_zip`, `dedicated` or `modal`. | `presentation` is `inline` (a new value) unless the page passes `presentation: "modal"`; `dedicated` on `quote.itspurgepros.com`; `hero_zip` when the ZIP in use was handed over. | The builder is no longer a dialog by default. | October 9, 2026 |
| T4 | `ui_version` is `2026-09-12-website-improvements-v1`. | `ui_version` is `2026-10-07-site-rebuild-v5` on every event (the `uiVersion` option changes it). | So reports can tell the two front ends apart. | October 9, 2026 |
| T5 | The ZIP result fires when "Check ZIP" is pressed, and again on every press. | There is no button. It fires when a typed ZIP reaches five digits, wherever it is typed (the ZIP question, or the ZIP field of the request form), and not again while it stays the same ZIP. | The brief's flow answers at once (spec section 15). | October 9, 2026 |
| T6 | Every `open({ zip })` call counts the ZIP again. On a site page `?zip=` is read only beside an open instruction; it stays in the address. | A ZIP that is handed over is counted once per ZIP. `?zip=` is honoured on its own, is taken out of the address once read, is not applied over the visitor's own saved ZIP unless the page load is a new arrival, and is never applied on a refresh (section 4). | One hero form submit should count once, and a refresh should count nothing. | October 9, 2026 |
| T7 | `funnel_step_viewed` sends 1 to 6 on every move, including 1 (Area) and 2 (Plan). | Sends 3, 4, 5 and 6 by meaning (price, request, confirm, done), on every move to those steps, including going back. The five plan questions send no step number. A design that merges request and confirm reports each once per visit to the screen (`reportStepShown`). | The new flow has different steps; the pixel milestones are keyed to 4 and 5 (spec section 14 item 10). Reports that use steps 1 and 2 lose them. | October 9, 2026 |
| T8 | `price_viewed` fires on every press of "Review price" (not when returning from an edit on the review, and not on resume). | Fires the first time the price step shows a given plan, and not again for that plan, however the visitor reaches the step. A changed plan fires it again. Never on resume. | "The first time the final price shows" (spec section 15). | October 9, 2026 |
| T9 | `dog_count_selected` fires on every dog-tile tap, including a tap on the tile already chosen. | `dog_count_selected` and `yard_size_selected` fire when the answer changes. | A repeated tap is not a new answer. | October 9, 2026 |
| T10 | `yard_size_help_opened` and `promotion_details_viewed` are fired by the widget itself; `promotion` is the live offer title ("Initial scoop surcharge waived"). | The page fires them through `store.track()`. `promotion` is whatever title the page shows ("No start-up fee", unchanged by the 2026-10-08 wording). Only allow-listed parameters with safe values are sent (section 6.6), and the listed personal field names are stripped from every event. | The engine cannot see a pop-up open. The filters are a safeguard; they change no defined event. | October 9, 2026 |
| T11 | Calls the tags wherever the script runs. | In live mode on a page that may not send requests (not https, or an origin the Worker does not accept: section 13), no tag is called at all; events go to `store.trackLog` only. Demo mode never calls a tag. | A staging or preview copy must not count in the owner's reports. | October 9, 2026 |
| T12 | The Google Ads `conversion` label is put into the widget by the Worker when the script is served. | The same label is the engine's built-in default (`PPQuoteCore.LIVE_GOOGLE_ADS_SEND_TO`); `googleAdsSendTo` replaces it, and `""` switches the `conversion` event off. | The engine is not served by the Worker. If the label ever changes in the Worker's settings it must be changed here too. | October 9, 2026 |
| T13 | Sends nothing to Meta when a quote delivery ("Send me this quote") is accepted. Google gets the stage event `quote_requested`. | An accepted quote delivery (intent `quote_delivery`, whether the reply is by text or by email) also sends the pixel CUSTOM event `QuoteSent { ui_version, frequency, value, currency, method }`, once per accepted request, straight after `quote_requested`. `value` is the per-visit price that was sent, the figure `quote_requested` already carries, with `currency` `USD`; `method` is row T16. It is sent with `trackCustom`, carries no `eventID`, and is never `Lead`: `Lead`, `generate_lead` and `conversion` still fire for a completed service request only. A failed, refused or locked request sends nothing. The event was approved under the name `QuoteTexted`; because it also fires for a quote sent by email it was renamed `QuoteSent` in engine 1.4.0, the same day, before anything was installed, so nothing was ever sent under the old name. | A texted quote is a real lead that Meta heard nothing about. Under its own name it shows in reports while "Lead" keeps one meaning (`ADS-READINESS.md`, decision 1). | October 9, 2026 |
| T14 | Creating a save link sends no event. | A save link that was created sends `quote_link_saved` to Google and the pixel CUSTOM event `QuoteLinkSaved`, once per created link, with `ui_version` and nothing else: nothing of the plan, the ZIP or the link. Nothing is sent for the same link handed back again, for a failed or refused attempt, or for a reply discarded because the plan changed. A changed plan gets a new link and one new count. | A saved quote gave the business not even a count (`ADS-READINESS.md`, decisions 6 and 7). | October 9, 2026 |
| T15 | The choice between the three ways forward sends no event of its own. Only the request that is finally sent names its intent. | `price_choice_selected { choice }` goes to Google when the visitor chooses a way forward on the price step; `choice` is `service_request`, `quote_delivery` or `question`. It is counted when the choice is first made: when a different intent is set while the price step is on screen, or when the visitor moves on from the price step with the intent already selected ("Request service" is selected from the start, so pressing it changes nothing). It is counted again only when the choice differs from the one counted last; a new quote (`reset()`, or a saved plan opened) starts again. An intent the engine changes by itself (a custom estimate) is not a choice. No pixel event, no price, nothing else. | To see which way forward visitors pick and where they stop (`ADS-READINESS.md`, decision 7). | October 9, 2026 |
| T16 | Says nothing about how a quote is sent: `quote_requested` carries the request id, the intent, the frequency and the price. | `quote_requested` and the pixel count `QuoteSent` both carry `method`: `text` or `email`, the reply method chosen for the quote. Never any other value (a quote cannot be sent by phone call), and on no other event. | One event counts quotes sent by text and by email, so a report must be able to tell them apart. | Approved by the owner's go-ahead of October 9, 2026 (he asked for the measurement to be fully fleshed out) |
| T17 | Sends nothing when the areas are chosen. | `areas_selected { areas_count }` goes to Google once the visitor moves on with an areas answer: on leaving the areas question for a later step, on choosing how often, when a later screen reports itself, or as the request is sent. Not on a tile tap. `areas_count` is 1, 2 or 3. Counted again only when the number differs from the one counted last for this quote. Areas carried in from another page or a saved plan are not counted. No pixel event. | To see whether visitors get past the areas question, the one plan question that takes more than one tap. | Approved by the owner's go-ahead of October 9, 2026 (he asked for the measurement to be fully fleshed out) |
| T18 | Sends nothing when the frequency is chosen; the frequency first appears on `price_viewed`. | `frequency_selected { frequency }` goes to Google when the visitor's own choice changes the frequency. `frequency` is the option id (`twice`, `weekly`, `biweekly`, `onetime`, `custom`). Not for a repeat tap, a cleared or refused choice, or a frequency the engine changed by itself after a dog or yard change. No price, no pixel event. | The last question before the price: where a visitor decides how much service they want. | Approved by the owner's go-ahead of October 9, 2026 (he asked for the measurement to be fully fleshed out) |
| T19 | The request form is one step; `funnel_step_viewed` 4 is all it sends. | An interface that shows the request step as shorter screens reports each through `store.trackUi()`. `request_step_viewed { request_step, choice }` and `request_step_completed { request_step, choice }` go to Google, each once per quote and way forward. `request_step` is `who`, `reach` or `where`; `choice` is the intent id, added by the engine. A completed screen never reported as reached is counted as reached first. Refused unless the request step is on screen (or, for a completed screen, the confirm step it led to). `funnel_step_viewed` 4 and the `QuoteDetailsViewed` milestone are unchanged. No pixel event. | To see which screen of the request loses people: the name, the phone number or the address. | Approved by the owner's go-ahead of October 9, 2026 (he asked for the measurement to be fully fleshed out) |
| T20 | Sends nothing when a press is refused. | `form_validation_failed { form_step, request_step?, fields, error_count, checked_by }` goes to Google when a press of Next or Send is refused on the request or confirm step. `fields` is the KEYS of the fields that failed, in the engine's order, joined by commas (`"phone,smsConsent"`) and cut at whole keys to 100 characters; `error_count` is how many failed; `form_step` is `request` or `confirm`; `checked_by` is `form` or `server`; `request_step` is the screen, when known. Never a value, a message or anything typed. The engine counts the refusals it makes itself (`next()` on the request step, `submit()`, a server reply that names fields); the interface reports its own through `store.trackUi()`. The same refusal with nothing changed in between is counted once. No pixel event. | To see which fields stop people. | Approved by the owner's go-ahead of October 9, 2026 (he asked for the measurement to be fully fleshed out) |
| T21 | Opening the dialog is what fires `funnel_viewed` (T1); closing sends nothing. | `builder_opened { entry, plan?, step }` goes to Google when the interface reports (`store.trackUi()`) that the builder opened as a panel or dialog. `entry` is `hero_card`, `header_button`, `menu_button`, `page_button`, `plan_button`, `pinned_bar`, `summary_card`, `link` or `saved_link`; `plan` is a frequency id, kept only with `plan_button`; `step` is the step it opened on, added by the engine. Counted once until the builder is closed. `builder_closed { step, request_step? }` is counted by the engine inside `close()` (so through `hooks.close()` too), or when the interface reports it, once per counted opening, with the step it was closed on. Neither is an answer: they never fire `funnel_viewed` or a city page's ZIP count, so T1 and T2 stand. No pixel event. | To see which buttons bring people into the builder, and where they give up. | Approved by the owner's go-ahead of October 9, 2026 (he asked for the measurement to be fully fleshed out) |
| T22 | Has no event for a contact link. | `contact_click { method, placement }` goes to Google when the interface reports (`store.trackUi()`) a press on a text, call or email link. `method` is `text`, `call` or `email`; `placement` is `header`, `menu`, `hero`, `section`, `closing`, `footer` or `builder`. Never the number, the address or the link. The same link pressed twice within a second is one press. The pixel gets its STANDARD event `Contact`, sent with `track` and no parameter at all, at most once per page load. Neither is a conversion and neither is an answer. | A visitor who texts or calls instead of using the form is a lead no report could see. `Contact` is Meta's own event for it. | Approved by the owner's go-ahead of October 9, 2026 (he asked for the measurement to be fully fleshed out) |
| T23 | Keeps the nine URL parameters for the browser session only (`sessionStorage`). | The session copy is unchanged. The last non-empty set is also kept in the browser's `localStorage` for 30 days under `pp_quote_attribution_kept_v1`, as `{ capturedAt, values }`, with the rules in section 14. It is used only when the session has no parameter of its own. It changes no event: only the `attribution`, `gclid`, `fbclid` and fallback `fbc` values a request carries, under the same payload keys. | A visitor who clicks an ad, leaves and comes back another day arrived with no source, so the request could not be traced to the ad that earned it. | Approved by the owner's go-ahead of October 9, 2026 (he asked for the measurement to be fully fleshed out) |

## 9. What the interface must do (the engine cannot enforce these)

Consent and compliance (spec 17.2):

1. Render the text-consent wording exactly: `<strong>` + `PPQuoteCore.CONSENT.lead` + `</strong> ` + `CONSENT.body`. Never retype it.
2. Show the consent box only while the reply method is Text. Never pre-tick it, and never tick it for the visitor: call `set({ smsConsent: true })` only from their own click. When `smsConsent` appears in `info.changed` (with a `CONSENT_CLEARED` notice), untick it on screen.
3. Email and Phone call stay available without consenting to texts, and the visitor is told so beside the box: `PPQuoteCore.wording.consentAlternativeParts(callIsOffered)` returns that line in parts, with the Privacy Policy and Terms & Conditions as links that open in a new tab. Pass `false` for a quote delivery.
4. Keep the phone hint on a service request: `CONSENT.phoneHintService` ("Providing a number does not opt you into texts.").
5. Render the terms checkbox for a service request with `PPQuoteCore.wording.termsParts(isOneTime)`. Unticked by default. It is required again after any edit: when `termsAccepted` appears in `info.changed` (with a `TERMS_CLEARED` notice), untick it on screen. For the other intents show `wording.otherIntentsParts()` instead of a box.
6. Before submit, the plan, the price, the contact details and the terms box are all visible on one screen, whether confirm is its own screen or the end of the request form. Say that this is a request, not a booking, and that nothing is charged or scheduled (`PPQuoteCore.PROMISES`). Repeat it on the done screen.
7. Keep every price and charge statement true (spec 6.3). One-time is $89.99 for the first 30 minutes, then $1 per minute, and the base is charged when the on-the-way text goes out. Returning and not-sure customers see the restart terms: render `offerNote()` of kind `restart` with its numbers unchanged. The new-customer benefit is once per household and subject to the team's check of service history; say so wherever "No start-up fee" is shown. A new recurring customer's first cleanup includes up to 120 minutes (`offerNote().facts.firstCleanupMinutesAllowance`): state that number and no other, and never promise a free or unlimited first cleanup. Print the engine's sentences for all four notes; do not write your own.
8. Never show a price for a custom estimate.
9. Collect nothing from an out-of-area visitor, and say so (`PROMISES.outOfAreaNoContact`).
10. Never put a name, phone, email, address or question in storage, in a link, or in a bar that follows the visitor between pages. The engine never does; do not add your own.
11. Do not call `gtag`, `fbq` or `dataLayer` for builder events yourself. Fire only the two interface events, through `store.track()`, report the six page moments through `store.trackUi()` (item 30), and pass nothing the visitor typed: for a refused field its key, never its value; for a contact link the method and where it sits, never the number or the link.
12. The review rating and count come only from the live feed, with a neutral fallback, never a typed-in number. The engine does not fetch it.

Accessibility, at least equal to the live tool (spec 17.2 item 14 and section 11):

13. Move focus to each new step (its heading or container, `tabindex="-1"`) when `state.step` changes, and to the error summary when a press is blocked.
14. Summarise errors in one `role="alert"` box, each linked to its field; mark the field `aria-invalid` and repeat the message beside it. Use `byField` and each error's `step`. Clear the previous errors each time.
15. Mark every required field, visibly and for assistive technology.
16. Choices are real buttons or inputs with their state exposed (`aria-pressed` or `checked`). A disabled option states its reason in visible text.
17. Everything works by keyboard: every tile, option, checkbox, Back, Continue, edit link, the yard guide and the save link can be reached with Tab and worked with Enter or Space, with a visible focus outline. Escape closes a pop-up, except while a request is being sent.
18. Any pop-up traps focus while it is open and returns focus to the control that opened it when it closes: the builder itself when it is shown as a dialog (`result.trigger` in the open handler), the yard guide and the offer details. An inline builder needs no page-wide trap.
19. Status messages are announced: the sending line, the save-link status, the saved-plan loading line and the saved-plan notice sit in `role="status"` regions and take focus when they appear.
20. Inputs are at least 16px on phones. Tap targets are at least 44px. Respect `prefers-reduced-motion`.

Behaviour:

21. Show every notice next to what changed. They arrive in `info.notices` for every kind of change, not only from `set()`.
22. Give every step a Back control (`flow().back`) and one-tap editing (`store.edit()`).
23. Bind the primary button to `flow().disablePrimary`, and show `flow().blockedReason` beside it while it is disabled.
24. While `state.submitting` is true: no second submit, no closing, a visible and announced status.
25. After a `locked` result: show the message with a call link, disable submit and every edit.
26. Do not rebuild a step on every tap: update what `info.changed` names. Preload a step's images (spec 13 item 4). No layout jump between steps.
27. Show and focus `state.resumeNotice` when it is set, and dismiss it when `resumeNotice` appears in `info.changed` with an empty value.
28. All three intents are reachable on a phone.
29. Review builds: show somewhere that the page is a demo and nothing is sent.

Measurement (section 6.6; the engine cannot see these moments):

30. Report through `store.trackUi()`: each request screen when it shows (`request_step_viewed`) and when the visitor gets past it (`request_step_completed`); a press your own check refused (`form_validation_failed`, with field keys); your panel or dialog opening, with the way in (`builder_opened`); and every text, call or email link on the page, including the ones in the header, the menu and the footer (`contact_click`). Close the builder through `hooks.close()` or `store.close()` so the closing is counted, or report `builder_closed` yourself.

## 10. Demo switches

Set by option, by query string, or while the page is open (`store.demo.submit = "timeout"`). The query string is read only in demo mode.

| Switch | Query string | Values |
|---|---|---|
| `demo.submit` | `?pp_demo=` or `?pp_demo_submit=` | `success`, `slow` (4-second wait, to build the sending state), `invalid` (400 with a field list), `uncertain` (409, locks), `conflict` (409, locks), `unavailable` (503), `timeout`, `network`, `forbidden` (403) |
| `demo.invalidFields` | `?pp_demo_fields=phone,street` | The Worker field names the `invalid` reply lists. Default `phone`. |
| `demo.save` | `?pp_demo_save=` | `success`, `rate_limited`, `unavailable`, `invalid`, `timeout`, `bad_link` |
| `demo.resume` | `?pp_demo_resume=` | `success`, `changed` (prices changed since saving), `expired`, `plan_unavailable`, `mismatch`, `timeout`, `rate_limited`, `unavailable` |
| `demo.delayMs` | `?pp_demo_delay=` | Wait before each demo reply. Default 900. |

Other useful addresses: `?zip=46032` (in area, ZIP skipped), `?zip=46201` (out of area), `?open_quote=1`. The `?zip=` disappears from the address bar once it has been read; that is intended (section 4).

A demo link from `createSaveLink()` opens only in the store that made it; any other well-formed token opens a fixed sample plan (2 dogs, weekly, quarter acre, back and front, 46032). To see the resume screens: `store.resume("A".repeat(43))`.

Demo mode refuses to submit on a real Purge Pros origin, so a review build can never show a pretend success to a customer.

## 11. Hooks other pages rely on

```js
const hooks = PPQuoteCore.installPageHooks(store, {
  open(result) { /* bring the builder into view (show your dialog, if it is one) and move focus to it */ },
  close() { /* hide the builder; only if yours can be closed */ },
  busy(result) { /* optional: open or close was asked while a request is being sent; move focus to your Sending status */ }
});
```

`result` is `{ ok, zipStatus, step, reason, trigger }`. `trigger` is the element that was pressed (or `null`), so you can return focus to it. When `ok` is false nothing was changed and `reason` says why (for example the locked message): still bring the builder into view, so the visitor sees it.

This wires, in one call (spec 2.3 and 17.1 item 18):

- `window.PurgeProsQuote`, in the live tool's shape `{ open, close, config }`, with the store itself at `window.PurgeProsQuote.core`.
- Clicks on `[data-purge-quote]`, `a[href="#quote"]` and `a[href="#get-quote"]`, unless another handler already prevented the click. To open the builder from any button, give it `data-purge-quote`.
- Hero ZIP forms: `<form data-pp-zip-form>` with an input named `zip`. The ZIP goes to the builder instead of leaving the page.
- `?open_quote=1` (also `true`, `yes`), `#quote` and `#get-quote` on page load. The instruction is removed from the address so a refresh does not reopen; attribution parameters stay. `hooks.autoOpened` says whether it happened.
- `?zip=` is read once by `create()` itself and removed from the address (section 4).

It returns `{ open, close, autoOpened, apiInstalled, notInstalledReason, uninstall }`. `hooks.open(options, trigger)` and `hooks.close()` are the same functions the global calls; use them for your own buttons. `hooks.uninstall()` removes everything.

What open and close do in each situation:

| Situation | `open` | `close` |
|---|---|---|
| A request is being sent | Ignored: nothing changes and your `open` handler is not called. `busy` is called instead. | Ignored: returns `false`, your `close` handler is not called, `busy` is called instead. A pending request is never hidden or lost. |
| After a locked reply | Your `open` handler is called with `ok: false` and the locked message as `reason`. Nothing changes. | Your `close` handler is called. The lock stays; only a reload clears it. |
| On the `done` step | With a five-digit ZIP (a hero ZIP form): a new quote starts with that ZIP, as in the live tool. With no ZIP (a launcher): the done screen is brought back into view, unchanged. | Your `close` handler is called, then a new quote starts (`store.close()`), as in the live tool. |
| Any other time | `store.open(options)` is applied, then your `open` handler is called. | Your `close` handler is called. Every answer stays in memory. |

**With the live widget script on the same page.** Whichever script defines `window.PurgeProsQuote` first owns every launcher on the page.

- Rebuilt pages should not load the live widget script (`/purge-quote.js`) at all.
- If it is there anyway and these hooks run first, nothing breaks: the live script sees the global and does nothing, and the line the Worker adds after it (which writes its promotion settings into `window.PurgeProsQuote.config.promotion`) has somewhere to write. The engine does not read what is written there. The live script is loaded with `defer`, so a plain script that calls `installPageHooks` while the page is being parsed runs first.
- If the live widget defined the global first, these hooks stand down: `hooks.apiInstalled` is `false`, `hooks.notInstalledReason` says why, the console gets one warning, the global is left alone, launcher clicks and hero ZIP forms are left to the live widget, and nothing opens automatically. Every launcher then opens the OLD dialog. Check `hooks.apiInstalled` in a review build; if it is false, move your script earlier or remove the live script. `hooks.open()` and `hooks.close()` still work for buttons you wire yourself.
- A second `installPageHooks` call on one page stands down in the same way; share one store and install once.

**`PPQuoteCore.takeResumeToken()`** takes a `#resume=` token out of the address before any analytics tag can read it. Returns the token, `"invalid"`, or `""`. Call it first thing, before any tag loads, then `store.resume(token)` if it is not empty.

## 12. ZIP codes and cities

`PPQuoteCore.SERVICE_ZIPS` is the 53 accepted ZIPs, identical to the live widget and the Worker (a test compares all three).

`PPQuoteCore.cityForZip(zip)` returns `{ zip, community, city, alternates, page, poBox }` or `null`. `PPQuoteCore.COMMUNITIES` lists the 26 communities with their ZIPs and page paths.

**Where the table comes from, and how far to trust it.** Neither the live widget nor the Worker has a ZIP-to-city table, and no ZIP is printed on any live page. The table is `spec/cities.json` `lookups.zipToCommunity`, which gives its own sources as: USPS city names from general knowledge for the 17 cities with pages; `operations/DECISIONS.md` item 15 for the nine communities without pages; the vault coverage audit for the PO Box flags. It agrees with `assets/map/communities.json`. **The owner has not confirmed it.** The engine uses it only to pre-fill an editable City field and to name the community in the coverage answer. It never decides coverage.

Points where a community could not be established with full confidence:

- **46216 and 46236** are listed under Lawrence, but their USPS city name is Indianapolis. The engine pre-fills **Indianapolis** and offers Lawrence as an alternate. On the Lawrence page pass `pageCity: "Lawrence"` and it pre-fills Lawrence.
- **46280** is listed under Indianapolis and also reaches the south edge of Carmel. **46062** is listed under Noblesville and also receives mail for parts of Westfield. Both carry the other name in `alternates`.
- **46014, 46015 (Anderson) and 46061 (Noblesville)** are PO Box ZIPs according to the coverage audit (`poBox: true`). The Worker accepts them, so the engine does too. Do not offer them as one-tap choices.
- **46113 (Camby)** spans Marion and Morgan counties. No alternate name is given because none is established in the sources.
- Other overlaps may exist. The City field must stay editable.

**City pages.** Pass `pageZip` only where the city has ONE accepted ZIP (Westfield, Avon, Brownsburg, Danville, Fortville, Greenfield, Ingalls, McCordsville, New Palestine, Plainfield). For Indianapolis, Carmel, Fishers, Noblesville, Anderson, Greenwood and Lawrence, do not pass one: ask for the ZIP, offering the accepted ones as one-tap choices (`spec/CONTENT-CITIES.md` section 5). A page-supplied ZIP is not stored, so it does not follow the visitor to other pages; a ZIP the visitor chose does.

## 13. Live and staging modes, and the page's send switch

Demo is the default, and a review build never leaves it. Two other modes exist since engine 1.5.0. Neither has been run against a real address: the tests use a stand-in `fetch`, and the browser checks intercept every request.

### 13.1 The three modes

| Mode | Requests | Where it may run | Tags (Google, Meta) | Saved-quote link it accepts |
|---|---|---|---|---|
| `demo` | None. Replies are played back (section 10). | Anywhere except a real Purge Pros address, where `submit()` returns `blocked`. | None called. Every event is written to `store.trackLog`. | The production form (a stand-in link). |
| `staging` | Real ones, to the STAGING request address only: `POST <endpoint>` and, beside it, `/quote-resume` and `/quote-resume/open`. A production address is refused, by host. | An `https` page whose origin is in `allowedOrigins` (as `siteOptions()` builds it: the engine's `PPQuoteCore.LIVE_ALLOWED_ORIGINS` plus the page's own), or the staging Worker's own host. | **None called, whatever `firePixelEvents`, `googleAdsSendTo` or the page's tags say.** Every event is written to `store.trackLog` with `sent: false`, so a tester can read what a live page would have sent. | The production form, and `<savedLinkBase>#resume=<token>` when `savedLinkBase` is a plain `https` address on an origin the page may send from. |
| `live` | Real ones, to the production request address. A JSON POST without cookies, aborted after 15 seconds, every reply handled as in spec 4.5.2. | An `https` page whose origin is one of `PPQuoteCore.LIVE_ALLOWED_ORIGINS`, or the Worker's own host. Never `file://`, never `http`. | Called, and only from a page that may send (section 8, T11). | The production form only: `PPQuoteCore.SAVE_LINK_PATTERN`. |

In every mode a second press while a request is on its way returns `busy` and sends nothing, a retry of the same request reuses its id, and the payload is the same 47 keys. `store.sendingBlockedReason()` says why a page may not send (`""` when it may). `store.submissionLog` keeps the whole payload in demo mode only; in staging and live it keeps the request id.

**There is no test marker in the payload.** None of the 47 keys is meant for one, and none was added. A staging request is told apart by where it goes (a separate Worker with its own request ledger and its own webhook address) and by its `page` value, which is the staging page's address. The `notes` value is the live tool's fixed sentence and was left alone.

### 13.2 `PPQuoteCore.siteOptions(site, trusted)`

Turns the page's settings object into options for `create()`. It never throws, and it decides everything a page must not be able to decide for itself.

```js
const options = Object.assign(
  { presentation: "inline", frequencyLabels: { twice: "Twice a week", custom: "Custom quote" } },
  PPQuoteCore.siteOptions(window.PPSite, { liveEndpoints: ["https://<the production quote Worker>/submit"] })
);
const store = PPQuoteCore.shared(options);
```

- `trusted.liveEndpoints` comes from the interface's own code, never from the page: the production request addresses, the first being the default. The engine names no endpoint (a test holds it to that). In this release they are in `directions/coverstory/js/builder.js` (`LIVE_ENDPOINTS`).
- `site.mode` `"live"`: returns `{ mode: "live", endpoint }` where `endpoint` is `site.endpoint` if it is one of `trusted.liveEndpoints`, otherwise the first of them. `site.allowedOrigins` and `site.savedLinkBase` are ignored. With no trusted address it returns `{}` (demo).
- `site.mode` `"staging"`: returns `{ mode: "staging", endpoint: site.endpoint, allowedOrigins, productionEndpoints, savedLinkBase? }`. `allowedOrigins` is the engine's own list plus each `https` origin the page names (anything else is dropped).
- Any other `mode`, or no object: returns `{}`. The store is then a demo store, exactly as with no `PPSite` at all.
- `googleAdsSendTo` is passed on when it is `""` or has the form `AW-<digits>/<label>`; `firePixelEvents` when it is `false`.

### 13.3 The `window.PPSite` contract

One object, set by the site body code before any script of ours loads. Nothing in it is secret. A key that is not listed is not read by the engine or the builder.

| Key | Who sets it | Read by | Default when absent | Meaning |
|---|---|---|---|---|
| `mode` | Packaging (the profile: `live` for production, `staging` for the test pages) | `siteOptions()` | demo | `"live"`, `"staging"` or `"demo"`. Anything else is demo. |
| `endpoint` | Packaging | `siteOptions()` | live: the builder's first production address. staging: none, and the page then cannot send | staging: the staging Worker's request address, `https://…/submit`. A production host is refused. live: optional; honoured only if it is one of the builder's production addresses (`https://purge-lead-relay.purgepros.workers.dev/submit`, the one the live site uses today, or `https://quote.itspurgepros.com/submit`, the same Worker on its custom domain). demo: ignored. |
| `allowedOrigins` | Packaging, staging profile only | `siteOptions()` | `[]` | staging: the `https` origins the test pages are served from, added to the engine's own list. The staging Worker's `ALLOWED_ORIGINS` must name the same origins. live and demo: ignored. |
| `savedLinkBase` | Packaging, staging profile only, and only if the staging Worker's `SAVED_LINK_BASE` is set to the same address | `siteOptions()` | none | staging: the staging quote page's own address, for example `https://<staging pages>/quote`. A link `<that address>#resume=<token>` is then accepted. Its origin must be one the page may send from. With it unset, a staging Worker answers a link on the live quote host, which staging also accepts; to open it, copy `#resume=<token>` onto the staging page's address. live and demo: ignored. |
| `googleAdsSendTo` | Packaging, optional | `siteOptions()` | the engine's `PPQuoteCore.LIVE_GOOGLE_ADS_SEND_TO`, `AW-17767139897/g9smCM7pkL4cELmUhJhC` (the live "Quote Booked" send-to, as in the October 5 Worker) | The Google Ads conversion label. `""` switches the conversion off. A value of any other shape is ignored. In staging it only shows in the log. |
| `firePixelEvents` | Packaging, optional | `siteOptions()` | `true` | `false` stops every Meta pixel event of the builder. In staging no pixel event is called either way. |
| `assets` | Packaging (also given to each script as `data-assets`) | `builder.js`, only when its own script tag has no `data-assets` | `"../../assets/"` | The folder of the builder's pictures, ending in `/`. |
| `reviewsEndpoint` | Packaging (production: `https://purge-lead-relay.purgepros.workers.dev/reviews`; staging: the staging Worker's `/reviews`) | `js/site.js` only; nothing in the engine or the builder | none: the pages keep the figures they were built with | The quote Worker's `/reviews` address. Read only when `mode` is `live` or `staging` and the value is `https://<host>/reviews`; asked once per page load. A good answer replaces every rating figure; any failure leaves the built-in figures as they are. `siteOptions()` ignores the key. |
| `env`, `assetsBase`, `build` | Packaging | Nobody (labels for a person reading the page source) | | Not read by the engine, the builder or `js/site.js`. |

The store's side of it, for a test page: `store.mode`, `store.isStaging`, `store.endpoint`, `store.sendingBlockedReason()`, `store.networkLog` (every request made), `store.trackLog` (every event, with `sent`).

**A page without the builder** (the welcome page) gets its store from `js/site.js`, which since October 9 creates it with `PPQuoteCore.shared(PPQuoteCore.siteOptions(window.PPSite, { liveEndpoints: CONTACT_LIVE_ENDPOINTS }))`, the same switch the builder uses, so its Text, Call and Email presses are counted on the live site. `CONTACT_LIVE_ENDPOINTS` in `js/site.js` and `LIVE_ENDPOINTS` in `js/builder.js` are the same two addresses and must stay the same; `_work/ghl/check-fragments.mjs` fails if they ever differ from each other or from the production profile.

**What the packaging writes** (the site body code of each profile, `_work/ghl/build-fragments.mjs`): production `{ env, mode: "live", endpoint, reviewsEndpoint, allowedOrigins: [], googleAdsSendTo, firePixelEvents: true, assetsBase, assets, build }`; staging `{ env, mode: "staging", endpoint, reviewsEndpoint, allowedOrigins, firePixelEvents: false, assetsBase, assets, build }`, plus `savedLinkBase` only when the settings file gives one. `googleAdsSendTo` is written in the production profile only.

## 14. Storage and privacy

- `sessionStorage` key `pp_quote_progress_v3`: exactly `zip`, `dogCount`, `frequency`, `areas`, `yardSize`, `lastCleaned`, `customerStatus`. The same key and shape as the live widget, so progress carries between old and new pages in a tab.
- `sessionStorage` key `pp_quote_attribution_v3`: the nine URL parameters, each cut to 250 characters. Since engine 1.5.1 a value that looks like an email address or a phone number is dropped first (an `@` with a dot after it; or, with spaces and `( ) - . + _ /` removed, a whole value of 7 to 15 digits): it is not stored here, not kept for 30 days and not sent, and it does not replace a good value already held for that tag. A value of that kind left in storage by an older engine is not used and is cleaned out on the next page load.
- `localStorage` key `pp_quote_attribution_kept_v1` (T23, added 2026-10-09): `{ capturedAt, values }`. `values` is the last non-empty set of the same nine parameters, cleaned and cut exactly as the session copy; `capturedAt` is the moment it was captured, in milliseconds. It is kept for 30 days (`PPQuoteCore.ATTRIBUTION_KEEP_DAYS`), so a visitor who clicked an ad and comes back on another day still arrives with a source. The rules:
  - It is written only when a page load itself arrives with at least one non-empty parameter. A visit with none never overwrites it.
  - A newer click replaces the whole set: what is written is the session's set, exactly what a request of that session would carry. The same set seen again keeps its first capture moment, so reloading the landing page does not extend the 30 days.
  - The session copy always wins. The kept set is used only when the session has no parameter of its own, and it is never copied into the session, so it cannot mix with a later click.
  - Once it is 30 days old it is removed. So is a copy that cannot be read, holds none of the nine keys, or is dated more than a day ahead of the clock.
  - A request carries it under the same keys as before (`attribution`, `gclid`, `fbclid`). There is no new payload field. When the pixel's `_fbc` cookie is missing, the fallback `fbc` built from a kept `fbclid` is dated at its capture moment, not at the moment of the request, so an old click is never presented as a new one.
  - `store.attributionSource()` says which copy is in use.
  - Its limits: a browser keeps storage per site address, so a set captured on `itspurgepros.com` is not visible on `quote.itspurgepros.com` or on `www.itspurgepros.com` (section 17, point 11). Safari clears a site's script-written storage after about seven days without a visit to that site, so on iPhones the 30 days is an upper limit. A private window keeps nothing. Where `localStorage` is missing or blocked nothing is kept and nothing else changes.
- Nothing else. No name, phone, email, address, city, question, consent, terms acceptance, start timing or request id is ever stored. No cookie is written; `_fbp` and `_fbc` are read at submit time. `localStorage` holds that one key and nothing else.
- Progress is read once per page load, and cleared after a successful submit, on `reset()`, when the builder is closed from the done step, and when a saved link starts opening.
- Attribution is captured when the store is created. Load the engine and create the store on every page, including pages with no builder on show, so the parameters a visitor arrived with are still there when they request service on a later page.
- A `?zip=` is removed from the address once read, so the `page` sent with a request does not carry it. Attribution parameters stay in the address.

## 15. Other exports

| Export | What it is |
|---|---|
| `PPQuoteCore.calculateQuote({ dogs, frequencyId, yardSizeId, areaIds })` | The one price calculation, without a store. Returns `{ ok, custom, reasons, priceCents, baseCents, yardAddCents, areaAddCents, lineItems }` or `{ ok: false, errors }`. Use it for price tables. |
| `PPQuoteCore.frequencyEligibility(frequencyId, dogCount, yardSizeId)` | `{ allowed, code, reason }` |
| `PPQuoteCore.reconcileFrequency(previous, current)` | The reconciliation rule as a pure function: `{ frequency, notice }` |
| `PPQuoteCore.formatMoney(cents)` | `"$28.99"`, `"$1,234.56"` |
| `PPQuoteCore.formatDollars(cents)` | `"28.99"` |
| `PPQuoteCore.normalizeZip(value)`, `normalizePhone(value)`, `formatPhone(value)`, `isValidEmail(value)`, `dogsLabel(dogCount)` | Small helpers. `normalizePhone` returns `{ digits, e164 }` or `null`: ten digits (or eleven starting with 1) whose area code and exchange each start with 2 to 9. Since 1.5.0 a number such as `(131) 755-5010` is `null` (no US number has that shape; the Worker itself would take it). Since 1.5.2 a value that starts with `+` and any digit but 1 is `null`, and `formatPhone` keeps it as `+` and its digits instead of cutting it to ten. |
| `PPQuoteCore.submissionFingerprint(payload)` | What makes two attempts "the same request". |
| `VERSIONS`, `BRAND`, `STORAGE_KEYS`, `PERSISTED_PLAN_KEYS`, `ATTRIBUTION_KEYS`, `ATTRIBUTION_KEEP_DAYS` | Versions (`schemaVersion`, `pricingVersion`, `consentVersion`, `termsVersion`, `uiVersion`, `liveUiVersion`), brand details and storage names (`STORAGE_KEYS` is `{ progress, attribution, attributionKept }`). `ATTRIBUTION_KEEP_DAYS` is 30 (section 14). |
| `STEPS`, `PLAN_STEPS`, `DOG_OPTIONS`, `YARD_SIZES`, `AREAS`, `AREA_ADDERS_CENTS`, `FREQUENCIES`, `ONE_TIME`, `FROM_LINE`, `RECURRING_PRICE_NOTE` | Option lists and price tables. |
| `LAST_CLEANED_OPTIONS`, `START_TIMING_OPTIONS`, `CUSTOMER_STATUS_OPTIONS`, `CONTACT_METHODS`, `INTENTS`, `STAGES`, `CUSTOM_REASON_LABELS` | The exact option strings and ids. |
| `CONSENT`, `TERMS`, `PROMISES`, `OUT_OF_AREA_COPY`, `MESSAGES`, `SUBMIT_MESSAGES`, `SAVE_LINK_MESSAGES`, `RESUME_MESSAGES`, `wording` | Exact wording and messages (key by key below). |
| `SERVICE_ZIPS`, `COMMUNITIES`, `ZIP_TO_COMMUNITY`, `checkZip`, `cityForZip` | Service area. |
| `FIELD_STEP`, `FIELD_MAX_LENGTH`, `SERVER_FIELD_MAP`, `mapServerFields`, `FINGERPRINT_FIELDS`, `SAVE_LINK_KEYS`, `SAVE_LINK_PATTERN`, `LIVE_ALLOWED_ORIGINS`, `LIVE_GOOGLE_ADS_SEND_TO`, `SUBMIT_TIMEOUT_MS`, `SAVE_LINK_TIMEOUT_MS` | Contract details. `FIELD_STEP` gives each field's home step; the request form's own ZIP field is the one exception (section 6.4). |
| `EVENTS`, `PIXEL_MILESTONES`, `LEGACY_STEP_NUMBER` | Tracking names. `EVENTS` is `{ engine, ui, uiParams, trackUi, trackUiParams, trackUiValues, pixelCounts, pixelStandard, measurementParams }`. `engine` is every Google name the engine sends; `ui` and `uiParams` belong to `store.track()`; `trackUi`, `trackUiParams` and `trackUiValues` are the names, parameters and fixed values of `store.trackUi()` (section 6.6); `pixelCounts` names the pixel count events (`QuoteSent`, `QuoteLinkSaved`); `pixelStandard` is the one standard pixel event besides `Lead` (`Contact`); `measurementParams` lists the only parameters each measurement event may carry (section 8). |
| `DEMO_SUBMIT_OUTCOMES`, `DEMO_SAVE_OUTCOMES`, `DEMO_RESUME_OUTCOMES` | Demo switch values. |
| `create`, `shared`, `siteOptions`, `installPageHooks`, `takeResumeToken`, `engineVersion` | Entry points. `siteOptions(site, trusted)` is section 13. |
| `testing` | Pure functions behind the store, for the tests. Not for page code. |

Every exported constant is frozen.

### Wording constants, key by key

Render these; never retype them. `{zip}`, `{requestId}`, `{privacy}` and `{terms}` are placeholders the engine fills in (the last two through `PPQuoteCore.wording`).

| Constant | Keys | Where it goes |
|---|---|---|
| `BRAND` | `name`, `phoneDisplay` ("(317) 961-5865"), `phoneHref` (the `tel:` link), `privacyUrl`, `termsUrl`, `reviewsUrl` | Phone links, policy links, the reviews link. |
| `OUT_OF_AREA_COPY` | `kicker` ("Outside our service area"), `heading` ("We do not service ZIP {zip} yet.": use `checkZip().message`, which has the ZIP filled in), `help` (the correction hint above the ZIP field), `edgeLead` ("Near the edge of our routes?"), `edgeBody` (the call line; its last sentence is the no-contact promise and must stay) | The out-of-area answer on the ZIP step. |
| `PROMISES` | `outOfAreaNoContact`, `nothingCharged`, `requestNotBooking` | Not free to reword (spec 18.3). The first on the out-of-area answer; the other two before submit and on the done screen. |
| `CONSENT` | `version`, `lead`, `body`, `alternativeWithCall`, `alternativeWithoutCall`, `privacyLinkText`, `termsLinkText`, `phoneHintService`, `phoneHintOther`, `errorWithCall`, `errorWithoutCall` | The text-consent box. Render `lead` and `body`; get the alternative line with its links from `wording.consentAlternativeParts()`. The hints and errors already arrive through `fieldRules()` and validation. |
| `TERMS` | `version`, `recurring`, `oneTime`, `termsLinkText`, `privacyLinkText`, `otherIntents`, `error` | The terms box. Use `wording.termsParts(isOneTime)` and `wording.otherIntentsParts()`, which return `[{ text }, { text, href }, ...]`. |
| `MESSAGES` | `customerStatus`, `firstName`, `lastName`, `preferredContact`, `callNotOffered`, `phone`, `email`, `address`, `city`, `startTiming`, `lastCleaned`, `question`, `intent`, `customNeedsServiceRequest`, `stale` | Field messages. They already arrive in validation errors; you rarely read them directly. |
| `SUBMIT_MESSAGES` | `sending` (show and announce while `state.submitting`), `uncertain`, `conflict`, `lockedFallback`, `unavailable`, `invalid`, `timeout`, `network`, `rejected`, `blockedLive`, `blockedDemo` | All but `sending` already arrive as `sent.message`. |
| `SAVE_LINK_MESSAGES` | `idle` (the line under the save-link button before it is pressed), `working` (while the link is being made), `created`, `copied` (after your clipboard copy succeeds), `copyManually` (when the clipboard is unavailable: show the link for the visitor to copy), `timeout`, `rateLimited`, `unavailable`, `rejected`, `badLink`, `fallback`, `notReady`, `blocked` | The save-link card. `createSaveLink()` returns the right one as `message` for every outcome; `idle`, `working`, `copied` and `copyManually` are yours to show. |
| `RESUME_MESSAGES` | `loadingTitle` and `loadingDetail` (show both while `state.resumeLoading`), `ready`, `pricingChanged`, `invalidToken`, `expired`, `planUnavailable`, `localCheckFailed`, `priceMismatch`, `timeout`, `fallback` | Opening a saved plan. Every outcome arrives as `state.resumeNotice`. |

## 16. Tests

```
node --test "production/site/shared/tests/"
```

The live widget and Worker the tests compare with are read from `shared/tests/fixtures/live-2026-10-05/` (byte-for-byte copies of commit `aa9f81d`, the October 5 release that is live; see the README there). No environment variable is needed. `PP_PRODUCTION_SRC=<folder holding widget.js and worker.template.mjs>` compares with another source; the checkers in `shared/verify/` follow the same rule through `shared/verify/pinned-live-source.mjs`. The engine against the Worker CANDIDATE is checked separately by `shared/verify/candidate-check.mjs`.

Node 20 or later, built-ins only, all offline. On Node 21 and later a directory given to `--test` runs `tests/index.js`, which loads every `*.test.mjs`.

| File | What it proves |
|---|---|
| `pricing-differential.test.mjs` | The engine's price and allowed/not-allowed agree with the Worker's own `calculateQuote` (cut from the live source, not rewritten) for all 1,750 combinations of dogs, yard size, areas and frequency, and with the live widget's. |
| `contract.test.mjs` | Engine-built payloads for every intent, reply method and plan type are accepted by the Worker's real `validateV3`; 35 single-field breakages are rejected by the Worker and were caught by the engine first; 60,000 random states never produce a payload the Worker rejects. |
| `strings-and-tables.test.mjs` | Every exact string, id, table and version matches `widget.js` and `worker.template.mjs`; the ZIP table matches `spec/cities.json`. The four offer notes and the customer-status hint are the exception since 2026-10-08: they must be in `POLICY-WORDING.md` word for word, with the same dollar amounts, minutes and charging moment as the live widget's sentences. |
| `reconciliation.test.mjs` | Every frequency change the engine makes carries a notice; Custom booking is released when its reason goes. |
| `zip.test.mjs`, `flow.test.mjs`, `request-form.test.mjs` | Coverage, the out-of-area stop, the city pre-fill, the step order, Back, skipping, editing, the pinned bar, consent and terms rules. The offer notes sentence by sentence; restart and one-time numbers unchanged; no note and no hint says offer, promotion, waived or surcharge; the new-recurring note states 120 minutes and no other allowance. |
| `persistence.test.mjs` | The stored JSON holds only the permitted keys at every point of a complete request. |
| `tracking.test.mjs` | Once-only rules, no ZIP in pixel events, conversion events only for a successful service request. The three measurement events T13 to T15: each fires once, with the right name and only its allow-listed parameters, with nothing personal, with no tag called from a page that may not send, and with `Lead`, `generate_lead` and `conversion` untouched by a quote sent to the visitor. |
| `funnel-events.test.mjs` | T16 to T22. The fixed lists themselves; `method` on `QuoteSent` and `quote_requested` only; each funnel event's once-only rule, name and parameters; `form_validation_failed` carrying field keys and never what was typed; `store.trackUi()` refusing every other name, moment and value; `contact_click` with the pixel's `Contact` once per page load and no parameter; no tag called from a page that may not send; demo mode writing each to the log; `Lead`, `generate_lead` and `conversion` identical to a visit that reported nothing; the payload's keys and versions unchanged and accepted by the Worker's `validateV3`; and 60 random walks of anything a page could pass. |
| `attribution-kept.test.mjs` | T23, with a stand-in for `localStorage` and a clock moved by hand: what is written (two things), a return visit carrying the source under the same payload keys, an empty visit never overwriting, a newer click replacing the whole set, the session copy winning and never being mixed, the first capture moment standing, use up to the last millisecond of day 30 and removal after it, unreadable or future-dated copies removed, the fallback `fbc` dated at the capture moment, storage that is missing or throws, and nothing personal ever kept. |
| `attribution-privacy.test.mjs` | Engine 1.5.1. An email address or a phone number in any of the nine tags is dropped: not in the session copy, not in the 30-day copy, not in the payload; a link whose only tag is personal leaves nothing and does not count as an arrival; a personal value never replaces a good one; one left in storage by an older engine is not used. Every form of tag the playbook uses (names with long ids in them, keywords with a ZIP) is kept exactly. The whole-payload console print on Send happens in demo only: live and staging print none of the tester's details, and demo on the live address refuses before printing. |
| `submit.test.mjs`, `save-resume.test.mjs` | Request-id reuse, every demo failure state, live-mode guards and replies, the six-key save body. |
| `send-switch.test.mjs` | Engine 1.5.0. `siteOptions()` for every kind of `PPSite`; live refused on a made-up origin, on `http` and from a file; live on each real origin posting once, to the production address, exactly the 47 keys, with the conversion once; staging posting only to the staging address, only from an allowed origin, with no tag called and the events in the log; a production address refused in staging however it is written; demo sending nothing; a double press sending once in every mode; a saved link made and opened in staging (the staging page's own link form) and in live (the production form only). |
| `phone-formats.test.mjs` | Audit finding B1. The eleven formats of `shots/xbrowser/phone-formats.mjs`, arriving whole and typed a character at a time, each kept as `(317) 555-0100` and sent as `3175550100`; no `maxLength` on the phone rule; what the old cut produced is refused; 20,000 random ten-digit numbers accepted exactly when area code and exchange start with 2 to 9, and never one the Worker refuses. |
| `random-walk.test.mjs` | About 500 random walks through answers, navigation, edits, saving, resuming and submitting, with every rule re-checked after each action. Every request that got through was accepted by the Worker's `validateV3`. |
| `browser-and-hooks.test.mjs`, `example-wiring.test.mjs` | The file as a script tag, the page hooks, the example in section 3 walked end to end, and this guide naming only things that exist. |
| `verifier-findings.test.mjs` | One group for each defect the independent verifiers reproduced on 2026-10-07: the terms box (a tick with an intent change or an edit in one call), a `?zip=` left in the address, subscribers told of every change exactly once (a subscriber that copies only `info.changed` stays correct over 300 random walks), `track()` parameters, the live widget on the same page, opening and closing around a request, the request form's ZIP field, the one-field answer for the primary button, and `funnel_viewed` for carried-over progress. |

The independent checks in `shared/verify/` are separate from this suite and are run the same way, one file at a time.

A mutation check (the engine broken in 50 different single places, in a scratch copy) had every breakage caught by the suite as it stood before the 2026-10-07 fixes. It has not been repeated for the whole engine since. On 2026-10-09 the 1.4.0 additions alone were broken in 62 single places, in memory only, and that check can be run again (`verify/tracking-mutation-sanity.mjs`, a minute or two): the suite caught 60. The two it did not catch are second guards that no call can reach with a bad value (the once-only mark behind `QuoteSent`, and the value filter that `store.trackUi()` has already applied); the filter is tested directly instead.

Not tested, because it cannot be from here: the live Worker's environment, the GHL workflow that receives a request, and receipt of events in Google or Meta.

## 17. Open points for the owner

1. **Tracking** (section 8): **decided 2026-10-09.** The twelve differences from the live tool and the three measurement events T13 to T15 are approved, and T16 to T23 were added under the owner's go-ahead of the same day (points 11 and 12 below). All are listed under "Tracking changes approved by the owner on October 9, 2026". Still open, and not engine work: nothing is deployed; receipt of any event by Google or Meta is untested; and showing a sent quote in Google Ads as a secondary conversion needs a second conversion label or a Google Analytics property (`ADS-READINESS.md`, decision 1). Today `quote_requested` goes to Google as a plain event.
2. **ZIP-to-city table** (section 12): confirm the grouping, and which city name to pre-fill for the two Lawrence ZIPs.
3. **City pages with more than one accepted ZIP**: ask for the ZIP (recommended) or skip the question with a main ZIP.
4. **Saved links open on `quote.itspurgepros.com`**, which serves the current widget. Pointing them at the new builder is a Worker deployment decision (spec section 14 item 2).
5. **"Text me this quote"** needs first name, mobile, the consent box and the last-cleanup answer unless the Worker changes (spec section 14 item 3).
6. **"No start-up fee" wording and the first-cleanup time allowance: decided 2026-10-08.** The allowance is 120 minutes and the wording was delegated; the engine now returns it (section 6.3, single source `POLICY-WORDING.md`). Three things are still open:
   - **One figure is an assumption awaiting his confirmation:** time agreed beyond the 120 minutes is stated as $1 per minute, the standing extra-time rate used for restart and one-time cleanups. If he sets a different rate, paragraph 2 of the `new_recurring` note and its tests change together.
   - **Prerequisites for going live.** The review build can say all of this; the live systems still describe the earlier rule. As one approved change set, before any page using this engine is published: (a) the quote Worker `purge-lead-relay`, which forwards `standardCleanupIncludedMinutes: 30`, the offer and cleanup-policy versions and a policy sentence to the team, must describe the 120-minute rule with new `offerVersion` and `cleanupPolicyVersion` values; (b) every GoHighLevel workflow message, pipeline note and Voice AI script that reads out the old rule; (c) the Terms & Conditions page and a new `termsVersion`, since acceptance is recorded against a version (the engine still sends the current `termsVersion` and the current terms wording, untouched); (d) Housecall Pro practice for flagging a first visit likely to pass 120 minutes and who contacts the customer first; (e) the repository's regression baseline, which freezes the current widget's wording. None of these has been done, and each needs his approval for that specific change.
   - **Saved-quote notices (fixed October 9):** `RESUME_MESSAGES.ready` and `RESUME_MESSAGES.pricingChanged` now say "price and first-cleanup terms"; the word "offer" is gone from everything a visitor reads.
7. **"Ask a question" for a custom estimate.** The Worker would accept it; the live tool does not offer it, so the engine does not either.
8. **Frequency names on screen** ("Custom booking" or "Custom quote", "Twice weekly" or "Twice a week"). Set with `frequencyLabels`.
9. **Going live** needs separate approval: the repository's regression test freezes parts of the current widget (spec section 14 item 9), and any new host must be on the Worker's allowed-origins list.
10. **The live widget script on rebuilt pages** (section 11): rebuilt pages should not load it. If the site-wide snippet keeps loading it, the new builder's hooks must run first.
11. **Attribution kept for 30 days (T23): built 2026-10-09, after reading the Privacy Policy. Nothing in the policy is contradicted.** The built page was read first (`directions/coverstory/_work/pages/privacy-policy.html`, clause 08, "Cookies, Analytics & Advertising Measurement"). It says the website may use cookies, pixels and local storage to understand traffic and measure advertising; clause 02 lists the referring source and advertising identifiers among what is collected; clause 04 gives attributing requests and conversions as a purpose; clause 10 keeps information "as long as reasonably necessary"; and no sentence gives a storage period or says the source is forgotten when the browser closes. Its "Quote-progress storage" sentence is about plan selections and promises only that contact details are not kept there, which is still true: the kept copy holds the nine URL parameters and a date, never a plan answer or a contact detail. So it was built (section 14). For the owner:
   - **No wording change is needed.** If the lawyer prefers to name it outright, one sentence under clause 08 would do it: "The website may also remember, in your browser for up to 30 days, the campaign tags and ad click identifiers of the link that brought you here, so that a later request can be matched to that visit." Optional.
   - **A rollout decision.** A browser keeps storage per site address. An ad lands on `itspurgepros.com`; a saved or texted quote link opens `quote.itspurgepros.com`. The kept source follows the visitor there only if `quote.itspurgepros.com` forwards to the builder on `itspurgepros.com` (a redirect keeps the `#resume=` part of the link). If it serves the builder itself, a visitor returning by a saved link still arrives with no source, exactly as today. The same holds between `www.itspurgepros.com` and `itspurgepros.com`: one should forward to the other. This is the same decision as point 4, and it is a Worker and domain change that needs his approval.
   - **Links the business sends should carry no campaign tags.** The engine keeps one set, the latest. A follow-up text or email whose link carries its own `utm_` tags would arrive as a newer tagged visit and replace the ad's set, click id included, as the source of the request. A saved-quote link has no tags, so it does not. Worth one line in the brief for the follow-up messages (`ADS-READINESS.md`, decision 6).
   - **Its limits.** It is per browser and per device. Safari clears script-written storage after about seven days without a visit, so on iPhones 30 days is an upper limit. It has been tried in headless Chrome on the example page (kept on arrival, used by a new session with a plain address, gone after 30 days), not on the live site, and GoHighLevel's own first-touch and last-touch fields are separate from it.
12. **The measurement added under the go-ahead (T16 to T22): built 2026-10-09, not yet read by the owner row by row.** They follow his eight decisions and change nothing a visitor sees. What is still open, none of it engine work:
   - **The six reported moments need the interface.** `request_step_viewed`, `request_step_completed`, `builder_opened`, `contact_click` and the interface's own `form_validation_failed` fire only once the page calls `store.trackUi()` (section 9, item 30). Until then the engine still sends `areas_selected`, `frequency_selected` and the refusals it makes itself.
   - **Almost all of it goes to Google, where nothing stores it yet.** The site has no Google Analytics property (`ADS-READINESS.md`, section 1), so until one exists these events are sent and kept nowhere. Creating one is an account decision, and in it each parameter a report should split by (`entry`, `plan`, `step`, `request_step`, `choice`, `form_step`, `fields`, `checked_by`, `areas_count`, `placement`, `method`) has to be registered as a custom dimension first.
   - **`Contact` is a standard Meta event.** It will show in Events Manager beside `Lead`. It is not a conversion: no campaign should optimise for it, or decision 1 is undone by a setting.
   - **The name `QuoteSent`.** Any Meta audience, custom conversion or checklist written for `QuoteTexted` must use the new name. `ADS-READINESS.md` (decision 1) still shows the suggested old name. Nothing was ever sent under it.
   - **The pre-spend checklist** (`ADS-READINESS.md`, decision 8, item 1) speaks of seven browser events reaching Meta. The pixel can now send ten names (section 8).

## Earlier change notes

Moved here from the top of the guide on October 9, 2026 to keep the opening short. Newer notes are at the top.

- **Changed 2026-10-09, engine 1.3.0: the owner's tracking decisions.** The twelve tracking differences from the live tool (T1 to T12) are approved, and three measurement events are added and approved (T13 to T15, section 8): the pixel custom event for an accepted quote delivery (`QuoteSent` since 1.4.0; it was named `QuoteTexted` in 1.3.0), `quote_link_saved` with the pixel custom event `QuoteLinkSaved` for a created save link, and `price_choice_selected { choice }` for the way forward chosen on the price step. The engine fires all three itself, so an interface changes nothing. A completed service request stays the only conversion: `Lead`, `generate_lead` and `conversion` are unchanged in name, timing, parameters and once-only behaviour, and any value sent is still the per-visit price. No payload field, price, option id or wording changed. Approved is not live: nothing is deployed, and no event has been received by Google or Meta.
- **Changed 2026-10-08, engine 1.2.0: the first-cleanup rule is decided, and its wording now comes from the engine.** `store.offerNote()` (all four kinds) and the hint under "Have you used Purge Pros before?" return the owner's wording from `POLICY-WORDING.md` (release root, the single source). The "No start-up fee" note has three real paragraphs, `draftWording: false` and `facts.firstCleanupMinutesAllowance: 120`. Restart and one-time numbers and timings are unchanged. Nothing that is sent changed: payload fields, version constants, option ids and strings, consent and terms wording are as they were. Details in section 6.3; what must change elsewhere before this wording goes live is in section 17.
