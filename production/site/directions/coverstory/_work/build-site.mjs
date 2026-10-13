// build-site.mjs : builds every page of the Cover Story site from ONE source file per page.
//
//   node _work/build-site.mjs                 build every source in _work/pages/ (and the recipe examples)
//   node _work/build-site.mjs carmel fishers  build only these pages (others are left alone)
//   node _work/build-site.mjs --list          the thirty pages and which are built
//   node _work/build-site.mjs --min           build, then write minified copies of every stylesheet and script to
//                                             assets/derived/min/ for rollout and report the saving (the pages
//                                             themselves keep loading the readable files; ADD-A-PAGE.md section 10)
//
// A source is _work/pages/<slug>.html : a JSON block in an HTML comment, then the page's own sections as plain HTML.
// Everything shared (head, header, hero, price-builder mount, facts strip, explainer, map, chips, Yard Guide cards,
// closing scene, footer, structured data) comes from the single files in _work/partials/.
// How to write a source: ADD-A-PAGE.md. Nobody needs to read this file to add a page. Plain Node, no dependencies.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, RELEASE, PARTIALS_DIR, PAGES_DIR, SITE, PAGES, CITIES, GLOVED_SCENES, PORTAL_HREF, PageError,
  readSource, listSources, siteState, didYouMean, decode, esc, faqPairs, imageSize,
  siteSettings, webpCopies, logoFiles, sharePicture, writeMinified } from "./site-lib.mjs";

const CORE = createRequire(import.meta.url)(path.join(RELEASE, "shared/pp-quote-core.js"));
const ASSETS = path.join(RELEASE, "assets");
const rel = (file) => path.relative(ROOT, file).replace(/\\/g, "/");

