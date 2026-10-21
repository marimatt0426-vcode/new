# Add a page to the Cover Story site

> Next build, owner decision of October 12, 2026: 46290 is accepted, with Indianapolis as mailing city and Carmel as alternate, exactly like 46280. The current total is 54 accepted ZIPs (51 printed after excluding the same three PO Box ZIPs). Indianapolis lists 19; the Marion directory group lists 21; Carmel displays four choices: 46032, 46033, 46280, 46290. Its hero uses `"alsoZips": ["46280", "46290"]`. Earlier dated counts, screenshots and approval questions below are historical and superseded by this decision. Prepared source only; rollout and browser verification are separate.

One source file per page. The builder supplies everything shared: head, header, hero, price-builder mount, facts strip, footer, structured data. `DESIGN.md` holds the design rules; this file is the mechanics. Run every command from `directions/coverstory`.

**You write:** `_work/pages/<slug>.html`, and if your family needs a new component, `css/family-<name>.css` and `_work/pages/kit-<name>.html`.
**You never edit:** a built page (`<slug>.html`), `css/site.css`, `css/builder.css`, `js/`, `_work/partials/`, `kit.html`, or another family's files. If a shared piece has a defect, report it; do not patch it for your page.

## 1. Steps

1. Copy the nearest example from `_work/examples/` (`city`, `plain-scene`, `plain-pose`, `plain-cover`, `legal`, `kit-family`) to `_work/pages/<slug>.html`. (The `city` example shows the hero and the mechanics only; the sections of a city page are in `CITY-PAGES.md`.) For a service page copy `_work/pages/dog-waste-removal.html`. The slug must be one of the thirty: `node _work/build-site.mjs --list`.
2. Fill in the JSON block, then write the page's own sections under it from kit components (section 6).
3. `node _work/build-site.mjs <slug>` writes `<slug>.html`. A mistake stops the build with a sentence naming the page and the field.
4. `node _work/check-site.mjs <slug>` and `node _work/check-layout.mjs <slug>` must both pass. Then look at the page (section 8).

## 2. The source file

A JSON block inside one HTML comment at the very top, then plain HTML sections. No `<h1>`, `<script>`, `<style>`, header or footer in a source.

```html
<!--
{
  "title": "Dog Waste Removal in Westfield, IN | Purge Pros",
  "description": "One or two sentences that belong to this page only, about 150 characters.",
  "hero": {
    "recipe": "city",
    "city": "Westfield",
    "zip": "46074",
    "alt": "What the hero picture shows, in one sentence.",
    "kw": "Dog waste removal in Westfield, Indiana",
    "title": ["Westfield yards.", "Handled."],
    "wrap": "first",
    "lead": "One or two plain sentences under the headline."
  },
  "facts": {
    "label": "Purge Pros in Westfield at a glance",
    "items": ["google", "proof", "pay", { "icon": "pp-local-area", "value": "A short fact", "label": "One line about it" }]
  },
  "schema": { "breadcrumb": [{ "name": "Service Areas", "page": "additional" }, "Westfield"] },
  "guideCards": { "prepare-first-pooper-scooper-visit": { "more": "Prepare for a visit" } },
  "allow": ["Do you offer one-time cleanups?"]
}
-->

<!-- 1. WHERE WE SCOOP -->
<section class="sec" data-edge="arc-r" id="area" aria-labelledby="area-title">
  <div class="wrap stack">
    <div class="sh sh--center">
      <span class="sh__emblem"><img class="stk" src="../../assets/brand-icons/pp-local-area.webp" width="62" height="62" loading="lazy" alt=""></span>
      <p class="kicker">Short kicker</p>
      <h2 class="sh__title" id="area-title">The search phrase with one <span class="swash">word</span> marked</h2>
    </div>
    {{GUIDE_CARDS:dog-poop-removal-cost-indianapolis,prepare-first-pooper-scooper-visit,gate-access-dog-waste-removal}}
  </div>
</section>
```

