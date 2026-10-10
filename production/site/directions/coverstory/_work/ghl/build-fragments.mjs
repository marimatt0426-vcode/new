// build-fragments.mjs : packages the approved built pages as GoHighLevel Custom Code blocks.
//
//   node _work/ghl/build-fragments.mjs                 every profile in fragments.config.json (staging, production)
//   node _work/ghl/build-fragments.mjs staging         only that profile
//
// READS   the built pages in directions/coverstory (<slug>.html), css/, js/, the engine, assets/ and
//         fragments.config.json. It never runs the site builder and never edits a page, stylesheet or script.
// WRITES  rollout/ghl-fragments/<profile>/   (the folder is emptied and written again on every run)
//           shared/header.html, footer.html          the two Global Sections (one block each)
//           shared/<slug>-header.html, -footer.html  for a page for existing customers (Welcome), which carries its own
//           shared/site-head.html, site-body.html    the website's head and body code. With "scriptsPlacement": "footer"
//                                                    (the setting since the October 9 staging gate) the settings object
//                                                    window.PPSite and the script loader stand at the end of EVERY footer
//                                                    block (shared, Welcome's own, both blog templates), because
//                                                    GoHighLevel holds site body code until the visitor's first touch or
//                                                    about 4 seconds; site-body.html is then two comment lines
//           pages/<slug>.html                        one body block per page (+ <slug>.schema.html, <slug>.1/.2.html when too large;
//                                                    <slug>.schema.html ALWAYS for a page named in "pageDataInOwnFile")
//           blog/                                    the blocks of the two blog templates and the blog's head and body code
//           fields.json, FIELDS.md                   per page a "type these" table (path, title, description, canonical,
//                                                    share image, the robots custom meta tag where the page must stay out
//                                                    of search, where its schema file goes) and a "paste these" table
//           MANIFEST.json                            every block with size and SHA-256; every file to upload to the assets host
// Nothing is listed by hand: pages, the three header versions, the body settings, the shared stylesheets and scripts
// are found by parsing the built pages, so the tool can be run again after any rebuild.
// Wording, prices, link text and pictures are never changed; check-fragments.mjs proves it block by block.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HERE, ROOT, RELEASE, OUT, posix, read, sha256, sha1, bytes, write, loadConfig, placeholders, tokens, attrsOf, mapAttrs,
  openTagOfRaw, topLevel, hasClass, discoverPages, fileInfo, listFiles, siteSettings, settingsProblems, TOKEN_GUARD, pageAddress, PREVIEW_BASE } from "./lib.mjs";