// ================================================================================================================
// 1. Partials: one file per shared piece. <!--# … --> at the top of a partial is a note to its editor, never output.
// ================================================================================================================
const partialCache = new Map();
function partial(name) {
  if (!partialCache.has(name)) {
    const file = path.join(PARTIALS_DIR, name + ".html");
    if (!fs.existsSync(file)) throw new Error(`partial not found: _work/partials/${name}.html`);
    partialCache.set(name, fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/<!--#[\s\S]*?-->\n?/g, "").replace(/\n+$/, ""));
  }
  return partialCache.get(name);
}
// A partial may hold several named pieces, each starting at a line  <!-- @block name -->
function block(name, blockName) {
  const pieces = partial(name).split(/^<!-- @block ([\w:-]+) -->\n/m);
  for (let i = 1; i < pieces.length; i += 2) if (pieces[i] === blockName) return pieces[i + 1].replace(/\n+$/, "");
  return null;
}
// {{>name}} includes a partial · {{#key}}…{{/key}} is kept only when the value is not empty · {{key}} is the value.
// A line that holds nothing but an empty {{key}} disappears with its line break.
function render(template, data, where) {
  const expand = (t) => t.replace(/\{\{>([\w-]+)\}\}/g, (_, name) => expand(partial(name)));
  let out = expand(template);
  out = out.replace(/^[ \t]*\{\{#(\w+)\}\}[ \t]*\n([\s\S]*?)^[ \t]*\{\{\/\1\}\}[ \t]*\n/gm, (_, key, inner) => (data[key] ? inner : ""));
  out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => (data[key] ? inner : ""));
  const value = (key) => { if (data[key] === undefined) throw new Error(`${where}: the slot {{${key}}} has no value`); return String(data[key]); };
  // one pass, so a value is never read again as a template
  return out.replace(/^[ \t]*\{\{(\w+)\}\}[ \t]*\n|\{\{(\w+)\}\}/gm, (m, lineKey, key) => {
    if (key) return value(key);
    const v = value(lineKey);
    return v === "" ? "" : m.replace(`{{${lineKey}}}`, () => v);
  });
}

// ================================================================================================================
// 2. Checking the JSON block. Every message names the page and the field.
// ================================================================================================================
const TOP_FIELDS = ["title", "description", "canonical", "robots", "audience", "ogImage", "body", "css", "scripts", "hero", "facts", "schema", "guideCards", "allow"];
const HERO_FIELDS = {
  home: ["recipe", "alt", "kw", "title", "wrap", "lead", "kwLines", "titleLines", "spark"],
  service: ["recipe", "scene", "alt", "kw", "title", "wrap", "lead", "sceneReach", "sceneLift", "lawn", "kwLines", "titleLines", "seal", "cardTitle", "action", "spark"],
  city: ["recipe", "city", "zip", "alsoZips", "scene", "alt", "kw", "title", "wrap", "lead", "sceneReach", "sceneLift", "lawn", "kwLines", "titleLines", "seal", "cardTitle", "action", "breaks", "spark"],
  plain: ["recipe", "scene", "pose", "cover", "stickers", "alt", "kw", "title", "wrap", "lead", "buttons", "sceneY"],
  legal: ["recipe", "pose", "stickers", "date", "alt", "kw", "title", "wrap", "lead"],
  kit: ["recipe", "title", "lead"],
};
const WITH_BUILDER = ["home", "service", "city"];

function check(page) {
  const { slug, meta, kind } = page;
  const fail = (message) => { throw new PageError(slug, message); };
  const text = (obj, key, label, { max } = {}) => {
    if (typeof obj[key] !== "string" || !obj[key].trim()) fail(`${label} is missing. It must be a line of text.`);
    if (max && decode(obj[key]).length > max) fail(`${label} is ${decode(obj[key]).length} characters; keep it to ${max} or fewer.`);
  };
  const known = (obj, fields, label) => { for (const k of Object.keys(obj)) if (!fields.includes(k)) fail(`${label}"${k}" is not a field the builder knows.${didYouMean(k, fields)} The fields are: ${fields.join(", ")}.`); };

  known(meta, TOP_FIELDS, "");
  text(meta, "title", "title");
  text(meta, "description", "description", { max: 200 });
  if (meta.canonical !== undefined && !/^https:\/\/([a-z0-9-]+\.)?itspurgepros\.com\//.test(meta.canonical)) fail(`canonical "${meta.canonical}" must be a full https://itspurgepros.com/… address (leave it out and it is "${canonicalOf(page)}").`);
  if (meta.robots !== undefined && typeof meta.robots !== "string") fail('robots must be text, for example "noindex".');
  if (meta.ogImage !== undefined && !/^https:\/\/\S+\.(jpg|jpeg|png|webp)$/i.test(String(meta.ogImage))) fail('ogImage is the full https address of the picture a shared link shows (an article\'s published cover). Left out, the page shows its own link preview (assets/derived/share/<slug>.jpg) once "assetsBase" is set in _work/partials/site.json.');
  if (meta.audience !== undefined && meta.audience !== "customer") fail('audience says who the page is for when that is not a visitor looking for a price. The only value is "customer" (the welcome page): the header, phone menu, closing scene and footer then offer the client portal, text and call instead of "Get my price". Leave it out on every other page.');
  for (const [k, v] of Object.entries(meta.body || {})) {
    if (!/^data-[a-z0-9-]+$/.test(k)) fail(`body."${k}": only data- attributes go on <body> (data-mascot, data-no-price-bar).`);
    if (v !== true && typeof v !== "string") fail(`body."${k}" must be true (an attribute with no value) or text.`);
  }
  for (const [key, pattern, hint] of [["css", /^css\/family-[a-z0-9-]+\.css$/, "css/family-<name>.css"], ["scripts", /^js\/(prices|family-[a-z0-9-]+)\.js$/, "js/family-<name>.js (or js/prices.js)"]]) {
    if (meta[key] === undefined) continue;
    if (!Array.isArray(meta[key])) fail(`${key} must be a list, for example ["${hint.split(" ")[0]}"].`);
    for (const f of meta[key]) {
      if (typeof f !== "string" || !pattern.test(f)) fail(`${key}: "${f}" is not allowed. A family's own file is named ${hint}; site.css, builder.css, site.js and builder.js are already on every page.`);
      if (!fs.existsSync(path.join(ROOT, f))) fail(`${key}: the file ${f} does not exist in the coverstory folder.`);
    }
  }
  if (meta.allow !== undefined && (!Array.isArray(meta.allow) || meta.allow.some((s) => typeof s !== "string" || !s.trim()))) fail('allow must be a list of exact phrases, for example ["Do you offer one-time cleanups?"].');
  for (const [post, own] of Object.entries(meta.guideCards || {})) {
    if (!covers[post]) fail(`guideCards: "${post}" is not a Yard Guide post in assets/covers/covers.json.${didYouMean(post, Object.keys(covers))}`);
    if (!own || typeof own !== "object") fail(`guideCards["${post}"] must be an object such as { "more": "Read the pricing guide" }.`);
    known(own, ["ribbon", "more", "text", "alt", "title", "cover"], `guideCards["${post}"].`);
    if (!page.body.includes(post)) fail(`guideCards: "${post}" is reworded here but no {{GUIDE_CARDS:…}} on this page shows it.`);
  }

  // ---- hero
  const hero = meta.hero;
  if (!hero || typeof hero !== "object") fail(`hero is missing. Give it a recipe: ${Object.keys(HERO_FIELDS).join(", ")}.`);
  if (!HERO_FIELDS[hero.recipe]) fail(`hero.recipe "${hero.recipe}" is not a recipe.${didYouMean(String(hero.recipe), Object.keys(HERO_FIELDS))} The recipes are: ${Object.keys(HERO_FIELDS).join(", ")}.`);
  if (kind === "kit" && hero.recipe !== "kit") fail('a kit page (kit-<name>.html) uses hero.recipe "kit".');
  if (kind === "page" && hero.recipe === "kit") fail('hero.recipe "kit" is only for a family kit page named kit-<name>.html.');
  if (kind === "page" && (hero.recipe === "city") !== CITIES.includes(slug)) fail(CITIES.includes(slug) ? 'this is one of the city pages, so hero.recipe is "city".' : 'hero.recipe "city" is for the city pages only; use "service" or "plain".');
  if (hero.recipe === "home" && slug !== "index" && kind !== "example") fail('hero.recipe "home" is the homepage only. A service page uses "service", a city page "city".');
  known(hero, HERO_FIELDS[hero.recipe], "hero.");
  text(hero, "lead", "hero.lead");
  if (hero.recipe === "kit") { text(hero, "title", "hero.title"); return; }
  text(hero, "kw", "hero.kw");
  text(hero, "alt", "hero.alt (what the hero picture shows, for people who cannot see it)");
  if (!Array.isArray(hero.title) || hero.title.length < 1 || hero.title.length > 2 || hero.title.some((l) => typeof l !== "string" || !l.trim())) fail('hero.title must be one or two lines of text: ["Dog poop removal.", "Handled."]. Line two is the cyan line.');
  if (hero.wrap !== undefined && !["first", "second", "both", "none"].includes(hero.wrap)) fail('hero.wrap says which title lines may wrap: "first", "second", "both" or "none".');
  for (const k of ["kwLines", "titleLines"]) if (hero[k] !== undefined && ![1, 2, 3].includes(hero[k])) fail(`hero.${k} is the number of lines the ${k === "kwLines" ? "keyword line" : "title"} takes on a phone: 1, 2 or 3.`);
  if (hero.sceneReach !== undefined && !(typeof hero.sceneReach === "number" && hero.sceneReach >= 0 && hero.sceneReach <= 1)) fail("hero.sceneReach is a number between 0 and 1 (.766 for the dog waste removal scene). See DESIGN.md section 12.");
  if (hero.lawn !== undefined && !/^#[0-9a-f]{6}$/i.test(hero.lawn)) fail('hero.lawn is the colour of the bottom rows of the scene as six hex digits, for example "#5d961f".');
  if (hero.sceneLift !== undefined && !(typeof hero.sceneLift === "number" && hero.sceneLift >= 16 && hero.sceneLift <= 40)) fail("hero.sceneLift is a number of pixels from 16 to 40: how far the picture may slide up under the headline band on a short phone, so a short dog is not hidden by the price card. Look at 360 by 740, 375 by 667 and 390 by 664 afterwards: the mascot's whole head must stay below the cyan line.");
  if (hero.seal !== undefined && typeof hero.seal !== "boolean") fail('hero.seal is true or false. false leaves the "$0 start-up fee" seal off a page whose subject is not recurring scooping (the sanitizing page).');
  if (hero.cardTitle !== undefined) text(hero, "cardTitle", 'hero.cardTitle (the small title of the price card, "Build your price" unless the page is about something else; 20 characters at most, so it fits the card and the panel on a 360px phone)', { max: 20 });
  if (hero.action !== undefined && (!hero.action || typeof hero.action.label !== "string" || !hero.action.label.trim() || typeof hero.action.href !== "string" || !/^(sms:|tel:|#[a-z][\w-]*$|[a-z0-9-]+\.html)/i.test(hero.action.href))) fail('hero.action is the page\'s own action beside the price card: { "label": "Text about availability", "href": "sms:+13179615865" } (a text, a call, a section of this page or another page).');
  if (hero.sceneY !== undefined && !(typeof hero.sceneY === "number" && hero.sceneY >= 0 && hero.sceneY <= 100)) fail("hero.sceneY is a number from 0 to 100: which part of the picture's height stays in view when a desktop window crops it (0 keeps the top, 100 the bottom; 50 when left out).");
  if (hero.breaks !== undefined && hero.breaks !== false) fail('hero.breaks: the builder sets the line breaks of a city headline ("Dog poop removal in {City}." then "Handled."). The only value is false, which leaves the wrapping to the browser.');
  const recipe = hero.recipe;
  if (recipe === "city") {
    text(hero, "city", "hero.city (the community's name, for example \"Westfield\")");
    if (hero.scene === undefined) hero.scene = `heroes/${slug}.jpg`;
    if (hero.zip !== undefined) checkCityZip(slug, hero, fail);
    if (hero.alsoZips !== undefined) checkAlsoZips(hero, fail);
    checkZipStamps(page, hero, fail);
  }
  if (recipe === "plain" && [hero.scene, hero.pose, hero.cover].filter(Boolean).length !== 1) fail('a "plain" hero shows ONE of: hero.scene (the page\'s 16:9 picture), hero.pose (one cut-out standing on the drawn field) or hero.cover (a Yard Guide article\'s own cover on the drawn field). Give exactly one.');
  if (hero.cover !== undefined && !covers[hero.cover]) fail(`hero.cover "${hero.cover}" is not a Yard Guide post in assets/covers/covers.json.${didYouMean(String(hero.cover), Object.keys(covers))} It is the post's slug; the hero then shows that article's cover and no pose.`);
  if (hero.spark !== undefined && typeof hero.spark !== "boolean") fail('hero.spark is true or false. false leaves the gold spark off the cyan line (when check-layout says the price card would cut it, and the line cannot be shortened).');
  if (hero.date !== undefined) text(hero, "date", 'hero.date (the document\'s date line, printed in the hero under the lead: "Last updated: September 9, 2026")', { max: 60 });
  if (hero.stickers !== undefined) {
    if (!hero.pose && recipe !== "legal") fail("hero.stickers are the sticker icons of the drawn field, so they go with hero.pose (or the legal recipe), not with a scene or a cover.");
    if (!Array.isArray(hero.stickers) || hero.stickers.length < 1 || hero.stickers.length > 3) fail('hero.stickers is a list of one to three brand icons that belong to the page, for example ["pp-service-calendar", "pp-secure-payment", "pp-gate-photo"]. A phone shows the first two.');
    hero.stickers.forEach((icon, i) => brandIcon(icon, `hero.stickers[${i}]`, fail));
    if (new Set(hero.stickers).size !== hero.stickers.length) fail("hero.stickers names the same icon twice.");
  }
  if (recipe === "legal" && hero.pose === undefined) hero.pose = "clipboard";
  if (["service", "city"].includes(recipe) || (recipe === "plain" && hero.scene)) {
    if (typeof hero.scene !== "string" || !/^(heroes|scenes)\/[a-z0-9-]+\.jpg$/.test(hero.scene)) fail(`hero.scene "${hero.scene}" must be a picture in assets/heroes or assets/scenes, written like "heroes/about.jpg".`);
    if (!fs.existsSync(path.join(ASSETS, hero.scene))) fail(`hero.scene: assets/${hero.scene} does not exist.`);
  }
  if (hero.pose !== undefined) {
    const poses = fs.readdirSync(path.join(ASSETS, "brand/poses")).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5));
    if (!poses.includes(hero.pose)) fail(`hero.pose "${hero.pose}" is not a pose.${didYouMean(String(hero.pose), poses)} The poses are: ${poses.join(", ")}.`);
  }
  if (hero.buttons !== undefined) {
    if (!Array.isArray(hero.buttons) || hero.buttons.length > 2) fail('hero.buttons is a list of at most two: "quote", "text", "call" (the text-first pair: Text, then Call), or { "label": "…", "href": "…" }.');
    if (hero.buttons.includes("text") && hero.buttons.includes("call")) fail('hero.buttons: "call" already is the pair (a Text button, then a Call button). Name "text" OR "call", not both.');
    hero.buttons.forEach((b, i) => {
      if (typeof b === "string") { if (!["quote", "call", "text"].includes(b)) fail(`hero.buttons[${i}] "${b}" is not a button. Use "quote", "call", "text", or { "label": "…", "href": "…" }.`); }
      else if (!b || typeof b.label !== "string" || typeof b.href !== "string" || b.href === "#" || !b.href) fail(`hero.buttons[${i}] needs a "label" and an "href" that goes somewhere real.`);
      else if (/^tel:/i.test(b.href)) fail(`hero.buttons[${i}] is a call button on its own. Text comes first (owner decision, October 8): use "call", which prints the pair (Text (317) 961-5865, then Call), or "text".`);
    });
  }

  // ---- facts strip
  const facts = meta.facts;
  {
    if (!facts || typeof facts !== "object") fail('facts is missing: { "label": "… at a glance", "items": [four facts] }. Every hero has the facts strip under it (DESIGN.md section 12). See ADD-A-PAGE.md.');
    known(facts, ["label", "items", "jump"], "facts.");
    text(facts, "label", "facts.label (read out by screen readers, for example \"Purge Pros at a glance\")");
    if (!Array.isArray(facts.items) || facts.items.length !== 4) fail(`facts.items must name exactly four facts (it has ${Array.isArray(facts.items) ? facts.items.length : "none"}). The strip is always four.`);
    facts.items.forEach((f, i) => {
      const at = `facts.items[${i}]`;
      const names = factNames();
      if (typeof f === "string") { if (!names.includes(f)) fail(`${at} "${f}" is not a ready-made fact.${didYouMean(f, names)} Ready-made: ${names.join(", ")}. Or write your own: { "icon": "pp-…", "value": "…", "label": "…" }.`); return; }
      if (!f || typeof f !== "object") fail(`${at} must be a ready-made fact's name or { "icon", "value", "label" }.`);
      if (f.use !== undefined) { known(f, ["use", "id"], at + "."); if (!names.includes(f.use)) fail(`${at}.use "${f.use}" is not a ready-made fact. Ready-made: ${names.join(", ")}.`); return; }
      known(f, ["icon", "value", "label", "id", "href"], at + ".");
      text(f, "value", at + ".value"); text(f, "label", at + ".label");
      if (f.href !== undefined && (typeof f.href !== "string" || !/^(sms:|tel:|mailto:|#[a-z][\w-]*$|[a-z0-9-]+\.html|https:\/\/)/i.test(f.href))) fail(`${at}.href "${f.href}" must go somewhere real: a text or call link, a section of this page ("#id"), a page of the site or a full https address.`);
      brandIcon(f.icon, at + ".icon", fail);
    });
    if (facts.jump !== undefined) {
      known(facts.jump, ["label", "links"], "facts.jump.");
      text(facts.jump, "label", "facts.jump.label");
      if (!Array.isArray(facts.jump.links) || ![6, 12].includes(facts.jump.links.length)) fail("facts.jump.links must hold 6 or 12 links, so every row of the link bar fills (DESIGN.md section 8).");
      facts.jump.links.forEach((l, i) => {
        const at = `facts.jump.links[${i}]`;
        if (!l || typeof l !== "object") fail(`${at} must be { "href": "#section-id", "icon": "pp-…", "label": "…" }.`);
        known(l, ["href", "icon", "label"], at + ".");
        text(l, "label", at + ".label");
        if (typeof l.href !== "string" || !/^#[a-z][\w-]*$/i.test(l.href)) fail(`${at}.href "${l.href}" must point at a section of this page, like "#prices".`);
        if (!new RegExp(`\\sid="${l.href.slice(1)}"`).test(page.body)) fail(`${at}.href "${l.href}": no section of this page has id="${l.href.slice(1)}".`);
        brandIcon(l.icon, at + ".icon", fail);
      });
    }
  }

  // ---- structured data options
  const schema = meta.schema || {};
  known(schema, ["breadcrumb", "service", "extra", "type", "name", "dateModified"], "schema.");
  if (schema.type !== undefined && !PAGE_TYPES.includes(schema.type)) fail(`schema.type "${schema.type}" is not a page type the builder writes.${didYouMean(String(schema.type), PAGE_TYPES)} The types are: ${PAGE_TYPES.join(", ")} (left out, it is WebPage).`);
  if (schema.name !== undefined) text(schema, "name", "schema.name (the page's short name in structured data; left out, it is the title)");
  if (schema.dateModified !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(schema.dateModified))) fail('schema.dateModified is a date written as "2026-10-08".');
  const inner = slug !== "index" && kind === "page";
  if (inner && schema.breadcrumb === undefined) fail('schema.breadcrumb is missing: the short name of this page in the breadcrumb trail, for example ["Dog Waste Removal"], or with a parent [{ "name": "Service Areas", "page": "additional" }, "Westfield"].');
  if (schema.breadcrumb !== undefined) {
    const trail = schema.breadcrumb;
    if (!Array.isArray(trail) || !trail.length || typeof trail[trail.length - 1] !== "string") fail('schema.breadcrumb is a list that ends with this page\'s short name: ["Dog Waste Removal"].');
    trail.slice(0, -1).forEach((t, i) => { if (!t || typeof t.name !== "string" || !PAGES.includes(t.page)) fail(`schema.breadcrumb[${i}] must be { "name": "…", "page": "<slug of one of the thirty pages>" }.`); });
  }
  if (schema.service !== undefined) { known(schema.service, ["name", "serviceType", "areaServed", "areaType"], "schema.service."); if (schema.service.areaType !== undefined && !["City", "Place"].includes(schema.service.areaType)) fail('schema.service.areaType is "City" (the default on a town page) or "Place" (a community that is not a town).'); for (const k of ["name", "serviceType", "areaServed"]) text(schema.service, k, "schema.service." + k); }
  if (schema.extra !== undefined && (!Array.isArray(schema.extra) || schema.extra.some((n) => !n || typeof n !== "object" || !n["@type"]))) fail('schema.extra is a list of schema.org nodes, each with an "@type".');
  if (/AggregateRating|aggregateRating|"@type":\s*"Review"|streetAddress/.test(JSON.stringify(schema))) fail("schema: no AggregateRating, no Review and no street address in structured data (DESIGN.md section 14).");
}

const PAGE_TYPES = ["WebPage", "CollectionPage", "AboutPage", "ContactPage"];
function factNames() { return [...partial("facts").matchAll(/^<!-- @block fact:([\w-]+) -->$/gm)].map((m) => m[1]).filter((n) => n !== "custom" && n !== "linked"); }
function brandIcon(icon, label, fail) {
  if (typeof icon !== "string" || !/^pp-[a-z0-9-]+$/.test(icon)) fail(`${label} "${icon}" must be the name of a brand icon without its ending, like "pp-gate-photo".`);
  if (!fs.existsSync(path.join(ASSETS, "brand-icons", icon + ".webp"))) fail(`${label}: assets/brand-icons/${icon}.webp does not exist.`);
}
// A city page may fix the ZIP only when its community has exactly one accepted ZIP (shared/CORE-API.md section 12).
function checkCityZip(slug, hero, fail) {
  const zip = String(hero.zip);
  const community = CORE.COMMUNITIES.find((c) => c.name.toLowerCase() === hero.city.toLowerCase());
  if (!community) fail(`hero.city "${hero.city}" is not one of the 26 communities in the price engine, so hero.zip cannot be checked.`);
  if (!community.zips.includes(zip)) fail(`hero.zip "${zip}" is not an accepted ZIP of ${community.name} (accepted: ${community.zips.join(", ")}).`);
  if (community.zips.length !== 1) fail(`hero.zip: ${community.name} has ${community.zips.length} accepted ZIPs, so its page must ask for the ZIP. Remove hero.zip (CORE-API.md section 12).`);
  hero.zip = zip;
}
// A city page may name EXTRA ZIPs of its community: accepted ZIPs that the price engine lists under a neighbour although the page
// prints them as its own (46280, an Indianapolis ZIP, covers Carmel's south edge). They go on the mount as data-zips-also; the price
// builder then offers them as one-tap choices after the community's own and greets them with the page's city ("Carmel, got it.").
// Nothing else changes: the engine still decides the City it pre-fills and everything that is sent. See BUILDER-NOTES.md.
function checkAlsoZips(hero, fail) {
  const eg = 'for example "alsoZips": ["46280"] on the Carmel page';
  if (!Array.isArray(hero.alsoZips) || !hero.alsoZips.length) fail(`hero.alsoZips is a list of ZIP codes, ${eg}. Leave the field out when the page has none.`);
  const community = CORE.COMMUNITIES.find((c) => c.name.toLowerCase() === hero.city.toLowerCase());
  const seen = new Set();
  hero.alsoZips = hero.alsoZips.map((value, i) => {
    const zip = typeof value === "number" ? String(value) : value;
    if (typeof zip !== "string" || !/^\d{5}$/.test(zip)) fail(`hero.alsoZips[${i}] ${JSON.stringify(value)} must be a ZIP code of five digits, ${eg}.`);
    if (!CORE.checkZip(zip).inArea) fail(`hero.alsoZips[${i}] "${zip}" is not a ZIP the price engine accepts (it is not in SERVICE_ZIPS of shared/pp-quote-core.js), so the price builder would turn it away. Only an accepted ZIP can be named here.`);
    if (community && community.zips.includes(zip)) fail(`hero.alsoZips[${i}] "${zip}" is already one of ${community.name}'s own ZIPs in the price engine (${community.zips.join(", ")}); the builder offers and greets it without help. alsoZips is only for a ZIP the engine lists under another community. Leave it out.`);
    if (seen.has(zip)) fail(`hero.alsoZips names "${zip}" twice.`);
    seen.add(zip);
    return zip;
  });
}
// Every ZIP stamp of a city page (a one-field form with data-pp-zip-form) opens the builder with that ZIP answered, and the mascot
// greets it by name. A stamp of a ZIP the engine lists under ANOTHER community must be named in hero.alsoZips, or the greeting on
// this page names the other town ("Indianapolis, got it." on the Carmel page).
function checkZipStamps(page, hero, fail) {
  const also = hero.alsoZips || [];
  for (const m of page.body.matchAll(/<form\b[^>]*\bdata-pp-zip-form\b[^>]*>\s*<input\b[^>]*\bname="zip"[^>]*\bvalue="(\d{5})"/g)) {
    const entry = CORE.cityForZip(m[1]);
    if (!entry || entry.community.toLowerCase() === hero.city.toLowerCase() || also.includes(m[1])) continue;
    fail(`the ZIP stamp ${m[1]} is a ZIP the price engine lists under ${entry.community}, not ${hero.city}: tapped here, the builder would say "${entry.community}, got it." Add it to the hero: "alsoZips": [${also.concat(m[1]).map((z) => `"${z}"`).join(", ")}] (ADD-A-PAGE.md section 3).`);
  }
}

// ================================================================================================================
// 3. The pieces of a page
// ================================================================================================================
const canonicalOf = (page) => page.meta.canonical || (page.slug === "index" ? SITE + "/" : `${SITE}/${page.kind === "example" ? "_example-" : ""}${page.slug}`);
const number = (n) => String(n).replace(/^0\./, ".");

// ---- headline typography -----------------------------------------------------------------------------------------
// Widths of the display face (Barlow Condensed 800 with the h1's letter-spacing) in em, measured in a browser on
// 2026-10-08. The builder cannot measure text, so it adds these up to decide where a city headline breaks and how
// large it may be set. Kerning makes a real line up to 1% narrower than the sum, so the sum is on the safe side.
const EM = { " ": .197, ".": .232, ",": .22, "'": .185, "’": .208, "-": .334, "&": .621, "!": .286, "?": .459, ":": .295,
  a: .454, b: .45, c: .442, d: .45, e: .443, f: .302, g: .448, h: .452, i: .22, j: .22, k: .462, l: .216, m: .682, n: .452, o: .449, p: .453, q: .453, r: .333, s: .423, t: .296, u: .452, v: .453, w: .632, x: .459, y: .439, z: .374,
  A: .505, B: .474, C: .467, D: .477, E: .438, F: .424, G: .47, H: .48, I: .232, J: .459, K: .502, L: .434, M: .555, N: .519, O: .476, P: .471, Q: .464, R: .478, S: .451, T: .482, U: .477, V: .503, W: .704, X: .487, Y: .489, Z: .416 };
const em = (s) => [...s].reduce((n, ch) => n + (EM[ch] ?? .46), 0);
const SPARK_EM = .64;                    // the spark and its gap, beside the last word
const PHONE_EM = 8.85;                   // what one line of a phone headline holds at 360px wide (328px at 36.7px), less a hair
const BR = (...at) => `<br class="cover__br ${at.map((a) => "cover__br--" + a).join(" ")}">`;
// A city headline is always "<what> in <City>." and then the cyan line. Its breaks are set on purpose, the same way on
// all 17 pages, instead of leaving three different wrappings to the browser:
//   desktop column (from 1240px)   Dog poop / removal in / {City}. / Handled.   the town has a line of its own; no word is
//                                  stranded in the middle of the phrase. --title-fit lets a long name set the size a step down
//   phone band (under 700px)       Dog poop removal / in {City}. Handled.       when that second line fits a 360px phone
//                                  Dog poop removal in / {City}. Handled.       when it does not (long names)
//   between                        the browser wraps the one sentence; --title-em lets a short window set it on one line
// The town's name never splits. Returns null for a title of another shape (or "breaks": false): the browser wraps it.
function cityTitle(hero) {
  const first = decode(hero.title[0]), town = decode(hero.city) + ".", tail = " in " + town, last = hero.title[1] ? decode(hero.title[1]) : "";
  if (hero.breaks === false || !last || !first.endsWith(tail)) return null;
  const what = first.slice(0, -tail.length).trim().split(/ +/);                 // ["Dog", "poop", "removal"]
  if (what.length < 2 || what.length > 5) return null;
  const words = [...what, "in"];
  // desktop: the words before the town on one line when they are short, otherwise on the two most even lines
  let split = 0;
  if (em(words.join(" ")) > 4.5) { let best = Infinity; for (let k = 1; k < words.length; k += 1) { const w = Math.max(em(words.slice(0, k).join(" ")), em(words.slice(k).join(" "))); if (w < best) { best = w; split = k; } } }
  const deskLines = split ? [words.slice(0, split).join(" "), words.slice(split).join(" "), town] : [words.join(" "), town];
  // phone: keep "in {City}." together when the second line still fits
  const phoneAfterWhat = em("in " + town + " " + last) + SPARK_EM <= PHONE_EM;
  const phoneLast = (phoneAfterWhat ? "in " + town : town) + " " + last;
  let html = "";
  words.forEach((w, i) => {
    const n = i + 1, at = [];
    if (n === split || n === words.length) at.push("d");
    if ((phoneAfterWhat && n === what.length) || (!phoneAfterWhat && n === words.length)) at.push("p");
    html += (i ? " " : "") + esc(w) + (at.length ? BR(...at) : "");
  });
  html += ` <span class="nb">${esc(town)}</span>`;
  return { html, fit: Math.max(...deskLines.map(em), em(last)) * 1.02, oneLine: (em(first + " " + last) + SPARK_EM) * 1.01, sparkOnPhone: em(phoneLast) + SPARK_EM <= PHONE_EM };
}

// The keyword line of a city page is "<what> in <City>, Indiana". In the desktop column it takes two lines, and where it
// broke depended on the length of the town's name ("…REMOVAL IN / NOBLESVILLE, INDIANA" on most, "…REMOVAL / IN DANVILLE,
// INDIANA" on four). The break is set on purpose, before "in", so all 17 read the same. Other widths: one line, as before.
function cityKw(hero, recipe) {
  const kw = esc(hero.kw);
  if (recipe !== "city" || hero.breaks === false) return kw;
  const at = kw.lastIndexOf(" in " + esc(hero.city));
  return at > 0 ? kw.slice(0, at) + BR("d") + kw.slice(at) : kw;
}

function heroHtml(page) {
  const { hero } = page.meta, recipe = hero.recipe, where = `${page.slug}: hero`;
  const wrapDefault = ["plain", "legal"].includes(recipe) ? "both" : "none";
  const wrap = hero.wrap || wrapDefault;
  const city = recipe === "city" ? cityTitle(hero) : null;
  const style = [hero.sceneReach !== undefined && `--scene-reach:${number(hero.sceneReach)}`, hero.lawn && `--cover-lawn:${hero.lawn}`,
    hero.kwLines && `--kw-lines:${hero.kwLines}`, hero.titleLines && `--title-lines:${hero.titleLines}`,
    city && `--title-fit:${city.fit.toFixed(3)}`, city && `--title-em:${city.oneLine.toFixed(3)}`,
    hero.sceneY !== undefined && `--scene-y:${hero.sceneY}%`,
    hero.sceneLift !== undefined && `--scene-lift:${hero.sceneLift}px;--scene-lift-rate:.5`].filter(Boolean).join(";");
  const wrap2 = ["second", "both"].includes(wrap), withSpark = WITH_BUILDER.includes(recipe) && hero.spark !== false;
  // a cyan line that may wrap carries its spark on its last word, so the spark follows that word to whichever line it lands on
  let line2 = hero.title[1] ? esc(hero.title[1]) : "", sparkOnLine = withSpark;
  if (withSpark && wrap2 && / /.test(hero.title[1] || "")) { const cut = hero.title[1].lastIndexOf(" "); line2 = `${esc(hero.title[1].slice(0, cut))} <span class="spark">${esc(hero.title[1].slice(cut + 1))}</span>`; sparkOnLine = false; }
  const data = {
    recipe, style: style ? ` style="${style}"` : "", alt: esc(hero.alt), kw: cityKw(hero, recipe), lead: esc(hero.lead),
    line1: city ? city.html : esc(hero.title[0]), line2,
    wrap1: ["first", "both"].includes(wrap) ? " cover__line--wrap" : "", wrap2: wrap2 ? " cover__line--wrap" : "",
    spark: sparkOnLine ? " spark" + (city && !city.sparkOnPhone ? " spark--desk" : "") : "",
    coverClass: (recipe === "city" ? " cover--city" : "") + (hero.seal === false ? " cover--noseal" : "")
      + (hero.pose || hero.cover ? " cover--drawn" : "") + (hero.cover ? " cover--drawn-cover" : "") + (hero.stickers ? " drawn--stickers" : ""),
    date: hero.date ? esc(hero.date) : "", stickers: "", cover: "", drawn: hero.pose || hero.cover ? "1" : "",
    seal: hero.seal === false ? "" : "1",
    sealHref: /\sid="start-up-fee"/.test(page.body) ? "#start-up-fee" : "dog-waste-removal.html#start-up-fee",
    mountAttrs: (hero.zip ? ` data-zip="${hero.zip}"` : "") + (recipe === "city" ? ` data-city="${esc(hero.city)}"` : "") + (hero.alsoZips ? ` data-zips-also="${hero.alsoZips.join(" ")}"` : "") + (hero.cardTitle ? ` data-title="${esc(hero.cardTitle)}"` : ""),
    action: "", actionHref: "", actionIcon: "",
    scene: "", pose: "", buttons: "", sceneSources: heroPictures(page).sources.join("\n"),
  };
  if (hero.action) Object.assign(data, { action: esc(hero.action.label), actionHref: esc(hero.action.href),
    actionIcon: /^sms:/.test(hero.action.href) ? "pp-visit-message" : /^tel:/.test(hero.action.href) ? "pp-phone" : "pp-next-arrow" });
  if (hero.scene) { const s = imageSize(path.join(ASSETS, hero.scene)); Object.assign(data, { scene: hero.scene, sceneW: s.width, sceneH: s.height }); }
  if (hero.pose) { const s = imageSize(path.join(ASSETS, "brand/poses", hero.pose + ".webp")); Object.assign(data, { pose: hero.pose, poseW: s.width, poseH: s.height }); }
  // a Yard Guide article's own cover as the hero art (the full 1536 by 1024 cover: it is the page's subject, so it is not lazy)
  if (hero.cover) { const post = covers[hero.cover], file = path.join(RELEASE, post.cover); if (!fs.existsSync(file)) throw new PageError(page.slug, `hero.cover: the cover ${post.cover} does not exist.`); const s = imageSize(file); Object.assign(data, { cover: post.cover, coverW: s.width, coverH: s.height }); }
  // the sticker icons of the drawn field: decoration that belongs to the page (alt is empty), tilted alternately
  if (hero.stickers) data.stickers = hero.stickers.map((icon, i) => `    <img class="stk${i % 2 ? " stk--r" : ""} drawn__stk drawn__stk--${i + 1}" src="../../assets/brand-icons/${icon}.webp" width="72" height="72" alt="">`).join("\n");
  if (hero.buttons && hero.buttons.length) {
    data.buttons = hero.buttons.map((b, i) => {
      if (typeof b === "string") return render(block("hero-buttons", b), {}, where).replaceAll(' loading="lazy"', "");   // "call" is the text-first pair (partials/reach-dark.html)
      const outside = /^https?:/.test(b.href);
      return render(block("hero-buttons", i === 0 ? "first" : "second"), { href: esc(b.href), label: esc(b.label), attrs: outside ? ' target="_blank" rel="noopener"' : "" }, where);
    }).join("");
  }
  let html = render(partial({ home: "hero-home", service: "hero-page", city: "hero-page", plain: "hero-plain", legal: "hero-plain" }[recipe]), data, where);
  // the card's small title in the static first question, so the card reads the same before and after the script starts
  if (hero.cardTitle) { const mock = '<p class="ppb-title">Build your price <span'; if (!html.includes(mock)) throw new Error(`${where}: the price card's title was not found in builder-mount.html`); html = html.replace(mock, () => `<p class="ppb-title">${esc(hero.cardTitle)} <span`); }
  return html;
}

function factsHtml(page) {
  const { facts } = page.meta, where = `${page.slug}: facts`;
  const items = facts.items.map((f, i) => {
    const tilt = i % 2 ? " stk--r" : "";
    const spec = typeof f === "string" ? { use: f } : f;
    const id = spec.id ? ` id="${esc(spec.id)}"` : "";
    if (spec.use) return render(block("facts", "fact:" + spec.use), { tilt, id }, where);
    if (spec.href) return render(block("facts", "fact:linked"), { tilt, id, icon: spec.icon, value: esc(spec.value), label: esc(spec.label), href: esc(spec.href), attrs: /^https:/.test(spec.href) ? ' target="_blank" rel="noopener"' : "" }, where);
    return render(block("facts", "fact:custom"), { tilt, id, icon: spec.icon, value: esc(spec.value), label: esc(spec.label) }, where);
  }).join("\n");
  const jump = facts.jump ? facts.jump.links.map((l) => render(block("facts", "jump-link"), { href: l.href, icon: l.icon, label: esc(l.label) }, where)).join("\n") : "";
  // A page with a parent in its breadcrumb (a city page under Service Areas) shows that trail under the facts: the same
  // names, in the same order, as the BreadcrumbList in its structured data, each parent a link.
  const trail = (page.meta.schema || {}).breadcrumb || [];
  const crumbs = trail.length > 1 && page.kind !== "kit"
    ? ['<li><a href="index.html">Home</a></li>', ...trail.slice(0, -1).map((t) => `<li><a href="${t.page}.html">${esc(t.name)}</a></li>`), `<li aria-current="page">${esc(trail[trail.length - 1])}</li>`].join("")
    : "";
  return render(block("facts", "section"), { label: esc(facts.label), items, jump, jumpLabel: facts.jump ? esc(facts.jump.label) : "", crumbs }, where);
}

// ---- the tokens a page drops into its sections ----
const covers = (() => { const c = JSON.parse(fs.readFileSync(path.join(ASSETS, "covers/covers.json"), "utf8")); return Object.fromEntries(c.posts.map((p) => [p.slug, p])); })();
const sentenceCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
// One shared place for the wording of a card whose published description must not be shown as it is (partials/guide-wording.json).
const GUIDE_WORDING = JSON.parse(fs.readFileSync(path.join(PARTIALS_DIR, "guide-wording.json"), "utf8"));
function guideCards(page, list) {
  const slugs = list.split(",").map((s) => s.trim()).filter(Boolean), where = `${page.slug}: {{GUIDE_CARDS}}`;
  if (slugs.length !== 3) throw new PageError(page.slug, `{{GUIDE_CARDS:${list}}} names ${slugs.length} article(s); a row of Yard Guide cards is exactly three.`);
  const own = page.meta.guideCards || {};
  const cards = slugs.map((slug, i) => {
    const post = covers[slug];
    if (!post) throw new PageError(page.slug, `{{GUIDE_CARDS}}: "${slug}" is not a Yard Guide post in assets/covers/covers.json.${didYouMean(slug, Object.keys(covers))}`);
    const o = own[slug] || {};
    const cover = o.cover || post.thumb || post.cover, file = path.join(RELEASE, cover);   // cards use the 720px thumbnail; the full cover is for an article page
    if (!fs.existsSync(file)) throw new PageError(page.slug, `{{GUIDE_CARDS}}: the cover ${cover} for "${slug}" does not exist.`);
    const size = imageSize(file);
    return render(block("guide-cards", "card"), { url: post.publicUrl, ribbonClass: ["", " ribbon--cyan", " ribbon--navy"][i], ribbon: esc(o.ribbon || sentenceCase(post.category)),
      cover, w: size.width, h: size.height, alt: esc(o.alt || (GUIDE_WORDING[slug] || {}).alt || post.alt), title: esc(o.title || post.title), text: esc(o.text || (GUIDE_WORDING[slug] || {}).text || post.description), more: esc(o.more || "Read the guide") }, where);
  });
  return render(block("guide-cards", "grid"), { cards: cards.join("\n") }, where);
}
// THE TEXT-FIRST PAIR (owner decision, October 8). {{REACH}} on a light ground, {{REACH:dark}} on navy, and in a sentence
// {{REACH:inline}} ("text (317) 961-5865 or call") or {{REACH:Inline}} (the same with a capital, to start a sentence).
function reach(page, arg) {
  const kind = (arg || "").trim();
  if (kind === "") return render(partial("reach"), {}, page.slug);
  if (kind === "dark") return render(partial("reach-dark"), {}, page.slug);
  if (kind === "inline" || kind === "Inline") return `<span class="reach-inline"><a class="link" href="sms:+13179615865">${kind === "Inline" ? "Text" : "text"} (317) 961-5865</a> or <a class="link" href="tel:+13179615865">call</a></span>`;
  throw new PageError(page.slug, `{{REACH:${kind}}} is not a form of the text-first pair. Write {{REACH}} (buttons on a light ground), {{REACH:dark}} (buttons on navy), {{REACH:inline}} or {{REACH:Inline}} (inside a sentence).`);
}
const TOKENS = {
  REACH: (page, arg) => reach(page, arg),
  EXPLAIN: () => partial("explain").replace("{{OPEN}}", () => ""),
  EXPLAIN_OPEN: () => partial("explain").replace("{{OPEN}}", () => " open"),
  MAP: () => partial("map"),
  AREA_CHIPS: () => partial("area-chips"),
  LIVE_REVIEWS: () => partial("live-reviews"),   // the loader tag of the live Google reviews feed; inside the element marked data-pp-live-reviews (October 12, 2026)
  GUIDE_CARDS: (page, arg) => guideCards(page, arg || ""),
  BUILDER_MOUNT: (page) => {
    if (WITH_BUILDER.includes(page.meta.hero.recipe)) throw new PageError(page.slug, `{{BUILDER_MOUNT}}: the "${page.meta.hero.recipe}" hero already carries the price builder; a page has one mount.`);
    return render(partial("builder-mount"), { mountAttrs: "" }, page.slug).replace(/^ {4}/, "");
  },
};
function sectionsHtml(page) {
  const fail = (m) => { throw new PageError(page.slug, m); };
  for (const [re, why] of [[/<h1[\s>]/, "the hero carries the page's only h1; start your sections at h2"], [/<(html|head|body|main|footer)[\s>]|<header class="hdr"/, "the builder supplies <head>, the header, <main> and the footer; a source holds only its own <section> blocks"],
    [/<script[\s>]/, "no <script> in a source: name a family script in \"scripts\", and put structured data in \"schema\""], [/<style[\s>]|<link[\s>]/, "no <style> or <link> in a source: put styles in css/family-<name>.css and name it in \"css\""]]) {
    if (re.test(page.body)) fail(why + ".");
  }
  let body = page.body.replace(/^[ \t]*\{\{FAQ_JSONLD\}\}[ \t]*\n?/gm, "").replace(/\{\{FAQ_JSONLD\}\}/g, "");   // accepted and not needed: FAQ data is always generated
  body = body.replace(/\{\{([A-Z_]+)(?::([^}]*))?\}\}/g, (m, name, arg) => {
    if (!TOKENS[name]) fail(`${m} is not a token.${didYouMean(name, Object.keys(TOKENS))} The tokens are: ${Object.keys(TOKENS).map((t) => "{{" + t + "}}").join(" ")} {{FAQ_JSONLD}}.`);
    return TOKENS[name](page, arg);
  });
  const left = /\{\{[^}]*\}\}|<!--@[^>]*-->/.exec(body);
  if (left) fail(`${left[0]} was left in the page: it is not a token the builder knows.`);
  if ((body.match(/\sid="pp-builder"/g) || []).length > 1) fail("the price-builder mount appears twice; a page has one.");
  return body;
}

// ---- structured data: the organisation, the page, the breadcrumb trail, and the FAQ exactly as it is shown ----
const ORG = JSON.parse(fs.readFileSync(path.join(PARTIALS_DIR, "organization.json"), "utf8"));
const BUSINESS = { "@id": SITE + "/#business" }, WEBSITE = { "@id": SITE + "/#website" };
// the address of another page of the thirty: its own canonical when its source sets one (the Yard Guide lives at the blog's address)
const pageUrlCache = new Map();
function pageUrl(slug) {
  if (!pageUrlCache.has(slug)) {
    let own = null;
    try { own = readSource(path.join(PAGES_DIR, slug + ".html")).meta.canonical; } catch { /* not written yet, or broken: its plain address */ }
    pageUrlCache.set(slug, typeof own === "string" && own ? own : slug === "index" ? SITE + "/" : `${SITE}/${slug}`);
  }
  return pageUrlCache.get(slug);
}
function structuredData(page, sections) {
  const { meta, slug } = page, schema = meta.schema || {}, url = canonicalOf(page);
  const name = decode(meta.title), description = decode(meta.description);
  const webPage = { "@type": schema.type || "WebPage", "@id": url + "#webpage", url, name: schema.name ? decode(schema.name) : name, description };
  if (schema.dateModified) webPage.dateModified = String(schema.dateModified);
  if (slug === "index") Object.assign(webPage, { about: BUSINESS, isPartOf: WEBSITE });
  else Object.assign(webPage, { isPartOf: WEBSITE }, schema.service ? { mainEntity: { "@id": url + "#service" } } : {});
  // a collection page points at its list (the all-areas page and its ItemList of city pages)
  const list = (schema.extra || []).find((n) => n["@type"] === "ItemList");
  if (schema.type === "CollectionPage" && list && !schema.service) { if (!list["@id"]) list["@id"] = url + "#list"; webPage.mainEntity = { "@id": list["@id"] }; }
  const graph = [webPage];
  // a city page serves a city: say so with the type, as the live pages do
  const areaServed = schema.service && (meta.hero.recipe === "city" ? { "@type": schema.service.areaType || "City", name: schema.service.areaServed } : schema.service.areaServed);
  if (schema.service) graph.push({ "@type": "Service", "@id": url + "#service", url, name: schema.service.name, serviceType: schema.service.serviceType, description, provider: BUSINESS, areaServed });
  if (schema.breadcrumb) {
    const trail = [{ name: "Home", item: SITE + "/" }, ...schema.breadcrumb.slice(0, -1).map((t) => ({ name: t.name, item: pageUrl(t.page) })), { name: schema.breadcrumb[schema.breadcrumb.length - 1], item: url }];
    graph.push({ "@type": "BreadcrumbList", itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: t.item })) });
  }
  // What a page adds (schema.extra) never doubles what the builder writes. A node that IS this page (the same @id, or a
  // page type such as AboutPage or CollectionPage) is merged into the one WebPage node: its type becomes the more
  // specific one and its other fields are added. A BreadcrumbList a page writes itself replaces the builder's, so the
  // page carries one trail. Any other node with the @id of a node already in the graph is merged into that node.
  for (const node of schema.extra || []) {
    const type = [].concat(node["@type"])[0];
    const isPage = PAGE_TYPES.includes(type) && (node["@id"] === webPage["@id"] || node.url === url || (!node["@id"] && !node.url));
    if (isPage) {
      const { "@type": t, "@id": id, url: u, ...rest } = node;
      if (type !== "WebPage") webPage["@type"] = type;
      for (const [k, v] of Object.entries(rest)) if (webPage[k] === undefined || k === "name" || k === "dateModified") webPage[k] = v;
      continue;
    }
    if (type === "BreadcrumbList") { const at = graph.findIndex((n) => n["@type"] === "BreadcrumbList"); if (at >= 0) graph[at] = node; else graph.push(node); continue; }
    const same = node["@id"] && graph.find((n) => n["@id"] === node["@id"]);
    if (same) { for (const [k, v] of Object.entries(node)) if (same[k] === undefined) same[k] = v; continue; }
    graph.push(node);
  }
  const blocks = [ORG, { "@context": "https://schema.org", "@graph": graph }];
  const faq = faqPairs(sections);
  if (faq.length) blocks.push({ "@context": "https://schema.org", "@type": "FAQPage", "@id": url + "#faq", isPartOf: WEBSITE,
    mainEntity: faq.map((q) => ({ "@type": "Question", name: q.question, acceptedAnswer: { "@type": "Answer", text: q.answer } })) });
  const text = blocks.map((b) => '<script type="application/ld+json">' + JSON.stringify(b).replace(/</g, "\\u003c") + "</script>").join("\n");
  if (/AggregateRating|"@type":"Review"/.test(text)) throw new PageError(slug, "structured data must never carry AggregateRating or Review.");
  return text;
}

// ================================================================================================================
// 3b. Pictures for speed, and the link preview (DESIGN.md "Speed"; ADD-A-PAGE.md section 10)
// ================================================================================================================
// Every hero and scene has WebP copies in up to three widths under assets/derived/ (node _work/perf/derive-images.mjs).
// The builder writes them as <source type="image/webp" srcset sizes> in front of the JPEG, which stays the <img> for a
// browser without WebP, and asks for the first-screen one in the head (rel="preload", one line per breakpoint).
// A picture with no copies, or with copies older than itself, is written as before and named at the end of the build.
//
// "sizes" tells the browser how wide the picture is DRAWN, so it can pick the smallest file that is sharp enough.
// The figures below were measured on the built pages (node _work/perf/probe-sizes.mjs prints them) and carry a margin
// of 15%: Chrome picks the file nearest the drawn width, which may be the smaller neighbour, and the margin keeps it
// from enlarging a picture by more than a few percent. A picture that is cropped to fill a taller box is drawn wider
// than the box: a 16:9 scene in the square arc frame is 1.78 box widths wide.
const A = "../../assets/";
const MARGIN = 1.15;
const PHONE = "(max-width: 699px)", WIDE = "(min-width: 700px)";
const PHONE_MAX = 1152;                                    // on a phone no hero file wider than this is offered (below)
const HERO_PHONE_VW = { home: 100, service: 133, city: 133, plain: 100 };   // the hero scene on a phone, in window widths
const FRAME_BOX = (wide) => [["(max-width: 619px)", 95, "vw"], ["(max-width: 899px)", wide ? 540 : 460, "px"], ["(max-width: 1279px)", 46, "vw"], ["", 588, "px"]];
const FOOT_DRAWN = [["(max-width: 899px)", 178, "vw"], ["(max-width: 1365px)", 93, "vw"], ["", 69, "vw"]];
const COVER_DRAWN = [["(max-width: 539px)", 65, "vw"], ["(max-width: 699px)", 288, "px"], ["(max-width: 1239px)", 334, "px"], ["", 529, "px"]];   // an article's cover as hero art
const sizesOf = (table, f) => table.map(([media, n, unit]) => `${media ? media + " " : ""}${Math.round(n * f)}${unit}`).join(", ");
const srcsetOf = (copies) => (copies.length === 1 ? A + copies[0].file : copies.map((v) => `${A}${v.file} ${v.w}w`).join(", "));
const notes = new Map();                                   // slug -> sentences about a picture written as it was
function note(slug, sentence) { if (!notes.has(sentence)) notes.set(sentence, new Set()); notes.get(sentence).add(slug); }

// The hero's <source> lines and the head's preload lines.
// A PHONE (under 700px) is offered the copies up to 1152px only. That is every pixel of a two-pixel-per-point screen
// (a 430px phone draws the 4:3 crop of a city scene 573 points wide) and what a three-pixel screen can show a person;
// the full 1600px file is 60 to 110 KB heavier and is the largest thing a paid visitor on mobile data would wait for.
// From 700px up the full width is the only copy offered: the picture is drawn 700 to 1750 pixels wide there.
function heroPictures(page) {
  const hero = page.meta.hero, recipe = hero.recipe, out = { sources: [], preloads: [] };
  const preload = (attrs) => out.preloads.push(`<link rel="preload" as="image" ${attrs} fetchpriority="high">`);
  const source = (attrs) => out.sources.push(`    <source ${attrs}>`);
  if (recipe === "home") {
    const phone = webpCopies("heroes/home-phone.jpg"), desk = webpCopies("heroes/home-desktop.jpg"), sizes = `${Math.round(HERO_PHONE_VW.home * MARGIN)}vw`;
    if (phone.copies) { source(`media="${PHONE}" type="image/webp" srcset="${srcsetOf(phone.copies)}" sizes="${sizes}" width="900" height="1350"`); preload(`type="image/webp" media="${PHONE}" imagesrcset="${srcsetOf(phone.copies)}" imagesizes="${sizes}"`); }
    else { note(page.slug, phone.why); preload(`href="${A}heroes/home-phone.jpg" media="${PHONE}"`); }
    source(`media="${PHONE}" srcset="${A}heroes/home-phone.jpg" width="900" height="1350"`);
    if (desk.copies) { const top = desk.copies[desk.copies.length - 1]; source(`type="image/webp" srcset="${A}${top.file}" width="${top.w}" height="${top.h}"`); preload(`type="image/webp" media="${WIDE}" href="${A}${top.file}"`); }
    else { note(page.slug, desk.why); preload(`href="${A}heroes/home-desktop.jpg" media="${WIDE}"`); }
  } else if (hero.scene) {
    const scene = webpCopies(hero.scene);
    if (!scene.copies) { note(page.slug, scene.why); preload(`href="${A}${hero.scene}"`); return out; }
    const top = scene.copies[scene.copies.length - 1], small = scene.copies.filter((v) => v.w <= PHONE_MAX), dims = `width="${top.w}" height="${top.h}"`;
    if (small.length && small.length < scene.copies.length) {
      const sizes = `${Math.round(HERO_PHONE_VW[recipe] * MARGIN)}vw`;
      source(`media="${PHONE}" type="image/webp" srcset="${srcsetOf(small)}" sizes="${sizes}" ${dims}`);
      preload(`type="image/webp" media="${PHONE}" imagesrcset="${srcsetOf(small)}" imagesizes="${sizes}"`);
      source(`type="image/webp" srcset="${A}${top.file}" ${dims}`);
      preload(`type="image/webp" media="${WIDE}" href="${A}${top.file}"`);
    } else { source(`type="image/webp" srcset="${A}${top.file}" ${dims}`); preload(`type="image/webp" href="${A}${top.file}"`); }
  } else if (hero.cover) {                                                                        // an article's own cover on the drawn field
    const file = covers[hero.cover].cover, got = webpCopies(file.replace(/^assets\//, ""));
    if (got.copies) preload(`type="image/webp" imagesrcset="${srcsetOf(got.copies)}" imagesizes="${sizesOf(COVER_DRAWN, MARGIN)}"`);
    else { note(page.slug, got.why); preload(`href="../../${file}"`); }
  } else if (hero.pose) preload(`href="${A}brand/poses/${hero.pose}.webp"`);                      // the pose on the drawn field
  return out;
}

// The pictures further down the page: a scene in an arc frame (figure.frame > img.frame__img) and the closing scene.
// Each <img> is wrapped in <picture style="display:contents"> with one WebP <source>; the wrapper makes no box, so
// nothing moves and every rule that styles the <img> still does. Lazy pictures stay lazy.
function picturesPass(html, slug) {
  const keyOf = (img) => (/\ssrc="\.\.\/\.\.\/assets\/((?:heroes|scenes|covers)\/[^"]+\.jpg)"/.exec(img) || [])[1];
  const wrap = (img, table, boxAspect) => {
    const key = keyOf(img);
    if (!key) return img;
    const got = webpCopies(key);
    if (!got.copies) { note(slug, got.why); return img; }
    const top = got.copies[got.copies.length - 1], f = MARGIN * (boxAspect ? Math.max(1, top.w / top.h / boxAspect) : 1);
    const sizes = got.copies.length > 1 ? ` sizes="${sizesOf(table, f)}"` : "";
    return `<picture style="display:contents"><source type="image/webp" srcset="${srcsetOf(got.copies)}"${sizes}>${img}</picture>`;
  };
  html = html.replace(/(<(?:figure|div|span)\b[^>]*\sclass="([^"]*)"[^>]*>\s*)(<img\b[^>]*>)/g, (m, open, cls, img) => {
    if (!/(^|\s)frame(\s|$)/.test(cls) || !/\sclass="[^"]*\bframe__img\b/.test(img)) return m;
    return open + wrap(img, FRAME_BOX(/(^|\s)frame--wide(\s|$)/.test(cls)), /(^|\s)frame--wide(\s|$)/.test(cls) ? 4 / 3 : 1);
  });
  html = html.replace(/(<div class="foot__pic">\s*)(<img\b[^>]*>)/, (m, open, img) => open + wrap(img, FOOT_DRAWN, 0));
  html = html.replace(/(<span class="drawn__cover">\s*)(<img\b[^>]*>)/, (m, open, img) => open + wrap(img, COVER_DRAWN, 0));
  // a hero or scene anywhere else is left as it is, and said so: the builder knows no drawn width for it
  // (the cover inside a native GoHighLevel post is GoHighLevel's own markup and is never touched)
  for (const m of html.matchAll(/(<source\b[^>]*>\s*)?(<img\b[^>]*>)/g)) {
    const key = keyOf(m[2]);
    if (key && !m[1] && !/\bblog-content-blog-image\b/.test(m[2]) && webpCopies(key).copies) note(slug, `assets/${key} is used in a place the builder has no drawn width for (not a hero, an arc frame or the closing scene), so it is served as the JPEG. Add the place to picturesPass in _work/build-site.mjs.`);
  }
  return html;
}

// The picture a shared link shows: the page's own "ogImage", or its link preview under the public address of the assets.
const SETTINGS = siteSettings();
function sharePictureOf(page) {
  const { meta, slug } = page;
  if (meta.ogImage) return { url: meta.ogImage };
  if (page.kind !== "page" || !SETTINGS.assetsBase) return null;
  const got = sharePicture(slug);
  if (!got.picture) { note(slug, got.why); return null; }
  const own = meta.hero.recipe === "home" ? "heroes/home-desktop.jpg" : meta.hero.scene;
  return { url: `${SETTINGS.assetsBase}/${got.picture.file}`, width: 1200, height: 630, alt: got.picture.from === own ? meta.hero.alt : "" };
}

// ================================================================================================================
// 4. One page, start to finish
// ================================================================================================================
function buildPage(page) {
  check(page);
  const { meta, slug, kind } = page, hero = meta.hero, recipe = hero.recipe;
  const sections = sectionsHtml(page);
  const body = { ...(meta.body || {}) };
  if (hero.scene && GLOVED_SCENES.has(hero.scene) && body["data-mascot"] === undefined) body["data-mascot"] = "gloved";   // the glove rule, never forgotten
  if (recipe === "kit") body["data-no-price-bar"] = true;
  const customer = meta.audience === "customer";            // a page for people who already have a price: nothing on it sells one
  if (customer) { body["data-no-price-bar"] = true; body["data-audience"] = "customer"; }
  const robots = meta.robots || (kind !== "page" ? "noindex" : "");
  const noindex = /noindex/i.test(robots);
  // the first-screen picture, asked for as early as the browser reads the head: one line per breakpoint (section 3b)
  const preloads = recipe === "kit" ? "" : heroPictures(page).preloads.join("\n");
  const main = noBreakCompounds(recipe === "kit"
    ? render(partial("kit-intro"), { title: esc(hero.title), lead: esc(hero.lead), sections }, slug)
    : [heroHtml(page), factsHtml(page), sections].filter(Boolean).join("\n\n"));
  // what a shared link shows (a text message, a social post): the page's own title and description, and one picture.
  // Open Graph and Twitter tags on every page, from its title, description and canonical. The picture (og:image and
  // twitter:image) is the page's own link preview, assets/derived/share/<slug>.jpg, and is written only when the ONE site
  // setting gives the public address of the assets ("assetsBase" in _work/partials/site.json): the review build's
  // pictures have no public address, and a wrong picture is worse than none. A page that names "ogImage" in its JSON
  // block (an article's published cover) shows that instead.
  const pic = recipe === "kit" ? null : sharePictureOf(page);
  const social = recipe === "kit" ? "" : [
    '<meta property="og:type" content="website">', '<meta property="og:site_name" content="Purge Pros">',
    `<meta property="og:title" content="${esc(meta.title)}">`, `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${canonicalOf(page)}">`, pic ? `<meta property="og:image" content="${esc(pic.url)}">` : "",
    pic && pic.width ? `<meta property="og:image:width" content="${pic.width}">\n<meta property="og:image:height" content="${pic.height}">\n<meta property="og:image:type" content="image/jpeg">` : "",
    pic && pic.alt ? `<meta property="og:image:alt" content="${esc(pic.alt)}">` : "",
    `<meta name="twitter:card" content="${pic ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(meta.title)}">`, `<meta name="twitter:description" content="${esc(meta.description)}">`,
    pic ? `<meta name="twitter:image" content="${esc(pic.url)}">` : "", pic && pic.alt ? `<meta name="twitter:image:alt" content="${esc(pic.alt)}">` : ""].filter(Boolean).join("\n");
  const logo = logoFiles();
  if (logo.why) note(slug, logo.why);
  let html = render(partial("document"), {
    title: esc(meta.title), description: esc(meta.description),
    canonical: noindex ? "" : `<link rel="canonical" href="${canonicalOf(page)}">`,   // a page kept out of search names no canonical
    social, visitor: customer ? "" : "1", customer: customer ? "1" : "", portal: PORTAL_HREF, standinAsOf: STANDIN ? esc(STANDIN.asOf || "") : "",
    reviewBuild: SETTINGS.review ? "1" : "",                  // the footer's "Review build." line: only when site.json says "review": true
    headerText: SETTINGS.headerText ? "1" : "",               // the Text button of the phone top bar: only when site.json says "headerText": true
    robots: robots ? `<meta name="robots" content="${esc(robots)}">` : "",
    preloads, stylesheets: (meta.css || []).map((f) => `<link rel="stylesheet" href="${f}">`).join("\n"),
    scripts: (meta.scripts || []).map((f) => `<script src="${f}" defer></script>`).join("\n"),
    bodyAttrs: Object.entries(body).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join(""),
    structuredData: recipe === "kit" ? "" : structuredData(page, sections), main,
    icon: logo.icon, logoSmall: logo.header, logoLarge: logo.footer,
  }, slug);
  html = html.replace("<head>\n", () => `<head>\n<!-- Built by _work/build-site.mjs from ${rel(page.file)}. Do not edit this file: edit the source and build again. -->\n`);
  html = reviewsPass(html, slug);
  html = picturesPass(html, slug);
  // "Get my price" always goes somewhere: on a page with no builder in it, the link is the quote page (scripts still open the panel in place).
  if (!/\sid="quote"/.test(html)) {
    if (slug === "quote") throw new PageError(slug, 'the quote page must carry the price builder: put {{BUILDER_MOUNT}} inside an element with id="quote".');
    html = html.replaceAll('href="#quote"', 'href="quote.html"');
  }
  return html + "\n";
}

// ---- THE ONE SWITCH for the Google rating: _work/partials/reviews.json ---------------------------------------------
// No partial and no page holds a rating of its own. Every line that shows one carries data-pp-reviews (its wording, with
// {rating} and {count}) and data-pp-neutral (its wording when no figure is known; empty means the line is left out).
//   "standin": { "rating": "4.9", "count": 43, "asOf": "October 4" }   every page is built with these figures and each badge is
//                                                                       marked data-standin="true" (the review build)
//   "standin": null                                                     every page is built with the neutral lines ("Read our
//                                                                       Google reviews"), no figure and no stand-in mark:
//                                                                       the build for ROLLOUT. The live review feed then
//                                                                       calls PurgeProsReviews.set({ rating, count }) (js/site.js)
// PP_REVIEWS=neutral in the environment builds the neutral pages once without editing the file (to look at them).
const REVIEWS = JSON.parse(fs.readFileSync(path.join(PARTIALS_DIR, "reviews.json"), "utf8"));
const STANDIN = process.env.PP_REVIEWS === "neutral" ? null : REVIEWS.standin || null;
if (STANDIN && (!/^[1-5]\.\d$/.test(String(STANDIN.rating)) || !Number.isInteger(STANDIN.count) || STANDIN.count < 1)) throw new Error('_work/partials/reviews.json: "standin" must be { "rating": "4.9", "count": 43, "asOf": "October 4" } or null.');
const NEUTRAL = String(REVIEWS.neutral || "Read our Google reviews");
function reviewsPass(html, slug) {
  const fail = (m) => { throw new PageError(slug, m); };
  const fill = (line) => line.replace(/\{rating\}/g, STANDIN.rating).replace(/\{count\}/g, String(STANDIN.count));
  // 1. A badge typed into a page's own sections (a.gbadge marked data-standin) gets the same hooks, so the switch reaches it:
  //    its figure, its count line, its second line and its label. (The partials' badges carry the hooks already.)
  html = html.replace(/<a\b[^>]*\bclass="gbadge[^"]*"[^>]*>[\s\S]*?<\/a>/g, (badge) => {
    if (!/\sdata-standin="true"/.test(badge) || /data-pp-reviews=/.test(badge)) return badge;
    const how = " Copy the badge from kit.html (06 Google badge): a.gbadge with data-standin=\"true\" and an aria-label that starts \"Rated 4.9 from 43 Google reviews.\", span.gbadge__num, and span.gbadge__txt holding \"43 Google reviews\" and, if wanted, one <u> line. The figures themselves come from _work/partials/reviews.json.";
    let out = badge, hits = 0, shown = "";                   // shown: the badge's second visible line, if it has one
    out = out.replace(/<span class="gbadge__num">[^<]*<\/span>/, () => { hits += 1; return '<span class="gbadge__num" data-pp-reviews="{rating}" data-pp-neutral=""></span>'; });
    out = out.replace(/(<span class="gbadge__txt">)\s*\d+ (Google )?reviews\s*(?:<u>([^<]*)<\/u>)?(?=\s*<\/span>)/, (m, open, g, second) => { hits += 1; shown = second === undefined ? "" : second.trim(); return `${open}<span data-pp-reviews="{count} Google reviews" data-pp-neutral="${esc(NEUTRAL)}"></span>${second === undefined ? "" : ` <u data-pp-reviews="${second.trim()}" data-pp-neutral=""></u>`}`; });
    // The name read out starts with the words on the badge, in their order ("4.9, 43 Google reviews. Read what neighbors
    // say."), so someone using voice control can say what they see (WCAG 2.5.3; audit m10). A badge with no second line
    // keeps the rest of the name its source gives.
    out = out.replace(/\saria-label="Rated \d(?:\.\d)? from \d+ (?:Google )?reviews\.([^"]*)"/, (m, rest) => { hits += 1; return ` data-pp-reviews-label="{rating}, {count} Google reviews.${shown ? " " + shown.replace(/[.]$/, "") + "." : rest}" data-pp-neutral-label="${esc(NEUTRAL)}."`; });
    if (hits !== 3) fail("a Google rating badge in this page's own sections is not in the standard form, so the one switch for the rating cannot reach it." + how);
    out = out.replace(/(<\/span>)(<span class="gbadge__txt">)/, "$1 $2");   // a space between the figure and its words: not drawn (the badge is a flex row), but read as "4.9 43 Google reviews", not "4.943" (audit m10)
    return out;
  });
  // 2. every line with a hook: the stand-in figures, or the neutral line
  const hooks = (html.match(/\sdata-pp-reviews="/g) || []).length;
  let filled = 0;
  html = html.replace(/<([a-z0-9]+)\b((?:[^>"]|"[^"]*")*?)\sdata-pp-reviews="([^"]*)"((?:[^>"]|"[^"]*")*)>([^<]*)<\/\1>/g, (m, tag, pre, line, post) => {
    filled += 1;
    const neutral = (/\sdata-pp-neutral="([^"]*)"/.exec(pre + post) || [])[1] || "";
    const open = `<${tag}${pre} data-pp-reviews="${line}"${post}`.replace(/\shidden(?=\s|$)/, "");
    return STANDIN ? `${open}>${fill(line)}</${tag}>` : `${open}${neutral ? "" : " hidden"}>${neutral}</${tag}>`;
  });
  if (filled !== hooks) fail(`${hooks - filled} line(s) marked data-pp-reviews hold more than plain text. A line the rating switch rewrites is one element with text only (a span or a u).`);
  // 3. the labels read out by a screen reader
  html = html.replace(/<[a-z0-9]+\b(?:[^>"]|"[^"]*")*\sdata-pp-reviews-label="([^"]*)"(?:[^>"]|"[^"]*")*>/g, (tag, line) => {
    const neutral = (/\sdata-pp-neutral-label="([^"]*)"/.exec(tag) || [])[1] || esc(NEUTRAL) + ".";
    return tag.replace(/\saria-label="[^"]*"/, "").replace(/>$/, ` aria-label="${STANDIN ? fill(line) : neutral}">`);
  });
  // 4. with no stand-in, nothing is marked as one
  if (!STANDIN) html = html.replace(/\sdata-standin="true"/g, "");
  else if (/\sdata-standin="true"/.test(html) === false && hooks) fail("a rating line is on the page but nothing is marked data-standin=\"true\"; the badge or fact that holds a stand-in figure carries that mark.");
  return html;
}

