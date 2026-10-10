// lib.mjs : shared helpers of the GoHighLevel fragment tools (build-fragments.mjs, check-fragments.mjs, simulate.mjs).
// Plain Node, no dependencies. Nothing here writes outside the folders named in build-fragments.mjs.
// Everything about the site is DISCOVERED by parsing the built pages; there is no list of pages or files in this folder.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));          // directions/coverstory/_work/ghl
export const ROOT = path.resolve(HERE, "../..");                           // directions/coverstory (the built pages)
export const RELEASE = path.resolve(ROOT, "../..");                        // the release folder (assets/, shared/, rollout/)
export const ROLLOUT = path.join(RELEASE, "rollout");
export const OUT = path.join(ROLLOUT, "ghl-fragments");
export const SIM = path.join(ROLLOUT, "ghl-sim");

export const posix = (p) => p.replace(/\\/g, "/");
export const norm = (s) => s.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
export const read = (file) => norm(fs.readFileSync(file, "utf8"));
export const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
export const sha1 = (data) => crypto.createHash("sha1").update(data).digest("hex");
export const bytes = (s) => Buffer.byteLength(s, "utf8");
export function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, "utf8"); }

// ---- the settings file ----------------------------------------------------------------------------------------------
export function loadConfig(file = path.join(HERE, "fragments.config.json")) {
  const cfg = JSON.parse(read(file));
  for (const [name, p] of Object.entries(cfg.profiles)) {
    p.name = name;
    p.assetsBase = String(p.assetsBase).replace("{assetsVersion}", cfg.assetsVersion).replace(/\/+$/, "");
    p.links = Object.assign({ prefix: "", map: {} }, p.links || {});
    for (const bad of linksProblems(p)) throw new Error(`fragments.config.json, profile "${name}": ${bad}`);
  }
  cfg.siteDir = posix(cfg.siteDir).replace(/^\/+|\/+$/g, "");
  if (path.resolve(RELEASE, cfg.siteDir) !== ROOT) throw new Error(`fragments.config.json: "siteDir" is ${cfg.siteDir}, but this tool stands in ${posix(path.relative(RELEASE, ROOT))}`);
  // "pageDataInOwnFile" (October 10): the pages whose page data ALWAYS goes in a file of its own (<slug>.schema.html),
  // in EVERY profile and whatever the block's length. A shared setting on purpose: which blocks a page has must not
  // depend on how long one profile's addresses are (the public copy of this file holds no staging page id and must
  // package production to the same blocks; staging must test the shape production gets). Every other page: the length rule.
  cfg.pageDataInOwnFile = cfg.pageDataInOwnFile === undefined ? [] : cfg.pageDataInOwnFile;
  if (!Array.isArray(cfg.pageDataInOwnFile) || cfg.pageDataInOwnFile.some((s) => typeof s !== "string" || !/^[a-z0-9-]+$/.test(s))) throw new Error(`fragments.config.json: "pageDataInOwnFile" must be a list of page names such as ["faq"]; it is ${JSON.stringify(cfg.pageDataInOwnFile)}`);
  return cfg;
}
// ---- where a link to another page of the site goes (POSTGATE 2026-10-10, staging gate: 65 bare-path links were dead) ----
// One rule for the builder and for the checker. In order:
//   links.map[slug]        a whole address given by hand (kept for special cases)
//   links.pageIds[slug]    a STAGING page that exists in GoHighLevel: links.previewBase + its page id
//                          (https://sites.leadconnectorhq.com/preview/<page id>). One more page = one more line there.
//   a page of the blog     its own full address, as always
//   links.fallbackOrigin   STAGING: every other page goes to its LIVE address (fallbackOrigin + its path), so that no
//                          link on a staging page is a dead end
//   otherwise              production: links.prefix + the page's path (a full address from the blog's blocks)
// A staging page id is 20 letters and digits; the previewBase and fallbackOrigin are https addresses; a live profile
// may have none of the three (loadConfig refuses it).
export const PREVIEW_BASE = "https://sites.leadconnectorhq.com/preview/";
export function linksProblems(profile) {
  const L = profile.links || {}, bad = [];
  for (const [slug, id] of Object.entries(L.pageIds || {})) if (!/^[A-Za-z0-9]{16,24}$/.test(String(id))) bad.push(`links.pageIds.${slug} is "${id}"; a GoHighLevel page id is 20 letters and digits (the last part of the page's preview address)`);
  if (L.previewBase !== undefined && !/^https:\/\/[a-z0-9.-]+\/(?:[\w-]+\/)*$/.test(L.previewBase)) bad.push(`links.previewBase must be an https address ending in "/"; it is ${L.previewBase}`);
  if (L.fallbackOrigin !== undefined && !/^https:\/\/[a-z0-9.-]+$/.test(L.fallbackOrigin)) bad.push(`links.fallbackOrigin must be an https origin with no path; it is ${L.fallbackOrigin}`);
  if (profile.mode === "live" && (Object.keys(L.pageIds || {}).length || L.fallbackOrigin || L.previewBase || Object.keys(L.map || {}).length)) bad.push("the production profile must not map links (links.pageIds, links.previewBase, links.fallbackOrigin and links.map are for staging only)");
  return bad;
}
export function pageAddress(cfg, profile, slug, publicUrl, kind) {
  const L = profile.links || {};
  if (L.map && L.map[slug]) return L.map[slug];
  if (L.pageIds && L.pageIds[slug]) return (L.previewBase || PREVIEW_BASE) + L.pageIds[slug];
  const u = publicUrl ? new URL(publicUrl) : new URL("/" + slug, cfg.siteOrigin);
  if (u.origin !== cfg.siteOrigin) return publicUrl;                                  // the Yard Guide lives on the blog's own address
  if (L.fallbackOrigin) return L.fallbackOrigin + u.pathname;
  const p = (L.prefix || "") + u.pathname;
  return kind === "site" ? p : (L.siteOrigin || cfg.siteOrigin) + p;                  // from the blog every link to the website is a full address
}
// every value still holding a placeholder (a word of four or more capitals, such as DATE or STAGING-QUOTE-WORKER)
export function placeholders(cfg, profile) {
  const found = [];
  const look = (where, v) => { if (typeof v === "string" && /(^|[^A-Za-z0-9])[A-Z]{4,}([^a-z0-9]|$)/.test(v.replace(/^https?:\/\//, ""))) found.push(`${where} = ${v}`); };
  look("assetsVersion", cfg.assetsVersion);
  for (const k of ["assetsBase", "endpoint", "reviewsEndpoint", "savedLinkBase"]) look(`profiles.${profile.name}.${k}`, profile[k]);
  for (const [slug, v] of Object.entries(profile.links.map || {})) look(`profiles.${profile.name}.links.map.${slug}`, v);
  return found;
}

// ---- HTML: entities, a small tokenizer, visible text, tag balance ----------------------------------------------------
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c", mdash: "\u2014", ndash: "\u2013",
  hellip: "\u2026", copy: "\u00a9", reg: "\u00ae", trade: "\u2122", middot: "\u00b7", bull: "\u2022", times: "\u00d7", frac12: "\u00bd", frac14: "\u00bc", frac34: "\u00be", deg: "\u00b0",
  rarr: "\u2192", larr: "\u2190", shy: "\u00ad", ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009", zwj: "\u200d", zwnj: "\u200c", check: "\u2713", star: "\u2606", starf: "\u2605", sect: "\u00a7",
  para: "\u00b6", cent: "\u00a2", euro: "\u20ac", pound: "\u00a3", laquo: "\u00ab", raquo: "\u00bb", prime: "\u2032", Prime: "\u2033", minus: "\u2212", plusmn: "\u00b1", divide: "\u00f7", eacute: "\u00e9" };
export const unknownEntities = new Set();
export const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  if (Object.prototype.hasOwnProperty.call(NAMED, e)) return NAMED[e];
  unknownEntities.add(e); return m;
});

const TOKEN = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`=]+))?)*)\s*(\/?)>/gi;
// tokens: { type: "text" | "comment" | "raw" (a whole script or style element) | "doctype" | "close" | "open", raw, start, end, tag?, attrs?, selfClosed? }
export function tokens(html) {
  const out = []; let last = 0, m; const re = new RegExp(TOKEN.source, "gi");
  while ((m = re.exec(html))) {
    if (m.index > last) out.push({ type: "text", raw: html.slice(last, m.index), start: last, end: m.index });
    const raw = m[0], base = { raw, start: m.index, end: m.index + raw.length };
    if (raw.startsWith("<!--")) out.push({ type: "comment", ...base });
    else if (m[1]) out.push({ type: "raw", tag: m[1].toLowerCase(), ...base });
    else if (/^<!doctype/i.test(raw)) out.push({ type: "doctype", ...base });
    else if (m[2]) out.push({ type: "close", tag: m[2].toLowerCase(), ...base });
    else out.push({ type: "open", tag: m[3].toLowerCase(), attrs: m[4] || "", selfClosed: m[5] === "/", ...base });
    last = m.index + raw.length;
  }
  if (last < html.length) out.push({ type: "text", raw: html.slice(last), start: last, end: html.length });
  return out;
}
const ATTR_SRC = "(\\s+)([^\\s\"'<>\\/=]+)(?:(\\s*=\\s*)(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'<>`=]+)))?";
export function attrsOf(attrString) {
  const out = {}, re = new RegExp(ATTR_SRC, "g"); let m;
  while ((m = re.exec(attrString))) out[m[2].toLowerCase()] = m[3] === undefined ? true : (m[4] ?? m[5] ?? m[6] ?? "");
  return out;
}
// change attribute values of one opening tag: fn(name, value) returns a new value, or undefined to keep it
export function mapAttrs(attrString, fn) {
  return attrString.replace(new RegExp(ATTR_SRC, "g"), (whole, space, name, eq, dq, sq, bare) => {
    if (eq === undefined) return whole;
    const value = dq ?? sq ?? bare ?? "", next = fn(name.toLowerCase(), value);
    return next === undefined || next === value ? whole : `${space}${name}="${String(next).replace(/"/g, "&quot;")}"`;
  });
}
export const openTagOfRaw = (raw) => {
  const m = /^<(script|style)\b([^>]*)>/i.exec(raw), end = raw.lastIndexOf("</");
  return { tag: m[1].toLowerCase(), attrs: m[2], open: m[0], inner: raw.slice(m[0].length, end), close: raw.slice(end) };
};

