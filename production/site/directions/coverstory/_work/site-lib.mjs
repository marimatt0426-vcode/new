// site-lib.mjs : the few things build-site.mjs, check-site.mjs and review/build-review.mjs all need to agree on:
// where things are, which thirty pages make the site, how a page source is read, and how HTML becomes plain text.
// Plain Node, no dependencies. A page author never needs to read this file; ADD-A-PAGE.md says everything.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const WORK = path.dirname(fileURLToPath(import.meta.url));   // directions/coverstory/_work
export const ROOT = path.resolve(WORK, "..");                        // directions/coverstory (the built pages live here)
export const RELEASE = path.resolve(ROOT, "../..");                  // the release folder (assets/, shared/, review/)
export const PAGES_DIR = path.join(WORK, "pages");
export const EXAMPLES_DIR = path.join(WORK, "examples");
export const PARTIALS_DIR = path.join(WORK, "partials");
export const SITE = "https://itspurgepros.com";
export const PHONE_HREF = "tel:+13179615865";
// The client portal (Housecall Pro), as linked from the live site's footer. One place, used by the header, the phone
// menu and the footer partials through the {{portal}} slot.
export const PORTAL_HREF = "https://client.housecallpro.com/customer_portal/request-link?token=5621b4767b82412482e8822eed5916a4";

// ---- the forty pages: the thirty of BRIEF.md section 7, the nine towns added on October 10, 2026 (26 town pages in
// all) and page-not-found (noindex; in no sitemap). A source file's name must be one of these slugs. Older comments
// and messages in the build files still say "the thirty": read it as "the pages of this list".
export const CITIES = "indianapolis carmel fishers noblesville westfield anderson avon brownsburg danville fortville greenfield greenwood ingalls lawrence mccordsville new-palestine plainfield zionsville whitestown mooresville pendleton camby cicero pittsboro lapel markleville".split(" ");
export const PAGES = ["index", "quote", "dog-waste-removal", "sanitizing-and-deodorizing", "additional", ...CITIES,
  "about", "reviews", "faq", "welcome", "terms-conditions", "privacy-policy", "yard-guide", "yard-guide-article", "page-not-found"];
// Heroes that show the mascot in blue gloves (DESIGN.md section 10, the glove rule).
export const GLOVED_SCENES = new Set([...CITIES.map((c) => `heroes/${c}.jpg`), "heroes/sanitizing-and-deodorizing.jpg", "heroes/welcome.jpg"]);

// ---- errors that name the page and the field at fault ----------------------------------------------------------
export class PageError extends Error {
  constructor(slug, message) { super(`${slug}: ${message}`); this.slug = slug; }
}

// ---- which kind of thing a source file is ----------------------------------------------------------------------
// "page"    one of the thirty, built to <slug>.html
// "kit"     a family's kit page, _work/pages/kit-<name>.html, built to kit-<name>.html
// "example" a working example of a hero recipe, _work/examples/<name>.html, built to _example-<name>.html
export function kindOf(slug, dir) {
  if (dir === EXAMPLES_DIR) return "example";
  if (/^kit-[a-z0-9-]+$/.test(slug)) return "kit";
  return PAGES.includes(slug) ? "page" : null;
}
export const outputName = (slug, kind) => (kind === "example" ? "_example-" + slug : slug) + ".html";

function nearest(word, list) {
  const dist = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length]; };
  const best = list.map((w) => [dist(word, w), w]).sort((x, y) => x[0] - y[0])[0];
  return best && best[0] <= 3 ? best[1] : null;
}
export const didYouMean = (word, list) => { const n = nearest(word, list); return n ? ` Did you mean "${n}"?` : ""; };

