# _work/partials: the shared pieces of every page

One file per piece. `node _work/build-site.mjs` puts them together; a page author never edits anything here (`ADD-A-PAGE.md`). A change in this folder changes every page, so after one: build everything, run `node _work/check-site.mjs` and `node _work/check-layout.mjs`, and if the pages were not meant to move, prove it with `node _work/compare-builds.mjs <old.html> <new.html>`.

| File | What it is | Used by |
|---|---|---|
| `document.html` | The page skeleton: head (fonts, the hero's preload, stylesheets, canonical, share tags, structured data), body, script order. Every script is deferred, the price engine too | every page |
| `header.html` | Skip link, sticky header, phone menu (its burger and close control are real buttons; `js/site.js` runs it). It ends with one small inline script that keeps the menu, the header's menu buttons and a tap on the hero's dog-count tiles working until the site's scripts have arrived, and two `<noscript>` links for a browser with scripts off | every page |
| `hero-home.html`, `hero-page.html`, `hero-plain.html` | The hero recipes: `home`; `service` and `city`; `plain` and `legal` | the hero named in a page's JSON block |
| `hero-drawn.html` | The drawn field of a hero with a pose or an article's cover: clouds, the disc, two hills, the stickers, the pose standing on the front hill | `hero-plain.html` |
| `hero-arcs.html`, `hero-head.html`, `hero-seal.html`, `hero-badge.html`, `hero-buttons.html` | Parts of a hero: the two drawings, keyword line and `h1`, the $0 seal, the review badge, a plain hero's buttons | the hero files |
| `builder-mount.html` | The price-builder mount with its static first question. Never edit the markup | heroes with the builder; the token `{{BUILDER_MOUNT}}` |
| `facts.html` | The facts strip, the ready-made facts, a linked fact (`fact:linked`), the link bar and the breadcrumb trail of a page with a parent | every page |
| `explain.html` | The "How this works" explainer and its small print (wording: `POLICY-WORDING.md`) | `{{EXPLAIN}}`, `{{EXPLAIN_OPEN}}` |
| `map.html` | The service-area map plate. Written by `node _work/build-map.mjs`; do not edit by hand | `{{MAP}}` |
| `area-chips.html` | The chip lists of the service area | `{{AREA_CHIPS}}` |
| `guide-cards.html` | The Yard Guide card and its row of three (data: `assets/covers/covers.json`) | `{{GUIDE_CARDS:…}}` |
| `closing.html`, `footer.html` | The closing scene and the footer (text first: the pair after the price button; "Text us" and the number as the footer's large line) | every page |
| `reach.html`, `reach-dark.html` | **The text-first pair**: a Text button with the number, then a Call button; the dark one for navy grounds | `{{REACH}}`, `{{REACH:dark}}`, the closing scene, a plain hero's `"call"` button |
| `reviews.json` | **The one switch for the Google rating.** `"standin"` holds the figures of the review build; `null` builds the neutral lines for rollout | every badge and the Google fact (`build-site.mjs`, `reviewsPass`) |
| `guide-wording.json` | The wording of a Yard Guide card whose published description must not be shown as it is | `{{GUIDE_CARDS:…}}` |
| `kit-intro.html` | The frame of a family kit page | `kit-<name>` pages |
| `organization.json` | The Organization and WebSite structured data | every page |
| `site.json` | **The site's two rollout settings.** `"assetsBase"`: the public https address of the `assets` folder once it is published; `null` in the review build. Set, every page names its link-preview picture (`<assetsBase>/derived/share/<slug>.jpg`) as `og:image` and `twitter:image`; `null`, no page names a picture and the build says so. `"review"`: `true` in the review build, and only then does the footer end with "Review build. Nothing on this page is sent anywhere..."; `false` or missing for rollout, when no page prints it (`PP_REVIEW=0` or `PP_REVIEW=1` sets it for one build and one check). The build says which it made, and `check-site` fails a page that disagrees with the setting | the share tags and the footer of every page (`build-site.mjs`, `sharePictureOf`, `reviewBuild`; `site-lib.mjs`, `siteSettings`; `ADD-A-PAGE.md` section 10) |

## The four marks a partial may carry

- `<!--# … -->` a note to whoever edits the file. Never written to a page.
- `{{name}}` a slot, filled from the page's JSON block. A line that holds only an empty slot disappears.
- `{{#name}} … {{/name}}` kept only when `name` has a value (on their own lines, or inside one line).
- `{{>file}}` another partial, placed here.

A file may hold several named pieces, each starting at a line `<!-- @block name -->` (`facts.html`, `hero-buttons.html`, `guide-cards.html`).

A third slot, `reviewBuild`, has a value only in the review build (`"review": true` in `site.json`); the footer's last line stands inside it.

Two slots are set for every page by the builder: `visitor` and `customer`. Exactly one of them has a value, so `{{#visitor}} … {{/visitor}}` holds what an ordinary page gets (the price button) and `{{#customer}} … {{/customer}}` what a page for existing customers gets (`"audience": "customer"` in its JSON block: the client portal, text and call). They are used in `header.html`, `closing.html`, `footer.html` and `document.html`; `{{portal}}` is the client portal's address (`PORTAL_HREF` in `site-lib.mjs`).

## Adding to the platform

- A ready-made fact: add a `<!-- @block fact:name -->` piece to `facts.html`. It is then a name pages may use.
- A page token: add one line to `TOKENS` in `build-site.mjs` and a row to `ADD-A-PAGE.md` section 4.
- A place where pages show a hero or a scene (a new frame, a new band): add it to `picturesPass` in `build-site.mjs` with the widths `node _work/perf/probe-sizes.mjs` prints, or the picture is served as its full JPEG there and the build names it.
- Slots filled for every page by the builder, beside `visitor` and `customer`: `{{preloads}}` and `{{icon}}` (`document.html`), `{{sceneSources}}` (the hero files: the WebP `<source>` lines of the scene), `{{logoSmall}}` (`header.html`) and `{{logoLarge}}` (`footer.html`): the small logo files under `assets/derived/brand/`.
- A hero field: add it to `HERO_FIELDS` and to `heroHtml` in `build-site.mjs`, and to `ADD-A-PAGE.md` section 3.
- After editing `header.html`, `footer.html`, `closing.html`, `builder-mount.html` or `area-chips.html`: build, then `node _work/sync-kit.mjs` (the kit shows copies).
- A partial never prints a call link (`tel:`) without a text link (`sms:`) before it in the same block, and never a rating: a line that shows one is left empty and marked `data-pp-reviews="… {rating} … {count} …"` with `data-pp-neutral="…"`; the builder fills it from `reviews.json`. `check-site` enforces both on every page.
- `node _work/check-site.selftest.mjs` breaks pages on purpose and expects every check to notice. Run it after changing `check-site.mjs`.