// The words a reader can see: no comments, scripts or styles; tags become blanks; entities decoded; blanks collapsed.
export function visibleText(html) {
  return tokens(html).filter((t) => t.type === "text").map((t) => decode(t.raw)).join(" ").replace(/[\s\u00a0]+/g, " ").trim();
}

export const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
const OPTIONAL = new Set("p li dt dd option optgroup tr td th thead tbody tfoot colgroup caption rt rp".split(" "));
const CLOSES_P = /^(div|ul|ol|dl|h[1-6]|section|table|figure|blockquote|form|p|header|footer|nav|details|address|hr|pre|main|article|aside)$/;
// Is every tag that was opened also closed? Returns a list of problems (empty = balanced). Elements whose end tag
// HTML allows to be left out (p, li, td ...) are closed where HTML closes them.
export function balance(html) {
  const stack = [], problems = [];
  for (const t of tokens(html)) {
    if (t.type === "open") {
      if (VOID.has(t.tag) || t.selfClosed) continue;
      const top = stack[stack.length - 1];
      if (top && OPTIONAL.has(top) && (top === t.tag || (top === "dt" && t.tag === "dd") || (top === "dd" && t.tag === "dt") || (top === "p" && CLOSES_P.test(t.tag)))) stack.pop();
      stack.push(t.tag);
    } else if (t.type === "close") {
      if (VOID.has(t.tag)) continue;
      const at = stack.lastIndexOf(t.tag);
      if (at < 0) { problems.push(`a closing </${t.tag}> with nothing open (near character ${t.start})`); continue; }
      for (const left of stack.slice(at + 1)) if (!OPTIONAL.has(left)) problems.push(`<${left}> is still open at </${t.tag}> (near character ${t.start})`);
      stack.length = at;
    }
  }
  for (const left of stack) if (!OPTIONAL.has(left)) problems.push(`<${left}> is never closed`);
  return problems;
}
// The nodes at the top level of a fragment: [{ kind: "element" | "text" | "comment" | "raw", tag, attrs, html }]
export function topLevel(html) {
  const out = []; let depth = 0, begin = -1, first = null;
  for (const t of tokens(html)) {
    if (depth === 0) {
      if (t.type === "open" && !(VOID.has(t.tag) || t.selfClosed)) { depth = 1; begin = t.start; first = t; continue; }
      if (t.type === "open") out.push({ kind: "element", tag: t.tag, attrs: attrsOf(t.attrs), html: t.raw });
      else if (t.type === "raw") out.push({ kind: "raw", tag: t.tag, attrs: attrsOf(openTagOfRaw(t.raw).attrs), html: t.raw });
      else if (t.type === "close") throw new Error(`topLevel: a closing </${t.tag}> at the top level`);
      else out.push({ kind: t.type, html: t.raw });
      continue;
    }
    if (t.type === "open" && !(VOID.has(t.tag) || t.selfClosed)) depth += 1;
    else if (t.type === "close" && !VOID.has(t.tag)) { depth -= 1; if (depth === 0) out.push({ kind: "element", tag: first.tag, attrs: attrsOf(first.attrs), html: html.slice(begin, t.end) }); }
  }
  if (depth !== 0) throw new Error("topLevel: the fragment ends with a tag still open");
  return out;
}
export const hasClass = (node, name) => node && node.attrs && typeof node.attrs.class === "string" && node.attrs.class.split(/\s+/).includes(name);