// "one-time" and "start-up" never break at their hyphen in a heading or an FAQ question: the word is wrapped in
// span.nb (white-space: nowrap). The ordinary hyphen stays, so the text a search engine, a screen reader or the FAQ
// data reads is unchanged. A word already inside a no-wrap span (.nb, a family's own -nb class, .swash) is left alone.
const COMPOUNDS = /\b(one-time|start-up)\b/gi;
function noBreakCompounds(html) {
  return html.replace(/(<h([1-4])\b[^>]*>)([\s\S]*?)(<\/h\2>)/g, (whole, open, level, inner, close) => {
    if (!COMPOUNDS.test(inner)) return whole;
    COMPOUNDS.lastIndex = 0;
    let held = 0;                                   // how many no-wrap spans are open at this point
    const stack = [];
    const out = inner.replace(/<[^>]+>|[^<]+/g, (piece) => {
      if (piece[0] === "<") {
        if (/^<\//.test(piece)) { if (stack.pop()) held -= 1; }
        else if (!/\/>$/.test(piece) && !/^<(br|img|wbr)\b/i.test(piece)) { const hold = /\sclass="[^"]*(?:\bnb\b|-nb\b|\bswash\b)[^"]*"/.test(piece); stack.push(hold); if (hold) held += 1; }
        return piece;
      }
      return held ? piece : piece.replace(COMPOUNDS, '<span class="nb">$1</span>');
    });
    return open + out + close;
  });
}

// Titles and descriptions are unique across the site.
function checkUnique(pages) {
  const errors = [];
  for (const field of ["title", "description"]) {
    const seen = new Map();
    for (const p of pages) {
      const v = typeof p.meta[field] === "string" ? decode(p.meta[field]).trim().toLowerCase() : "";
      if (!v) continue;
      if (seen.has(v)) errors.push(new PageError(p.slug, `${field} is the same as on "${seen.get(v)}". Every page needs its own ${field}.`));
      else seen.set(v, p.slug);
    }
  }
  return errors;
}

// ================================================================================================================
// 5. Command line
// ================================================================================================================
const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const p of siteState()) console.log(`  ${p.file.padEnd(34)} ${p.state}`);
  const s = siteState();
  console.log(`\n${s.filter((p) => p.built).length} of ${PAGES.length} built.`);
  process.exit(0);
}
const unknown = args.filter((a) => a.startsWith("--") && !["--list", "--min"].includes(a));
if (unknown.length) { console.error(`Unknown option ${unknown.join(", ")}. The options are --list and --min.`); process.exit(1); }
const wanted = args.filter((a) => !a.startsWith("--")).map((a) => a.replace(/\.html$/, ""));
const problems = [], sources = [];
for (const file of listSources()) {
  try { sources.push(readSource(file)); } catch (e) { problems.push({ slug: path.basename(file, ".html"), error: e, mine: !wanted.length || wanted.includes(path.basename(file, ".html")) }); }
}
for (const w of wanted) if (!sources.some((p) => p.slug === w) && !problems.some((p) => p.slug === w)) problems.push({ slug: w, mine: true, error: new PageError(w, `no source file _work/pages/${w}.html${PAGES.includes(w) ? "" : " (and it is not one of the thirty pages)." + didYouMean(w, PAGES)}`) });
for (const e of checkUnique(sources.filter((p) => p.kind === "page"))) problems.push({ slug: e.slug, error: e, mine: !wanted.length || wanted.includes(e.slug) });