// ---- reading a page source: a JSON block in an HTML comment, then the page's own sections ----------------------
export function readSource(file) {
  const dir = path.dirname(file), slug = path.basename(file, ".html");
  const kind = kindOf(slug, dir);
  if (!kind) throw new PageError(slug, `"${slug}.html" is not one of the site's pages and not a kit page (kit-<name>.html). The page slugs are listed by: node _work/build-site.mjs --list.${didYouMean(slug, PAGES)}`);
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const open = text.match(/^\s*<!--/);
  const end = text.indexOf("-->");
  if (!open || end < 0) throw new PageError(slug, "the file must start with its JSON block inside an HTML comment: <!-- { \"title\": … } -->");
  const json = text.slice(open[0].length, end);
  if (!json.trim().startsWith("{")) throw new PageError(slug, "the first thing in the file must be its JSON block inside an HTML comment: <!-- { \"title\": … } -->. This file starts with an ordinary comment.");
  let meta;
  try { meta = JSON.parse(json); } catch (e) {
    const pos = /position (\d+)/.exec(e.message);
    const line = pos ? text.slice(0, open[0].length + Number(pos[1])).split("\n").length : null;
    throw new PageError(slug, `the JSON block does not parse${line ? " (near line " + line + " of the file)" : ""}: ${e.message}. Check for a missing comma, a trailing comma or an unescaped double quote.`);
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new PageError(slug, "the JSON block must be one object: { \"title\": …, \"description\": …, \"hero\": { … } }");
  return { slug, kind, file, meta, body: text.slice(end + 3).replace(/^\n+/, "").trimEnd(), out: outputName(slug, kind) };
}

// Every source there is, in a stable order: the thirty first (in site order), then kits, then examples.
export function listSources() {
  const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort().map((f) => path.join(dir, f)) : []);
  const pages = files(PAGES_DIR);
  const rank = (f) => { const i = PAGES.indexOf(path.basename(f, ".html")); return i < 0 ? PAGES.length : i; };
  return [...pages.sort((a, b) => rank(a) - rank(b)), ...files(EXAMPLES_DIR)];
}

// The state of the thirty: built (source and output exist), source only, or not started.
export function siteState() {
  return PAGES.map((slug) => {
    const source = fs.existsSync(path.join(PAGES_DIR, slug + ".html")), built = fs.existsSync(path.join(ROOT, slug + ".html"));
    return { slug, file: slug + ".html", source, built: source && built, state: source && built ? "built" : source ? "source only (run the build)" : "not started" };
  });
}
// Every page file the site builder has produced: the built ones of the thirty, then family kit pages.
export function builtFiles() {
  const kits = fs.existsSync(PAGES_DIR) ? fs.readdirSync(PAGES_DIR).filter((f) => /^kit-[a-z0-9-]+\.html$/.test(f) && fs.existsSync(path.join(ROOT, f))).sort() : [];
  return { pages: siteState().filter((p) => p.built).map((p) => p.file), kits, notBuilt: siteState().filter((p) => !p.built).map((p) => p.file) };
}

// ---- HTML to plain text ----------------------------------------------------------------------------------------
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·", mdash: "—", ndash: "–", hellip: "…", copy: "©", times: "×", frac12: "½", deg: "°" };
export const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
});
// Text for an HTML text node or attribute. A bare & is escaped; an entity already written (&rsquo; &amp;) is kept.
export const esc = (s) => String(s).replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// The text of a fragment: tags dropped, entities decoded, one space between words. The end of a paragraph, a list item,
// a heading or a line break is a space, so the words of an answer written as a list do not run together.
export const textOf = (html) => decode(html.replace(/<\/(?:p|li|ul|ol|h[1-6]|div|dt|dd)>|<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
// Everything a visitor can read on a page (scripts, styles and drawings left out).
export const visibleText = (html) => decode(html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

// The visible accordion as question and answer pairs: the one source of FAQPage structured data.
export function faqPairs(html) {
  return [...html.matchAll(/<details class="faq__item"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<div class="faq__a">([\s\S]*?)<\/div>\s*<\/details>/g)]
    .map((m) => ({ question: textOf(m[1]), answer: textOf(m[2]) }));
}
export const jsonLdBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// ---- width and height of an image file (JPEG, PNG, WebP), so no page ever types them --------------------------
export function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0xff && b[1] === 0xd8) {                                   // JPEG: find the frame header
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  } else if (b.toString("ascii", 1, 4) === "PNG") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  else if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") { const n = b.readUInt32LE(21); return { width: 1 + (n & 0x3fff), height: 1 + ((n >> 14) & 0x3fff) }; }
  }
  throw new Error("cannot read the size of " + file);
}

