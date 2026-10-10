// check-site.mjs : every check a page author runs before saying a page is done.
//
//   node _work/check-site.mjs                 every built page of the thirty, and family kit pages
//   node _work/check-site.mjs carmel fishers  only these pages
//   node _work/check-site.mjs --examples      the hero-recipe examples as well
//   node _work/check-site.mjs --static        skip the browser pass (quick, while writing)
//
// For each page it reads the built file and checks structure (one h1, heading order, title, description, canonical),
// images, links, phone numbers, TEXT FIRST (a call link never without a text link before it in its block; never the
// words "call or text"), the review badge and the one switch for its figures, FAQ data, one WebPage and one
// BreadcrumbList, wording rules (POLICY-WORDING.md), every price against the price engine, and then loads the page in a
// real browser at 390 and 1440 wide and fails on console errors, failed requests, broken images, sideways scroll or a
// hero spark cut by the price card. This file replaces audit-pages.mjs and check-prices.mjs.
// SPEED (DESIGN.md "Speed"): every hero has its WebP copies in srcset and a preload for each breakpoint; no picture
// on the first screen of a phone is above about 200 KB; every script is deferred; every derived picture is as new as
// its original; each of the thirty has its 1200 by 630 link preview. It prints the weight of each page as a phone
// receives it, and a table of all of them at the end.
// Exit code 1 if any page fails. Plain Node; the browser pass uses $PP_PPTR_DIR/shot.mjs.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { ROOT, RELEASE, PARTIALS_DIR, PAGES, GLOVED_SCENES, readSource, listSources, siteState, decode, visibleText, faqPairs, jsonLdBlocks,
  derivedManifest, webpCopies, logoFiles, sharePicture, siteSettings, imageSize, mediaMatches, pageWeight } from "./site-lib.mjs";

const C = createRequire(import.meta.url)(path.join(RELEASE, "shared/pp-quote-core.js"));
const args = process.argv.slice(2);
const wanted = args.filter((a) => !a.startsWith("--")).map((a) => a.replace(/\.html$/, ""));
const STATIC_ONLY = args.includes("--static"), WITH_EXAMPLES = args.includes("--examples");
const money = (cents) => C.formatMoney(cents);

// ---- which pages -------------------------------------------------------------------------------------------------
const all = [];
for (const file of listSources()) {
  let src; try { src = readSource(file); } catch (e) { if (!wanted.length || wanted.includes(path.basename(file, ".html"))) { console.error("  " + e.message); process.exitCode = 1; } continue; }
  if (fs.existsSync(path.join(ROOT, src.out))) all.push({ ...src, html: fs.readFileSync(path.join(ROOT, src.out), "utf8") });
}
const byFile = new Map(all.map((p) => [p.out, p]));
const pick = wanted.length
  ? wanted.map((w) => all.find((p) => p.slug === w || p.out === w + ".html") || { missing: w })
  : all.filter((p) => p.kind !== "example" || WITH_EXAMPLES);
for (const p of pick.filter((x) => x.missing)) { console.error(`  ${p.missing}: no built page of that name. Build it first: node _work/build-site.mjs ${p.missing}`); process.exitCode = 1; }
const targets = pick.filter((p) => !p.missing);

// ---- POLICY-WORDING.md in the release root: the one source for every sentence about the first cleanup ------------
const policy = fs.readFileSync(path.join(RELEASE, "POLICY-WORDING.md"), "utf8").replace(/\r\n/g, "\n");
const plain = (s) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").replace(/ ([.,;:!?])/g, "$1").trim();
const policyPart = (from, to) => { const a = policy.indexOf(from); if (a < 0) throw new Error("POLICY-WORDING.md: not found: " + from); const b = policy.indexOf(to, a + from.length); return policy.slice(a + from.length, b < 0 ? policy.length : b); };
const POLICY = {
  lead: plain(policyPart("**Lead under the heading:**", "\n")),
  small: plain(policyPart("**Small print under the explainer:**", "\n")),
  items: [...policyPart('**"How the no-start-up fee works"', "**Small print under the explainer:**").matchAll(/^- \*\*(.+?)\*\* (.+)$/gm)].map((m) => [plain(m[1]), plain(m[2])]),
  short: [...policyPart("**Short forms for tight places", "\n").matchAll(/"([^"]+)"/g)].map((m) => m[1]),
};
if (POLICY.items.length !== 6) throw new Error("POLICY-WORDING.md: expected six explainer items, found " + POLICY.items.length);
// sentences that described the earlier rule or the earlier wording; none may come back
const STALE = ["Nothing is added for the first cleanup", "Visit one is billed", "We tell you before you approve it", "Extra minutes on a restart or one-time cleanup are invoiced", "base deposit", "ETA text", "the no-start-up-fee rule is for recurring service", "Introductory", "does not apply", "initial scoop"];

// ---- small helpers -----------------------------------------------------------------------------------------------
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const around = (text, index, n = 60) => "…" + text.slice(Math.max(0, index - n), index + n).trim() + "…";
const without = (text, phrases) => phrases.reduce((t, phrase) => t.split(phrase).join(" "), text);
const isKit = (p) => Boolean(p.meta.hero) && p.meta.hero.recipe === "kit";
const idsOf = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
// the split price markup ($ / dollars / cents spans) is joined back into one figure before reading
const joinPrice = (html) => html.replace(/<span class="price__(?:cur|int|cents)">([^<]*)<\/span>/g, "$1");
const stripTags = (html) => decode(joinPrice(html).replace(/<[^>]+>/g, " ")).replace(/’/g, "'").replace(/\s+/g, " ").trim();
const firstMoney = (text) => { const m = /\$(\d+)\.(\d\d)/.exec(text); return m ? Number(m[1]) * 100 + Number(m[2]) : null; };
function elementsWithAttr(html, name) {
  const out = [], re = new RegExp("<([a-z0-9]+)([^>]*\\s" + name + '="([^"]*)"[^>]*)>', "g");
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1], open = new RegExp("<" + tag + "[\\s>]", "g"), close = "</" + tag + ">";
    let depth = 1, pos = re.lastIndex;
    while (depth > 0) {
      const nextClose = html.indexOf(close, pos);
      if (nextClose < 0) throw new Error("unclosed <" + tag + "> with " + name);
      open.lastIndex = pos;
      const nextOpen = open.exec(html);
      if (nextOpen && nextOpen.index < nextClose) { depth += 1; pos = nextOpen.index + 1; } else { depth -= 1; pos = nextClose + close.length; }
    }
    out.push({ tag, attrs: m[2], value: m[3], inner: html.slice(re.lastIndex, pos - close.length) });
  }
  return out;
}