// ---- reading a built page ---------------------------------------------------------------------------------------------
// Which files in directions/coverstory are pages of the site: those the site builder marked as built from
// _work/pages/<slug>.html, without the kit pages (kit-*.html) and the recipe examples (_work/examples/).
// THE ROLLOUT FORM OF A BUILT PAGE. The site builder writes ONE line that belongs to the review build only: the
// footer's last paragraph, <p class="foot__review">Review build. Nothing on this page is sent anywhere. ...</p>,
// printed only while _work/partials/site.json says "review": true. A rollout build (PP_REVIEW=0, or "review": false)
// is the same page without that one line, byte for byte (proven by _work/ghl/prove-rollout-form.mjs, which builds
// both and compares all pages). The fragment tools always read the rollout form, so the blocks are the same whichever
// of the two builds stands on disk, they never carry the line, and the owner's review copy can stay in place.
// If the line ever changes shape so that it cannot be removed whole, reading the page stops with a sentence.
const REVIEW_LINE = /\n[ \t]*<p class="foot__review">[^<]*<\/p>(?=\n)/g;
export function rolloutForm(html, name = "the page") {
  const out = html.replace(REVIEW_LINE, "");
  if (/foot__review|Review build\./.test(out)) throw new Error(`${name}: the footer's review-build line is not in the one-line form the fragment tools remove (<p class="foot__review">plain text</p> on a line of its own). Build the pages as a rollout build (PP_REVIEW=0 node _work/build-site.mjs) or bring rolloutForm in _work/ghl/lib.mjs up to date.`);
  return out;
}
export function discoverPages() {
  const pages = [];
  for (const name of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort()) {
    const file = path.join(ROOT, name), onDisk = read(file);
    const made = /<!-- Built by _work\/build-site\.mjs from (_work\/[\w\/.-]+\.html)\./.exec(onDisk.slice(0, 2000));
    if (!made || !made[1].startsWith("_work/pages/") || /^_work\/pages\/kit-/.test(made[1])) continue;
    const html = rolloutForm(onDisk, name);
    const page = parsePage(name.replace(/\.html$/, ""), html, file);
    page.reviewBuildOnDisk = html !== onDisk;        // the page on disk is a review build; its rollout form is what was read
    pages.push(page);
  }
  if (!pages.length) throw new Error("no built pages found in " + ROOT);
  return pages;
}
export function parsePage(slug, html, file) {
  const fail = (why) => { throw new Error(`${slug}.html: ${why}. The fragment builder reads the page as the site builder writes it; if the skeleton (_work/partials/document.html) changed, parsePage in _work/ghl/lib.mjs must follow.`); };
  const headM = /<head>([\s\S]*?)<\/head>/.exec(html) || fail("no <head>");
  const bodyM = /<body([^>]*)>([\s\S]*)<\/body>/.exec(html) || fail("no <body>");
  const head = headM[1], body = bodyM[2];
  const page = { slug, file, mtimeMs: file ? fs.statSync(file).mtimeMs : 0, sourceSha256: sha256(html), bodyAttrs: attrsOf(bodyM[1]), bodyInner: body };
  const metas = {}, links = [];
  page.jsonld = [];
  for (const t of tokens(head)) {
    if (t.type === "open" && t.tag === "meta") { const a = attrsOf(t.attrs), key = a.name || a.property; if (key) metas[key] = decode(String(a.content ?? "")); }
    if (t.type === "open" && t.tag === "link") links.push({ raw: t.raw, attrs: attrsOf(t.attrs) });
    if (t.type === "raw" && t.tag === "script") { const o = openTagOfRaw(t.raw), a = attrsOf(o.attrs); if (a.type === "application/ld+json") page.jsonld.push(o.inner.trim()); else fail("a script in the head that is not structured data"); }
    if (t.type === "raw" && t.tag === "style") fail("a <style> in the head");
  }
  page.title = decode((/<title>([\s\S]*?)<\/title>/.exec(head) || fail("no <title>"))[1].trim());
  page.metas = metas;
  page.description = metas.description || "";
  page.robots = metas.robots || "";
  page.canonical = (links.find((l) => l.attrs.rel === "canonical") || { attrs: {} }).attrs.href || "";
  page.icon = (links.find((l) => l.attrs.rel === "icon") || { attrs: {} }).attrs.href || "";
  page.preloads = links.filter((l) => l.attrs.rel === "preload").map((l) => l.raw);
  page.fontLinks = links.filter((l) => /fonts\.(googleapis|gstatic)\.com/.test(String(l.attrs.href || ""))).map((l) => l.raw);
  page.stylesheets = links.filter((l) => l.attrs.rel === "stylesheet" && !/^https?:/.test(String(l.attrs.href || ""))).map((l) => l.attrs.href);
  const mainAt = body.indexOf("<main"), mainEnd = body.indexOf("</main>");
  if (mainAt < 0 || mainEnd < 0 || body.indexOf("<main", mainAt + 5) >= 0) fail("expected exactly one <main>");
  page.headerHtml = body.slice(0, mainAt).trim();
  page.mainOpen = /^<main[^>]*>/.exec(body.slice(mainAt))[0];
  page.mainInner = body.slice(mainAt + page.mainOpen.length, mainEnd);
  const after = body.slice(mainEnd + "</main>".length);
  const footEnd = after.lastIndexOf("</footer>");
  if (footEnd < 0) fail("no </footer> after </main>");
  page.footerHtml = after.slice(0, footEnd + "</footer>".length).trim();
  page.scripts = [];
  for (const t of tokens(after.slice(footEnd + "</footer>".length))) {
    if (t.type === "text" && !t.raw.trim()) continue;
    if (t.type === "comment") continue;
    if (t.type === "raw" && t.tag === "script") { const o = openTagOfRaw(t.raw), a = attrsOf(o.attrs); if (a.src && !o.inner.trim()) { page.scripts.push(a.src); continue; } }
    fail("something other than a script with a src after the footer: " + t.raw.slice(0, 80));
  }
  if (!/<header\b/.test(page.headerHtml)) fail("no <header> before <main>");
  if (!/^(<!--[\s\S]*?-->\s*)*<footer\b/.test(page.footerHtml)) fail("something other than the footer between </main> and </footer>");
  return page;
}