// ================================================================================================================
// SPEED AND LINK PREVIEWS (ADD-A-PAGE.md section 10, DESIGN.md "Speed"). Three things every tool must agree on:
// the site settings, the derived pictures, and the minified copies of the stylesheets and scripts.
// ================================================================================================================
export const ASSETS_DIR = path.join(RELEASE, "assets");
export const DERIVED_DIR = path.join(ASSETS_DIR, "derived");
const sha1Cache = new Map();
export function fileSha1(file) {
  const st = fs.statSync(file), key = `${file}:${st.size}:${st.mtimeMs}`;
  if (!sha1Cache.has(key)) sha1Cache.set(key, crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex"));
  return sha1Cache.get(key);
}

// ---- THE SITE'S ROLLOUT SETTINGS: _work/partials/site.json -----------------------------------------------------
//   "assetsBase": null                                   the review build: no page carries a link-preview picture
//   "assetsBase": "https://<where the assets folder is published>"   ROLLOUT: every page then names its own picture,
//                                                        <assetsBase>/derived/share/<slug>.jpg, as og:image and twitter:image
// PP_ASSETS_BASE in the environment sets it for one build without editing the file.
//   "review": true                                       the review build: the footer's last line says "Review build.
//                                                        Nothing on this page is sent anywhere..." on every page
//   "review": false, or the line left out                ROLLOUT: no page prints that line. The safe default: only the
//                                                        exact value true turns it on, so a production build never
//                                                        carries it by accident
// PP_REVIEW=1 or PP_REVIEW=0 in the environment sets it for one build (and one check) without editing the file.
//   "headerText": true                                   the phone top bar (under 1180px wide) carries a Text button straight
//                                                        before the gold button: a.hdr__text in _work/partials/header.html,
//                                                        and the header gets the class hdr--text (owner request, October 12)
//   "headerText": false, or the line left out            the header without it, byte for byte as it was. Only the exact
//                                                        value true turns it on
// PP_HEADER_TEXT=1 or PP_HEADER_TEXT=0 in the environment sets it for one build (and one check) without editing the file.
export function siteSettings() {
  const file = path.join(PARTIALS_DIR, "site.json");
  const json = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  let base = process.env.PP_ASSETS_BASE !== undefined ? process.env.PP_ASSETS_BASE : json.assetsBase;
  base = base === null || base === undefined ? "" : String(base).trim().replace(/\/+$/, "");
  if (base && !/^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._~\/-]*)?$/.test(base)) throw new Error(`_work/partials/site.json: "assetsBase" must be null or a full https address with no query, like "https://assets.example.com/site" (it is the public address of the assets folder). It is "${base}".`);
  const env = process.env.PP_REVIEW;
  if (env !== undefined && !/^[01]$/.test(env)) throw new Error(`PP_REVIEW must be 1 (a review build) or 0 (a rollout build). It is "${env}".`);
  if (json.review !== undefined && typeof json.review !== "boolean") throw new Error('_work/partials/site.json: "review" must be true (the review build) or false (rollout).');
  const text = process.env.PP_HEADER_TEXT;
  if (text !== undefined && !/^[01]$/.test(text)) throw new Error(`PP_HEADER_TEXT must be 1 (the phone top bar carries the Text button) or 0 (it does not). It is "${text}".`);
  if (json.headerText !== undefined && typeof json.headerText !== "boolean") throw new Error('_work/partials/site.json: "headerText" must be true (the phone top bar carries the Text button) or false (it does not).');
  return { assetsBase: base, review: env !== undefined ? env === "1" : json.review === true, headerText: text !== undefined ? text === "1" : json.headerText === true };
}