// ================================================================================================================
// The checks. Each takes the page and a report with fail(message) and note(message).
// ================================================================================================================
function checkStructure(p, r) {
  const { html } = p;
  const heads = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  const h1 = heads.filter((h) => h === 1).length;
  if (h1 !== 1) r.fail(`the page has ${h1} h1 headings; it must have exactly one (the hero's headline)`);
  if (!isKit(p)) { let prev = 0; for (const h of heads) { if (prev && h > prev + 1) r.fail(`heading order jumps from h${prev} to h${h}; never skip a level`); prev = h; } }
  const title = /<title>([\s\S]*?)<\/title>/.exec(html), desc = /<meta name="description" content="([^"]*)">/.exec(html), canon = [...html.matchAll(/<link rel="canonical" href="([^"]*)">/g)];
  if (!title || !title[1].trim()) r.fail("the <title> is missing or empty");
  if (!desc || !desc[1].trim()) r.fail("the meta description is missing or empty");
  // a page kept out of search names no canonical (the builder leaves it out); every other page names exactly one
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  if (noindex) { if (canon.length) r.fail("the page is noindex and still carries a canonical link, a mixed signal; build it again (the builder leaves the canonical out of a noindex page)"); }
  else if (canon.length !== 1 || !/^https:\/\//.test(canon[0][1])) r.fail("the page needs exactly one canonical link with a full https address");
  // what a shared link shows: title, description, address and one picture (the builder writes them; kit pages have none)
  // what a shared link shows: title, description and address (the builder writes them; kit pages have none). A picture
  // only when the page's JSON block names one ("ogImage", a full https address): never a picture nobody chose.
  if (!isKit(p)) for (const tag of ['property="og:title"', 'property="og:description"', 'property="og:url"', 'name="twitter:card"', 'name="twitter:title"', 'name="twitter:description"']) {
    const m = new RegExp("<meta " + tag + ' content="([^"]*)">').exec(html);
    if (!m || !m[1].trim()) r.fail(`the head has no ${tag.split('"')[1]} tag (a shared link would show no title or text); build the page again`);
    else if (/og:url/.test(tag) && !/^https:\/\//.test(m[1])) r.fail(`${tag.split('"')[1]} must be a full https address`);
  }
  // The picture: the page's own "ogImage", or its link preview under the site's ONE setting ("assetsBase" in
  // _work/partials/site.json: the public address of the assets). With neither, no picture is named at all.
  if (!isKit(p)) {
    const pic = /<meta property="og:image" content="([^"]*)">/.exec(html), tw = /<meta name="twitter:image" content="([^"]*)">/.exec(html), card = (/<meta name="twitter:card" content="([^"]*)">/.exec(html) || [])[1];
    const named = (p.meta && p.meta.ogImage) || "", base = siteSettings().assetsBase;
    const want = named || (base && p.kind === "page" && sharePicture(p.slug).picture ? `${base}/${sharePicture(p.slug).picture.file}` : "");
    if (!want && pic) r.fail(`the head carries og:image "${pic[1]}" but the page names no "ogImage" and the site's "assetsBase" (_work/partials/site.json) is not set; a share picture is written only when its public address is known. Build the page again`);
    if (want && (!pic || decode(pic[1]) !== want)) r.fail(`the head should carry og:image "${want}"${named ? ' (the page\'s "ogImage")' : ' (the page\'s link preview under "assetsBase")'} and does not; build the page again`);
    if (want && (!tw || decode(tw[1]) !== want)) r.fail("twitter:image is missing or differs from og:image; build the page again");
    if (card !== (want ? "summary_large_image" : "summary")) r.fail(`twitter:card is "${card}" and should be "${want ? "summary_large_image" : "summary"}"; build the page again`);
    if (pic && !/^https:\/\//.test(pic[1])) r.fail("og:image must be a full https address");
  }
  if (!isKit(p) && title && (new RegExp('<meta property="og:title" content="([^"]*)">').exec(html) || [])[1] !== title[1]) r.fail("og:title differs from the <title>; build the page again");
  // The footer's "Review build." line belongs to the review build alone ("review": true in _work/partials/site.json).
  {
    const review = siteSettings().review, line = /class="foot__review"|Review build\./.test(html);
    if (!review && line) r.fail('the page carries the review-build line ("Review build. Nothing on this page is sent anywhere...") but the site setting "review" (_work/partials/site.json) is not true; a rollout page never prints it. Build the page again');
    if (review && !line && /\sid="site-footer"/.test(html)) r.fail('the footer has no review-build line although "review" is true in _work/partials/site.json; build the page again');
  }
  const ids = idsOf(html), dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  if (dup.length) r.fail("the same id is used twice: " + dup.join(", "));
  for (const m of html.matchAll(/aria-(?:labelledby|describedby|controls)="([^"]+)"/g)) for (const id of m[1].split(" ")) if (!ids.includes(id)) r.fail(`an aria attribute points at id="${id}", which is not on the page`);
  if (!/<footer\b[^>]*\sid="site-footer"/.test(html)) r.fail('the footer has no id="site-footer" (the pinned price bar hides over it)');
  if (/class="ppb-back"/.test(html)) r.fail("the static hero card still has a Back element");
  if (/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(html)) r.fail("an emoji or pictograph character is on the page; use the brand icons");
  for (const s of isKit(p) ? [] : [...html.matchAll(/<section\b[^>]*>/g)].map((m) => m[0])) if (!/aria-labelledby=|aria-label=/.test(s)) r.fail("a <section> has neither aria-labelledby nor aria-label: " + s.slice(0, 90));
  if (p.slug === "welcome" && p.kind === "page") {
    if (!/<meta name="robots" content="[^"]*noindex/.test(html)) r.fail('the welcome page must be noindex: add "robots": "noindex" to its JSON block (BRIEF.md section 7)');
    if (!/<body[^>]*\sdata-no-price-bar/.test(html)) r.fail('the welcome page shows no price bar: add "body": { "data-no-price-bar": true } (BRIEF.md section 7)');
    if (!/<body[^>]*\sdata-audience="customer"/.test(html)) r.fail('the welcome page is for existing customers: add "audience": "customer" to its JSON block, so the header, phone menu, closing scene and footer offer the client portal, text and call instead of "Get my price"');
  }
  // a page for existing customers sells nothing: no price link, no price button, no price script
  if (/<body[^>]*\sdata-audience="customer"/.test(html)) {
    const sells = /data-purge-quote|href="(?:#quote|quote\.html)"|>\s*(?:Get|See) my price\b/.exec(html);
    if (sells) r.fail(`a page for existing customers ("audience": "customer") still offers a price: ${around(html, sells.index, 50)}`);
    if (/js\/builder\.js|pp-quote-core\.js/.test(html)) r.fail('a page for existing customers still loads the price builder scripts; build it again');
  }
  const scene = (/<picture class="cover__scene">\s*(?:<source[^>]*>\s*)*<img src="\.\.\/\.\.\/assets\/([^"]+)"/.exec(html) || [])[1];
  if (scene && GLOVED_SCENES.has(scene) && !/<body[^>]*\sdata-mascot="gloved"/.test(html)) r.fail('this hero shows the gloved mascot, so <body> needs data-mascot="gloved" (the glove rule, DESIGN.md section 10)');
  return { title: title ? decode(title[1]).trim() : "", description: desc ? decode(desc[1]).trim() : "", headings: heads.length };
}