const ASSET_EXT = /\.(?:webp|png|jpe?g|gif|svg|avif|ico|css|js|mjs|json|woff2?|ttf|otf|mp4|webm|pdf|txt|xml)$/i;
const isRelative = (v) => v !== "" && !/^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(v);
const splitTail = (v) => { const m = /^([^?#]*)([?#].*)?$/.exec(v); return [m[1], m[2] || ""]; };
const intersect = (lists) => (lists.length ? lists[0].filter((x) => lists.every((l) => l.includes(x))) : []);
const jsString = (s) => JSON.stringify(String(s)).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).replace(/<\//g, "<\\/");
const asciiHtml = (s) => s.replace(/[\u0080-\u{10ffff}]/gu, (c) => `&#${c.codePointAt(0)};`);
const asciiJson = (s) => s.replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

// ====================================================================================================================
// 1. What the built pages have in common, found by parsing
// ====================================================================================================================
export function analyse(cfg, pages) {
  const site = { pages, bySlug: new Map(pages.map((p) => [p.slug, p])) };
  for (const p of pages) {
    p.publicUrl = cfg.publicUrl[p.slug] || p.canonical || p.metas["og:url"] || "";
    if (!/^https:\/\//.test(p.publicUrl)) throw new Error(`${p.slug}.html: no public address (no canonical and no og:url). Give one in fragments.config.json "publicUrl".`);
    p.kind = new URL(p.publicUrl).origin === cfg.blogOrigin ? "blog" : "site";
    p.customer = p.bodyAttrs["data-audience"] === "customer";
    p.inPlace = /\sid="quote"/.test(p.mainInner);                 // the page holds the builder mount, so price buttons open it in place
    p.nativePost = /\bpp-blog-native-post\b/.test(p.mainInner);   // the blog-post template: GoHighLevel's own post markup stands in the page
  }
  const visitors = pages.filter((p) => !p.customer);
  if (!visitors.length) throw new Error("no page for visitors found");

  // ---- the header and footer versions --------------------------------------------------------------------------------
  // A price launcher is <a … data-purge-quote …>. Its href is "#quote" on a page that holds the builder and the quote
  // page's file elsewhere. With those hrefs made equal, every visitor page must have ONE header and ONE footer.
  const launcherHrefs = new Set();
  const neutral = (html) => html.replace(/<a\b[^>]*\sdata-purge-quote\b[^>]*>/g, (tag) => tag.replace(/\shref="([^"]*)"/, (m, href) => { launcherHrefs.add(href); return ' href="@@PRICE@@"'; }));
  const variants = (part) => {
    const groups = new Map();
    for (const p of visitors) { const key = neutral(p[part]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p.slug); }
    return groups;
  };
  const headers = variants("headerHtml"), footers = variants("footerHtml");
  const explain = (what, groups) => `the visitor pages have ${groups.size} different ${what}s after the price buttons' addresses are made equal (${[...groups.values()].map((g) => g.slice(0, 4).join(", ") + (g.length > 4 ? ", ..." : "")).join(" | ")}). One Global Section cannot serve them: this needs a decision, see FRAGMENT-NOTES.md "Header and footer".`;
  if (headers.size !== 1) throw new Error(explain("header", headers));
  if (footers.size !== 1) throw new Error(explain("footer", footers));
  const elsewhere = [...launcherHrefs].filter((h) => h !== "#quote");
  if (elsewhere.length !== 1 || !/^[\w-]+\.html$/.test(elsewhere[0])) throw new Error(`expected the price buttons to point at "#quote" or at ONE page; found: ${[...launcherHrefs].join(", ")}`);
  site.quoteFile = elsewhere[0];
  site.quoteSlug = site.quoteFile.replace(/\.html$/, "");
  // the rule the build follows, proven for every page: "#quote" exactly where the page holds the builder mount
  for (const p of visitors) {
    const here = new Set(); (p.headerHtml + p.footerHtml).replace(/<a\b[^>]*\sdata-purge-quote\b[^>]*>/g, (tag) => { here.add(/\shref="([^"]*)"/.exec(tag)[1]); return tag; });
    if (here.size !== 1 || (here.has("#quote") !== p.inPlace)) throw new Error(`${p.slug}.html: its header and footer price buttons point at ${[...here].join(" and ")}, but the page ${p.inPlace ? "holds" : "does not hold"} the builder (id="quote"). The one-header rule "in place where the builder is on the page" no longer matches the build.`);
  }
  const anyElsewhere = visitors.find((p) => !p.inPlace) || visitors[0];
  site.header = neutral(anyElsewhere.headerHtml).replace(/@@PRICE@@/g, site.quoteFile);     // the "link to the quote page" form; a script makes it "#quote" where the builder is
  site.footer = neutral(anyElsewhere.footerHtml).replace(/@@PRICE@@/g, site.quoteFile);
  site.versions = { inPlace: visitors.filter((p) => p.inPlace).map((p) => p.slug), toQuotePage: visitors.filter((p) => !p.inPlace).map((p) => p.slug), customer: pages.filter((p) => p.customer).map((p) => p.slug) };

  // ---- stylesheets, fonts, scripts, shared page data -------------------------------------------------------------------
  const sitePages = pages.filter((p) => p.kind === "site");
  site.sharedStyles = intersect(sitePages.map((p) => p.stylesheets));            // css/site.css, css/builder.css
  site.fontLinks = pages[0].fontLinks;
  for (const p of pages) if (p.fontLinks.join("\n") !== site.fontLinks.join("\n")) throw new Error(`${p.slug}.html loads other typefaces than ${pages[0].slug}.html; the header block can carry only one set`);
  site.commonScripts = intersect(pages.map((p) => p.scripts));                    // js/site.js
  const price = intersect(visitors.map((p) => p.scripts)).filter((s) => !site.commonScripts.includes(s));
  const ref = visitors[0].scripts, firstCommon = Math.min(...site.commonScripts.map((s) => ref.indexOf(s)));
  site.priceBefore = price.filter((s) => ref.indexOf(s) < firstCommon);            // the engine
  site.priceAfter = price.filter((s) => ref.indexOf(s) > firstCommon);             // js/builder.js
  for (const p of pages) {
    p.ownScripts = p.scripts.filter((s) => !site.commonScripts.includes(s) && !price.includes(s));
    p.price = price.every((s) => p.scripts.includes(s));
    const again = [...(p.price ? site.priceBefore : []), ...site.commonScripts, ...p.ownScripts, ...(p.price ? site.priceAfter : [])];
    if (again.join("|") !== p.scripts.join("|")) throw new Error(`${p.slug}.html loads its scripts in an order the loader cannot repeat: ${p.scripts.join(", ")}`);
    p.familyStyles = p.stylesheets.filter((s) => !site.sharedStyles.includes(s));
  }
  site.sharedData = intersect(pages.map((p) => p.jsonld));                        // Organization + WebSite
  for (const p of pages) p.ownData = p.jsonld.filter((d) => !site.sharedData.includes(d));
  site.themeColor = pages[0].metas["theme-color"] || "";
  site.icon = pages[0].icon;
  // what site.css gives <body> that GoHighLevel's own stylesheet takes away again (font-weight and line-height, both !important)
  const css = read(path.join(ROOT, site.sharedStyles[0] || "css/site.css"));
  const bodyFont = /(?:^|\})\s*body\s*\{[^}]*?\bfont:\s*(\d{3})\s+[\d.]+px\s*\/\s*([\d.]+)\s/m.exec(css);
  site.bodyFont = bodyFont ? { weight: bodyFont[1], lineHeight: bodyFont[2] } : null;
  // the attributes the build puts on <body>
  site.bodyAttrNames = [...new Set(pages.flatMap((p) => Object.keys(p.bodyAttrs)))].sort();
  return site;
}

// ====================================================================================================================
// 2. One profile
// ====================================================================================================================
// The length a block will have once the date placeholder in the hosted addresses is replaced by a real date.
export function measureBlock(cfg, profile, text) {
  const g = cfg.sizeGuard || {}, grow = g.placeholder && profile.assetsBase.includes(g.placeholder) ? Math.max(0, (g.realLength || 0) - g.placeholder.length) : 0;
  return text.length + (/\n$/.test(text) ? 0 : 1) + (grow ? grow * (text.split(profile.assetsBase).length - 1) : 0);
}
// One plan for every profile: for each body block the strongest remedy any profile needs, with that profile's cut.
// A page named in "pageDataInOwnFile" is at remedy (a) or more in every profile by the setting itself (fit, below), so
// its page-data file never depends on which profiles, or how many staging page ids, went into the plan.
export function planFor(cfg, pages = discoverPages(), profiles = Object.values(cfg.profiles)) {
  const plan = new Map();
  for (const profile of profiles) for (const s of buildProfile(cfg, profile, pages).sizes) { const had = plan.get(s.block); if (!had || s.level > had.level) plan.set(s.block, { level: s.level, k: s.k, decidedBy: profile.name }); }
  return plan;
}
export function buildProfile(cfg, profile, pages = discoverPages(), plan = null) {
  const site = analyse(cfg, pages);
  const refs = new Map(), warnings = [], notes = [];
  const addRef = (rel, from) => { if (!refs.has(rel)) refs.set(rel, new Set()); refs.get(rel).add(from); };
  const warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };

  // ---- addresses -----------------------------------------------------------------------------------------------------
  const minIndex = cfg.minified && fs.existsSync(path.join(RELEASE, "assets/derived/min/min.json")) ? JSON.parse(read(path.join(RELEASE, "assets/derived/min/min.json"))).files || {} : {};
  const hosted = (rel) => {      // the file that is published for this file of the build (its minified copy when "minified" is on and the copy is current)
    if (profile.engineFile && rel === cfg.engineFile) rel = profile.engineFile;
    if (!cfg.minified || !/\.(css|js)$/.test(rel)) return rel;
    const name = path.posix.basename(rel), copy = "assets/derived/min/" + name, source = path.join(RELEASE, rel);
    if (minIndex[name] && fs.existsSync(path.join(RELEASE, copy)) && fs.existsSync(source) && minIndex[name].sha1 === sha1(fs.readFileSync(source))) return copy;
    warn(`"minified" is on, but the minified copy of ${rel} is missing or older than its source; the readable file is used. Run node _work/build-site.mjs --min when the build scripts are free.`);
    return rel;
  };
  const relOf = (value) => posix(path.posix.normalize(cfg.siteDir + "/" + value));
  const asset = (value, from) => {
    const [p, tail] = splitTail(value), rel = relOf(p);
    if (rel.startsWith("..")) { warn(`${from}: the address ${value} points outside the release folder and was left as it is`); return value; }
    const file = hosted(rel); addRef(file, from);
    return `${profile.assetsBase}/${file}${tail}`;
  };
  const linkTo = (slug, kind, from) => {
    // the one rule for every profile is pageAddress() in lib.mjs (a staging page id, else the live address on staging)
    const target = site.bySlug.get(slug);
    if (!target) { const to = pageAddress(cfg, profile, slug, "", kind); warn(`${from}: a link to ${slug}.html, which is not a built page; written as ${to}`); return to; }
    return pageAddress(cfg, profile, slug, target.publicUrl, kind);
  };
  const pageLink = (value, kind, from) => {
    const m = /^([\w-]+)\.html(\?[^#]*)?(#.*)?$/.exec(value);
    return m ? linkTo(m[1], kind, from) + (m[2] || "") + (m[3] || "") : null;
  };
  const cssUrls = (text, from) => text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q, u) => (isRelative(u) && !/^data:/i.test(u) ? `url(${q}${asset(u, from)}${q})` : m));

  // ---- one fragment of a built page, with every address made absolute -------------------------------------------------
  function rewrite(html, kind, from) {
    let out = "";
    for (const t of tokens(html)) {
      if (t.type === "comment" || t.type === "doctype") continue;                      // a comment of the build is a note to its editors, not content
      if (t.type === "text") { out += tidy(t.raw); continue; }
      if (t.type === "close") { out += t.raw; continue; }
      if (t.type === "raw") {
        const o = openTagOfRaw(t.raw), a = attrsOf(o.attrs);
        if (o.tag === "style") { out += o.open + cssUrls(o.inner, from) + o.close; continue; }
        if (a.type === "application/ld+json") { out += o.open + pageData(o.inner, kind, from) + o.close; continue; }
        const attrs = mapAttrs(o.attrs, (name, value) => (name === "src" && isRelative(value) ? asset(value, from) : undefined));
        out += `<script${attrs}>${o.inner}${o.close}`;
        continue;
      }
      const attrs = mapAttrs(t.attrs, (name, value) => {
        if (name === "src" || name === "poster" || name === "data-guide-css" || name === "data-assets") return isRelative(value) ? asset(value, from) : undefined;
        if (name === "srcset" || name === "imagesrcset") return value.split(",").map((c) => { const [u, ...d] = c.trim().split(/\s+/); return [isRelative(u) ? asset(u, from) : u, ...d].join(" "); }).join(", ");
        if (name === "href" || name === "action") {
          if (!isRelative(value)) return undefined;
          if (t.tag === "link") return asset(value, from);
          const link = pageLink(value, kind, from);
          if (link !== null) return link;
          if (ASSET_EXT.test(splitTail(value)[0])) return asset(value, from);
          warn(`${from}: <${t.tag} ${name}="${value}"> is a relative address this tool does not know how to place; left as it is`);
          return undefined;
        }
        if (name === "style") return /url\(/.test(value) ? cssUrls(value, from) : undefined;
        if (/^(?:\.\.?\/|css\/|js\/)|^[\w-]+\.html(?:[?#]|$)/.test(value)) warn(`${from}: <${t.tag} ${name}="${value.slice(0, 80)}"> looks like a relative address in an attribute this tool does not rewrite`);
        return undefined;
      });
      out += cfg.asciiSafe ? asciiHtml(`<${t.raw.slice(1, 1 + t.tag.length)}${attrs}${t.selfClosed ? "/" : ""}>`) : `<${t.raw.slice(1, 1 + t.tag.length)}${attrs}${t.selfClosed ? "/" : ""}>`;
    }
    return out.replace(/\n{2,}/g, "\n").trim();
  }
  // Text between tags: the indentation of the build goes (a run of blanks with a line break in it stays one line break,
  // which a browser reads exactly as before), and a character outside ASCII becomes a numeric reference, so a paste
  // cannot damage it (pasted city bodies were damaged that way in September: GHL audit 1.6).
  const tidy = (text) => { const t = text.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{2,}/g, "\n"); return cfg.asciiSafe ? asciiHtml(t) : t; };
  // page data (JSON-LD): a relative address inside it becomes absolute; characters outside ASCII become \u escapes
  function pageData(json, kind, from) {
    let data;
    try { data = JSON.parse(json); } catch (e) { warn(`${from}: structured data that is not valid JSON was passed on unchanged`); return json; }
    let changed = false;
    const walk = (v) => {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") { for (const k of Object.keys(v)) v[k] = walk(v[k]); return v; }
      if (typeof v === "string" && isRelative(v) && /^(?:\.\.?\/|css\/|js\/|[\w-]+\.html(?:[?#]|$))/.test(v)) { changed = true; return pageLink(v, "blog", from) || asset(v, from); }
      return v;
    };
    data = walk(data);
    const text = changed ? JSON.stringify(data) : json.trim();
    return (cfg.asciiSafe ? asciiJson(text) : text).replace(/<\//g, "<\\/");
  }
  const dataScripts = (list, kind, from, id) => list.map((json, i) => `<script type="application/ld+json"${id && i === 0 ? ` id="${id}"` : ""}>${pageData(json, kind, from)}</script>`).join("\n");

  // ---- the pieces every header block starts with ----------------------------------------------------------------------
  const fontLinks = () => site.fontLinks.join("\n");
  const styleLinks = (list, from) => list.map((href) => `<link rel="stylesheet" href="${asset(href, from)}">`).join("\n");
  const head = (what) => `<!-- Purge Pros v5 (${cfg.assetsVersion}, ${profile.name}): ${what}. Written by _work/ghl/build-fragments.mjs from the approved build; do not edit here. -->`;

  // The wrapper rules. GoHighLevel puts eight boxes around a Custom Code block (section, .inner, row, .inner, column,
  // .inner, .c-custom-code, .custom-code-container: read from the live pages, rollout/ghl-sim/live-shell/). They are given
  // no box of their own, so the header, <main> and the footer stand in the page exactly as in the approved build: the
  // sticky header travels the whole page, bands run full width, no section padding, border or shadow is drawn.
  // Only wrappers that HOLD one of these blocks are touched (:has, and the class pp5-w that each block's first script
  // puts on its own wrappers for browsers without :has). A native blog element is in a section of its own and is not.
  // The second half gives back, inside these blocks only, what GoHighLevel's page stylesheet changes for every element
  // of its kind: body line-height and font-weight (both !important there), heading weight 500, "p + p", a blank after
  // an empty heading or paragraph, the image baseline, overflow-wrap.
  // The <style> stands BEFORE the stylesheet links, and its second half is written with :where() so that each rule
  // weighs exactly what GoHighLevel's rule weighs: it wins over GoHighLevel's (earlier in the page) and loses to any
  // rule of css/site.css that sets the same thing (later). After site.css it would undo site.css (h1 to h3: weight 800).
  const scope = [".skip", ".hdr", ".mnav", "#main", "main", ".foot", "[data-pp5]", ".guide-after", ...cfg.bodyAppendedRoots].join(",");
  const blockRoots = ":is(.hdr,#main,.foot,[data-pp5],.guide-after)";
  const wrapperCss = () => [
    `:is(.c-section,.c-row,.c-column,.c-custom-code,.inner):has(.custom-code-container>${blockRoots}),.custom-code-container:has(>${blockRoots}),.pp5-w{display:contents!important}`,
    site.bodyFont ? `:where(${scope}){line-height:${site.bodyFont.lineHeight};font-weight:${site.bodyFont.weight};overflow-wrap:normal}` : "",
    `:where(${scope}) :is(h1,h2,h3,h4,h5,h6){font-weight:bold}`,
    `:where(${scope}) p+p{margin-top:0}`,
    `:where(${scope}) img{vertical-align:baseline}`,
    `:where(${scope}) :is(h1,h2,h3,h4,h5,h6,p):empty::after{content:none}`,
  ].filter(Boolean).join("\n");
  // pp5w(script): marks the GoHighLevel wrappers of the block the script stands in. pp5q(): on a page that holds the
  // builder (id="quote") the header and footer price buttons point at it, as the build writes them there.
  const headerScript = (quoteHref) => `<script>(function(w,d){w.pp5w=function(s){for(var n=s&&s.parentNode;n&&n.classList&&/(^| )(custom-code-container|c-custom-code|inner|c-column|c-row|c-section)( |$)/.test(n.className);n=n.parentNode){n.classList.add("pp5-w");if(/(^| )c-section( |$)/.test(n.className))break}};w.pp5q=function(){if(!d.getElementById("quote"))return;[].forEach.call(d.querySelectorAll(".hdr a[data-purge-quote],.mnav a[data-purge-quote],.foot a[data-purge-quote]"),function(a){if(a.getAttribute("href")===${jsString(quoteHref)})a.setAttribute("href","#quote")})};w.pp5w(d.currentScript);if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",w.pp5q);else w.pp5q()})(window,document)</script>`;
  const markScript = `<script>window.pp5w&&pp5w(document.currentScript)</script>`;
  // the first script of a body block: the settings the build puts on <body>, and which scripts this page needs
  const pageScript = (p, from) => {
    const set = Object.entries(p.bodyAttrs).map(([k, v]) => `b.setAttribute(${jsString(k)},${v === true ? '""' : jsString(v)});`).join("");
    const own = p.ownScripts.map((s) => jsString(asset(s, from))).join(",");
    return `<script>(function(w,d){var b=d.body;${set}w.PPPage={slug:${jsString(p.slug)},price:${p.price ? 1 : 0},scripts:[${own}]};w.pp5w&&w.pp5w(d.currentScript)})(window,document)</script>`;
  };

  // ---- the site code: settings and the script loader -------------------------------------------------------------------
  // window.PPSite is the ONE settings object (shared/CORE-API.md section 13.3; lib.mjs siteSettings). It is set first, on
  // every page, before any script of ours exists. Then each script is added once, in the built page's order, with
  // data-assets (the pictures folder every script of the site reads from its own tag).
  // Two stopgaps that stood here until October 9 are gone, because the scripts themselves were fixed (SITE-LANE.md A1,
  // A2): the loader no longer replaces window.addEventListener while scripts arrive after "load" (js/site.js,
  // js/prices.js and js/family-legal.js run their after-load step at once when the page has already loaded), and it no
  // longer repairs img addresses that start "../../assets/" (js/family-legal.js takes the folder from data-assets).
  const sendProblems = settingsProblems(cfg, profile);
  if (sendProblems.length) throw new Error(`profile "${profile.name}": its send settings in fragments.config.json are not usable:\n  - ${sendProblems.join("\n  - ")}`);
  const loader = (from) => {
    const settings = siteSettings(cfg, profile);
    const urls = (list) => "[" + list.map((s) => jsString(asset(s, from))).join(",") + "]";
    return `<script>(function(w,d){
var S=w.PPSite=${JSON.stringify(settings)};
if(w.PP5Loaded)return;w.PP5Loaded=1;
var P=w.PPPage||{},price=P.price!==0,list=[].concat(price?${urls(site.priceBefore)}:[],${urls(site.commonScripts)},P.scripts||[],price?${urls(site.priceAfter)}:[]);
list.forEach(function(u){var s=d.createElement("script");s.src=u;s.async=false;s.setAttribute("data-assets",S.assets);d.body.appendChild(s)});
})(window,document)</script>`;
  };
  const tracking = () => {
    const src = read(path.resolve(HERE, cfg.tracking.headSource));
    const a = src.indexOf("<!-- Google tag (gtag.js) -->"), endMark = "<!-- End Meta Pixel Code -->", b = src.indexOf(endMark);
    if (a < 0 || b < a) throw new Error(`the tracking tags were not found in ${cfg.tracking.headSource} between "<!-- Google tag (gtag.js) -->" and "${endMark}"`);
    const block = src.slice(a, b + endMark.length);
    for (const id of cfg.tracking.expected) if (!block.includes(id)) throw new Error(`the tracking block copied from ${cfg.tracking.headSource} does not hold ${id}`);
    return block;
  };
  const siteHead = (kind, extraStyles, from) => [
    head(kind === "blog" ? "the BLOG's head tracking code (Sites > Blogs > settings)" : "the WEBSITE's head tracking code (Sites > Websites > settings)"),
    TOKEN_GUARD,   // first, before any tag: see lib.mjs
    profile.robots ? `<meta name="robots" content="${profile.robots}">` : "",
    `<meta name="pp-environment" content="${profile.environment || profile.name}">`,
    site.themeColor ? `<meta name="theme-color" content="${site.themeColor}">` : "",
    fontLinks(),
    extraStyles.length ? styleLinks(extraStyles, from) : "",
    dataScripts(site.sharedData, kind, from, "pp-shared-organization"),
    profile.tracking ? tracking() : "<!-- no tracking tags in this profile -->",
  ].filter(Boolean).join("\n");
  // POSTGATE 2026-10-10 (NEEDS-from-staging-gate item 1). GoHighLevel holds the site BODY code until the visitor's first
  // touch after its own script has finished, or about 4 seconds after (7 to 13 seconds on a busy machine); an inline script
  // inside a pasted block runs at once, while the page is read. So with "scriptsPlacement": "footer" the settings and the
  // loader stand at the end of every footer block and NOTHING of ours is left for the body code: no script of this site
  // has to be site-wide beyond what the footer block of every page already carries. The field must not keep an older
  // loader (it would set window.PPSite a second time, late, from whatever build it was pasted from).
  const siteBody = (kind, from) => [
    head(kind === "blog" ? "the BLOG's body tracking code" : "the WEBSITE's body tracking code"),
    cfg.scriptsPlacement === "footer" ? `<!-- Nothing of ours runs from this field in this build (scriptsPlacement: footer). The settings (window.PPSite) and the script loader stand at the end of the footer block of every page, because GoHighLevel holds this field's code until the visitor's first touch or about 4 seconds. Paste these two comment lines over whatever the field holds, so that no older loader stays behind. -->` : loader(from),
  ].join("\n");
  const footerTail = (from) => (cfg.scriptsPlacement === "footer" ? "\n" + loader(from) : "");

  // ---- blocks -----------------------------------------------------------------------------------------------------------
  const files = new Map(), blocks = [];
  const put = (rel, text, info = {}) => {
    if (/foot__review|Review build\./.test(text)) throw new Error(`${rel}: the block would carry the footer's "Review build." line. No block for GoHighLevel may: see rolloutForm in _work/ghl/lib.mjs.`);
    files.set(rel, text.endsWith("\n") ? text : text + "\n"); if (info.block !== false) blocks.push({ file: rel, ...info });
  };
  const quoteHref = (kind, from) => linkTo(site.quoteSlug, kind, from);
  const headerBlock = (headerHtml, kind, styles, from, what, extra = "") => [
    head(what), `<style>\n${wrapperCss()}\n</style>`, fontLinks(), styleLinks(styles, from), headerScript(quoteHref(kind, from)), extra, rewrite(headerHtml, kind, from),
  ].filter(Boolean).join("\n");
  const footerBlock = (footerHtml, kind, from, what, before = "") => [head(what), markScript, before, rewrite(footerHtml, kind, from)].filter(Boolean).join("\n") + footerTail(from);

  // shared: the two Global Sections, and the site code
  put("shared/header.html", headerBlock(site.header, "site", site.sharedStyles, "shared/header.html", "HEADER, the header Global Section (one Custom Code block, every page)"), { role: "header" });
  put("shared/footer.html", footerBlock(site.footer, "site", "shared/footer.html", "FOOTER, the footer Global Section (one Custom Code block, every page)"), { role: "footer" });
  put("shared/site-head.html", siteHead("site", [], "shared/site-head.html"), { role: "site-head" });
  put("shared/site-body.html", siteBody("site", "shared/site-body.html"), { role: "site-body" });
  for (const p of site.pages.filter((x) => x.customer && x.kind === "site")) {
    put(`shared/${p.slug}-header.html`, headerBlock(p.headerHtml, "site", site.sharedStyles, `shared/${p.slug}-header.html`, `HEADER of the page ${p.slug} only (its own Custom Code block, NOT the Global Section)`), { role: "header", page: p.slug });
    put(`shared/${p.slug}-footer.html`, footerBlock(p.footerHtml, "site", `shared/${p.slug}-footer.html`, `FOOTER of the page ${p.slug} only (its own Custom Code block, NOT the Global Section)`), { role: "footer", page: p.slug });
  }

  // A body block that is too large: (a) its page data moves to a file of its own, (b) the body is cut in two at a
  // section boundary. Each remedy is used only when the one before it was not enough, and is recorded.
  // The size that counts is the size once the date placeholder is filled in (sizeGuard in the settings file): every
  // hosted address in a block grows by the difference. "plan" (from planFor, below) makes every profile use the SAME
  // remedy and the same cut for a page, decided on the profile with the longest addresses, so staging tests the very
  // structure production will have.
  // "pageDataInOwnFile" in the settings file (October 10) names pages for which (a) is NOT left to the length rule: their
  // page data goes in its own file in every profile, with or without a plan, whatever the block's length. Reason: `faq`
  // fits in one block in production (63,572) and not in staging once every staging page id is mapped (65,105), so its
  // shape depended on how many staging ids the settings file held; the public copy of the file holds none.
  const sizes = [];
  const measure = (text) => measureBlock(cfg, profile, text);
  function fit(base, what, pre, mainOpen, sections, mainClose, data, record) {
    const forced = plan ? plan.get(base) || { level: 0, k: 0 } : null;
    const one = (withData) => [head(what), pre, mainOpen, ...sections, mainClose, withData ? data : ""].filter(Boolean).join("\n");
    const cut = (k) => ({
      first: [head(what + ", PART 1 of 2"), pre, mainOpen, ...sections.slice(0, k), mainClose].filter(Boolean).join("\n"),
      // part 2 carries the rest of <main>'s sections in a holder that draws no box; its script puts them into <main>
      // before anything is painted, so the page is the approved page again (and does nothing if it is ever run twice)
      second: [head(what + ", PART 2 of 2 (a second Custom Code block directly under part 1)"), markScript, `<div data-pp5="more" style="display:contents">`, ...sections.slice(k), `</div>`,
        `<script>(function(d){var h=d.currentScript.previousElementSibling,m=d.getElementById("main");if(!h||!m||h.getAttribute("data-pp5")!=="more")return;if(!m.hasAttribute("data-pp5-joined")){m.setAttribute("data-pp5-joined","");while(h.firstChild)m.appendChild(h.firstChild)}h.parentNode.removeChild(h)})(document)</script>`].join("\n"),
    });
    let level = 0, k = 0, out = [[`${base}.html`, one(true)]];
    const dataFile = () => [`${base}.schema.html`, [head(what + ": PAGE DATA for the page's own schema or tracking-code field"), data].join("\n")];
    const ownFile = Boolean(data) && (cfg.pageDataInOwnFile || []).includes(record.page);   // by setting, not by length
    if (data && (ownFile || (forced ? forced.level >= 1 : measure(out[0][1]) > cfg.blockLimit))) { level = 1; out = [[`${base}.html`, one(false)], dataFile()]; }
    if (forced ? forced.level >= 2 : measure(out[0][1]) > cfg.blockLimit) {
      if (forced) k = forced.k;
      else {
        let best = null;
        for (let i = 1; i < sections.length; i += 1) { const c = cut(i), worst = Math.max(measure(c.first), measure(c.second)); if (!best || worst < best.worst) best = { worst, i }; }
        k = best ? best.i : 0;
      }
      if (k > 0 && k < sections.length) { const c = cut(k); level = 2; out = [[`${base}.1.html`, c.first], [`${base}.2.html`, c.second], ...(data ? [dataFile()] : [])]; }
    }
    const remedy = level === 0 ? "none" : level === 1 ? "a: page data in its own file" : (data ? "a + " : "") + "b: body split in two blocks";
    for (const [rel, text] of out) put(rel, text, { ...record, remedy, part: rel.endsWith(".schema.html") ? "page data" : "body" });
    sizes.push({ block: base, level, k, remedy, asOneBlockWhenDated: measure(one(true)), withoutPageDataWhenDated: measure(one(false)), hostedAddresses: one(true).split(profile.assetsBase).length - 1, files: out.map(([rel, text]) => ({ file: rel, chars: text.length + 1, charsWhenDated: measure(text), bytes: bytes(text) + 1 })) });
  }
  const sectionsOf = (html, kind, from) => topLevel(html).filter((n) => n.kind === "element" || n.kind === "raw").map((n) => rewrite(n.html, kind, from));

  // pages of the website: one body block each
  for (const p of site.pages.filter((x) => x.kind === "site")) {
    const from = `pages/${p.slug}.html`;
    const pre = [...p.preloads.map((l) => rewrite(l, "site", from)), pageScript(p, from), styleLinks(p.familyStyles, from)].filter(Boolean).join("\n");
    fit(`pages/${p.slug}`, `BODY of ${p.slug} (${new URL(p.publicUrl).pathname})`, pre, rewrite(p.mainOpen, "site", from), sectionsOf(p.mainInner, "site", from), "</main>", dataScripts(p.ownData, "site", from), { role: "body", page: p.slug });
  }

  // the blog: two templates, each with its own pasted header and footer
  const blog = { home: null, post: null };
  for (const p of site.pages.filter((x) => x.kind === "blog")) {
    const which = p.nativePost ? "post" : "home";
    if (blog[which]) throw new Error(`two built pages look like the blog's "${which}" template: ${blog[which].slug} and ${p.slug}`);
    blog[which] = p;
  }
  if (blog.home) {
    const p = blog.home, from = "blog/home-1-header-and-index.html";
    const pre = headerBlock(p.headerHtml, "blog", p.stylesheets, from, "", [...p.preloads.map((l) => rewrite(l, "blog", from)), pageScript(p, from)].join("\n")).replace(/^<!--[^\n]*\n/, "");
    fit("blog/home-1-header-and-index", `BLOG HOME template, first Custom Code block: stylesheets, header and the Yard Guide index (from ${p.slug}.html)`, pre, rewrite(p.mainOpen, "blog", from), sectionsOf(p.mainInner, "blog", from), "</main>", dataScripts(p.ownData, "blog", from), { role: "blog-home-header-index", page: p.slug });
    put("blog/home-2-NATIVE-blog-posts-element.txt", `HERE, between the two Custom Code blocks, stands GoHighLevel's own "Blog Posts" element (today blog-post-AMuAg4dR2w, in a section of its own).\nDo not paste anything here and do not remove the element. It is kept, and kept out of view by the template page's Custom CSS, as today\n(the line "#section-…{display:none!important}" for the native element's own section; keep that line, drop the others: FRAGMENT-NOTES.md, "The blog").\n`, { block: false });
    put("blog/home-3-footer.html", footerBlock(p.footerHtml, "blog", "blog/home-3-footer.html", "BLOG HOME template, last Custom Code block: the footer"), { role: "footer", page: p.slug });
  }
  if (blog.post) {
    const p = blog.post, nodes = topLevel(p.mainInner).filter((n) => n.kind === "element");
    const at = nodes.findIndex((n) => /\bpp-blog-native-post\b/.test(n.html));
    // Above the post: everything of <main> before it, less the review builder's own hero (.cover) and facts strip (.facts),
    // which a native post does not have (FAMILY-NOTES-guide.md 4.2). Below the post: everything after it.
    const above = nodes.slice(0, at).filter((n) => !hasClass(n, "cover") && !hasClass(n, "facts"));
    const below = nodes.slice(at + 1);
    blog.reviewOnly = nodes.slice(0, at).filter((n) => hasClass(n, "cover") || hasClass(n, "facts"));
    blog.native = nodes[at];
    if (!above.length || !below.length) warn(`${p.slug}.html: expected custom code both above and below the native post`);
    // the first piece above the post takes id="main": the header's skip link and the phone menu's close link point at #main,
    // and on the blog no <main> exists to carry it (FAMILY-NOTES-guide.md 4.2)
    const aboveHtml = above.map((n, i) => (i === 0 && !n.attrs.id ? n.html.replace(/^<([a-zA-Z][\w-]*)/, '<$1 id="main"') : n.html)).join("\n");
    const postStyles = [...p.stylesheets, ...[...p.mainInner.matchAll(/\sdata-guide-css="([^"]+)"/g)].map((m) => m[1])].filter((v, i, all) => all.indexOf(v) === i);
    blog.postStyles = postStyles;
    const from = "blog/post-1-header.html";
    put(from, [headerBlock(p.headerHtml, "blog", postStyles, from, `BLOG POST template, first Custom Code block: stylesheets, header and the band above every post (from ${p.slug}.html)`, pageScript(p, from)), rewrite(aboveHtml, "blog", from)].join("\n"), { role: "blog-post-header", page: p.slug });
    put("blog/post-2-NATIVE-blog-content-element.txt", `HERE, between the two Custom Code blocks, stands GoHighLevel's own "Blog Content" element (today blog-content-SNKZYT25pP, in a section of its own).\nDo not paste anything here. Keep the element and keep its custom class: pp-blog-native-post\nEvery article is shown by this element from its own record; no article is edited. It is dressed by css/blog-native.css, which the first block links.\n`, { block: false });
    put("blog/post-3-footer.html", footerBlock(p.footerHtml, "blog", "blog/post-3-footer.html", `BLOG POST template, last Custom Code block: what stands under every post, and the footer (from ${p.slug}.html)`, rewrite(below.map((n) => n.html).join("\n"), "blog", "blog/post-3-footer.html")), { role: "blog-post-footer", page: p.slug });
    if (p.ownData.length) notes.push(`The article page's own page data (${p.ownData.length} block(s)) names one article and is NOT in the blog-post template, which is one block for all posts. GoHighLevel writes no structured data for a post (GHL audit 1.8).`);
  }
  if (blog.home || blog.post) {
    const nativeCss = blog.post ? blog.postStyles.filter((s) => !blog.post.stylesheets.includes(s)) : [];
    put("blog/site-head.html", siteHead("blog", nativeCss, "blog/site-head.html"), { role: "site-head", kind: "blog" });
    put("blog/site-body.html", siteBody("blog", "blog/site-body.html"), { role: "site-body", kind: "blog" });
  }

  // "pageDataInOwnFile": a name there that did nothing is a mistake in the settings file, not something to pass over
  for (const slug of cfg.pageDataInOwnFile || []) {
    if (!site.bySlug.has(slug)) throw new Error(`fragments.config.json "pageDataInOwnFile" names "${slug}", which is not a built page (built: ${site.pages.map((p) => p.slug).join(", ")})`);
    if (!blocks.some((b) => b.page === slug && b.part === "page data")) throw new Error(`fragments.config.json "pageDataInOwnFile" names "${slug}", but that page has no page data of its own to put in a file (or it is the blog-post template, which carries none)`);
  }

  // ---- the field sheet ---------------------------------------------------------------------------------------------------
  const fields = site.pages.map((p) => {
    const u = new URL(p.publicUrl), shareFile = `assets/derived/share/${p.slug}.jpg`;
    const own = p.metas["og:image"] || "";
    const share = own || (fs.existsSync(path.join(RELEASE, shareFile)) ? `${profile.assetsBase}/${shareFile}` : "");
    if (!own && share) addRef(shareFile, "fields.json (share image)");
    // ROBOTS IS A TYPED FIELD OF THE PAGE (NEEDS-from-staging-gate item 8): on a preview address GoHighLevel does not
    // serve a robots tag from the site head code, so a page that must stay out of search carries its own custom meta tag.
    // The value is the build's; "robotsTyped" in the settings file may give the exact words to type for a page the build
    // already keeps out of search (never for a page the build leaves in search: that would be a decision, not a spelling).
    const robotsBuild = p.robots || "", typed = (cfg.robotsTyped || {})[p.slug];
    if (typed && (!/noindex/i.test(robotsBuild) || !/noindex/i.test(typed))) throw new Error(`fragments.config.json "robotsTyped".${p.slug} is "${typed}", but ${/noindex/i.test(robotsBuild) ? "it must still say noindex" : "the built page does not ask to stay out of search (its robots is \"" + (robotsBuild || "none") + "\")"}. This setting only spells the tag of a page the build already keeps out.`);
    const robots = typed || robotsBuild, keepOut = /noindex/i.test(robots);
    const schemaBlock = blocks.find((b) => b.page === p.slug && b.part === "page data");
    const pasteBlocks = blocks.filter((b) => b.page === p.slug && !["header", "footer"].includes(b.role) && b.part !== "page data").map((b) => b.file);
    const ids = (profile.links && profile.links.pageIds) || {};
    const typeThese = {
      path: u.origin === cfg.siteOrigin ? u.pathname : p.publicUrl, title: p.title, description: p.description, canonical: p.canonical || null, shareImage: share || null,
      customMetaTags: keepOut ? [{ name: "robots", content: robots }] : [],
      schemaFile: schemaBlock ? schemaBlock.file : null,
      schemaGoes: schemaBlock ? `"SEO & AI search optimization" > "Schema markup" > "Add schema"; if that form refuses or changes the text: a small Custom Code element of its own at the foot of the body section, under the last body block` : null,
    };
    return { slug: p.slug, typeThese, keepOutOfSearch: keepOut, robotsFromBuild: robotsBuild || "none", pasteBodyBlocks: pasteBlocks, splitInTwo: pasteBlocks.length > 1,
      linksToThisPageGoTo: p.kind === "site" ? pageAddress(cfg, profile, p.slug, p.publicUrl, "site") : p.publicUrl, previewAddress: ids[p.slug] ? (profile.links.previewBase || PREVIEW_BASE) + ids[p.slug] : null, where: p.kind === "site" ? "website page" : p.nativePost ? "blog template: Blog Post (fields belong to each post's own record)" : "blog template: Blog Home (fields belong to the blog's settings)",
      path: u.origin === cfg.siteOrigin ? u.pathname : p.publicUrl, publicUrl: p.publicUrl, title: p.title, description: p.description, canonical: p.canonical || "",
      robots: robots || "index (no robots tag)", robotsCustomMetaTag: robots, shareImage: share, shareImageFrom: own ? "the page names it" : share ? "the page's own link-preview picture, 1200 x 630" : "none",
      inSitemap: p.kind === "site" && !/noindex/i.test(robots) && Boolean(p.canonical), sitemapNote: p.kind === "blog" ? "the blog has its own sitemap" : /noindex/i.test(robots) ? "kept out of search" : !p.canonical ? "no canonical in the build" : "",
      bodyBlocks: blocks.filter((b) => b.page === p.slug && !["header", "footer"].includes(b.role)).map((b) => b.file), ownHeaderAndFooter: p.customer,
      bodySettings: p.bodyAttrs, sourceSha256: p.sourceSha256 };
  });
  if (site.icon) addRef(relOf(site.icon), "site setting: favicon");

  // ---- every file the blocks, stylesheets and scripts ask for ---------------------------------------------------------------
  const seen = new Set();
  const follow = (rel) => {
    if (seen.has(rel)) return; seen.add(rel);
    const file = path.join(RELEASE, rel);
    if (!fs.existsSync(file)) return;
    if (/\.css$/.test(rel)) {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)|@import\s+(["'])([^"']+)\3/g)) {
        const u = m[2] ?? m[4];
        if (!u || !isRelative(u) || /^data:/i.test(u)) continue;
        const target = posix(path.posix.normalize(path.posix.dirname(rel) + "/" + splitTail(u)[0]));
        addRef(target, `stylesheet ${rel}`); follow(target);
      }
    }
    if (/\.js$/.test(rel)) {
      const js = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      // a whole file name in a string: found under assets/ (what data-assets points at), beside the page, or as written
      for (const m of js.matchAll(/(["'])((?:\.\.\/)*[\w.-]+(?:\/[\w.-]+)*\.(?:webp|png|jpe?g|gif|svg|avif|json|css|woff2?))\1/g)) {
        const lit = m[2], tries = [posix(path.posix.normalize(cfg.siteDir + "/" + lit)), "assets/" + lit];
        const hit = tries.find((t) => !t.startsWith("..") && fs.existsSync(path.join(RELEASE, t)));
        if (hit) { addRef(hit, `script ${rel}`); follow(hit); }
        else if (/\//.test(lit)) addRef("assets/" + lit.replace(/^(\.\.\/)+assets\//, ""), `script ${rel} (named in the script, not found)`);
      }
      // a name built in the script: "folder/start-" + something + ".ext" : every file of that folder that starts so
      for (const m of js.matchAll(/(["'])((?:[\w-]+\/)+)([\w-]*)\1\s*\+/g)) {
        const dir = path.join(RELEASE, "assets", m[2]);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) if (f.startsWith(m[3]) && fs.statSync(path.join(dir, f)).isFile()) addRef(`assets/${m[2]}${f}`, `script ${rel} (name built in the script: ${m[2]}${m[3]}…)`);
      }
    }
  };
  for (const rel of [...refs.keys()]) follow(rel);
  for (const rel of [...refs.keys()]) follow(rel);
  const fileList = [...refs.keys()].sort().map((rel) => ({ ...fileInfo(rel), address: `${profile.assetsBase}/${rel}`, askedForBy: [...refs.get(rel)].sort().slice(0, 6), askedForByCount: refs.get(rel).size }));

  const blockList = blocks.map((b) => { const text = files.get(b.file), dated = measureBlock(cfg, profile, text); return { ...b, chars: text.length, charsWhenDated: dated, bytes: bytes(text), sha256: sha256(text), overLimit: dated > cfg.blockLimit && !["site-head", "site-body"].includes(b.role) ? true : undefined }; });
  const onDisk = pages.filter((p) => p.reviewBuildOnDisk).length;
  notes.push(onDisk ? `The pages on disk are a REVIEW build (${onDisk} of ${pages.length} carry the footer's "Review build" line). The blocks were made from their rollout form, which is the same page without that one line (lib.mjs rolloutForm; proven equal to a real rollout build by _work/ghl/prove-rollout-form.mjs). No block carries the line.` : `The pages on disk are a ROLLOUT build: no page carries the footer's "Review build" line, and no block does.`);
  return { cfg, profile, site, files, blocks: blockList, sizes, fields, fileList, warnings, notes, blog, placeholders: placeholders(cfg, profile), settings: siteSettings(cfg, profile) };
}

// ====================================================================================================================
// 3. Writing a profile
// ====================================================================================================================
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
// The paste rule for plain text boxes (NEEDS-from-staging-gate item 4), in one place for FIELDS.md and the notes.
export const PLAIN_BOX_RULE = [
  `**Plain text boxes in GoHighLevel's settings** (the website's and the blog's head and body tracking code, and any box that is not the Custom Code editor):`,
  `1. **Never press Ctrl+A in such a box.** On October 9 it typed a letter "a" into both site-code boxes; that one letter put a white strip with an "a" under every footer and stopped the head code's link tags from reaching the page.`,
  `2. Click into the box, press **Home** to stand at the very start, and remove what is there with **Delete** until the box is empty.`,
  `3. Paste the file.`,
  `4. Read the box back before saving: it must **start with the comment marker \`<!--\`** (nothing, not even a blank, in front of it) and end with the file's last characters. If it starts with anything else, empty it the same way and paste again.`,
];
export function fieldsSheet(result) {
  const { profile, fields, cfg, site, blocks } = result, lines = [], footer = cfg.scriptsPlacement === "footer";
  const staging = Boolean(profile.links && (profile.links.fallbackOrigin || Object.keys(profile.links.pageIds || {}).length));
  const code = (v) => "`" + cell(v) + "`", chars = (file) => { const b = blocks.find((x) => x.file === file); return b ? ` (${b.chars.toLocaleString("en-US")} characters)` : ""; };
  const outPages = fields.filter((f) => f.keepOutOfSearch && !/^blog template/.test(f.where));
  lines.push(`# What to type and what to paste into GoHighLevel (${profile.name})`, "",
    `State: Prepared. Written by \`_work/ghl/build-fragments.mjs\` from the head of each approved built page; nothing here is in GoHighLevel. Every page below has two tables: **Type these** (the page's own fields) and **Paste these** (its code blocks, in order).`, "",
    `## Read first`, "",
    `- The fields are typed in the page editor: toolbar > **"SEO & AI search optimization"** ("Content" > "Title" and "Description"; "Images" > the share image; "Links & tags" > "Canonical links" > "+ Add", and the custom meta tag's "+ Add"; "Schema markup" > "Add schema"). The path is in the page card's "Edit page details" ("Path"). The two "+ Add" forms and the "Add schema" form had not been seen when this was written (STAGING-RUNBOOK NS-6, NS-7): record what they ask for the first time.`,
    `- **Robots is typed on the page, never left to site code.** A page that must stay out of search has a row "Custom meta tag" below: name \`robots\`, the content as printed. On a preview address GoHighLevel does not serve a robots tag that stands in the site head code (it serves its own \`noindex\` there instead), so the page's own tag is the only one that can be relied on; read it back on a published address at the switch. Pages that must carry it in this build: ${outPages.length ? outPages.map((f) => code(f.slug) + " (" + f.typeThese.customMetaTags[0].content + ")").join(", ") : "none"}. Where the row says "none", add no robots tag.`,
    profile.robots ? `- This profile's site head code also names \`robots: ${profile.robots}\` for the whole site. Treat it as a second belt only: it was NOT served on the preview address on October 9.` : `- This profile adds no site-wide robots tag: a page is kept out of search by its own typed tag and by nothing else.`,
    `- **Schema file.** A page whose body is too large for one block has its page data in a file of its own, \`<page>.schema.html\`. It goes into the page's own "Schema markup" > "Add schema". If that form refuses the text or changes it, paste the file as a small Custom Code element of its own at the foot of the body section, under the last body block, and use that method for every page that has a schema file. A page with no schema row carries its page data inside its body block: add nothing.`,
    `- **A body in two parts** (\`<page>.1.html\`, \`<page>.2.html\`) is two Custom Code elements, one directly under the other, in the SAME section and column. Part 2 puts its sections into part 1's \`<main>\` by itself.`,
    footer ? `- **The scripts start from the footer block.** Every footer block (the footer Global Section, Welcome's own footer, both blog templates' last block) ends with one script that sets \`window.PPSite\` (${profile.mode} mode) and loads the site's scripts, because GoHighLevel holds the site body code until the visitor's first touch or about 4 seconds. So the footer must be pasted again after EVERY rebuild of the blocks, and the site body code is two comment lines.` : `- The scripts start from the website's body tracking code (\`shared/site-body.html\`).`,
    `- Keywords and Author are not in the build: leave what the page has today. Site-wide, once: the browser-tab icon is \`${site.icon ? posix(path.posix.normalize(cfg.siteDir + "/" + site.icon)) : "(none)"}\` (Sites > settings > favicon).`,
    staging ? `- **Links on this staging site.** A link to a page whose GoHighLevel page id is known goes to its preview address (${Object.keys(profile.links.pageIds || {}).map(code).join(", ") || "none yet"}). Every other internal link goes to that page's LIVE address on \`${profile.links.fallbackOrigin || cfg.siteOrigin}\`, so no link is a dead end; following one leaves staging (a page that is new in this build answers "not found" there until the switch). One more staging page = one more line in \`profiles.${profile.name}.links.pageIds\` of \`_work/ghl/fragments.config.json\`, then build, check, and paste the header and footer again.` : "",
    "", `## How to paste`, "",
    `**Custom Code elements** (every block under \`pages/\`, \`shared/*-header.html\`, \`shared/*-footer.html\` and \`blog/*.html\` except the site code): "Open Code Editor", replace everything, compare what the editor holds with the file, "Save".`, "",
    ...PLAIN_BOX_RULE, "",
    `## Once for the whole site`, "",
    `| File | Where in GoHighLevel | What it is |`, `|---|---|---|`,
    `| \`shared/header.html\`${chars("shared/header.html")} | the header Global Section: one section, one row, one column, one Custom Code element | wrapper rules, typefaces, stylesheets, header and phone menu |`,
    `| \`shared/footer.html\`${chars("shared/footer.html")} | the footer Global Section, built the same way | the footer${footer ? ", then `window.PPSite` and the script loader" : ""} |`,
    `| \`shared/site-head.html\`${chars("shared/site-head.html")} | Sites > Websites > the site's settings > head tracking code (a PLAIN TEXT BOX: the rule above) | the saved-quote guard, ${profile.robots ? "the site-wide robots tag, " : ""}theme colour, typefaces, the shared organization data${profile.tracking ? ", and the Google tag and Meta pixel exactly as on the live site today" : "; no tracking tag in this profile"} |`,
    `| \`shared/site-body.html\`${chars("shared/site-body.html")} | the same settings > body tracking code (a PLAIN TEXT BOX) | ${footer ? "two comment lines and nothing else; they replace any loader pasted earlier" : "`window.PPSite` and the script loader"} |`,
    ...fields.filter((f) => f.ownHeaderAndFooter).flatMap((f) => [`| \`shared/${f.slug}-header.html\`${chars(`shared/${f.slug}-header.html`)}, \`shared/${f.slug}-footer.html\`${chars(`shared/${f.slug}-footer.html`)} | the page ${code(f.slug)} only: its own first and last section, NOT the Global Sections | that page's own header and footer${footer ? " (the footer ends with the settings and the loader too)" : ""} |`]),
    blocks.some((b) => b.file === "blog/site-head.html") ? `| \`blog/site-head.html\`${chars("blog/site-head.html")}, \`blog/site-body.html\`${chars("blog/site-body.html")} | Sites > Blogs > the blog's settings > head and body tracking code (PLAIN TEXT BOXES) | as the website's; the head code also links the native post's stylesheet |` : "", "");
  for (const f of fields) {
    const t = f.typeThese, blog = /^blog template/.test(f.where), tag = t.customMetaTags[0];
    lines.push(`## ${f.slug}`, "", `${cell(f.where)}.${f.previewAddress ? " Staging preview address: `" + f.previewAddress + "`." : ""}${staging && !blog ? " Links to this page from other staging pages go to `" + f.linksToThisPageGoTo + "`." : ""}`, "",
      `**Type these**${blog ? " (a blog template: the title and description belong to " + (/Blog Post/.test(f.where) ? "each post's own record" : "the blog's settings") + "; they are listed for reference)" : ""}`, "",
      "| Where in GoHighLevel | Type this |", "|---|---|",
      `| Page details > Path | ${code(t.path)} |`,
      `| Content > Title | ${cell(t.title)} |`,
      `| Content > Description | ${cell(t.description)} |`,
      `| Images > share image | ${t.shareImage ? code(t.shareImage) + " (" + f.shareImageFrom + ")" : "none"} |`,
      `| Links & tags > Canonical links > + Add | ${t.canonical ? code(t.canonical) : "none: the build names no canonical for this page; add none"} |`,
      `| Links & tags > Custom meta tag > + Add | ${tag ? "**REQUIRED, this page must stay out of search:** name `" + tag.name + "`, content `" + cell(tag.content) + "`" + (f.robotsFromBuild !== tag.content ? " (the built page says `" + cell(f.robotsFromBuild) + "`; the words to type are set in `robotsTyped` of the settings file)" : "") : "none: add no robots tag (the page is meant to be found)"} |`,
      `| Schema markup > Add schema | ${t.schemaFile ? "the whole content of " + code(t.schemaFile) + chars(t.schemaFile) + "; if the form refuses or changes it, a small Custom Code element of its own at the foot of the body section" : "nothing: this page's data is inside its body block"} |`,
      `| Sitemap | ${f.inSitemap ? "in the sitemap" : "NOT in the sitemap" + (f.sitemapNote ? " (" + f.sitemapNote + ")" : "")} |`, "",
      "**Paste these**, top to bottom", "", "| # | File | Where |", "|---|---|---|");
    const rows = [];
    if (blog) for (const b of f.pasteBodyBlocks) rows.push([b, "the template's Custom Code elements, in this order (the native blog element stays between them; see the two `.txt` markers in `blog/`)"]);
    else {
      rows.push(f.ownHeaderAndFooter ? [`shared/${f.slug}-header.html`, "first section, its own Custom Code element (no Global Section on this page)"] : ["shared/header.html", "first section: the header Global Section (already pasted once; only place it)"]);
      f.pasteBodyBlocks.forEach((b, i) => rows.push([b, f.splitInTwo ? (i === 0 ? "body section, FIRST Custom Code element" : "the same section and column, a SECOND Custom Code element directly under the first") : "body section, one Custom Code element"]));
      rows.push(f.ownHeaderAndFooter ? [`shared/${f.slug}-footer.html`, "last section, its own Custom Code element"] : ["shared/footer.html", "last section: the footer Global Section (already pasted once; only place it)"]);
    }
    if (blog) { const foot = blocks.find((b) => b.page === f.slug && /footer/.test(b.role)); if (foot && !rows.some((r) => r[0] === foot.file)) rows.push([foot.file, "the template's last Custom Code element"]); }
    rows.forEach((r, i) => lines.push(`| ${i + 1} | \`${r[0]}\`${chars(r[0])} | ${r[1]} |`));
    lines.push("");
  }
  return lines.filter((l) => l !== false).join("\n").replace(/\n{3,}/g, "\n\n");
}
export function writeProfile(result, dir = path.join(OUT, result.profile.name)) {
  if (!posix(path.resolve(dir)).includes("/rollout/ghl-")) throw new Error("refusing to write outside rollout/ghl-fragments or rollout/ghl-sim: " + dir);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [rel, text] of result.files) write(path.join(dir, rel), text);
  write(path.join(dir, "fields.json"), JSON.stringify({ profile: result.profile.name, generated: new Date().toISOString(), pages: result.fields }, null, 2) + "\n");
  write(path.join(dir, "FIELDS.md"), fieldsSheet(result) + "\n");
  const missing = result.fileList.filter((f) => !f.exists).map((f) => f.path);
  const manifest = { state: "Prepared and locally simulated; not in GoHighLevel", profile: result.profile.name, generated: new Date().toISOString(), assetsBase: result.profile.assetsBase, blockLimit: result.cfg.blockLimit,
    placeholdersStillInUse: result.placeholders, warnings: result.warnings, notes: result.notes,
    siteSettings: result.settings, pagesOnDisk: result.site.pages.some((p) => p.reviewBuildOnDisk) ? "review build (blocks made from the rollout form)" : "rollout build",
    headerFooterVersions: result.site.versions, bodySettingsCarried: result.site.bodyAttrNames,
    blocks: result.blocks, sizes: result.sizes,
    uploadList: { note: "Every file the blocks, the stylesheets and the scripts ask for, by its path under assetsBase (the same folder tree as the release folder). Upload these before any page names them (Cloudflare audit 3.2).",
      count: result.fileList.length, bytes: result.fileList.reduce((n, f) => n + (f.bytes || 0), 0), missing, files: result.fileList } };
  write(path.join(dir, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

// ====================================================================================================================
// 4. Run
// ====================================================================================================================
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const cfg = loadConfig(), want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const names = want.length ? want : Object.keys(cfg.profiles);
  const pages = discoverPages();
  const plan = planFor(cfg, pages);
  for (const name of names) {
    if (!cfg.profiles[name]) throw new Error(`no profile "${name}" in fragments.config.json (there: ${Object.keys(cfg.profiles).join(", ")})`);
    const result = buildProfile(cfg, cfg.profiles[name], pages, plan), manifest = writeProfile(result);
    const body = result.blocks.filter((b) => !["site-head", "site-body"].includes(b.role));
    console.log(`\n${name}: ${result.files.size} files written to rollout/ghl-fragments/${name}/  (${pages.length} built pages read; limit ${cfg.blockLimit} characters a block)`);
    console.log("  largest blocks: " + [...body].sort((a, b) => b.chars - a.chars).slice(0, 5).map((b) => `${b.file} ${b.chars}${b.charsWhenDated !== b.chars ? " (" + b.charsWhenDated + " dated)" : ""}`).join(" · "));
    const remedied = result.sizes.filter((s) => s.remedy !== "none");
    console.log(`  remedies: ${remedied.length ? remedied.map((s) => `${s.block} (${s.remedy})`).join("; ") : "none needed"}`);
    const over = result.blocks.filter((b) => b.overLimit);
    if (over.length) console.log("  STILL OVER THE LIMIT: " + over.map((b) => `${b.file} ${b.chars}`).join(", "));
    console.log(`  upload list: ${manifest.uploadList.count} files, ${(manifest.uploadList.bytes / 1048576).toFixed(1)} MB${manifest.uploadList.missing.length ? "; MISSING on disk: " + manifest.uploadList.missing.join(", ") : "; none missing"}`);
    if (result.placeholders.length) console.log("  placeholders still in use: " + result.placeholders.join("; "));
    console.log("  window.PPSite: " + JSON.stringify(Object.fromEntries(Object.entries(result.settings).filter(([k]) => !["assetsBase", "assets", "build"].includes(k)))));
    for (const w of result.warnings) console.log("  note: " + w);
    for (const n of result.notes.filter((x) => /REVIEW build|ROLLOUT build/.test(x))) console.log("  " + n);
  }
}