const rows = [];
for (const page of sources) {
  if (wanted.length && !wanted.includes(page.slug)) continue;
  if (problems.some((p) => p.slug === page.slug)) continue;
  try {
    const html = buildPage(page);
    const target = path.join(ROOT, page.out);
    const same = fs.existsSync(target) && fs.readFileSync(target, "utf8") === html;
    if (!same) fs.writeFileSync(target, html);
    const count = (re) => (html.match(re) || []).length;
    rows.push(`  ${page.out.padEnd(34)} ${String(html.length).padStart(7)} bytes  ${String(count(/<section[\s>]/g)).padStart(2)} sections  ${String(count(/<h2[\s>]/g)).padStart(2)} h2  ${String(count(/application\/ld\+json/g))} JSON-LD  ${page.meta.hero.recipe.padEnd(8)} ${same ? "unchanged" : "written"}`);
  } catch (e) {
    if (!e.message.startsWith(page.slug + ":")) e.message = `${page.slug}: ${e.message}`;
    problems.push({ slug: page.slug, error: e, mine: true });
  }
}
if (rows.length) console.log("Built from _work/pages/ and _work/partials/:\n" + rows.join("\n"));
const mine = problems.filter((p) => p.mine), others = problems.filter((p) => !p.mine);
if (others.length) console.log("\nNot yours to fix now (other pages' sources have a problem; yours were built):\n" + others.map((p) => "  " + p.error.message).join("\n"));
// pictures: what was written as it was, and whether a shared link shows a picture
if (notes.size) console.log("\nPictures written without their WebP copies or link preview (the page still works; it is slower):\n" + [...notes].map(([sentence, slugs]) => `  ${sentence}  [${[...slugs].slice(0, 4).join(", ")}${slugs.size > 4 ? " and " + (slugs.size - 4) + " more" : ""}]`).join("\n"));
if (rows.length) console.log(SETTINGS.assetsBase
  ? `\nLink previews: each page names ${SETTINGS.assetsBase}/derived/share/<slug>.jpg as og:image and twitter:image.`
  : `\nLink previews: NO PAGE NAMES A PICTURE (og:image, twitter:image). The public address of the assets is not set: at rollout put it in "assetsBase" in _work/partials/site.json and build again.`);
