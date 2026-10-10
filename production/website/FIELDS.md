# What to type and what to paste into GoHighLevel (production)

State: Prepared. Written by `_work/ghl/build-fragments.mjs` from the head of each approved built page; nothing here is in GoHighLevel. Every page below has two tables: **Type these** (the page's own fields) and **Paste these** (its code blocks, in order).

## Read first

- The fields are typed in the page editor: toolbar > **"SEO & AI search optimization"** ("Content" > "Title" and "Description"; "Images" > the share image; "Links & tags" > "Canonical links" > "+ Add", and the custom meta tag's "+ Add"; "Schema markup" > "Add schema"). The path is in the page card's "Edit page details" ("Path"). The two "+ Add" forms and the "Add schema" form had not been seen when this was written (STAGING-RUNBOOK NS-6, NS-7): record what they ask for the first time.
- **Robots is typed on the page, never left to site code.** A page that must stay out of search has a row "Custom meta tag" below: name `robots`, the content as printed. On a preview address GoHighLevel does not serve a robots tag that stands in the site head code (it serves its own `noindex` there instead), so the page's own tag is the only one that can be relied on; read it back on a published address at the switch. Pages that must carry it in this build: `page-not-found` (noindex, follow), `quote` (noindex, follow), `welcome` (noindex,follow). Where the row says "none", add no robots tag.
- This profile adds no site-wide robots tag: a page is kept out of search by its own typed tag and by nothing else.
- **Schema file.** A page whose body is too large for one block has its page data in a file of its own, `<page>.schema.html`. It goes into the page's own "Schema markup" > "Add schema". If that form refuses the text or changes it, paste the file as a small Custom Code element of its own at the foot of the body section, under the last body block, and use that method for every page that has a schema file. A page with no schema row carries its page data inside its body block: add nothing.
- **A body in two parts** (`<page>.1.html`, `<page>.2.html`) is two Custom Code elements, one directly under the other, in the SAME section and column. Part 2 puts its sections into part 1's `<main>` by itself.
- **The scripts start from the footer block.** Every footer block (the footer Global Section, Welcome's own footer, both blog templates' last block) ends with one script that sets `window.PPSite` (live mode) and loads the site's scripts, because GoHighLevel holds the site body code until the visitor's first touch or about 4 seconds. So the footer must be pasted again after EVERY rebuild of the blocks, and the site body code is two comment lines.
- Keywords and Author are not in the build: leave what the page has today. Site-wide, once: the browser-tab icon is `assets/derived/brand/logo-mark-64.png` (Sites > settings > favicon).

## How to paste

**Custom Code elements** (every block under `pages/`, `shared/*-header.html`, `shared/*-footer.html` and `blog/*.html` except the site code): "Open Code Editor", replace everything, compare what the editor holds with the file, "Save".

**Plain text boxes in GoHighLevel's settings** (the website's and the blog's head and body tracking code, and any box that is not the Custom Code editor):
1. **Never press Ctrl+A in such a box.** On October 9 it typed a letter "a" into both site-code boxes; that one letter put a white strip with an "a" under every footer and stopped the head code's link tags from reaching the page.
2. Click into the box, press **Home** to stand at the very start, and remove what is there with **Delete** until the box is empty.
3. Paste the file.
4. Read the box back before saving: it must **start with the comment marker `<!--`** (nothing, not even a blank, in front of it) and end with the file's last characters. If it starts with anything else, empty it the same way and paste again.

## Once for the whole site

| File | Where in GoHighLevel | What it is |
|---|---|---|
| `shared/header.html` (14,679 characters) | the header Global Section: one section, one row, one column, one Custom Code element | wrapper rules, typefaces, stylesheets, header and phone menu |
| `shared/footer.html` (9,300 characters) | the footer Global Section, built the same way | the footer, then `window.PPSite` and the script loader |
| `shared/site-head.html` (2,756 characters) | Sites > Websites > the site's settings > head tracking code (a PLAIN TEXT BOX: the rule above) | the saved-quote guard, theme colour, typefaces, the shared organization data, and the Google tag and Meta pixel exactly as on the live site today |
| `shared/site-body.html` (550 characters) | the same settings > body tracking code (a PLAIN TEXT BOX) | two comment lines and nothing else; they replace any loader pasted earlier |
| `shared/welcome-header.html` (14,998 characters), `shared/welcome-footer.html` (8,698 characters) | the page `welcome` only: its own first and last section, NOT the Global Sections | that page's own header and footer (the footer ends with the settings and the loader too) |
| `blog/site-head.html` (2,891 characters), `blog/site-body.html` (547 characters) | Sites > Blogs > the blog's settings > head and body tracking code (PLAIN TEXT BOXES) | as the website's; the head code also links the native post's stylesheet |

## about

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/about` |
| Content > Title | About Purge Pros \| Local Indianapolis Pet Waste Removal |
| Content > Description | Meet the local family behind Purge Pros. Learn about our Indianapolis roots, pet-care standards, service communication and pay-per-visit dog waste removal. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/about.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/about` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/about.html` (31,594 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## additional

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/additional` |
| Content > Title | Central Indiana Dog Waste Removal Service Areas \| Purge Pros |
| Content > Description | Explore Purge Pros dog waste removal areas around Indianapolis. Find your city, check the service ZIP, and request an exact-address route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/additional.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/additional` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | the whole content of `pages/additional.schema.html` (6,661 characters); if the form refuses or changes it, a small Custom Code element of its own at the foot of the body section |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/additional.1.html` (50,408 characters) | body section, FIRST Custom Code element |
| 3 | `pages/additional.2.html` (29,187 characters) | the same section and column, a SECOND Custom Code element directly under the first |
| 4 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## anderson

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/anderson` |
| Content > Title | Dog Waste Removal in Anderson, IN \| Purge Pros |
| Content > Description | Get an Anderson dog waste removal price or custom estimate path online. Check your ZIP, describe the yard, and request local route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/anderson.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/anderson` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/anderson.html` (59,111 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## avon

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/avon` |
| Content > Title | Dog Waste Removal in Avon, IN \| Purge Pros |
| Content > Description | Price Avon dog waste removal online for recurring or one-time cleanup. Include every yard area, review the rate, and request route confirmation. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/avon.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/avon` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/avon.html` (57,145 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## brownsburg

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/brownsburg` |
| Content > Title | Dog Waste Removal in Brownsburg, IN \| Purge Pros |
| Content > Description | Get Brownsburg dog waste removal pricing for recurring or one-time service. Check the ZIP, choose the plan, and request local route review online. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/brownsburg.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/brownsburg` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/brownsburg.html` (59,118 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## camby

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/camby` |
| Content > Title | Dog Waste Removal in Camby, IN \| Purge Pros |
| Content > Description | Price Camby dog waste removal online for recurring or one-time cleanup. Pick the yard areas, see the rate, and request an exact-address route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/camby.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/camby` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/camby.html` (57,559 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## carmel

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/carmel` |
| Content > Title | Dog Waste Removal in Carmel, IN \| Purge Pros |
| Content > Description | Check Carmel dog waste removal pricing for recurring or one-time cleanup. Select every yard area, see the available rate, and request route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/carmel.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/carmel` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/carmel.html` (59,309 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## cicero

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/cicero` |
| Content > Title | Dog Waste Removal in Cicero, IN \| Purge Pros |
| Content > Description | Check Cicero dog waste removal pricing online, lake lot or in town. Choose recurring or one-time cleanup and request an address-level route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/cicero.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/cicero` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/cicero.html` (58,404 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## danville

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/danville` |
| Content > Title | Dog Waste Removal in Danville, IN \| Purge Pros |
| Content > Description | Check Danville dog waste removal pricing and route availability. Describe the yard, compare recurring or one-time service, and request review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/danville.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/danville` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/danville.html` (57,939 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## dog-waste-removal

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/dog-waste-removal` |
| Content > Title | Dog Poop Removal Services in Indianapolis \| Purge Pros |
| Content > Description | Weekly, twice-weekly and one-time dog poop removal in Indianapolis and nearby communities. Check your ZIP and see your price before sharing contact details. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/dog-waste-removal.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/dog-waste-removal` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | the whole content of `pages/dog-waste-removal.schema.html` (6,772 characters); if the form refuses or changes it, a small Custom Code element of its own at the foot of the body section |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/dog-waste-removal.1.html` (41,924 characters) | body section, FIRST Custom Code element |
| 3 | `pages/dog-waste-removal.2.html` (39,020 characters) | the same section and column, a SECOND Custom Code element directly under the first |
| 4 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## faq

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/faq` |
| Content > Title | Dog Waste Removal FAQs \| Pricing & Service \| Purge Pros |
| Content > Description | Get answers about Purge Pros pricing, first cleanups, billing, pets, gates and weather. Learn how recurring dog waste removal works before requesting service. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/faq.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/faq` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | the whole content of `pages/faq.schema.html` (7,628 characters); if the form refuses or changes it, a small Custom Code element of its own at the foot of the body section |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/faq.html` (55,554 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## fishers

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/fishers` |
| Content > Title | Dog Waste Removal in Fishers, IN \| Purge Pros |
| Content > Description | See Fishers dog waste removal pricing for recurring or one-time service. Check your ZIP, build the yard plan, and request an address-level route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/fishers.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/fishers` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/fishers.html` (59,613 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## fortville

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/fortville` |
| Content > Title | Dog Waste Removal in Fortville, IN \| Purge Pros |
| Content > Description | See Fortville dog waste removal pricing for recurring or one-time cleanup. Build the yard plan and request address-level route confirmation. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/fortville.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/fortville` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/fortville.html` (58,468 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## greenfield

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/greenfield` |
| Content > Title | Dog Waste Removal in Greenfield, IN \| Purge Pros |
| Content > Description | See Greenfield dog waste removal pricing online. Describe the dogs, lot size, and cleanup areas, then request recurring or one-time service review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/greenfield.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/greenfield` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/greenfield.html` (59,163 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## greenwood

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/greenwood` |
| Content > Title | Dog Waste Removal in Greenwood, IN \| Purge Pros |
| Content > Description | See Greenwood dog waste removal pricing for recurring or one-time cleanup. Match frequency to your dogs and request a locally reviewed service route. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/greenwood.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/greenwood` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/greenwood.html` (59,382 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## index

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/` |
| Content > Title | Dog Waste Removal Indianapolis \| Purge Pros |
| Content > Description | See your Purge Pros pet waste removal price in about 60 seconds. Recurring and one-time dog waste cleanup across Indianapolis and surrounding communities. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/index.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | the whole content of `pages/index.schema.html` (2,630 characters); if the form refuses or changes it, a small Custom Code element of its own at the foot of the body section |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/index.1.html` (34,367 characters) | body section, FIRST Custom Code element |
| 3 | `pages/index.2.html` (31,940 characters) | the same section and column, a SECOND Custom Code element directly under the first |
| 4 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## indianapolis

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/indianapolis` |
| Content > Title | Dog Waste Removal in Indianapolis, IN \| Purge Pros |
| Content > Description | Get an Indianapolis dog waste removal price online. Choose recurring or one-time cleanup, check the service ZIP, and request a locally reviewed route. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/indianapolis.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/indianapolis` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | the whole content of `pages/indianapolis.schema.html` (4,736 characters); if the form refuses or changes it, a small Custom Code element of its own at the foot of the body section |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/indianapolis.1.html` (31,448 characters) | body section, FIRST Custom Code element |
| 3 | `pages/indianapolis.2.html` (34,011 characters) | the same section and column, a SECOND Custom Code element directly under the first |
| 4 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## ingalls

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/ingalls` |
| Content > Title | Dog Waste Removal in Ingalls, IN \| Purge Pros |
| Content > Description | Check Ingalls dog waste removal route availability and pricing. Describe the exact property, choose service, and request a locally reviewed route day. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/ingalls.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/ingalls` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/ingalls.html` (58,592 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## lapel

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/lapel` |
| Content > Title | Dog Waste Removal in Lapel, IN \| Purge Pros |
| Content > Description | See Lapel dog waste removal pricing and route availability. Describe the yard, choose recurring or one-time cleanup, and request an address review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/lapel.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/lapel` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/lapel.html` (57,566 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## lawrence

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/lawrence` |
| Content > Title | Dog Waste Removal in Lawrence, IN \| Purge Pros |
| Content > Description | Check Lawrence dog waste removal pricing for recurring or one-time cleanup. Build the yard plan online and request a route after address review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/lawrence.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/lawrence` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/lawrence.html` (59,118 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## markleville

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/markleville` |
| Content > Title | Dog Waste Removal in Markleville, IN \| Purge Pros |
| Content > Description | Check Markleville dog waste removal availability and pricing. Size the area the dogs use, choose recurring or one-time cleanup, and request review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/markleville.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/markleville` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/markleville.html` (57,928 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## mccordsville

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/mccordsville` |
| Content > Title | Dog Waste Removal in McCordsville, IN \| Purge Pros |
| Content > Description | Check McCordsville dog waste removal pricing online. Build a recurring or one-time yard plan and request route confirmation for the exact address. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/mccordsville.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/mccordsville` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/mccordsville.html` (58,378 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## mooresville

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/mooresville` |
| Content > Title | Dog Waste Removal in Mooresville, IN \| Purge Pros |
| Content > Description | See Mooresville dog waste removal pricing for recurring or one-time cleanup. Count the dogs, size the yard, and request a route day after review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/mooresville.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/mooresville` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/mooresville.html` (58,043 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## new-palestine

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/new-palestine` |
| Content > Title | Dog Waste Removal in New Palestine, IN \| Purge Pros |
| Content > Description | Price New Palestine dog waste removal for recurring or one-time cleanup. Enter the true lot size and service areas, then request route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/new-palestine.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/new-palestine` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/new-palestine.html` (59,209 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## noblesville

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/noblesville` |
| Content > Title | Dog Waste Removal in Noblesville, IN \| Purge Pros |
| Content > Description | Price dog waste removal in Noblesville online. Compare recurring and one-time cleanup, describe the yard, and request a route day after local review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/noblesville.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/noblesville` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/noblesville.html` (59,051 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## page-not-found

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/page-not-found` |
| Content > Title | Page Not Found \| Purge Pros |
| Content > Description | Sorry, that page is not here. Head to the Purge Pros home page, dog waste removal, our service areas, questions and answers or the Yard Guide. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/page-not-found.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | none: the build names no canonical for this page; add none |
| Links & tags > Custom meta tag > + Add | **REQUIRED, this page must stay out of search:** name `robots`, content `noindex, follow` |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | NOT in the sitemap (kept out of search) |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/page-not-found.html` (9,238 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## pendleton

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/pendleton` |
| Content > Title | Dog Waste Removal in Pendleton, IN \| Purge Pros |
| Content > Description | Check Pendleton dog waste removal pricing for recurring or one-time cleanup. Describe the yard, old lot or new, and request an exact-address review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/pendleton.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/pendleton` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/pendleton.html` (58,332 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## pittsboro

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/pittsboro` |
| Content > Title | Dog Waste Removal in Pittsboro, IN \| Purge Pros |
| Content > Description | Get Pittsboro dog waste removal pricing for recurring or one-time cleanup. Build the yard plan online and request a route day after address review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/pittsboro.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/pittsboro` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/pittsboro.html` (58,183 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## plainfield

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/plainfield` |
| Content > Title | Dog Waste Removal in Plainfield, IN \| Purge Pros |
| Content > Description | See Plainfield dog waste removal pricing online. Choose recurring or one-time cleanup, define the yard, and request an address-level route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/plainfield.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/plainfield` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/plainfield.html` (58,991 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## privacy-policy

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/privacy-policy` |
| Content > Title | Privacy Policy \| Purge Pros |
| Content > Description | Read how Purge Pros handles information from quote requests, service communications and website use, including contact preferences and privacy questions. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/privacy-policy.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/privacy-policy` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/privacy-policy.html` (35,699 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## quote

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/quote` |
| Content > Title | Build Your Dog Waste Removal Price \| Purge Pros |
| Content > Description | See your per-visit dog waste removal price for Indianapolis and Central Indiana in five quick questions, before sharing contact details. No payment today. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/quote.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | none: the build names no canonical for this page; add none |
| Links & tags > Custom meta tag > + Add | **REQUIRED, this page must stay out of search:** name `robots`, content `noindex, follow` |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | NOT in the sitemap (kept out of search) |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/quote.html` (37,818 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## reviews

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/reviews` |
| Content > Title | Purge Pros Reviews \| Indianapolis Dog Waste Removal |
| Content > Description | Read customer feedback on Purge Pros dog waste removal in Indianapolis and nearby communities. See how our local team cares for yards, gates and pets. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/reviews.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/reviews` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/reviews.html` (26,249 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## sanitizing-and-deodorizing

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/sanitizing-and-deodorizing` |
| Content > Title | Yard Sanitizing & Deodorizing in Indianapolis \| Purge Pros |
| Content > Description | Ask about optional yard sanitizing and deodorizing in Indianapolis and nearby communities. We review your address, surfaces and treatment needs before quoting. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/sanitizing-and-deodorizing.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/sanitizing-and-deodorizing` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/sanitizing-and-deodorizing.html` (46,748 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## terms-conditions

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/terms-conditions` |
| Content > Title | Terms & Conditions \| Purge Pros Dog Waste Removal |
| Content > Description | Review Purge Pros service terms, recurring billing, first-cleanup and one-time pricing, access requirements, weather policies and cancellation terms. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/terms-conditions.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/terms-conditions` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/terms-conditions.html` (34,470 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## welcome

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/welcome` |
| Content > Title | New Customer Welcome \| Purge Pros |
| Content > Description | What new Purge Pros customers can expect before, during, and after pet waste removal service. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/welcome.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | none: the build names no canonical for this page; add none |
| Links & tags > Custom meta tag > + Add | **REQUIRED, this page must stay out of search:** name `robots`, content `noindex,follow` (the built page says `noindex`; the words to type are set in `robotsTyped` of the settings file) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | NOT in the sitemap (kept out of search) |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/welcome-header.html` (14,998 characters) | first section, its own Custom Code element (no Global Section on this page) |
| 2 | `pages/welcome.html` (40,630 characters) | body section, one Custom Code element |
| 3 | `shared/welcome-footer.html` (8,698 characters) | last section, its own Custom Code element |

## westfield

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/westfield` |
| Content > Title | Dog Waste Removal in Westfield, IN \| Purge Pros |
| Content > Description | Get a Westfield dog waste removal price for recurring or one-time cleanup. Match service to the dogs and yard, then request a reviewed route day. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/westfield.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/westfield` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/westfield.html` (58,883 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## whitestown

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/whitestown` |
| Content > Title | Dog Waste Removal in Whitestown, IN \| Purge Pros |
| Content > Description | Get a Whitestown dog waste removal price online. Pick recurring or one-time cleanup, add current gate notes, and request an exact-address route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/whitestown.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/whitestown` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/whitestown.html` (57,962 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

## yard-guide-article

blog template: Blog Post (fields belong to each post's own record).

**Type these** (a blog template: the title and description belong to each post's own record; they are listed for reference)

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `https://blog.itspurgepros.com/post/dog-poop-removal-cost-indianapolis` |
| Content > Title | Dog Poop Removal Cost in Indianapolis: What Shapes Your Quote |
| Content > Description | See what changes dog poop removal pricing in Indianapolis, how per-visit plans work, and what to compare before requesting a cleanup. |
| Images > share image | `https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa8cdc0a4d512c32b699ec2.jpg` (the page names it) |
| Links & tags > Canonical links > + Add | `https://blog.itspurgepros.com/post/dog-poop-removal-cost-indianapolis` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | NOT in the sitemap (the blog has its own sitemap) |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `blog/post-1-header.html` (16,393 characters) | the template's Custom Code elements, in this order (the native blog element stays between them; see the two `.txt` markers in `blog/`) |
| 2 | `blog/post-3-footer.html` (15,635 characters) | the template's Custom Code elements, in this order (the native blog element stays between them; see the two `.txt` markers in `blog/`) |

## yard-guide

blog template: Blog Home (fields belong to the blog's settings).

**Type these** (a blog template: the title and description belong to the blog's settings; they are listed for reference)

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `https://blog.itspurgepros.com/` |
| Content > Title | Dog-Friendly Yard Care & Cleanup Guides \| Purge Pros |
| Content > Description | Practical dog waste removal and yard-care guides for Indianapolis-area homeowners. Compare service schedules and learn what to expect from Purge Pros. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/yard-guide.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://blog.itspurgepros.com/` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | the whole content of `blog/home-1-header-and-index.schema.html` (9,335 characters); if the form refuses or changes it, a small Custom Code element of its own at the foot of the body section |
| Sitemap | NOT in the sitemap (the blog has its own sitemap) |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `blog/home-1-header-and-index.1.html` (20,678 characters) | the template's Custom Code elements, in this order (the native blog element stays between them; see the two `.txt` markers in `blog/`) |
| 2 | `blog/home-1-header-and-index.2.html` (60,340 characters) | the template's Custom Code elements, in this order (the native blog element stays between them; see the two `.txt` markers in `blog/`) |
| 3 | `blog/home-3-footer.html` (10,293 characters) | the template's last Custom Code element |

## zionsville

website page.

**Type these**

| Where in GoHighLevel | Type this |
|---|---|
| Page details > Path | `/zionsville` |
| Content > Title | Dog Waste Removal in Zionsville, IN \| Purge Pros |
| Content > Description | Price Zionsville dog waste removal online, village lot or acreage. Pick recurring or one-time cleanup, size the area to scoop, and request route review. |
| Images > share image | `https://purge-pros-site-assets.purgepros.workers.dev/assets/v5-DATE/assets/derived/share/zionsville.jpg` (the page's own link-preview picture, 1200 x 630) |
| Links & tags > Canonical links > + Add | `https://itspurgepros.com/zionsville` |
| Links & tags > Custom meta tag > + Add | none: add no robots tag (the page is meant to be found) |
| Schema markup > Add schema | nothing: this page's data is inside its body block |
| Sitemap | in the sitemap |

**Paste these**, top to bottom

| # | File | Where |
|---|---|---|
| 1 | `shared/header.html` (14,679 characters) | first section: the header Global Section (already pasted once; only place it) |
| 2 | `pages/zionsville.html` (58,145 characters) | body section, one Custom Code element |
| 3 | `shared/footer.html` (9,300 characters) | last section: the footer Global Section (already pasted once; only place it) |