// ---- derived pictures: assets/derived/manifest.json, written by _work/perf/derive-images.mjs ---------------------
// A copy counts only while it is as new as its original: the manifest holds the original's fingerprint, and a
// picture that was replaced since is treated as having no copies (the page then shows the original and check-site
// says which command to run).
let manifestCache = null;
export function derivedManifest() {
  if (!manifestCache) {
    const file = path.join(DERIVED_DIR, "manifest.json");
    manifestCache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { images: {}, logo: null, share: {} };
  }
  return manifestCache;
}
const DERIVE_HINT = "Run: node _work/perf/derive-images.mjs";
// the WebP copies of assets/<key>, smallest first: [{ w, h, file, bytes }]; null (with a reason) when there are none to use
export function webpCopies(key) {
  const entry = derivedManifest().images[key], src = path.join(ASSETS_DIR, key);
  if (!entry) return { copies: null, why: `assets/${key} has no WebP copies. ${DERIVE_HINT}` };
  if (!fs.existsSync(src) || fileSha1(src) !== entry.sha1) return { copies: null, why: `the WebP copies of assets/${key} are older than the picture. ${DERIVE_HINT}` };
  const gone = entry.variants.find((v) => !fs.existsSync(path.join(ASSETS_DIR, v.file)));
  if (gone) return { copies: null, why: `assets/${gone.file} is missing. ${DERIVE_HINT}` };
  return { copies: entry.variants, why: "" };
}
// the small logo files: { header, footer, icon } as paths under assets/, or the original when they are missing or old
export function logoFiles() {
  const logo = derivedManifest().logo, src = path.join(ASSETS_DIR, "brand/logo-mark.png"), plain = { header: "brand/logo-mark.png", footer: "brand/logo-mark.png", icon: "brand/logo-mark.png", why: `the small logo files are missing or older than assets/brand/logo-mark.png. ${DERIVE_HINT}` };
  if (!logo || !fs.existsSync(src) || fileSha1(src) !== logo.sha1) return plain;
  const find = (name) => logo.files.find((f) => f.file.endsWith(name) && fs.existsSync(path.join(ASSETS_DIR, f.file)));
  const header = find("logo-mark-158.webp"), footer = find("logo-mark-316.webp"), icon = find("logo-mark-64.png");
  return header && footer && icon ? { header: header.file, footer: footer.file, icon: icon.file, why: "" } : plain;
}
// the link-preview picture of a page: { file, bytes, from } under assets/, or null with a reason
export function sharePicture(slug) {
  const s = derivedManifest().share[slug];
  if (!s) return { picture: null, why: `${slug} has no link-preview picture. ${DERIVE_HINT}` };
  const src = path.join(ASSETS_DIR, s.from);
  if (!fs.existsSync(path.join(ASSETS_DIR, s.file)) || !fs.existsSync(src) || fileSha1(src) !== s.sha1) return { picture: null, why: `the link-preview picture of ${slug} is missing or older than assets/${s.from}. ${DERIVE_HINT}` };
  return { picture: s, why: "" };
}

// ---- minified copies of the stylesheets and scripts, for rollout: assets/derived/min/ ---------------------------
// Whitespace and comments only. Nothing is renamed, reordered or rewritten, so a minified file behaves exactly as
// its source. node _work/build-site.mjs --min writes them and reports the saving; review/build-review.mjs --min and
// _work/perf/*.mjs --min use them. _work/perf/verify-min.mjs proves each copy equal to its source.
export const MIN_DIR = path.join(DERIVED_DIR, "min");
export const MIN_HREF = "../../assets/derived/min/";

// CSS: comments go; runs of blanks become one; blanks beside { } ; go, and beside the commas of a selector list and the
// colon of a declaration; the last ; of a block goes. Strings and url(...) are kept byte for byte, and a value keeps
// its own spelling: the blanks around + - * / > ~ and after the commas inside it stay (calc() needs some of them).
export function minifyCss(css) {
  const src = css.replace(/^﻿/, "").replace(/\r\n/g, "\n"), n = src.length, kept = [];
  const keep = (text) => { kept.push(text); return `\u0000${kept.length - 1}\u0000`; };
  let text = "", i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "*") {
      const j = src.indexOf("*/", i + 2), end = j < 0 ? n : j + 2;
      // a comment is not a blank: glued between two tokens it is kept, so the tokens neither join nor part
      const glued = i > 0 && end < n && !/\s/.test(src[i - 1]) && !/\s/.test(src[end]) && !/[{};,]/.test(src[i - 1]) && !/[{};,]/.test(src[end]);
      if (glued) text += keep(src.slice(i, end));
      i = end; continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1; while (j < n && src[j] !== ch) { if (src[j] === "\\") j += 1; j += 1; }
      text += keep(src.slice(i, j + 1)); i = j + 1; continue;
    }
    if ((ch === "u" || ch === "U") && /^url\(/i.test(src.substr(i, 4)) && !/[\w-]/.test(src[i - 1] || " ")) {
      let j = i + 4; while (j < n && /\s/.test(src[j])) j += 1;
      if (src[j] !== '"' && src[j] !== "'") { const k = src.indexOf(")", j); text += keep(src.slice(i, k < 0 ? n : k + 1)); i = k < 0 ? n : k + 1; continue; }
    }
    text += ch; i += 1;
  }
  // The text is now pieces that end at { } or ; . A piece that ends at { is a selector list (the blanks beside its
  // commas mean nothing) or an at-rule's condition (left as written: a browser keeps the spelling of @supports).
  // Any other piece is a declaration: only the blanks around its first colon go, and its value is left as written
  // (a browser keeps the spelling of a value that holds var() or belongs to a custom property).
  text = text.replace(/[ \t\n\f]+/g, " ").replace(/([^{};]*)([{};]?)/g, (m, body, end) => {
    const piece = body.trim();
    if (end === "{") return (piece[0] === "@" ? piece : piece.replace(/ ?, ?/g, ",")) + end;
    const decl = /^([\w-]+) ?: ?([\s\S]*)$/.exec(piece);
    if (!decl) return piece + end;
    return decl[1] + ":" + (decl[2] === "" && /^--/.test(decl[1]) ? " " : decl[2]) + end;   // an empty custom property keeps its blank
  }).replace(/;\}/g, "}").trim();
  return text.replace(/\u0000(\d+)\u0000/g, (m, k) => kept[Number(k)]) + "\n";
}