| Field | Needed | What it is |
|---|---|---|
| `title`, `description` | yes | The `<title>` and meta description. Each must be unique across the site |
| `hero` | yes | The recipe and its fields (section 3) |
| `facts` | yes | The four facts under the hero (section 4) |
| `schema` | inner pages | `breadcrumb`: this page's short name last, parents before it as `{ "name", "page" }` (a page with a parent also shows the linked trail under its facts: an article under the Yard Guide, a city under Service Areas). One WebPage and one BreadcrumbList per page: a page node or a trail you put in `extra` is merged into the builder's, never added beside it, so give the trail here, the page's short name in `name` and its date in `dateModified`. `service`: `{ "name", "serviceType", "areaServed" }` on a service page. `extra`: more schema.org nodes. Optional: `type` (`"CollectionPage"`, `"AboutPage"`, `"ContactPage"`; left out it is `WebPage`; a collection page points at the `ItemList` in `extra` by itself), `name` (the page's short name in the data; left out it is the title), `dateModified` (`"2026-10-08"`). Never a rating, a review or a street address |
| `canonical` | no | Left out, it is `https://itspurgepros.com/<slug>`. A `noindex` page gets none |
| `robots` | no | `"noindex"` (the welcome page must have it) |
| `audience` | no | `"customer"` on a page for people who are already customers (the welcome page). See section 3a |
| `ogImage` | no | The full `https://` address of a picture a shared link shows INSTEAD of the page's own link preview (an article's published cover). Leave it out on every other page: each of the thirty has its own 1200 by 630 link preview, cut from its hero, and the builder names it as `og:image` once the site's ONE setting, `"assetsBase"` in `_work/partials/site.json`, gives the public address of the assets. Until then no page names a picture (section 10) |
| `body` | no | `data-` attributes for `<body>`, for example `{ "data-no-price-bar": true }` on the welcome page |
| `css`, `scripts` | no | Your family's own files only: `["css/family-city.css"]`, `["js/family-city.js"]` (section 5) |
| `guideCards` | no | Rewords a Yard Guide card on this page: `ribbon`, `more` (link label), `text`, `alt`, `title` |
| `allow` | no | Exact phrases the wording and price checks should pass over, when "offer", "promotion", a number of minutes or a dollar amount is on the page for a reason that has nothing to do with the first cleanup or a service price |

**Done for you:** WebPage, BreadcrumbList and Organization data; FAQPage data written from the visible accordion (just write `details.faq__item` blocks; an answer may hold paragraphs or a list); Open Graph and Twitter tags from the title, the description and the canonical, and the page's link-preview picture once the site's `assetsBase` is set (section 10); the WebP copies, `srcset`, `sizes` and the head's preload for the hero and for a scene in an arc frame, the small logo, and every script deferred (section 10); the Google rating, wherever a badge or the Google fact shows it (section 4a); width and height of hero and cover pictures; `data-mascot="gloved"` on `<body>` when the hero shows the gloved mascot; the seal's link to the fee section; on a page with no builder in it, every `href="#quote"` becomes `quote.html` (with scripts the panel still opens in place); "one-time" and "start-up" kept on one line in every heading and FAQ question (`span.nb`; write it yourself anywhere else a hyphenated word breaks at its hyphen); the breadcrumb trail under the facts of a page that has a parent; the line breaks, the size and the spark of a city headline.

## 3. Hero recipes

Every recipe takes `alt`, `kw` (the keyword line), `title` (one or two lines; line two is cyan), `lead`, and optional `wrap` (`"first"`, `"second"`, `"both"`, `"none"`: which title lines may wrap). The `h1` is the headline word for word; the search phrase goes in `kw`. Pictures: `shots/platform/recipe-<name>-phone.jpg` and `-desktop.jpg`.