if (rows.length) console.log(SETTINGS.review
  ? `Review build: every footer ends with the line "Review build. Nothing on this page is sent anywhere." ("review": true in _work/partials/site.json). For rollout set it to false and build again.`
  : `ROLLOUT build: no page carries the "Review build." line ("review" is not true in _work/partials/site.json).`);
if (rows.length) console.log(SETTINGS.headerText
  ? `Phone top bar: WITH the Text button ("headerText": true in _work/partials/site.json, or PP_HEADER_TEXT=1). Build every page with the same setting before packaging.`
  : `Phone top bar: without the Text button ("headerText" is not true in _work/partials/site.json).`);
if (args.includes("--min") && !mine.length) {
  const made = writeMinified(), kb = (n) => (n / 1024).toFixed(1).padStart(7) + " KB", sum = (k, kind) => made.filter((r) => !kind || r.kind === kind).reduce((n, r) => n + r[k], 0);
  console.log("\nMinified copies for rollout, in assets/derived/min/ (whitespace and comments only; nothing renamed):\n" + made.map((r) => `  ${r.name.padEnd(24)} ${kb(r.before)}  ->  ${kb(r.after)}   ${String(Math.round(100 - 100 * r.after / r.before)).padStart(2)}% smaller   ${r.written ? "written" : "unchanged"}`).join("\n"));
  console.log(`  stylesheets ${kb(sum("before", "css")).trim()} -> ${kb(sum("after", "css")).trim()}, scripts ${kb(sum("before", "js")).trim()} -> ${kb(sum("after", "js")).trim()}, all ${kb(sum("before")).trim()} -> ${kb(sum("after")).trim()} (${Math.round(100 - 100 * sum("after") / sum("before"))}% smaller). Prove them equal to their sources: node _work/perf/verify-min.mjs`);
}
if (mine.length) { console.error(`\nNOT BUILT, ${mine.length} problem(s):\n` + mine.map((p) => "  " + p.error.message).join("\n")); process.exit(1); }
const state = siteState();
console.log(`\n${state.filter((p) => p.built).length} of ${PAGES.length} pages built. Next: node _work/check-site.mjs${wanted.length ? " " + wanted.join(" ") : ""}`);