function checkImages(p, r) {
  const imgs = [...p.html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  let lazy = 0;
  for (const im of imgs) {
    const src = attr(im, "src") || "", short = im.slice(0, 110);
    if (attr(im, "alt") === null) r.fail("an image has no alt attribute (decoration takes alt=\"\"): " + short);
    if (!/\swidth="\d+"/.test(im) || !/\sheight="\d+"/.test(im)) r.fail("an image has no width and height: " + short);
    if (/loading="lazy"/.test(im)) lazy += 1;
    if (/^https?:|^\/\//.test(src)) r.fail("an image is loaded from another site; every picture is a local file: " + src);
    else if (!fs.existsSync(path.join(ROOT, src))) r.fail("an image file does not exist: " + src);
    // pictures that carry meaning must say what they show; only icons, the logo and small mascot decorations may be silent
    if (/assets\/(heroes|scenes|photos|covers)\//.test(src) && !(attr(im, "alt") || "").trim()) r.fail("a scene, photo or cover has an empty alt; say what it shows: " + src);
    if (/assets\/photos\//.test(src) && !/^Real visit photo:/.test(attr(im, "alt") || "")) r.fail('the alt of a real job photo starts with "Real visit photo:" (DESIGN.md section 11): ' + src);
  }
  // a row of real-visit receipts says each thing once: the two photos of the kit both carry the sanitized-tools caption,
  // so a page shows one of them, never both (post-gate judges, October 10)
  const sanitized = [...p.html.matchAll(/<p class="receipt__text">([^<]*)<\/p>/g)].filter((m) => /sanitized/i.test(m[1])).length;
  if (sanitized > 1) r.fail(`${sanitized} receipts on this page say the same thing: tools are sanitized. Show one photo of the kit, not two (PHOTOS in _work/city-map.mjs; CITY-PAGES.md section 8)`);
  return { images: imgs.length, lazy };
}

// ---- SPEED (DESIGN.md "Speed", ADD-A-PAGE.md section 10) ---------------------------------------------------------
// A paid visitor arrives on a phone over mobile data, so: the hero has WebP copies in srcset and a preload in the head
// for each breakpoint; nothing a phone is given for the first screen is above about 200 KB; every script is deferred;
// every derived picture is as new as its original. It also weighs the page as a phone would receive it.
const FIRST_SCREEN_LIMIT = 210 * 1024;       // "about 200 KB"
const variantOwner = (() => { const map = new Map(); for (const [key, e] of Object.entries(derivedManifest().images)) for (const v of e.variants) map.set(v.file, key); return map; })();
function checkSpeed(p, r) {
  const { html } = p, hero = (p.meta && p.meta.hero) || {};
  const head = html.slice(0, html.indexOf("</head>"));
  const preloads = [...head.matchAll(/<link rel="preload" as="image"[^>]*>/g)].map((m) => m[0]);
  const again = "Then build the page again: node _work/build-site.mjs " + p.slug;
  // 1. the hero: WebP copies in srcset, the JPEG as the <img>, and a preload for each breakpoint
  const scenePic = /<picture class="cover__scene">([\s\S]*?)<\/picture>/.exec(html);
  if (scenePic) {
    const sources = [...scenePic[1].matchAll(/<source\b[^>]*>/g)].map((m) => m[0]), webp = sources.filter((s) => /type="image\/webp"/.test(s));
    const img = (/<img\b[^>]*>/.exec(scenePic[1]) || [""])[0], key = (/assets\/((?:heroes|scenes)\/[^"]+\.jpg)/.exec(attr(img, "src") || "") || [])[1];
    if (!/\.jpg$/.test(attr(img, "src") || "")) r.fail("the hero's <img> must stay the JPEG (the fallback for a browser without WebP)");
    if (!webp.length) r.fail(`the hero has no srcset: its picture is served as one JPEG${key && fs.existsSync(path.join(RELEASE, "assets", key)) ? " of " + Math.round(fs.statSync(path.join(RELEASE, "assets", key)).size / 1024) + " KB" : ""} at every width. ${key ? webpCopies(key).why : ""} ${again}`);
    for (const s of webp) {
      const set = attr(s, "srcset") || "", media = attr(s, "media") || "";
      if (/\s\d+w/.test(set) && !attr(s, "sizes")) r.fail("a hero <source> lists widths but has no sizes attribute: " + s.slice(0, 120));
      const want = /\s\d+w/.test(set) ? `imagesrcset="${set}"` : `href="${set}"`;
      const pre = preloads.find((l) => l.includes(want));
      if (!pre) r.fail(`the hero has no preload in the head for its ${media ? "source " + media : "main source"} (${set.split(",")[0].trim().split(" ")[0].split("/").pop()}); the first-screen picture must be asked for from the head. ${again}`);
      else if (media && !mediaMatches(media, 390) !== !mediaMatches(attr(pre, "media") || "", 390)) r.fail(`the hero's preload for ${media} carries a different media condition (${attr(pre, "media") || "none"}), so a phone would preload the wrong file`);
      else if (!/fetchpriority="high"/.test(pre)) r.fail("the hero's preload has no fetchpriority=\"high\"");
    }
    // the largest file a phone can be handed for the hero
    const phone = webp.find((s) => mediaMatches(attr(s, "media"), 390));
    if (phone) for (const c of (attr(phone, "srcset") || "").split(",").map((x) => x.trim().split(/\s+/)[0])) {
      const f = path.join(ROOT, c);
      if (fs.existsSync(f) && fs.statSync(f).size > FIRST_SCREEN_LIMIT) r.fail(`a phone can be given ${c.split("/").pop()} for the hero, which is ${Math.round(fs.statSync(f).size / 1024)} KB; nothing on the first screen of a phone may be above about 200 KB (DESIGN.md "Speed")`);
    }
  } else if (hero.pose || hero.cover) {
    if (!preloads.length) r.fail(`the hero's picture (${hero.pose ? "the pose " + hero.pose : "the cover"}) has no preload in the head. ${again}`);
  }
  for (const l of preloads) if (/\bhref="[^"]+\.jpg"/.test(l) && scenePic && /type="image\/webp"/.test(scenePic[1])) r.fail("the head preloads the hero's JPEG although the page shows its WebP copy: the picture would be fetched twice. " + again);
  // 2. every derived picture the page names exists and is as new as its original
  const named = new Set([...html.matchAll(/\.\.\/\.\.\/assets\/(derived\/[A-Za-z0-9_\-./]+\.(?:webp|png|jpg))/g)].map((m) => m[1]));
  const stale = new Set();
  for (const f of named) {
    if (!fs.existsSync(path.join(RELEASE, "assets", f))) { r.fail(`the page names assets/${f}, which does not exist. Run: node _work/perf/derive-images.mjs  ${again}`); continue; }
    const owner = variantOwner.get(f);
    if (owner && !webpCopies(owner).copies) stale.add(webpCopies(owner).why);
  }
  for (const why of stale) r.fail(`${why}  ${again}`);
  if (/assets\/derived\/brand\//.test(html) && logoFiles().why) r.fail(logoFiles().why + "  " + again);
  // 3. no script holds back the first paint
  for (const m of html.matchAll(/<script\b[^>]*\ssrc="[^"]*"[^>]*>/g)) if (!/\s(defer|async)\b/.test(m[0])) r.fail("a script is loaded without defer, so the page cannot be painted until it has arrived: " + m[0]);
  // 4. a link preview for every one of the thirty, 1200 by 630
  if (p.kind === "page") {
    const got = sharePicture(p.slug);
    if (!got.picture) r.fail(got.why);
    else { const s = imageSize(path.join(RELEASE, "assets", got.picture.file)); if (s.width !== 1200 || s.height !== 630) r.fail(`the link-preview picture assets/${got.picture.file} is ${s.width} by ${s.height}; it must be 1200 by 630`); }
  }
  // 5. the weight of the page as a phone receives it (pageWeight in site-lib.mjs)
  return { weight: pageWeight(html, ROOT) };
}

function checkLinks(p, r, site) {
  const { html } = p, ids = new Set(idsOf(html));
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  const kinds = { page: 0, anchor: 0, external: 0, tel: 0, sms: 0, mailto: 0 };
  for (const a of anchors) {
    const h = attr(a, "href");
    if (h === null) { r.fail("a link has no href: " + a.slice(0, 90)); continue; }
    if (h === "#" || h === "") r.fail('a link goes nowhere (href="' + h + '"): ' + a.slice(0, 90));
    else if (h.startsWith("#")) { kinds.anchor += 1; if (!ids.has(h.slice(1))) r.fail(`the link ${h} has no target on this page (no id="${h.slice(1)}")`); }
    else if (/^https:\/\//.test(h)) kinds.external += 1;
    else if (/^http:\/\//.test(h)) r.fail("a link uses http, not https: " + h);
    else if (h.startsWith("tel:")) { kinds.tel += 1; if (h !== "tel:+13179615865") r.fail("a phone link is not tel:+13179615865: " + h); }
    else if (h.startsWith("sms:")) { kinds.sms += 1; if (h !== "sms:+13179615865") r.fail("a text link is not sms:+13179615865: " + h); }
    else if (h.startsWith("mailto:")) kinds.mailto += 1;
    else {
      kinds.page += 1;
      const [file, frag] = h.split("#");
      if (!/^[a-z0-9-]+\.html$/.test(file) || !PAGES.includes(file.slice(0, -5))) { r.fail(`the link "${h}" does not point at one of the site's pages`); continue; }
      const target = byFile.get(file);
      if (!target) site.notBuilt.set(file, (site.notBuilt.get(file) || new Set()).add(p.out));
      else if (frag && !idsOf(target.html).includes(frag)) r.fail(`the link "${h}": ${file} has no id="${frag}"`);
    }
  }
  // a phone number a visitor can read is always a link they can tap
  // (the header's contact control shows the number on a button that opens the Text and Call links: that number is not loose)
  const loose = visibleText(html.replace(/<a\b[^>]*\shref="(?:tel|sms):[^"]*"[^>]*>[\s\S]*?<\/a>/g, " ").replace(/<button\b[^>]*\sdata-menu-btn[^>]*\saria-controls="menu-reach"[^>]*>[\s\S]*?<\/button>/g, " "));
  const phone = /\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/.exec(loose);
  if (phone) r.fail(`the phone number "${phone[0]}" is plain text; wrap it in <a href="tel:+13179615865">: ${around(loose, phone.index, 40)}`);
  if (/data-menu-btn[^>]*aria-controls="menu-reach"/.test(html) && !/id="menu-reach"[\s\S]{0,400}?href="sms:\+13179615865"[\s\S]{0,600}?href="tel:\+13179615865"/.test(html)) r.fail("the header's contact control must open the Text link and then the Call link (partials/header.html)");
  // TEXT FIRST (owner decision, October 8): wherever a page offers a phone call, a text link comes before it in the same block
  for (const block of callWithoutText(html)) r.fail(`TEXT FIRST: a call link (tel:) has no text link (sms:) before it in its block: ${block}. Put the text-first pair there: {{REACH}} (on navy {{REACH:dark}}, in a sentence {{REACH:inline}}); see ADD-A-PAGE.md section 4b`);
  {
    // (an offer is meant: "call or text us", "Call or text (317) …". A legal list such as "call or text history" is not one; a page may also name an exact phrase in "allow")
    const said = without(visibleText(html) + " " + [...html.matchAll(/\saria-label="([^"]*)"/g)].map((m) => decode(m[1])).join(" . "), (p.meta && p.meta.allow) || []);
    const hit = /\bcall(?:s|ing)?(?: us)? or (?:send (?:us )?a )?text(?:s|ing)?\b(?! (?:history|records?|logs?|data|activity|messages?)\b)/i.exec(said);
    if (hit) r.fail(`TEXT FIRST: the page says "${hit[0]}". Say "text or call", never "call or text": ${around(said, hit.index, 50)}`);
  }
  // the Google review badge is a link to the reviews page wherever it appears
  for (const m of html.matchAll(/<([a-z0-9]+)\b[^>]*\sclass="gbadge[\s"][^>]*>/g)) {
    const href = attr(m[0], "href");
    if (m[1] !== "a" || !href) r.fail("the Google review badge must be a link: " + m[0].slice(0, 90));
    else if (!/^reviews\.html(#|$)/.test(href) && !(p.slug === "reviews" && /^(#[\w-]+|https:\/\/)/.test(href))) r.fail(`the Google review badge links to "${href}"; it links to reviews.html`);
  }
  return kinds;
}

const PAGE_TYPES = ["WebPage", "CollectionPage", "AboutPage", "ContactPage"];   // schema.type in a page's JSON block
function checkStructuredData(p, r) {
  const blocks = [];
  for (const raw of jsonLdBlocks(p.html)) { try { blocks.push(JSON.parse(raw)); } catch (e) { r.fail("a structured-data block is not valid JSON: " + e.message); } }
  const text = JSON.stringify(blocks);
  if (/AggregateRating|aggregateRating|"@type":"Review"|"review":|ratingValue/.test(text) || /itemprop="(review|ratingValue|aggregateRating)"/.test(p.html)) r.fail("rating or review markup is present; AggregateRating and Review are never used");
  if (/streetAddress/.test(text)) r.fail("a street address is in the structured data; the business has a mailing address only");
  const shown = faqPairs(p.html), faq = blocks.filter((d) => d["@type"] === "FAQPage");
  if (!shown.length && faq.length) r.fail("FAQPage data is present but the page shows no questions");
  if (shown.length) {
    if (faq.length !== 1) r.fail(`the page shows ${shown.length} questions but has ${faq.length} FAQPage blocks (the builder writes one; build the page again)`);
    else {
      const data = faq[0].mainEntity || [];
      if (data.length !== shown.length) r.fail(`FAQPage lists ${data.length} questions, the page shows ${shown.length}`);
      shown.forEach((q, i) => {
        if (!data[i]) return;
        if (data[i].name !== q.question) r.fail(`FAQPage question ${i + 1} is "${data[i].name}", the page shows "${q.question}"`);
        else if ((data[i].acceptedAnswer || {}).text !== q.answer) r.fail(`FAQPage answer ${i + 1} ("${q.question}") differs from the answer shown`);
      });
    }
  }
  if (!isKit(p) && !blocks.some((d) => (d["@graph"] || []).some((n) => PAGE_TYPES.includes(n["@type"]) && /#webpage$/.test(n["@id"] || "")))) r.fail("no WebPage structured data (the builder writes it; build the page again)");
  // one of each: the page is described once and carries one breadcrumb trail (the builder merges what a page adds in schema.extra)
  const nodes = blocks.flatMap((d) => d["@graph"] || [d]), own = (/<link rel="canonical" href="([^"]*)">/.exec(p.html) || [])[1] || (/<meta property="og:url" content="([^"]*)">/.exec(p.html) || [])[1] || "";
  const pageNodes = nodes.filter((n) => PAGE_TYPES.includes([].concat(n["@type"])[0]) && (!n.url || !own || n.url === own));
  if (!isKit(p) && pageNodes.length > 1) r.fail(`the structured data describes this page ${pageNodes.length} times (${pageNodes.map((n) => n["@type"] + " " + (n["@id"] || "")).join(", ")}); one WebPage node. Build the page again: the builder merges a page node given in schema.extra`);
  const trails = nodes.filter((n) => n["@type"] === "BreadcrumbList").length;
  if (trails > 1) r.fail(`the structured data carries ${trails} BreadcrumbList nodes; a page has one trail. Give the trail in schema.breadcrumb (parents as { "name", "page" }) and take it out of schema.extra`);
  return { faq: shown.length, jsonLd: blocks.map((d) => d["@type"] || (d["@graph"] || []).map((n) => n["@type"]).join("+")).join(", ") };
}

// TEXT FIRST. Walks the page's elements in order. A call link passes when a text link came before it inside the same
// block: the nearest enclosing elements, up to five levels, without leaving the section, header, footer, menu or form it
// is in. Returns one description per call link that has none.
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
function callWithoutText(html) {
  const start = html.indexOf("<body"), body = start < 0 ? html : html.slice(start);
  const re = /<!--[\s\S]*?-->|<(script|style|svg)\b[\s\S]*?<\/\1>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const stack = [], out = [];
  const cls = (el) => (attr("<x" + el.attrs + ">", "class") || "").split(/\s+/).filter(Boolean);
  const edge = (el) => ["body", "main", "section", "header", "footer", "nav", "aside", "dialog", "form"].includes(el.tag) || cls(el).includes("mnav");
  const label = (el) => el.tag + (attr("<x" + el.attrs + ">", "id") ? "#" + attr("<x" + el.attrs + ">", "id") : cls(el).length ? "." + cls(el)[0] : "");
  let m;
  while ((m = re.exec(body))) {
    if (m[2]) { const tag = m[2].toLowerCase(); let i = stack.length - 1; while (i >= 0 && stack[i].tag !== tag) i -= 1; if (i >= 0) stack.length = i; continue; }
    if (!m[3]) continue;
    const tag = m[3].toLowerCase(), attrs = m[4] || "";
    if (tag === "a") {
      const href = attr("<a" + attrs + ">", "href") || "";
      if (href.startsWith("sms:")) for (const el of stack) el.sms = true;
      else if (href.startsWith("tel:")) {
        let ok = false;
        for (let i = stack.length - 1, depth = 0; i >= 0 && depth < 5; i -= 1, depth += 1) { if (stack[i].sms) { ok = true; break; } if (edge(stack[i])) break; }
        if (!ok) {
          const inner = stack.slice(-2).map(label).join(" > "), home = [...stack].reverse().find((el) => attr("<x" + el.attrs + ">", "id") || ["section", "header", "footer"].includes(el.tag) || cls(el).includes("mnav"));
          const words = stripTags(body.slice(m.index, body.indexOf("</a>", m.index))).slice(0, 40);
          out.push(`"${words}" in <${inner}>${home ? " (" + label(home) + ")" : ""}`);
        }
      }
    }
    if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(attrs)) stack.push({ tag, attrs, sms: false });
  }
  return out;
}

// THE ONE SWITCH FOR THE GOOGLE RATING (_work/partials/reviews.json). No page holds a figure of its own: every line that
// shows one is a hook (data-pp-reviews, its wording with {rating} and {count}) filled by the builder, and each badge or
// fact that holds a stand-in figure is marked data-standin. With no stand-in in the file, the lines are the neutral ones.
const REVIEWS = JSON.parse(fs.readFileSync(path.join(PARTIALS_DIR, "reviews.json"), "utf8"));
const STANDIN = process.env.PP_REVIEWS === "neutral" ? null : REVIEWS.standin || null;
function checkReviews(p, r) {
  const { html } = p;
  const fill = (line) => (STANDIN ? line.replace(/\{rating\}/g, STANDIN.rating).replace(/\{count\}/g, String(STANDIN.count)) : line);
  let hooks = 0;
  for (const m of html.matchAll(/<([a-z0-9]+)\b((?:[^>"]|"[^"]*")*?)\sdata-pp-reviews="([^"]*)"((?:[^>"]|"[^"]*")*)>([^<]*)<\/\1>/g)) {
    hooks += 1;
    const neutral = (/\sdata-pp-neutral="([^"]*)"/.exec(m[2] + m[4]) || [])[1] || "", want = STANDIN ? fill(m[3]) : neutral;
    if (m[5] !== want) r.fail(`a rating line reads "${decode(m[5])}" but the one switch (_work/partials/reviews.json) makes it "${decode(want)}"; nobody types a rating into a page. Build the page again`);
  }
  if ((html.match(/\sdata-pp-reviews="/g) || []).length !== hooks) r.fail("a line marked data-pp-reviews holds more than plain text; build the page again");
  const marked = elementsWithAttr(html, "data-standin");
  if (!STANDIN && marked.length) r.fail('reviews.json has no stand-in rating, but something on the page is still marked data-standin="true"; build the page again');
  for (const el of marked) {
    const rest = el.inner.replace(/<([a-z0-9]+)\b[^>]*\sdata-pp-reviews="[^"]*"[^>]*>[^<]*<\/\1>/g, " ");
    const typed = /\d/.exec(visibleText(rest));
    if (typed) r.fail(`a stand-in badge holds a figure the rating switch cannot reach: ${around(visibleText(rest), typed.index, 30)}. Use the standard badge (kit.html, 06 Google badge) or mark the line with data-pp-reviews`);
    if (STANDIN && !/data-pp-reviews="/.test(el.inner)) r.fail('something is marked data-standin="true" but holds no rating line (data-pp-reviews)');
  }
  // a rating or a review count typed anywhere else on the page
  const plainText = visibleText(html.replace(/<([a-z0-9]+)\b[^>]*\sdata-pp-reviews="[^"]*"[^>]*>[^<]*<\/\1>/g, " "));
  const loose = /\b[1-5]\.\d(?= ?(?:stars?\b|star rating|on Google|out of 5|from \d+ (?:Google )?reviews))|\b\d+ (?:Google |five-star |5-star )?reviews\b|\brated [1-5](?:\.\d)?\b/i.exec(plainText);
  if (loose) r.fail(`a rating or a review count is typed into the page ("${loose[0]}"): ${around(plainText, loose.index, 40)}. It must come from the one switch: the standard badge, or a line marked data-pp-reviews`);
  for (const m of html.matchAll(/<[a-z0-9]+\b(?:[^>"]|"[^"]*")*\saria-label="([^"]*)"(?:[^>"]|"[^"]*")*>/g)) if (/\b[1-5]\.\d from \d+|\b\d+ (?:Google )?reviews\b/i.test(m[1]) && !/\sdata-pp-reviews-label="/.test(m[0])) r.fail(`an aria-label holds a rating that the switch cannot reach: "${decode(m[1])}"`);
  return { ratingLines: hooks };
}

// A family's own stylesheet (css/family-<name>.css) may add components but never restyle the system: every selector
// carries a class that starts with the family's name, and every colour written as a hex code is one of the tokens.
const TOKEN_COLOURS = (() => {
  const css = fs.readFileSync(path.join(ROOT, "css/site.css"), "utf8"), a = css.indexOf(":root {");
  return new Set((css.slice(a, css.indexOf("\n}", a)).match(/#[0-9a-f]{3,8}\b/gi) || []).map((c) => c.toLowerCase()).concat(["#fff", "#000"]));
})();
const SHARED_CLASSES = new Set((fs.readFileSync(path.join(ROOT, "css/site.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").match(/\.[a-z][\w-]*/g) || []).map((c) => c.slice(1)));
function checkFamilyCss(p, r) {
  const files = [...p.html.matchAll(/<link rel="stylesheet" href="(css\/family-([a-z0-9-]+)\.css)">/g)];
  for (const [, file, name] of files) {
    const css = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      const prelude = m[1].trim();
      if (!prelude || prelude.startsWith("@") || /^(from|to|\d+(\.\d+)?%)(\s*,\s*(from|to|\d+(\.\d+)?%))*$/.test(prelude)) continue;
      // a selector list is split at its own commas only, never at one inside :is(…), :not(…) or :where(…)
      const selectors = []; { let depth = 0, cur = ""; for (const ch of prelude) { if (ch === "(") depth += 1; else if (ch === ")") depth -= 1; if (ch === "," && depth === 0) { selectors.push(cur.trim()); cur = ""; } else cur += ch; } selectors.push(cur.trim()); }
      // a family whose name is also a shared class (.areas) must use its own prefix (.areas-…): the bare class is the shared component
      const own = SHARED_CLASSES.has(name) ? new RegExp(`\\.${name}[-_][\\w-]`) : new RegExp(`\\.${name}(-|_|\\b)`);
      for (const selector of selectors) if (!own.test(selector)) r.fail(`${file}: the selector "${selector}" has no class of this family (.${name}-…). A family file adds its own components; it never restyles a shared one. A defect in a shared component is fixed in site.css.`);
    }
    for (const c of new Set((css.match(/#[0-9a-f]{3,8}\b/gi) || []).map((x) => x.toLowerCase()))) if (!TOKEN_COLOURS.has(c)) r.fail(`${file}: the colour ${c} is not one of the tokens in css/site.css (:root). Use var(--navy), var(--cyan) and the rest; no new colours.`);
    if (/@import|url\(\s*['"]?https?:/.test(css)) r.fail(`${file}: nothing is loaded from another site and no @import; every file is local.`);
    if (!fs.existsSync(path.join(ROOT, `kit-${name}.html`))) r.fail(`${file} is used, but the family has no kit page yet: add _work/pages/kit-${name}.html and show each new component there (ADD-A-PAGE.md).`);
  }
  return { familyCss: files.map((f) => f[1]).join(", ") };
}

// Wording. A page may name exact phrases in "allow" (its JSON block) when one of these words is used for something
// that has nothing to do with the first cleanup, for example the FAQ question "Do you offer one-time cleanups?".
function checkWording(p, r) {
  const allow = (p.meta && p.meta.allow) || [];
  const text = visibleText(p.html), checked = without(text, allow);
  const how = ' If this is not about the first cleanup or the start-up fee, add the exact phrase to "allow" in the page\'s JSON block; otherwise use the wording in POLICY-WORDING.md.';
  for (const [re, label] of [[/initial scoop/i, "initial scoop"], [/surcharge/i, "surcharge"], [/waive/i, "waived"], [/promotion/i, "promotion"], [/\boffer/i, "offer"]]) {
    const hit = re.exec(checked);
    if (hit) r.fail(`the word "${label}" is in the visible text: ${around(checked, hit.index)}${how}`);
  }
  for (const raw of jsonLdBlocks(p.html)) {
    const data = without(decode(raw), allow).replace(/"@type":"(Offer|AggregateOffer)"|"offers":|"makesOffer":|"hasOfferCatalog":|"OfferCatalog"|"itemOffered":/g, " ");   // schema.org names no visitor reads
    const hit = /initial scoop|surcharge|waive|promotion|\boffer/i.exec(data);
    if (hit) r.fail(`the word "${hit[0]}" is in the structured data: ${around(data, hit.index)}${how}`);
  }
  for (const old of STALE) if (checked.includes(old)) r.fail(`wording from before the October 8 decision is back: "${old}"${how}`);
  // the on-the-way text arrives "generally 10 to 45 minutes before arrival" (owner, October 8): the one other number of minutes a page may state
  for (const m of checked.replace(/\b10(?: to |[–-])45 minutes before arrival/g, " ").matchAll(/(\d+)[ -]minutes?\b/g)) if (!["30", "120"].includes(m[1])) r.fail(`"${m[0]}" is stated; the only time allowances are 30 and 120 minutes: ${around(checked, m.index, 40)}${how}`);
  const free = /\bfree first|first cleanup (is )?free|unlimited/i.exec(checked);
  if (free) r.fail(`a free or unlimited first cleanup is promised: ${around(checked, free.index, 40)}${how}`);

  // the explainer, wherever it is used: six items in order, word for word, and the small print directly under it
  const explainers = [...p.html.matchAll(/<details class="explain"[\s\S]*?<\/details>(\s*<p class="explain__small">([\s\S]*?)<\/p>)?/g)];
  for (const block of explainers) {
    if (!block[1]) r.fail("the explainer is not followed by its small print (p.explain__small); use the {{EXPLAIN}} token");
    else if (plain(visibleText(block[2])) !== POLICY.small) r.fail("the small print under the explainer differs from POLICY-WORDING.md: " + plain(visibleText(block[2])));
    const pairs = [...block[0].matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)].map((m) => [plain(visibleText(m[1])), plain(visibleText(m[2]))]);
    if (pairs.length !== 6) r.fail(`the explainer has ${pairs.length} items, not six`);
    POLICY.items.forEach((want, i) => {
      const got = pairs[i] || ["", ""];
      if (got[0] !== want[0]) r.fail(`explainer item ${i + 1} is titled "${got[0]}"; POLICY-WORDING.md says "${want[0]}"`);
      if (got[1] !== want[1]) r.fail(`explainer item ${i + 1} differs from POLICY-WORDING.md: "${got[1]}"`);
    });
    if (/<h3|faq__/.test(block[0])) r.fail("the explainer must not be an FAQ entry");
    if (!text.includes("How the no-start-up fee works")) r.fail("the explainer title is missing");
    if (!text.includes(POLICY.short[1])) r.fail(`the explainer sub-line is missing: "${POLICY.short[1]}"`);
    for (const must of ["$89.99", "first 30 minutes", "$1 per minute", "two hours (120 minutes)", "when we text that we are on the way"]) if (!text.includes(must)) r.fail("a figure or timing of the rule is missing beside the explainer: " + must);
  }
  // the full "No start-up fee" section (id="start-up-fee"): the lead, the explainer and the claim in its short form
  if (/\sid="start-up-fee"/.test(p.html)) {
    if (!explainers.length) r.fail('the section id="start-up-fee" has no explainer; add {{EXPLAIN}}');
    if (!text.includes(POLICY.lead)) r.fail("the lead of the no-start-up-fee section is not the sentence in POLICY-WORDING.md");
    if (!text.includes(POLICY.short[0])) r.fail(`the claim's short form is missing: "${POLICY.short[0]}"`);
  }
  return { explainers: explainers.length, allowed: allow.length };
}

// Prices. Every figure a visitor can read is one the engine produces; nothing is typed from memory.
const BASE = { yardSizeId: C.YARD_SIZES[0].id, areaIds: [C.AREAS[0].id] };   // one area, the smallest yard
const RECURRING = C.FREQUENCIES.filter((f) => !f.custom && !f.anyDogs);       // twice, weekly, every other week
function enginePrice(key) {
  if (key === "onetime") return C.ONE_TIME.baseCents;
  const [frequencyId, dogs] = key.split(":");
  const q = C.calculateQuote({ dogs: Number(dogs), frequencyId, ...BASE });
  return q && q.ok && !q.custom ? q.priceCents : null;
}
function checkPrices(p, r) {
  const { html } = p, allow = (p.meta && p.meta.allow) || [];
  // 1. every element that carries a price key shows the engine's figure
  const priced = elementsWithAttr(html, "data-price");
  for (const el of priced) {
    const shown = firstMoney(stripTags(el.inner)), want = enginePrice(el.value);
    if (want === null) r.fail(`data-price="${el.value}" is not a price the engine has`);
    else if (shown !== want) r.fail(`data-price="${el.value}" shows ${shown === null ? "no price" : money(shown)}; the engine says ${money(want)}`);
  }
  // 2. a full price list (rows with data-min): every combination the engine has is listed once, every other is marked
  const rows = elementsWithAttr(html, "data-min").map((el) => ({ min: Number(el.value), max: Number(attr(el.attrs, "data-max")), price: attr(el.attrs, "data-price"), na: attr(el.attrs, "data-na"), text: stripTags(el.inner) }));
  if (rows.length) {
    for (const f of RECURRING) {
      for (let dogs = 1; dogs <= 9; dogs += 1) {
        const allowed = C.frequencyEligibility(f.id, dogs, BASE.yardSizeId).allowed;
        const priceRows = rows.filter((x) => x.price === `${f.id}:${dogs}`), naRows = rows.filter((x) => x.na === f.id && dogs >= x.min && dogs <= x.max);
        if (allowed) {
          if (priceRows.length !== 1) r.fail(`price list: ${f.label}, ${dogs} dogs should have exactly one price row (found ${priceRows.length})`);
          if (naRows.length) r.fail(`price list: ${f.label}, ${dogs} dogs has a price but also sits in a "not available" row`);
          if (priceRows[0] && !(priceRows[0].min === dogs && priceRows[0].max === dogs && new RegExp("^" + dogs + " dogs?\\b").test(priceRows[0].text))) r.fail(`price list: the ${f.label} row for ${dogs} dogs is labelled "${priceRows[0].text}"`);
        } else {
          if (priceRows.length) r.fail(`price list: ${f.label}, ${dogs} dogs is not sold by the engine but has a price row`);
          if (naRows.length !== 1) r.fail(`price list: ${f.label}, ${dogs} dogs should sit in one "not available" row (found ${naRows.length})`);
          if (naRows[0] && !naRows[0].text.includes("up to " + f.maxDogs + " dogs")) r.fail(`price list: the ${f.label} "not available" row must give the reason "up to ${f.maxDogs} dogs" (says "${naRows[0].text}")`);
        }
      }
      if (!html.includes(`1 to ${f.maxDogs} dogs`)) r.fail(`the options card for ${f.label} should say "1 to ${f.maxDogs} dogs"`);
    }
    if (rows.some((x) => x.max > 9)) r.fail("price list: a row covers more than 9 dogs; 10 or more is a custom quote");
  }
  // 3. add-on amounts (the dog waste removal page only)
  const adders = elementsWithAttr(html, "data-adder");
  for (const el of adders) {
    const [kind, id] = el.value.split(":"), text = stripTags(el.inner);
    if (kind === "yard") {
      const y = C.YARD_SIZES.find((s) => s.id === id);
      if (!y) r.fail(`data-adder: unknown yard size "${id}"`);
      else if (y.custom) { if (!/custom quote/i.test(text) || firstMoney(text) !== null) r.fail(`${y.label} must read "Custom quote" (reads "${text}")`); }
      else if (y.addCents === 0) { if (!/included/i.test(text) || firstMoney(text) !== null) r.fail(`${y.label} must read "Included" (reads "${text}")`); }
      else if (firstMoney(text) !== y.addCents || !text.includes("+")) r.fail(`${y.label} shows "${text}"; the engine says +${money(y.addCents)}`);
    } else if (kind === "areas") {
      const cents = C.AREA_ADDERS_CENTS[id];
      if (cents === undefined) r.fail(`data-adder: the engine has no amount for ${id} areas`);
      else if (cents === 0) { if (!/included/i.test(text) || firstMoney(text) !== null) r.fail(`${id} area must read "Included" (reads "${text}")`); }
      else if (firstMoney(text) !== cents || !text.includes("+")) r.fail(`${id} areas shows "${text}"; the engine says +${money(cents)}`);
    } else r.fail(`data-adder: unknown kind "${kind}"`);
  }
  if (adders.length) {
    if (p.slug !== "dog-waste-removal") r.fail("add-on amounts appear only on the dog waste removal page (DESIGN.md section 14)");
    if (adders.filter((a) => a.value.startsWith("yard:")).length !== C.YARD_SIZES.length) r.fail(`every yard size should be listed (${C.YARD_SIZES.length})`);
    if (adders.filter((a) => a.value.startsWith("areas:")).length !== Object.keys(C.AREA_ADDERS_CENTS).length) r.fail("every area count should be listed");
  }
  // 4. a worked example adds up exactly as the engine does
  const examples = elementsWithAttr(html, "data-example").map((ex) => {
    const spec = Object.fromEntries(ex.value.split(";").map((kv) => kv.split("=")));
    return { ex, q: C.calculateQuote({ dogs: Number(spec.dogs), frequencyId: spec.freq, yardSizeId: spec.yard, areaIds: (spec.areas || "").split(",") }) };
  });
  for (const { ex, q } of examples) {
    if (!q.ok || q.custom) { r.fail(`the worked example ${ex.value} is not a standard quote`); continue; }
    const lines = Object.fromEntries(elementsWithAttr(ex.inner, "data-line").map((l) => [l.value, firstMoney(stripTags(l.inner))]));
    for (const [line, cents] of [["base", q.baseCents], ["yard", q.yardAddCents], ["areas", q.areaAddCents], ["total", q.priceCents]]) if (lines[line] !== cents) r.fail(`worked example: the ${line} line shows ${money(lines[line] ?? 0)}; the engine says ${money(cents)}`);
  }
  // 5. no other dollar figure anywhere on the page (text, alt and aria-label attributes, structured data)
  const ok = new Set(["$0", "$" + C.ONE_TIME.extraPerMinuteCents / 100, money(C.ONE_TIME.baseCents)]);
  for (const f of RECURRING) for (const cents of Object.values(f.prices)) ok.add(money(cents));
  if (adders.length) { for (const y of C.YARD_SIZES) if (y.addCents) ok.add(money(y.addCents)); for (const cents of Object.values(C.AREA_ADDERS_CENTS)) if (cents) ok.add(money(cents)); }
  for (const { q } of examples) if (q.ok && !q.custom) ok.add(money(q.priceCents));
  const flat = without(decode(joinPrice(html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " "))), allow);
  const figures = flat.match(/\$\d[\d,]*(?:\.\d\d)?/g) || [];
  for (const t of new Set(figures)) if (!ok.has(t)) r.fail(`"${t}" is on the page but is not a figure the price engine produces. Mark a real price with data-price="weekly:2" and copy it from the engine; a figure that is not a service price (a legal page, say) goes in "allow" as the exact phrase.`);
  // 6. the one-time allowance is the engine's
  for (const m of flat.match(/first (\d+) minutes/g) || []) if (m !== `first ${C.ONE_TIME.includedMinutes} minutes`) r.fail(`"${m}" is stated but the engine's allowance is ${C.ONE_TIME.includedMinutes} minutes`);
  return { keyed: priced.length, figures: figures.length, rows: rows.length, adders: adders.length };
}

// The page in a real browser, phone and desktop: nothing may fail to load, throw, or scroll sideways.
const PROBE = `(() => { const out = { gloved: document.body.getAttribute("data-mascot") === "gloved", bare: [] };
  if (out.gloved) for (const im of document.querySelectorAll('img[src*="/brand/poses/"], img[src*="/assets/scenes/"]')) {
    { const src = im.getAttribute("src") || ""; if (src.endsWith("/scenes/golden.jpg") || src.endsWith("/scenes/lab.jpg")) continue; }   // dog-only pictures: no mascot, so no hands to compare
    const b = im.getBoundingClientRect(), cs = getComputedStyle(im);
    let shown = b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && Number(cs.opacity) > 0;
    for (let e = im; shown && e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden") shown = false; }
    if (shown && b.top < innerHeight * 2 && b.right > 0 && b.left < innerWidth) out.bare.push(im.getAttribute("src").split("/").slice(-2).join("/"));
  }
  // a hero with the price card, on a phone: the keyword line and the title must take the number of lines the hero is
  // set for (--kw-lines, --title-lines), or the card ends below the first screen on a short phone (DESIGN.md section 12)
  const cover = document.querySelector(".cover"), card = cover && cover.querySelector(".cover__builder");
  if (card && innerWidth < 700) {
    const lines = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    const set = (name) => Number(getComputedStyle(cover).getPropertyValue(name));
    out.hero = { kw: lines(cover.querySelector(".cover__kw")), title: lines(cover.querySelector(".cover__title")), kwSet: set("--kw-lines"), titleSet: set("--title-lines"), cardBottom: Math.round(card.getBoundingClientRect().bottom + scrollY), screen: innerHeight };
  }
  // the gold spark beside the hero's cyan line: fully visible, or not there at all
  const spark = cover && cover.querySelector(".spark");
  if (spark && getComputedStyle(spark, "::after").content !== "none") {
    const rects = spark.getClientRects(), last = rects[rects.length - 1], after = getComputedStyle(spark, "::after");
    const left = (getComputedStyle(spark).display === "block" ? spark.getBoundingClientRect().right : last.right) + parseFloat(after.marginLeft), right = left + parseFloat(after.width);
    const c = card ? card.getBoundingClientRect() : null;
    if (c && right > c.left + 2 && left < c.right && last.bottom > c.top && last.top < c.bottom) out.spark = "under the price card by " + Math.round(right - c.left) + "px";
    else if (right > document.documentElement.clientWidth) out.spark = "off the screen by " + Math.round(right - document.documentElement.clientWidth) + "px";
  }
  // <main> clips what runs off the side instead of scrolling, so look for words, pictures and controls that are cut
  const lost = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return true; if (e !== el && /(auto|scroll)/.test(s.overflowX)) return true; } return false; };
  out.cut = [];
  for (const el of document.querySelectorAll("main p, main h1, main h2, main h3, main h4, main li, main a, main button, main img, main table, main dl, main input, main summary, footer p, footer a, footer li")) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height || (b.right <= innerWidth + 2 && b.left >= -2)) continue;
    if (el.closest('[aria-hidden="true"], .cover__scene, .foot__pic, .vh, dialog') || lost(el)) continue;
    out.cut.push(el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "") + " '" + (el.textContent || el.getAttribute("src") || "").trim().slice(0, 30) + "'");
  }
  // SPEED: the file each picture on the first screen was really taken from (the browser's own choice from srcset)
  // (a native GoHighLevel post is left out: on the live blog GoHighLevel serves the cover in its own sizes; the review
  //  page shows the published file as it is. It is reported, not failed.)
  const onFirst = [...document.images].filter((im) => { const b = im.getBoundingClientRect(); return b.width > 1 && b.height > 1 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth && !lost(im); });
  out.first = [...new Set(onFirst.filter((im) => !im.closest("[data-guide-css]")).map((im) => im.currentSrc || im.src))];
  out.native = [...new Set(onFirst.filter((im) => im.closest("[data-guide-css]")).map((im) => im.currentSrc || im.src))];
  return JSON.stringify(out); })()`;
const SIZES = [["390", ["--mobile"]], ["1440", ["--w", "1440", "--h", "900"]]];
// one page at one size; the first screen is saved to shots/check/ so there is something to look at
function loadInBrowser(p, name, flags) {
  const shot = path.join(ROOT, "shots", "check", `${p.out.replace(/\.html$/, "")}-${name}.jpg`);
  const cli = [((process.env.PP_PPTR_DIR || "tools/pptr") + "/shot.mjs"), "--url", path.join(ROOT, p.out), "--out", shot, "--no-motion", "--steps", JSON.stringify([{ eval: PROBE }]), ...flags];
  return new Promise((resolve) => {
    execFile("node", cli, { encoding: "utf8", maxBuffer: 1 << 26 }, (error, out) => {
      try { resolve({ name, rep: JSON.parse(out.slice(out.indexOf("{"))) }); } catch (e) { resolve({ name, error: String((error && error.message) || e.message).slice(0, 200) }); }
    });
  });
}
function readBrowserReport(r, { name, rep, error }) {
  if (error) { r.fail(`${name}px: the page could not be loaded in the browser: ${error}`); return null; }
  if (rep.consoleErrors.length) r.fail(`${name}px: console errors: ${JSON.stringify(rep.consoleErrors).slice(0, 400)}`);
  if (rep.failedRequests.length) r.fail(`${name}px: failed requests: ${JSON.stringify(rep.failedRequests).slice(0, 400)}`);
  if (rep.brokenImages.length) r.fail(`${name}px: broken images: ${JSON.stringify(rep.brokenImages).slice(0, 400)}`);
  if (rep.horizontalOverflow) r.fail(`${name}px: the page scrolls sideways by ${rep.overflowBy}px`);
  if ((rep.h1 || []).length !== 1) r.fail(`${name}px: the browser finds ${(rep.h1 || []).length} h1 headings`);
  const probe = rep.evals && rep.evals[0] ? JSON.parse(rep.evals[0]) : { bare: [], cut: [] };
  if (probe.hero) {
    const h = probe.hero;
    if (h.kw !== h.kwSet) r.fail(`${name}px: the hero's keyword line takes ${h.kw} line(s) on a phone but the hero is set for ${h.kwSet}. Add "kwLines": ${h.kw} to "hero" in the JSON block (or shorten the line), or the price card ends below the first screen on a short phone.`);
    if (h.title !== h.titleSet) r.fail(`${name}px: the hero's title takes ${h.title} line(s) on a phone but the hero is set for ${h.titleSet}. Add "titleLines": ${h.title} to "hero" in the JSON block (or shorten the title).`);
    if (h.cardBottom > h.screen) r.fail(`${name}px: the price card ends ${h.cardBottom - h.screen}px below the first screen; the whole card belongs on the first screen (DESIGN.md section 12).`);
  }
  if (probe.spark) r.fail(`${name}px: the gold spark beside the hero's cyan line is ${probe.spark}. Shorten the line, or leave the spark off with "spark": false in "hero"`);
  if (probe.cut.length) r.fail(`${name}px: content is cut off at the side of the screen: ${probe.cut.slice(0, 4).join(", ")}${probe.cut.length > 4 ? " and " + (probe.cut.length - 4) + " more" : ""}`);
  if (probe.bare.length) r.fail(`${name}px: a bare-handed mascot (${[...new Set(probe.bare)].join(", ")}) is in the first two screens of a page whose hero shows the gloved mascot (the glove rule, DESIGN.md section 10)`);
  // SPEED, on the phone: no picture on the first screen above about 200 KB (the file the browser itself chose)
  let first = "";
  if (name === "390" && probe.first) {
    const files = probe.first.filter((u) => /^file:/.test(u)).map((u) => { try { return fileURLToPath(u); } catch { return ""; } }).filter((f) => f && fs.existsSync(f));
    for (const f of files) if (fs.statSync(f).size > FIRST_SCREEN_LIMIT) r.fail(`${name}px: a picture on the first screen is ${Math.round(fs.statSync(f).size / 1024)} KB (${path.relative(RELEASE, f).replace(/\\/g, "/")}); at phone width nothing on the first screen may be above about 200 KB. A hero needs its WebP copies (node _work/perf/derive-images.mjs, then build); any other picture needs a smaller file.`);
    first = `, first screen ${files.length} pictures ${Math.round(files.reduce((n, f) => n + fs.statSync(f).size, 0) / 1024)} KB`;
    const native = (probe.native || []).filter((u) => /^file:/.test(u)).map((u) => { try { return fileURLToPath(u); } catch { return ""; } }).filter((f) => f && fs.existsSync(f));
    if (native.length) first += ` (and the native post's own cover, ${Math.round(native.reduce((n, f) => n + fs.statSync(f).size, 0) / 1024)} KB as published: GoHighLevel serves its own sizes on the live blog)`;
  }
  return `${name}px ${rep.pageHeight}px tall${first}`;
}
// every page at both sizes, four browsers at a time
async function browserPass(results) {
  const jobs = results.flatMap((res) => SIZES.map(([name, flags]) => ({ res, name, flags })));
  let next = 0;
  const worker = async () => { while (next < jobs.length) { const job = jobs[next]; next += 1; job.out = await loadInBrowser(job.res.p, job.name, job.flags); } };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  for (const res of results) res.info.browser = jobs.filter((j) => j.res === res).map((j) => readBrowserReport(res.r, j.out)).filter(Boolean).join(", ");
}

// ================================================================================================================
// Run
// ================================================================================================================
const site = { notBuilt: new Map() };
let failed = 0;
const facts = new Map();   // title and description of every built page, for the uniqueness check
for (const p of all.filter((x) => x.kind === "page")) {
  const t = /<title>([\s\S]*?)<\/title>/.exec(p.html), d = /<meta name="description" content="([^"]*)">/.exec(p.html);
  facts.set(p.out, { title: t ? decode(t[1]).trim().toLowerCase() : "", description: d ? decode(d[1]).trim().toLowerCase() : "" });
}
const results = targets.map((p) => {
  const fails = [], info = {}, r = { fail: (m) => fails.push(m) };
  try {
    Object.assign(info, checkStructure(p, r), checkImages(p, r), checkSpeed(p, r), { links: checkLinks(p, r, site) }, checkStructuredData(p, r), checkReviews(p, r), checkFamilyCss(p, r), checkWording(p, r), checkPrices(p, r));
    if (p.kind === "page") for (const field of ["title", "description"]) for (const [other, f] of facts) if (other !== p.out && f[field] && f[field] === facts.get(p.out)[field]) r.fail(`the ${field} is the same as on ${other}; every page needs its own`);
  } catch (e) { r.fail("the check itself stopped: " + e.message); }
  return { p, r, fails, info };
});
if (!STATIC_ONLY) await browserPass(results);
for (const { p, fails, info } of results) {
  console.log(`${fails.length ? "FAIL" : "PASS"}  ${p.out}`);
  console.log(`      ${info.headings} headings · ${info.images} images (${info.lazy} lazy) · links ${JSON.stringify(info.links || {})} · FAQ ${info.faq} · JSON-LD ${info.jsonLd || "none"}`);
  console.log(`      prices: ${info.keyed} keyed, ${info.figures} dollar figures read, ${info.rows} price-list rows, ${info.adders} add-on lines · explainers ${info.explainers} · allowed phrases ${info.allowed}${info.browser ? " · browser: " + info.browser : STATIC_ONLY ? " · browser pass skipped (--static)" : ""}`);
  if (info.weight) { const w = info.weight, kb = (n) => Math.round(n / 1024).toLocaleString("en-US"); console.log(`      weight on a phone: ${kb(w.total)} KB as sent (page ${kb(w.page)}, stylesheets ${kb(w.styles)}, scripts ${kb(w.scripts)}, pictures ${kb(w.pictures)} of which ${kb(w.eager)} are not lazy)${w.heroFile ? " · hero file " + w.heroFile.split("/").pop() : ""}`); }
  for (const m of fails) console.log("      FAIL " + m);
  if (fails.length) failed += 1;
}
// SPEED: the weight of every checked page of the thirty, lightest first (what a 390px phone with two pixels per point
// receives if it scrolls the whole page: the page, its stylesheets and scripts compressed as a host sends them, and
// every picture in the HTML in the size that phone takes. Not counted: the fonts, the three pictures the stylesheet
// asks for and the icons the price builder fetches for its later steps.)
{
  const rows = results.filter((x) => x.p.kind === "page" && x.info.weight).sort((a, b) => a.info.weight.total - b.info.weight.total);
  if (rows.length > 1) {
    const kb = (n) => String(Math.round(n / 1024)).padStart(6);
    console.log("\nPage weight on a phone, KB as sent (lightest first)\n      " + "page".padEnd(34) + " total   page styles scripts pictures  not lazy");
    for (const { p, info: { weight: w } } of rows) console.log(`      ${p.out.padEnd(34)}${kb(w.total)} ${kb(w.page)} ${kb(w.styles)}  ${kb(w.scripts)}   ${kb(w.pictures)}    ${kb(w.eager)}`);
    const total = rows.reduce((n, x) => n + x.info.weight.total, 0);
    console.log(`      ${rows.length} pages, ${Math.round(total / rows.length / 1024)} KB on average; heaviest ${rows[rows.length - 1].p.out} (${Math.round(rows[rows.length - 1].info.weight.total / 1024)} KB)`);
  }
}
if (site.notBuilt.size) {
  console.log("\nInformation, not a failure: links to pages of the thirty that are not built yet");
  for (const [file, from] of [...site.notBuilt].sort()) console.log(`      ${file.padEnd(34)} linked from ${[...from].join(", ")}`);
}
const state = siteState();
console.log(`\nPrice engine ${C.VERSIONS.pricingVersion} · ${state.filter((s) => s.built).length} of ${PAGES.length} pages built · ${targets.length} checked`);
if (failed || process.exitCode) { console.log(`${failed} page(s) FAILED`); process.exit(1); }
console.log(targets.length ? "ALL CHECKS PASS" + (STATIC_ONLY ? " (static checks only; run again without --static before you finish)" : "") : "Nothing to check.");