| Recipe | For | Its own fields | Picture |
|---|---|---|---|
| `home` | `index` only | none: both scenes are fixed | `recipe-home` |
| `service` | dog waste removal, sanitizing | `scene` (`"heroes/….jpg"`); optional `sceneReach`, `sceneLift`, `lawn`, `kwLines`, `titleLines`, `seal`, `cardTitle`, `action`, `spark`, `towns` (one line under the lead naming served towns, then "and nearby towns" linked to the service areas page; /quote only) | `recipe-service` |
| `city` | the 17 city pages | `city` (the community's name, put on the mount as `data-city`); `zip` only where the city has ONE accepted ZIP (the builder checks the engine); `alsoZips` only where the page prints a ZIP that the price engine lists under another town (below); `scene` defaults to `heroes/<slug>.jpg`; the same options as `service` | `recipe-city` |
| `plain` | about, reviews, FAQ, welcome, Yard Guide, all areas, an article | ONE of `scene` (the page's 16:9 picture), `pose` (one cut-out standing on the drawn field) or `cover` (a Yard Guide post's slug: that article's cover on the drawn field, no pose); `buttons`: up to two of `"quote"`, `"text"`, `"call"` (the text-first PAIR: Text, then Call), `{ "label", "href" }`; optional `sceneY`, and with a pose `stickers` | `_example-plain-scene.html`, `_example-plain-pose.html`, `_example-plain-cover.html` |
| `legal` | terms, privacy | `pose` (default `clipboard`: give each legal page its own), `stickers`, `date`; no buttons | `_example-legal.html` |
| `kit` | `kit-<name>` pages | `title` (one line of text) and `lead` only | `kit.html` |

- On a phone the keyword line of a hero with the builder must stay on ONE line (about 40 characters) and the title on two. If yours differs, `check-site` tells you the exact `kwLines` or `titleLines` to add. Two keyword lines plus a two-line title push the card up to the mascot's mouth on a short phone: shorten the line instead.
- `sceneReach` (0 to 1): how far left the characters reach from the picture's right edge, as a share of the cover's height. Set it when the characters sit behind the card at 1440 by 900 (`.766` on the service page). `lawn`: leave it out; the approved lawn green reads well under the city scenes. Set a `"#rrggbb"` only if a seam shows under your scene on a phone.
- **A city headline is `["Dog poop removal in <City>.", "Handled."]` and the builder sets its breaks**, the same way on all 17: in the desktop column "Dog poop / removal in / {City}. / Handled." (a long name sets the size a step down, so it never reaches the price card), on a phone "Dog poop removal / in {City}. Handled." or, for a long name, "Dog poop removal in / {City}. Handled.". Keep `"wrap": "first"` and `"titleLines": 2`. `"breaks": false` hands the wrapping back to the browser; you should not need it.
- **A city page that prints a ZIP the price engine lists under another town names it in `"alsoZips"`.** `"alsoZips": ["46280"]` on Carmel (in the engine 46280 is an Indianapolis ZIP; it covers Carmel's south edge and the page prints it as one of its three), `"alsoZips": ["46062"]` on Westfield (a Noblesville ZIP that reaches Westfield; the page names it in a sentence). The builder writes the list on the mount as `data-zips-also="46280"` (several are separated by a space). On that page the price builder then (a) offers the ZIP as a one-tap choice after the community's own, and (b) says the page's city for it wherever it names the place of a ZIP: "Carmel, got it. Now count the tails.", "Carmel! I know those lawns.", "We serve Carmel." Without the field it says the engine's town, which reads as a mistake ("Indianapolis, got it." on the Carmel page). Nothing else changes: coverage, the price, the City the engine pre-fills in the request and everything that is sent stay the engine's. Each entry is five digits, must be a ZIP the engine accepts and must not be one of the community's own (those need no help); the build stops with a sentence otherwise. **The build also stops when a ZIP stamp of a city page (a `data-pp-zip-form` form) carries a ZIP of another community that is not named here**, and tells you the line to add. How it works: `BUILDER-NOTES.md`, last section.
- `sceneLift` (16 to 40, pixels; service and city): how far the picture may slide up under the headline band on a short phone, so a short dog is not hidden by the price card (Greenwood's dachshunds: 26). Look at 360 by 740, 375 by 667 and 390 by 664 afterwards: the mascot's whole head stays below the cyan line. On a 667px-tall phone the card covers everything below his chin whatever you set: that is the first-screen rule.
- **A page that is not about recurring scooping** (the sanitizing page) says so on the price card and drops the scooping claim: `"cardTitle": "Your scooping price"` (20 characters at most: that fits the card and the panel on a 360px phone), `"seal": false`, and `"action": { "label": "Text about availability", "href": "sms:+13179615865" }` for the page's own button under the lead.
- `sceneY` (0 to 100; plain heroes with a scene): which part of the picture's height a desktop window keeps when it crops it. 50 when left out; a higher number moves the picture up (shows more of its bottom, for boots on the lower edge), a lower one shows more of its top (for a head under the header).
- A plain or legal title may wrap on both lines by default. Two short sentences ("A local team. A higher standard.") read better with `"wrap": "none"`: one sentence a line.
- A cyan line that wraps carries its spark on its last word, so the spark follows that word; nothing to do. If `check-site` or `check-layout` says the spark is under the price card or off the screen, shorten the line; `"spark": false` leaves it off.
- **The drawn field** (a `pose`, the `legal` recipe, or a `cover`): sky, clouds, a pale disc, two hills. The pose stands ON the front hill at every width and the band is compact (about 420px on a 1366 by 768 window); `check-layout` fails a pose that floats, is covered by the lead card, or a drawn hero taller than 62% of a desktop window. Nothing to set. Three things to choose:
  - `pose`: any file name in `assets/brand/poses` without its ending. Two pages of one family never open on the same pose (terms `clipboard`, privacy another).
  - `stickers`: one to three brand icons that belong to the page, pinned in the sky (`["pp-service-calendar", "pp-secure-payment", "pp-gate-photo"]`). A phone shows the first two.
  - `date` (legal only): the document's date line, printed in the hero under the lead: `"Last updated: September 9, 2026"`. Then do not repeat the date as a heading's kicker.
- **An article** opens on its own cover: `"cover": "<post slug>"` (from `assets/covers/covers.json`) puts that cover on the drawn lawn and shows no pose, so the glossy mascot is never beside the cover's flat one. Do not show the cover again in the first section. Give the article `"breadcrumb": [{ "name": "Yard Guide", "page": "yard-guide" }, "<short title>"]` and the linked trail appears under its facts.
- **Hero buttons are text first.** `"text"` is the Text button with the number. `"call"` is the pair, Text then Call: a hero never shows a call button alone, and a `{ "label", "href" }` button may not be a `tel:` link.

## 3a. A page for existing customers

`"audience": "customer"` in the JSON block (the welcome page; it also needs `"robots": "noindex"`). Nothing on such a page sells a price: the header's gold button and the phone menu's button become "Client portal", the closing scene asks "Questions about your service? Text us." with the Text button first (gold, with the number) and Call second, the footer's gold button is the client portal and its two pricing links go to the price list, no price bar is shown and the price scripts are not loaded. Write no `data-purge-quote` link and no "Get my price" button in the page's own sections; `check-site` fails the page if one is there.

## 4. Facts and tokens

`facts.items` is always four. Ready-made: `"google"`, `"proof"`, `"pay"`, `"communities"`, `"team"`. Your own: `{ "icon": "pp-…", "value": "…", "label": "…" }` (a brand icon name); add `"href"` (a text or call link, `"#section"`, a page) and the fact is a link. `{ "use": "pay", "id": "…" }` adds an id. Keep a value to about 14 characters and a label to two lines at 1440 (about 48 characters): longer ones wrap and the strip grows a line. A link-bar label holds about 15 characters. A service page adds the link bar: `"jump": { "label": "…", "links": [six or twelve of { "href": "#section-id", "icon": "pp-…", "label": "…" }] }`.

| Token in a section | Gives you |
|---|---|
| `{{EXPLAIN}}`, `{{EXPLAIN_OPEN}}` | The "How this works" explainer, closed or open, with its small print, word for word from `POLICY-WORDING.md`. The whole fee block to copy is in `_work/examples/plain-pose.html` |
| `{{MAP}}` | The service-area map plate, for the picture side of a split or inside `<div class="areas__map">` |
| `{{AREA_CHIPS}}` | The 18 linked chips and the nine plain ones, for `<div class="areas__list">` or a words column |
| `{{LIVE_REVIEWS}}` | The loader tag of the live Google reviews feed (Trustindex; `_work/partials/live-reviews.html`). Inside the element marked `data-pp-live-reviews`, on the same line straight before its `<noscript>`; once a page. The Reviews page carries it. A source never holds a `<script>` of its own |
| `{{GUIDE_CARDS:slug,slug,slug}}` | A row of exactly three Yard Guide cards. Slugs, titles and covers are in `assets/covers/covers.json` |
| `{{BUILDER_MOUNT}}` | The price builder outside a hero (the quote page), inside an element with `id="quote"` |
| `{{REACH}}`, `{{REACH:dark}}` | **The text-first pair** (section 4b): a Text button with the number, then a Call button. `dark` on a navy ground (a band, the navy section) |
| `{{REACH:inline}}`, `{{REACH:Inline}}` | The same offer inside a sentence: "text (317) 961-5865 or call", two links. `Inline` starts a sentence with a capital |

## 4a. The Google rating: ONE switch

Nobody types a rating, in a partial or in a page. The switch is `_work/partials/reviews.json`:

```json
{ "standin": { "rating": "4.9", "count": 43, "asOf": "October 4" }, "neutral": "Read our Google reviews" }
```

- **While `standin` holds figures** (the review build), the builder writes them into every rating line of every page: the hero badge, the Google fact, the footer badge and any badge in a page's own section. Each is marked `data-standin="true"`.
- **At rollout set `"standin": null` and build.** Every page is then built with the neutral line ("Read our Google reviews"), no figure and no stand-in mark. The live review feed's installer calls `PurgeProsReviews.set({ rating, count })` (`js/site.js`) once it knows the real figures and the same lines take them; if it cannot, `PurgeProsReviews.clear()` puts the neutral lines back. `PP_REVIEWS=neutral node _work/build-site.mjs <slug>` builds the neutral page once without editing the file, to look at it.
- **A badge in your own section** (a review frame): write the standard badge, as in `kit.html` component 06, `<a class="gbadge" href="reviews.html" data-standin="true" aria-label="Rated 4.9 from 43 Google reviews. Read our reviews."> … <span class="gbadge__num">4.9</span><span class="gbadge__txt">43 Google reviews <u>Read what neighbors say</u></span></a>`. The builder replaces the figures with the switch's and adds the hooks (`data-pp-reviews`, `data-pp-neutral`). A line of your own that shows a figure: `<span data-pp-reviews="Rated {rating} by {count} neighbors" data-pp-neutral="Read our Google reviews"></span>`, left empty.
- `check-site` fails a page that types a rating or a review count anywhere else, and a badge whose figure the switch cannot reach. Never `AggregateRating` or `Review` markup.

## 4b. Text first (owner decision, October 8)

Purge Pros answers most things by text. **Wherever a page offers a phone call there is a text option, shown first and as the stronger of the two; the call stays in view, second.** Both use (317) 961-5865.

- Buttons: `{{REACH}}` (on navy `{{REACH:dark}}`). It writes:
  `<span class="reach"><a class="btn btn--secondary btn--sm reach__text" href="sms:+13179615865"><img class="btn__ico" src="../../assets/brand-icons/pp-visit-message.webp" width="26" height="26" loading="lazy" alt="">Text (317) 961-5865</a> <a class="btn btn--outline btn--sm reach__call" href="tel:+13179615865"><img class="btn__ico" src="../../assets/brand-icons/pp-phone.webp" width="26" height="26" loading="lazy" alt="">Call<span class="vh"> (317) 961-5865</span></a></span>`
  (the dark form uses `reach reach--dark`, `btn--on-dark` and `btn--ghost-dark`). On a phone the pair fills its row: Text takes the width, Call stays compact. Put it in an `.actions` or `.center-row`, beside a gold button if the block has one.
- In a sentence: `{{REACH:inline}}` gives "text (317) 961-5865 or call" (the first link texts, the second calls). Write the words around it: "Not sure? {{REACH:Inline}} and we will check the address."
- A text link alone is fine (`href="sms:+13179615865"`, with the number in or beside it so it is useful on a computer). A call link alone is not.
- Say "text or call", never "call or text". Do not say who answers a call; "Text us. Our team answers." is fine.
- A fact that links to contact: `"href": "sms:+13179615865"`.
- `check-site` fails a page where a `tel:` link has no `sms:` link before it in the same block (the nearest few enclosing elements, inside the same section), and names the block; it also fails the words "call or text".
- Shared pieces already follow the rule: the header's "Text or call" control (it opens Text, then Call), the phone menu, the closing scene, the footer ("Text us" and the number as the large line, Call second, email third) and every state of the price builder.
- **Icons follow the rule too.** The ringing phone (`brand-icons/pp-phone.webp`, `step-icons/call.webp`) belongs on a Call button, the header's Call row and the footer's Call line, and nowhere else. A list item, a clause or a card about contacting us leads with text, so its icon is the message icon: `brand-icons/pp-visit-message.webp` (the one on every Text button and on the header's control), or the 3D `step-icons/chat.webp` where the first is already an icon of that section (`DESIGN.md` section 9: no icon twice in one section). `node _work/audit-contact-icons.mjs` reads every built page and lists each phone or call icon that is not on a call link; it fails when one leads a block whose first contact action is a text link. Run it with your slug after a build (section 8).

## 5. CSS: one system, one file per family

`css/site.css` is the system and changes only to fix a defect in a shared component. Something new goes in `css/family-<name>.css`: same tokens, same radii, shadows and type sizes, every class starting with the family's name (`.city-…`). Name the file in `"css"`, and show each new component on `kit-<name>.html` (source `_work/pages/kit-<name>.html`, copied from `_work/examples/kit-family.html`). `check-site` fails a family file that restyles a shared class, uses a colour that is not a token, or has no kit page.

## 6. Kit components (each is shown at `kit.html#…`)

| For | Classes | Kit |
|---|---|---|
| Section and heading | `section.sec` + `sec--cream`/`--sky`/`--grass`/`--gold`/`--navy`, `data-edge`; `.sh.sh--center` or `.sh--left`, `.sh__emblem`, `.kicker`, `.sh__title`, `.sh__intro.lead`, `.swash`, `.pop` | `kit-heading`, `kit-dividers` |
| Text and buttons | `.lead`, `.small`, `a.link`, `.prose`, `span.nb` (a hyphenated word that must not break); `.btn` + `--primary`, `--secondary`, `--outline`, `--quiet`, `--on-dark`; `.center-row`; the text-first pair `.reach` (`{{REACH}}`) | `kit-text`, `kit-buttons`, `kit-reach` |
| Picture beside words | `.split`, `--flip`, `--top`; `.frame`, `--flip`, `--wide`, `.frame__cap` | `kit-split` |
| Cards and grids | `.fcard` + `--gold`, `--grass`, `--cyan`, `--navy`, `--row`; `.grid.grid--2` to `--7`, `--compact` | `kit-fcards`, `kit-five` |
| Lists and steps | `ul.ilist`, `--checks`, `--3up` (the label is a `b`, or an `h3` when the labels are headings of the page); `ol.steps.steps--3` or `--4` | `kit-ilist`, `kit-3up`, `kit-steps` |
| Proof | `.receipts`, `.receipt`, `.tag--real`, `.rowhead`, `.rowsplit`; `.rfeed`; `a.gbadge`; `.frame--phone` | `kit-receipts`, `kit-rfeed`, `kit-gbadge`, `kit-msgphone` |
| Prices | `.pcard`, `.price`, `.ribbon`, `.pnote`; `.pboard`, `.ticket`; `.adders` | `kit-pcards`, `kit-pboard`, `kit-adders` |
| Notices and questions | `.notice`, `--sky`; `.faq` > `details.faq__item` > `summary.faq__q` + `.faq__a` | `kit-notice`, `kit-faq` |
| Areas and links | `.areas`, `.map`, `.chips`, `--3`, `--wide`, `--pair`, `a.chip`; `a.gcard`; `.cta` | `kit-areas`, `kit-gcards`, `kit-cta` |
| Mascot and stickers | `.stand`, `--mound`, `.peek-host` + `.peek`, `.lean-host` + `.lean`, `.lawn-edge`, `p.says`; `.stk`, `.puck`, `.seal`, `.tag` | `kit-mascot`, `kit-says`, `kit-decor` |
| Forms | `.field`, `.choices`, `.choice`, `label.check` | `kit-forms` |

## 7. Rules that are easy to break

1. **Alignment.** One container, `.wrap`. A section whose body spans it has a centred heading (`.sh--center` in `.wrap.stack`); a split has a left heading inside `.split__text`. Nothing else.
2. **Under 900px every heading is centred** by the stylesheet. Write the desktop markup, add no phone class, and put a split's lead inside the heading block as `p.sh__intro.lead`.
3. **No orphans.** Choose the grid class by the number of items (`grid--2` to `--7`, `steps--3` or `--4`, chips in sixes). `node _work/check-layout.mjs <slug> --verbose` prints every row.
4. **One mascot per screenful.** A pose stands, sits, leans or peeks ON something with a shadow; never beside a scene of him at a similar size; nothing covers his face.
5. **The glove rule.** City, sanitizing and welcome heroes show blue gloves, so no pose and no bare-handed scene in the first two screens of those pages. `check-site` measures it.
6. **Real photos are receipts.** `assets/photos` only as `.receipt`, in threes or fours, tagged `Real visit`, alt starting "Real visit photo:", different photos on different pages. Never tag a scene as real.
7. **Rhythm.** Never set padding or margin on a section: `--sec-gap` spaces every join. Never the same ground twice in a row, navy once, gold only for the fee block, the last section white, and no two neighbours with the same `data-edge` (DESIGN.md sections 5 and 7).
8. **Art direction in every section.** Each section has its emblem and its own picture, icon set, receipts or mascot placement. Alternate centred and split sections; the first split has its picture on the left, each later one flips. No picture twice on a page.
9. **Words and prices.** Anything about the first cleanup, restarts, one-time billing or when the card is charged is copied from `POLICY-WORDING.md`. The on-the-way text arrives "generally 10 to 45 minutes before arrival" (owner, October 8): say it in those words and the check accepts it; any other number of minutes still needs `allow`. Sanitizing and deodorizing is available to new and existing customers by request and is never pushed: no button that sells it, no price for it. A price is `<span data-price="weekly:2">` holding the engine's figure; add-on amounts only on the dog waste removal page. No review text is ever typed. One `.swash` word per heading.
10. **Links.** Real file names of the thirty (a page not built yet is fine; the check lists it as information), `sms:+13179615865` and `tel:+13179615865` (a call link only with a text link before it: section 4b), and for the builder `href="#quote" data-purge-quote` with `data-quote-plan` on a plan button. Never `href="#"`. A link to a section of the page names the section's id; on a phone, where a split shows its picture first, the page lands on the section's heading by itself.

11. **Tablets (620 to 899px) are one column, but designed.** A split's picture is a 460px print, centred (540px for `.frame--wide`); three short feature cards (`.grid--3.grid--compact`) keep the compact ticket form; a row of three Yard Guide cards puts each cover at the left with its words beside it. Write the desktop markup; add `grid--compact` to three short `.fcard`s and look at 768 wide.

Smaller things worth knowing: the heading over a peeking mascot (`.peek-host`) is a short title with no intro, or his ear covers its last word; a ribbon above a `.fcard--row` title needs `grid--compact` on the grid under 620px; the small caps label over a row of chips (`.chips__label`) is a list label and stays left on a phone, like the list under it; a title line in the call-to-action band holds about 22 characters before it crosses the cyan arc.

## 8. Build, check, look

```bash
node _work/build-site.mjs <slug>          # build one page (no name: every page)
node _work/check-site.mjs <slug>          # structure, links, wording, prices, then a browser at 390 and 1440
node _work/check-layout.mjs <slug>        # rhythm, alignment, grids, tap targets, small text at six widths
node _work/audit-contact-icons.mjs <slug> # text first, for icons: a phone icon only on a Call button (no name: every page)
node $PP_PPTR_DIR/shot.mjs --url <slug>.html --out shots/<family>/<slug>-m.jpg --tiles --mobile
node $PP_PPTR_DIR/shot.mjs --url <slug>.html --out shots/<family>/<slug>-d.jpg --tiles
```

`check-site` saves the first screen at both sizes in `shots/check/`. The two `shot.mjs` lines write one image per screenful (phone 390 by 844, desktop 1440 by 900): open every one and look before you say a page is done. `--static` skips the browser while you are still writing. Other people's pages can be half-finished while you work: a build of your own slug is never stopped by their mistakes.

**If you added or replaced a picture in `assets/heroes` or `assets/scenes`, or added a page:** run `node _work/perf/derive-images.mjs` before the build (section 10). `check-site` fails the page until you do.

## 9. Yard Guide covers

`assets/covers/covers.json` lists all 46 posts with `cover` (1536 by 1024, for an article page or one large feature) and `thumb` (720 by 480). Cards and grids use the thumb; `{{GUIDE_CARDS}}` does this for you. A page that shows many covers (the Yard Guide index) must use thumbs with `loading="lazy"`, width and height.

The Yard Guide index (`_work/pages/yard-guide.html`) is GENERATED from `covers.json` by the guide family's script, `shots/fix-guide/gen-guide.mjs` (`FAMILY-NOTES-guide.md`, appendix A): change the script and run it, never the cards by hand. A card whose published description must not be shown as it is has its wording in ONE shared place, `_work/partials/guide-wording.json` (today: the weekly-or-one-time card, whose live text says "offer"); `{{GUIDE_CARDS}}` uses it on every page unless the page gives its own in `guideCards`. The same file may give a card's picture description (`"alt"`) where the published one is not fit to be read out (17 covers since October 12, 2026). Yard Guide articles stay native GoHighLevel blog posts at rollout (owner decision, October 8): they take the new header, footer, type and colours from a stylesheet, and no article is rebuilt here beyond the one example page.

## 10. Speed and link previews

Ad visitors arrive on phones over mobile data, so the first screen has to be light. The builder does the work; you run one command when a picture or a page is new. The reasons and the measurements are in `DESIGN.md`, "Speed".

**What the builder writes for you**

| Thing | What a page gets |
|---|---|
| The hero scene | `<source type="image/webp">` lines in front of the JPEG: for a phone (under 700px) the 768 and 1152 wide copies with `sizes`, for everything wider the full 1600 copy. The `<img>` stays the JPEG, for a browser without WebP. A phone is never offered a hero file wider than 1152px |
| The head | One `<link rel="preload" as="image">` per breakpoint for the hero (the pose or the cover on a drawn hero), so the first-screen picture is asked for before the stylesheets are read |
| A scene further down | A scene in an arc frame (`figure.frame > img.frame__img`) and the closing scene are wrapped in `<picture style="display:contents">` with one WebP `<source>`. The wrapper makes no box: nothing moves and your classes still style the `<img>`. Write the `<img>` as before, with its JPEG `src`, width, height and `loading="lazy"` |
| The logo | The header and phone menu use `assets/derived/brand/logo-mark-158.webp` (10 KB for the 144 KB original), the footer `logo-mark-316.webp`, the browser tab `logo-mark-64.png` |
| Scripts | Every script is deferred, the price engine too. Nothing in a page may depend on a script having run before the page is painted; the static first question in the hero is there for that moment |
| The link preview | See below |

A scene used somewhere the builder knows no drawn width for (not a hero, not an arc frame, not the closing scene) is left as the JPEG and named at the end of the build. Tell whoever keeps the builder: the place is added to `picturesPass` in `_work/build-site.mjs` with the widths `node _work/perf/probe-sizes.mjs` prints.

**The one command: `node _work/perf/derive-images.mjs`**

Run it after adding or replacing a picture in `assets/heroes`, `assets/scenes` or `assets/scenes/city-dogs`, and after adding a page. It writes, under `assets/derived/` (never edit that folder by hand; the originals are never changed):

- WebP copies of every hero and scene in up to three widths (768, 1152 and the picture's own width), `assets/derived/<folder>/<name>-<width>.webp`;
- the three small logo files;
- one 1200 by 630 link-preview picture per page, `assets/derived/share/<slug>.jpg`, cut from that page's hero;
- `assets/derived/manifest.json`, the list of all of it with the fingerprint of each original.

A copy older than its original is not used: the builder writes the plain JPEG again and says so, and `check-site` fails the page with the command to run. `node _work/perf/derive-images.mjs --check` changes nothing and lists what is missing or out of date.

**The link preview (what a shared link shows in Facebook, iMessage, Google)**

- Each of the thirty has its own picture, cut from its own hero so the mascot and the dog are whole and no words are in it. Where the cut sits is in `_work/perf/share-crops.json`: `height` (how tall the cut is in the original's pixels: smaller is closer), `x` and `y` (where it sits). A page whose hero is a drawn field with a pose (terms, privacy) has no photograph, so it names one there: `"from": "scenes/scene-gate.jpg"`. After editing the file: `node _work/perf/derive-images.mjs --share`, then **look at them**: `node _work/perf/derive-images.mjs --sheet shots/share-sheet.jpg` puts all thirty in one picture.
- **ONE site setting decides whether pages name the picture: `"assetsBase"` in `_work/partials/site.json`.** It is the public `https://` address of the `assets` folder once it is published, with no slash at the end. It is `null` in the review build, because the review's pictures have no public address and a wrong picture is worse than none: then no page carries `og:image` or `twitter:image`, the card type is `summary`, and every build ends by saying so. **Rollout:** set it (for example `"assetsBase": "https://assets.example.com/site"`), build everything, and each page names `<assetsBase>/derived/share/<slug>.jpg` with its width, height and alt text, and the card type becomes `summary_large_image`. `PP_ASSETS_BASE=https://… node _work/build-site.mjs` does the same for one build without editing the file (give `check-site` the same variable).
- **The same file holds a second setting, `"review"` (added October 9).** `true` is the review build: every footer ends with the line "Review build. Nothing on this page is sent anywhere..." and `check-site` insists on it. `false`, or no such line, is a rollout build with no such line on any page. `PP_REVIEW=1` or `PP_REVIEW=0` in the environment sets it for one build and one check without editing the file. Keep it `true` while the owner reviews from this folder: the blocks for GoHighLevel never carry the line either way, because `_work/ghl/build-fragments.mjs` reads every page in its rollout form (the page without that one line; `node _work/ghl/prove-rollout-form.mjs` proves the two builds differ by nothing else), and `review/build-review.mjs` refuses to make the review bundle from pages that lack it.
- **A third setting in that file, `"headerText"` (added October 12).** `true` puts a Text button into the phone top bar of every page, straight before the gold button: the site's `sms:` link, shown under 1180px wide only (from there the bar has its own "Text or call" control). `false`, or no such line, builds the header as it was. `PP_HEADER_TEXT=1` or `PP_HEADER_TEXT=0` in the environment sets it for one build and one check. It changes the header and nothing else: build every page, run `node _work/sync-kit.mjs`, package again, and only the header blocks differ (`shared/header.html`, `shared/welcome-header.html`, `blog/home-1-header-and-index.1.html`, `blog/post-1-header.html`); no page block and no hosted file changes. `check-site` fails a page whose header disagrees with the setting.
- A page that names `"ogImage"` in its JSON block (an article's published cover) shows that picture instead, with or without the setting.

**Minified stylesheets and scripts, for rollout**

`node _work/build-site.mjs --min` builds as usual and then writes a minified copy of every stylesheet and script (the price engine too) to `assets/derived/min/`, and prints the saving. Only blanks and comments are removed: nothing is renamed or reordered. The built pages keep loading the readable files, so nobody's work in `css/` or `js/` waits on a minified copy. Two things use the copies:

- `node ../../review/build-review.mjs --min` makes the review bundle load them (the rollout form);
- `node _work/perf/measure.mjs --min` measures the pages with them.

Both refuse a copy that is older than its source and tell you to run `--min` again. `node _work/perf/verify-min.mjs --tests` proves every copy the same as its source: the same rules as the browser reads them, the same tokens and syntax tree for each script, and the engine's own tests run against the minified engine (one test reads the comments of the readable source and cannot pass on a minified file; the script says so).

**Measuring**

```bash
node _work/perf/measure.mjs --label mine --pages index,quote,carmel,dog-waste-removal   # LCP, CLS, bytes, requests on a throttled phone
node _work/perf/measure.mjs --label mine-min --min                                    # the same with the minified copies
node _work/perf/make-pair.mjs                                                         # today's sources built by the old and the new builder
node _work/perf/capture.mjs --label control --site control && node _work/perf/capture.mjs --label after --site after/site
node _work/perf/compare.mjs control after                                             # pixel by pixel, and every element's box
```

`check-site` enforces the rest on every page: the hero has its WebP copies and a preload for each breakpoint, nothing on the first screen of a phone is above about 200 KB, every script is deferred, every derived picture is as new as its original, each of the thirty has its link preview. It prints each page's weight as a phone receives it, and a table of all of them at the end.