// JavaScript: comments go, the blanks that start and end a line go, empty lines go. Every line break that separates
// two statements stays (so nothing depends on a semicolon that is not there), and nothing inside a line is touched.
// Strings, template literals and regular expressions are copied byte for byte.
const REGEX_AFTER = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
const quoteEnd = (s, i) => { const q = s[i]; let j = i + 1; while (j < s.length && s[j] !== q) { if (s[j] === "\\") j += 1; j += 1; } return Math.min(j + 1, s.length); };
function templateEnd(s, i) {                       // s[i] is the opening backtick
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "\\") { j += 2; continue; }
    if (s[j] === "`") return j + 1;
    if (s[j] === "$" && s[j + 1] === "{") {
      let depth = 1; j += 2;
      while (j < s.length && depth) {
        if (s[j] === '"' || s[j] === "'") { j = quoteEnd(s, j); continue; }
        if (s[j] === "`") { j = templateEnd(s, j); continue; }
        if (s[j] === "{") depth += 1; else if (s[j] === "}") depth -= 1;
        j += 1;
      }
      continue;
    }
    j += 1;
  }
  return s.length;
}
export function minifyJs(js) {
  const src = js.replace(/^﻿/, "").replace(/\r\n/g, "\n"), n = src.length;
  let out = "", i = 0, hold = 0, prev = "", word = "";
  const literal = (end) => { out += src.slice(i, end); hold = out.length; i = end; prev = "value"; };
  const atLineStart = () => out.length === 0 || (out[out.length - 1] === "\n" && out.length > hold);
  const newline = () => {
    let end = out.length; while (end > hold && (out[end - 1] === " " || out[end - 1] === "\t")) end -= 1;
    out = out.slice(0, end);
    if (out.length && out[out.length - 1] !== "\n") out += "\n";
  };
  while (i < n) {
    const ch = src[i], nx = src[i + 1];
    if (ch === "\n") { newline(); i += 1; continue; }
    if (ch === " " || ch === "\t" || ch === "\f" || ch === "\v" || ch === " ") { if (!atLineStart()) out += ch; i += 1; continue; }
    if (ch === "/" && nx === "/") { const j = src.indexOf("\n", i); i = j < 0 ? n : j; continue; }
    if (ch === "/" && nx === "*") {
      const j = src.indexOf("*/", i + 2), end = j < 0 ? n : j + 2, lines = src.slice(i, end).includes("\n");
      i = end;
      if (lines) newline(); else if (!atLineStart() && !/\s/.test(out[out.length - 1])) out += " ";
      continue;
    }
    if (ch === '"' || ch === "'") { literal(quoteEnd(src, i)); continue; }
    if (ch === "`") { literal(templateEnd(src, i)); continue; }
    if (ch === "/" && (prev === "" || (prev === "word" ? REGEX_AFTER.has(word) : prev !== "value" && prev !== ")" && prev !== "]" && prev !== "}"))) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== "\n") { const c = src[j]; if (c === "\\") { j += 2; continue; } if (c === "[") cls = true; else if (c === "]") cls = false; else if (c === "/" && !cls) break; j += 1; }
      if (j < n && src[j] === "/" && j > i + 1) { j += 1; while (j < n && /[A-Za-z]/.test(src[j])) j += 1; literal(j); continue; }
    }
    if (/[A-Za-z0-9_$]/.test(ch)) { let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j += 1; word = src.slice(i, j); out += word; i = j; prev = "word"; continue; }
    // x++ and x-- end a value: a slash after them divides
    prev = (ch === "+" || ch === "-") && out[out.length - 1] === ch ? "value" : ch;
    out += ch; i += 1;
  }
  newline();
  return out;
}