// ---- files on disk --------------------------------------------------------------------------------------------------
export function fileInfo(rel) {
  const file = path.join(RELEASE, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { path: rel, exists: false };
  const data = fs.readFileSync(file);
  return { path: rel, exists: true, bytes: data.length, sha256: sha256(data) };
}
export function listFiles(dir) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out.push(f); } };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

// ---- window.PPSite: the ONE settings object of a profile (shared/CORE-API.md section 13.3) --------------------------
// Written by the site body code before any script of ours loads. build-fragments.mjs writes it; check-fragments.mjs
// reads it back from the block and compares with this, then hands it to the engine's own siteOptions().
//   mode              "live" (production) or "staging"; a profile for the local simulation says "demo"
//   endpoint          the quote Worker's request address (.../submit)
//   reviewsEndpoint   the same Worker's /reviews (read by js/site.js only)
//   allowedOrigins    staging only: the https origins of the test pages. [] in production (live ignores it)
//   savedLinkBase     staging only, and only when the settings file gives one
//   googleAdsSendTo   PRODUCTION ONLY: the Google Ads conversion label. A staging block never names it
//   firePixelEvents   true in production, false in staging
//   env, assetsBase, assets, build   for the loader and for a person reading the page source
export function siteSettings(cfg, profile) {
  const out = { env: profile.environment || profile.name, mode: profile.mode, endpoint: profile.endpoint || "" };
  if (profile.reviewsEndpoint) out.reviewsEndpoint = profile.reviewsEndpoint;
  out.allowedOrigins = profile.mode === "staging" ? profile.allowedOrigins || [] : [];
  if (profile.mode === "staging" && profile.savedLinkBase) out.savedLinkBase = profile.savedLinkBase;
  if (profile.mode === "live" && profile.googleAdsSendTo) out.googleAdsSendTo = profile.googleAdsSendTo;
  out.firePixelEvents = profile.mode === "live" ? profile.firePixelEvents !== false : false;
  out.assetsBase = profile.assetsBase; out.assets = profile.assetsBase + "/assets/"; out.build = cfg.assetsVersion;
  return out;
}
// The production request addresses the site's own scripts trust (js/builder.js LIVE_ENDPOINTS, js/site.js
// CONTACT_LIVE_ENDPOINTS) and the engine's conversion label, read from the files that will be published.
export function trustedFromScripts(cfg) {
  const list = (file, name) => { const m = new RegExp("var " + name + "\\s*=\\s*(\\[[^\\]]*\\]);").exec(read(path.join(ROOT, file))); if (!m) throw new Error(`${file}: "var ${name} = [...]" was not found; the fragment tools read the production request addresses from it`); return JSON.parse(m[1]); };
  const engine = read(path.join(RELEASE, cfg.engineFile)), label = /const LIVE_GOOGLE_ADS_SEND_TO\s*=\s*"([^"]+)";/.exec(engine);
  if (!label) throw new Error(`${cfg.engineFile}: LIVE_GOOGLE_ADS_SEND_TO was not found`);
  return { builder: list("js/builder.js", "LIVE_ENDPOINTS"), site: list("js/site.js", "CONTACT_LIVE_ENDPOINTS"), googleAdsSendTo: label[1] };
}
// THE SAVED-QUOTE TOKEN GUARD: the first thing in the site head code, before any tag.
// FIX 2026-10-10 (VERIFY-sending finding 2). A saved-quote link is <page>#resume=<token>. js/builder.js takes the token
// out of the address "before any tag can read it", but inside GoHighLevel the Google tag and the pixel's PageView sit in
// the site head and the builder arrives after load, so the tags ran with the token still in the address. This script
// takes it out first and hands it to the engine once through window.__ppTakePlanToken, the hook takeResumeToken()
// already honours (the live quote page works the same way). Same rules as the engine: 43 characters of A-Z a-z 0-9 _ -
// or "invalid"; an address that cannot be cleaned makes the token unusable. With no #resume= it does nothing at all.
export const TOKEN_GUARD = `<script>/* a saved-quote link's token leaves the address before any tag can read it; the price builder is handed it once */
(function(w){try{var l=w.location,h=String(l.hash||"");if(!/^#resume=/.test(h))return;var m=/^#resume=([A-Za-z0-9_-]{43})$/.exec(h),t=m?m[1]:"invalid";try{w.history.replaceState(w.history.state,"",l.pathname+l.search)}catch(e){t="invalid"}w.__ppTakePlanToken=function(){var x=t;t="";return x}}catch(e){}})(window)</script>`;
// What is wrong with a profile's send settings, as sentences (empty = nothing). The same rules for builder and checker.
export function settingsProblems(cfg, profile) {
  // The host as a browser resolves it: lower case, no port, no trailing dot ("host:443" and "host." are "host").
  // FIX 2026-10-10 (VERIFY-sending finding 1): a trailing dot used to pass as a different host.
  const bad = [], t = trustedFromScripts(cfg), host = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/[.]+$/, ""); } catch (e) { return ""; } };
  // a plain host name and nothing else: no port, no user name, no trailing dot
  const submit = (u) => /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?\/submit$/.test(String(u || "")), reviews = (u) => /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?\/reviews$/.test(String(u || ""));
  if (t.builder.join("|") !== t.site.join("|")) bad.push(`js/builder.js LIVE_ENDPOINTS (${t.builder.join(", ")}) and js/site.js CONTACT_LIVE_ENDPOINTS (${t.site.join(", ")}) are not the same list`);
  if (!["live", "staging", "demo"].includes(profile.mode)) bad.push(`mode is "${profile.mode}"; it must be live, staging or demo`);
  if (profile.mode === "live") {
    if (profile.endpoint !== t.builder[0]) bad.push(`the production request address is ${profile.endpoint || "(none)"}; it must be the first address js/builder.js trusts, ${t.builder[0]}`);
    if (profile.googleAdsSendTo !== t.googleAdsSendTo) bad.push(`googleAdsSendTo is ${profile.googleAdsSendTo || "(none)"}; the production profile must carry the engine's live label ${t.googleAdsSendTo}`);
    if ((profile.allowedOrigins || []).length) bad.push("allowedOrigins must be empty in the production profile (live mode ignores it)");
    if (profile.savedLinkBase) bad.push("savedLinkBase must not be set in the production profile");
    if (profile.firePixelEvents === false) bad.push("firePixelEvents is false in the production profile");
    if (!profile.tracking) bad.push("the production profile has tracking off");
  }
  if (profile.mode === "staging") {
    if (!submit(profile.endpoint)) bad.push(`the staging request address must be https://<host>/submit; it is ${profile.endpoint || "(none)"}`);
    if (t.builder.some((u) => host(u) === host(profile.endpoint))) bad.push(`the staging request address is on a PRODUCTION host (${host(profile.endpoint)})`);
    if (profile.googleAdsSendTo !== undefined) bad.push("googleAdsSendTo must not be set in the staging profile (the conversion label is for production only)");
    if (profile.firePixelEvents !== false) bad.push("firePixelEvents must be false in the staging profile");
    if (profile.tracking) bad.push("the staging profile has tracking on");
    if (!(profile.allowedOrigins || []).length || (profile.allowedOrigins || []).some((o) => !/^https:\/\/[a-z0-9.-]+$/.test(o))) bad.push("allowedOrigins must name the https origin(s) the staging pages are served from");
    if (profile.savedLinkBase && !/^https:\/\//.test(profile.savedLinkBase)) bad.push("savedLinkBase must be an https address");
  }
  if (profile.mode !== "demo") {
    if (!reviews(profile.reviewsEndpoint)) bad.push(`reviewsEndpoint must be https://<host>/reviews; it is ${profile.reviewsEndpoint || "(none)"}`);
    else if (host(profile.reviewsEndpoint) !== host(profile.endpoint)) bad.push(`reviewsEndpoint (${host(profile.reviewsEndpoint)}) is not on the same Worker as the request address (${host(profile.endpoint)})`);
  }
  return bad;
}