// every stylesheet and script the pages can load, as { name, from (file), kind }
export function minifiable() {
  const dir = (d, ext) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith(ext)).sort().map((f) => ({ name: f, from: path.join(ROOT, d, f), kind: ext.slice(1) }));
  return [...dir("css", ".css"), ...dir("js", ".js"), { name: "pp-quote-core.js", from: path.join(RELEASE, "shared/pp-quote-core.js"), kind: "js" }];
}
// Writes assets/derived/min/ and returns one row per file: { name, before, after, written }.
// A stylesheet's url("../../../assets/…") becomes url("../../…"): the same file, seen from the min folder.
export function writeMinified() {
  fs.mkdirSync(MIN_DIR, { recursive: true });
  const rows = [], index = {};
  for (const f of minifiable()) {
    const source = fs.readFileSync(f.from, "utf8");
    let text = f.kind === "css" ? minifyCss(source) : minifyJs(source);
    if (f.kind === "css") {
      text = text.replace(/url\((["']?)\.\.\/\.\.\/\.\.\/assets\//g, "url($1../../");
      for (const m of text.matchAll(/url\((["']?)([^"')]+)\1\)/g)) {
        if (/^data:/.test(m[2])) continue;
        if (!fs.existsSync(path.resolve(MIN_DIR, m[2].split(/[?#]/)[0]))) throw new Error(`${f.name}: url(${m[2]}) does not lead to a file from assets/derived/min/. A stylesheet names its pictures as url("../../../assets/…").`);
      }
    }
    const target = path.join(MIN_DIR, f.name), same = fs.existsSync(target) && fs.readFileSync(target, "utf8") === text;
    if (!same) fs.writeFileSync(target, text);
    index[f.name] = { sha1: fileSha1(f.from), before: Buffer.byteLength(source), after: Buffer.byteLength(text) };
    rows.push({ name: f.name, kind: f.kind, before: Buffer.byteLength(source), after: Buffer.byteLength(text), written: !same });
  }
  for (const old of fs.readdirSync(MIN_DIR)) if (/\.(css|js)$/.test(old) && !index[old]) fs.rmSync(path.join(MIN_DIR, old));
  fs.writeFileSync(path.join(MIN_DIR, "min.json"), JSON.stringify({ note: "Written by node _work/build-site.mjs --min. Do not edit.", files: index }, null, 1) + "\n");
  return rows;
}
// A built page with its stylesheets and scripts pointed at the minified copies. It refuses a copy that is missing
// or older than its source, so a page is never served with yesterday's script. ({ fresh: false } skips that check:
// only for measuring a saved copy of the pages, _work/perf/serve.mjs.)
export function minifiedRefs(html, { fresh = true } = {}) {
  const file = path.join(MIN_DIR, "min.json"), index = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).files : {};
  const sources = new Map(minifiable().map((f) => [f.name, f.from]));
  const use = (name) => {
    if (!sources.has(name)) throw new Error(`the page loads ${name}, which is not a stylesheet or script of the site`);
    if (!index[name] || !fs.existsSync(path.join(MIN_DIR, name)) || (fresh && index[name].sha1 !== fileSha1(sources.get(name)))) throw new Error(`the minified copy of ${name} is missing or older than its source. Run: node _work/build-site.mjs --min`);
    return MIN_HREF + name;
  };
  return html
    .replace(/(<link rel="stylesheet" href=")css\/([\w.-]+\.css)(")/g, (m, a, name, z) => a + use(name) + z)
    .replace(/(\sdata-guide-css=")css\/([\w.-]+\.css)(")/g, (m, a, name, z) => a + use(name) + z)
    .replace(/(<script src=")js\/([\w.-]+\.js)(")/g, (m, a, name, z) => a + use(name) + z)
    .replace(/(<script src=")\.\.\/\.\.\/shared\/(pp-quote-core\.js)(")/g, (m, a, name, z) => a + use(name) + z);
}

// ---- the weight of a page as a phone receives it ------------------------------------------------------------------
// The page, its stylesheets and scripts (text compressed as a web host sends it) and every picture its HTML asks
// for, each in the size a 390px phone with two pixels per point takes from srcset (the smallest wide enough).
// Not counted: the fonts, the pictures a stylesheet asks for, the icons the price builder fetches for later steps.
// Used by check-site.mjs (one line per page) and _work/perf/weigh.mjs (before and after).
const attrOf = (tag, name) => { const m = new RegExp("\\s" + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
export const PHONE = { width: 390, ratio: 2 };      // the phone the weight is counted for
const sentCache = new Map();
// bytes of a file as a web host sends it: text is compressed, pictures are not
function sent(file) {
  if (!sentCache.has(file)) { const b = fs.readFileSync(file); sentCache.set(file, /\.(html|css|js|json|svg)$/.test(file) ? zlib.gzipSync(b, { level: 6 }).length : b.length); }
  return sentCache.get(file);
}
export const mediaMatches = (media, width) => { if (!media) return true; const lo = /min-width:\s*(\d+)px/.exec(media), hi = /max-width:\s*(\d+)px/.exec(media); return (!lo || width >= Number(lo[1])) && (!hi || width <= Number(hi[1])); };
// the file a browser of this width and pixel ratio takes from a srcset (the smallest that is wide enough)
export function pickCandidate(srcset, sizes, width, ratio) {
  const list = srcset.split(",").map((c) => c.trim().split(/\s+/)).map(([url, d]) => ({ url, w: d && /w$/.test(d) ? Number(d.slice(0, -1)) : 0 }));
  if (list.length === 1 || !list.every((c) => c.w)) return list[0].url;
  let drawn = width;
  for (const part of (sizes || "100vw").split(/,(?![^(]*\))/).map((s) => s.trim())) {
    const m = /^(\([^)]*\))?\s*([\d.]+)(vw|px)$/.exec(part);
    if (!m) continue;
    if (mediaMatches(m[1], width)) { drawn = m[3] === "vw" ? width * Number(m[2]) / 100 : Number(m[2]); break; }
  }
  const sorted = list.sort((a, b) => a.w - b.w);
  return (sorted.find((c) => c.w >= drawn * ratio) || sorted[sorted.length - 1]).url;
}
// every picture file the page's HTML asks a phone for, in page order: { file, lazy, hero }
export function phonePictures(html, root = ROOT) {
  const out = [], seen = new Set();
  const add = (url, lazy, hero) => { const file = path.join(root, url); if (!seen.has(file) && fs.existsSync(file)) { seen.add(file); out.push({ file, url, lazy, hero }); } };
  for (const m of html.matchAll(/<picture\b([^>]*)>([\s\S]*?)<\/picture>|<img\b[^>]*>/g)) {
    const block = m[0], img = (/<img\b[^>]*>/.exec(block) || [""])[0], lazy = /loading="lazy"/.test(img), hero = /class="cover__scene/.test(m[1] || "");
    let url = attrOf(img, "src");
    for (const s of block.startsWith("<picture") ? [...m[2].matchAll(/<source\b[^>]*>/g)].map((x) => x[0]) : []) {
      if (!mediaMatches(attrOf(s, "media"), PHONE.width)) continue;
      url = pickCandidate(attrOf(s, "srcset") || "", attrOf(s, "sizes"), PHONE.width, PHONE.ratio); break;
    }
    if (url && !/^https?:|^data:/.test(url)) add(url, lazy, hero);
  }
  return out;
}
export function pageWeight(html, root = ROOT) {
  const local = (re) => [...html.matchAll(re)].map((m) => m[1]).filter((u) => !/^https?:/.test(u)).map((u) => path.join(root, u)).filter((f) => fs.existsSync(f));
  const sum = (files) => files.reduce((n, f) => n + sent(f), 0);
  const styles = sum(local(/<link rel="stylesheet" href="([^"]+)"/g)), scripts = sum(local(/<script\b[^>]*\ssrc="([^"]+)"/g)), pics = phonePictures(html, root);
  const page = zlib.gzipSync(Buffer.from(html), { level: 6 }).length, pictures = pics.reduce((n, x) => n + fs.statSync(x.file).size, 0), eager = pics.filter((x) => !x.lazy).reduce((n, x) => n + fs.statSync(x.file).size, 0);
  return { total: page + styles + scripts + pictures, page, styles, scripts, pictures, eager, heroFile: (pics.find((x) => x.hero) || {}).url || "" };
}
