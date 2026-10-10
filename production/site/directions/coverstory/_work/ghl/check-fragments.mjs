// check-fragments.mjs : proves the GoHighLevel blocks against the approved built pages. Reads only; writes nothing.
//
//   node _work/ghl/check-fragments.mjs              every profile found in rollout/ghl-fragments/
//   node _work/ghl/check-fragments.mjs staging      only that profile
//   node _work/ghl/check-fragments.mjs --dir <folder> --profile <name-in-config-or-json>   (used by simulate.mjs)
//
// For every page it puts header + body + footer together from the blocks ON DISK and compares with the built page:
//   1  the visible text is the same (white space normalised); any difference is printed
//   2  every link has the same words and goes where the built link goes; every picture is the same file
//   3  no relative address is left (attributes, srcset, style url(), page data)
//   4  no block holds an <html>, <head> or <body> tag, and every block closes every tag it opens (split parts too)
//   5  every file a block names is on disk and on the upload list; nothing on the upload list is missing
//   6  every block is under the limit, counted with the date placeholder filled in
//   7  staging holds no tracking tag and a noindex robots meta; production holds exactly the two expected tags,
//      byte for byte as in the live site's head code, and only in the site head code
//   8  stylesheet links stand first in each header block; the hero preload stands first in each body block
//   9  the settings the build puts on <body> are carried; the scripts load in the built page's order
//   10 the blocks are those of TODAY's built pages (a page rebuilt since is reported)
//   11 window.PPSite in each site body code is exactly the settings object of the profile (CORE-API.md 13.3), and the
//      ENGINE's own siteOptions() reads it as intended: production = live mode to the production request address
//      with the Google Ads conversion label; staging = staging mode to the staging address, no label, pixel off.
//      The production addresses in js/builder.js, js/site.js and the production profile are one list.
//   12 no block carries the footer's review-build line (the rollout form of each page is what is compared;
//      the invisible data-standin marks are left in on purpose and are not counted)
//   14 each site head code opens with the saved-quote token guard, before any tag or any other script (VERIFY-sending
//      finding 2), and the guard really takes a token out of an address and hands it over exactly once
//   15 the settings rules refuse a staging profile aimed at a production host in any spelling (a port, a trailing
//      dot, upper case, a user name): VERIFY-sending finding 1
//   13 the loader holds neither of the two retired stopgaps (no replaced window.addEventListener, no img repair)
//   16 WHERE THE SCRIPTS START (NEEDS-from-staging-gate item 1). With "scriptsPlacement": "footer": every footer block
//      (the footer Global Section, a customer page's own footer, both blog templates' last block) ends with exactly one
//      script that sets window.PPSite and loads the scripts, standing after </footer>; no other block holds one; the site
//      body code holds no script at all. With "site-body" the reverse. Checks 7, 9 and 11 read the loader where it stands.
//   17 LINKS OF A STAGING PROFILE (links.pageIds / links.fallbackOrigin): every link and form of every block is in-page,
//      sms:, tel:, mailto: or a full https address (no bare path, which is a dead end on a site with no domain); a page
//      with a page id is linked by its preview address and nothing else; a production profile maps no link and names
//      no preview address anywhere.
//   18 WHAT IS TYPED (items 8 and 9). fields.json gives every page a "typeThese" entry; a page whose build says noindex
//      has the robots custom meta tag there (still noindex), and FIELDS.md prints it as REQUIRED in that page's table;
//      a page with a schema file names it and where it goes; FIELDS.md holds the paste rule for plain text boxes.
//   19 PAGE DATA BY SETTING. Every page named in "pageDataInOwnFile" of the settings file has its page data in a file of
//      its own (<slug>.schema.html) and none in its body block, in this profile as in every other, whatever the length.
// Exit code 0 only when every check passes for every profile.
import fs from "node:fs";
import path from "node:path";
import { HERE, ROOT, RELEASE, OUT, posix, read, sha256, loadConfig, placeholders, tokens, attrsOf, openTagOfRaw, visibleText, balance,
  topLevel, hasClass, decode, discoverPages, siteSettings, settingsProblems, trustedFromScripts, TOKEN_GUARD, pageAddress, PREVIEW_BASE, linksProblems } from "./lib.mjs";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf("--" + name); return i < 0 ? null : args[i + 1]; };
const cfg = loadConfig();
const pages = discoverPages();
const bySlug = new Map(pages.map((p) => [p.slug, p]));
const isRelative = (v) => v !== "" && !/^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(v);
const TRACKING = /googletagmanager\.com|google-analytics\.com|\bgtag\s*\(|\bfbq\s*\(|connect\.facebook\.net|facebook\.com\/tr\b|\bAW-\d{6,}|\bG-[A-Z0-9]{8,}\b|\bGTM-[A-Z0-9]{4,}\b|clarity\.ms|hotjar/;

let failed = 0;
function checkProfile(dir, profile) {
  const fails = [], notes = [];
  const fail = (m) => { if (fails.length < 60) fails.push(m); else if (fails.length === 60) fails.push("... more failures not printed"); };
  const has = (rel) => fs.existsSync(path.join(dir, rel));
  const get = (rel) => read(path.join(dir, rel));
  if (!has("MANIFEST.json") || !has("fields.json")) { console.log(`\n${profile.name}: FAIL\n  no MANIFEST.json or fields.json in ${dir}: run node _work/ghl/build-fragments.mjs first`); failed += 1; return; }
  const manifest = JSON.parse(get("MANIFEST.json")), fields = JSON.parse(get("fields.json")).pages;
  const fieldOf = new Map(fields.map((f) => [f.slug, f]));
  const blockFiles = manifest.blocks.map((b) => b.file);
  const done = { text: 0, links: 0, pictures: 0, blocks: 0, addresses: 0 };
  const safeTop = (rel) => { try { return topLevel(get(rel)); } catch (e) { fail(`${rel}: ${e.message.replace(/^topLevel: /, "")}`); return []; } };

  // ---- helpers over the blocks on disk -------------------------------------------------------------------------------
  const bodyOf = (slug, base) => {
    const one = `${base}.html`, two = [`${base}.1.html`, `${base}.2.html`];
    if (has(one) && has(two[0])) fail(`${slug}: both ${one} and ${two[0]} exist`);
    if (has(one)) return [one];
    if (has(two[0]) && has(two[1])) return two;
    fail(`${slug}: no body block ${one} (or ${two.join(" + ")})`); return [];
  };
  const quoteHrefIn = (headerText) => { const m = /getAttribute\("href"\)===("(?:[^"\\]|\\.)*")/.exec(headerText); return m ? JSON.parse(m[1]) : null; };
  // what the header block's script does on a page that holds the builder: the header and footer price buttons point at it
  const flip = (html, quoteHref, inPlace) => (!inPlace || quoteHref === null ? html : html.replace(/<a\b[^>]*\sdata-purge-quote\b[^>]*>/g, (tag) => tag.replace(/\shref="([^"]*)"/, (m, h) => (decode(h) === quoteHref ? ' href="#quote"' : m))));
  const anchors = (html) => {
    const out = []; let open = null;
    for (const t of tokens(html)) {
      if (t.type === "open" && t.tag === "a") open = { href: decode(String(attrsOf(t.attrs).href ?? "")), text: "" };
      else if (t.type === "close" && t.tag === "a" && open) { out.push({ href: open.href, text: open.text.replace(/\s+/g, " ").trim() }); open = null; }
      else if (t.type === "text" && open) open.text += decode(t.raw);
      else if (t.type === "open" && t.tag === "form") out.push({ href: decode(String(attrsOf(t.attrs).action ?? "")), text: "(form)" });
    }
    return out;
  };
  const pictures = (html) => {
    const out = [];
    for (const t of tokens(html)) {
      if (t.type !== "open") continue;
      const a = attrsOf(t.attrs);
      if (t.tag === "img" && typeof a.src === "string") out.push(a.src);
      if (t.tag === "source" && typeof a.srcset === "string") out.push(...a.srcset.split(",").map((c) => c.trim().split(/\s+/)[0]));
      if (t.tag === "img" && typeof a.srcset === "string") out.push(...a.srcset.split(",").map((c) => c.trim().split(/\s+/)[0]));
    }
    return out;
  };
  const hostedPath = (v) => posix(path.posix.normalize(cfg.siteDir + "/" + v.replace(/[?#].*$/, "")));
  const expectedLink = (href, kind) => {
    const m = /^([\w-]+)\.html(\?[^#]*)?(#.*)?$/.exec(href);
    if (!m) return href;                                                       // #hash, https:, sms:, tel:, mailto: stay as they are
    const tail = (m[2] || "") + (m[3] || ""), f = fieldOf.get(m[1]);
    return pageAddress(cfg, profile, m[1], f ? f.publicUrl : "", kind) + tail;   // the one rule of builder and checker (lib.mjs)
  };
  const firstDiff = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i += 1; return `at character ${i}: approved "…${a.slice(Math.max(0, i - 40), i + 60)}…" | blocks "…${b.slice(Math.max(0, i - 40), i + 60)}…"`; };

  function compare(slug, kind, approvedHtml, parts, inPlace) {
    // parts: [{ file, role }] in page order
    const texts = parts.map((p) => ({ ...p, html: get(p.file) }));
    const header = texts.find((p) => p.role === "header");
    const quoteHref = header ? quoteHrefIn(header.html) : null;
    if (header && quoteHref === null) fail(`${header.file}: the script that points the price buttons at the builder was not found`);
    const assembled = texts.map((p) => (p.role === "header" || p.role === "footer" ? flip(p.html, quoteHref, inPlace) : p.html)).join("\n");
    // 1 text
    const want = visibleText(approvedHtml), got = visibleText(assembled);
    if (want !== got) fail(`${slug}: the visible text differs, ${firstDiff(want, got)}`); else done.text += 1;
    // 2 links and pictures
    const wantA = anchors(approvedHtml), gotA = anchors(assembled);
    if (wantA.length !== gotA.length) fail(`${slug}: ${wantA.length} links and forms in the built page, ${gotA.length} in the blocks`);
    else {
      let bad = 0;
      wantA.forEach((w, i) => { const g = gotA[i], exp = expectedLink(w.href, kind); if (w.text !== g.text || exp !== g.href) { bad += 1; if (bad <= 3) fail(`${slug}: link ${i + 1} "${w.text.slice(0, 40)}": built href ${w.href} should become ${exp}, the block has ${g.href} "${g.text.slice(0, 40)}"`); } });
      if (!bad) done.links += wantA.length;
    }
    const wantP = pictures(approvedHtml).map((v) => (isRelative(v) ? `${profile.assetsBase}/${hostedPath(v)}` : v)), gotP = pictures(assembled);
    if (wantP.join("\n") !== gotP.join("\n")) { const i = wantP.findIndex((v, n) => v !== gotP[n]); fail(`${slug}: the pictures differ (${wantP.length} built, ${gotP.length} in the blocks); first difference at picture ${i + 1}: ${wantP[i]} | ${gotP[i]}`); } else done.pictures += wantP.length;
  }

  // ---- 10 freshness, 1/2 text, links and pictures, 9 settings and scripts, page by page ---------------------------------
  const siteBody = has("shared/site-body.html") ? get("shared/site-body.html") : "";
  // the loader THIS page gets: the site body code, or (scriptsPlacement footer) the footer block that page really carries
  const footerOf = (p, kind) => (kind === "blog" ? (/\bpp-blog-native-post\b/.test(p.mainInner) ? "blog/post-3-footer.html" : "blog/home-3-footer.html") : p.bodyAttrs["data-audience"] === "customer" ? `shared/${p.slug}-footer.html` : "shared/footer.html");
  const loaderText = (kind, p) => { const f = cfg.scriptsPlacement === "footer" ? footerOf(p, kind) : kind === "blog" ? "blog/site-body.html" : "shared/site-body.html"; return has(f) ? get(f) : ""; };
  const loaderLists = (text) => { const m = /list=\[\]\.concat\(price\?(\[[^\]]*\]):\[\],(\[[^\]]*\]),P\.scripts\|\|\[\],price\?(\[[^\]]*\]):\[\]\)/.exec(text); return m ? { before: JSON.parse(m[1]), common: JSON.parse(m[2]), after: JSON.parse(m[3]) } : null; };
  const hostedScript = (src) => `${profile.assetsBase}/${hostedPath(src)}`;
  for (const p of pages) {
    const f = fieldOf.get(p.slug);
    if (!f) { fail(`${p.slug}: a built page with no entry in fields.json: run build-fragments again`); continue; }
    if (f.sourceSha256 !== p.sourceSha256) { fail(`${p.slug}: the built page changed after the blocks were written: run node _work/ghl/build-fragments.mjs again`); continue; }
    const kind = /^blog template/.test(f.where) ? "blog" : "site";
    const inPlace = /\sid="quote"/.test(p.mainInner), customer = p.bodyAttrs["data-audience"] === "customer";
    let settingsBlock = "";
    if (kind === "site") {
      const body = bodyOf(p.slug, `pages/${p.slug}`);
      const own = customer ? [`shared/${p.slug}-header.html`, `shared/${p.slug}-footer.html`] : ["shared/header.html", "shared/footer.html"];
      if (!has(own[0]) || !has(own[1])) { fail(`${p.slug}: its header or footer block is missing (${own.join(", ")})`); continue; }
      compare(p.slug, kind, p.bodyInner, [{ file: own[0], role: "header" }, ...body.map((file) => ({ file, role: "body" })), { file: own[1], role: "footer" }], inPlace);
      settingsBlock = body.length ? get(body[0]) : "";
      // 8 order inside the body block
      if (body.length) {
        const first = safeTop(body[0]).filter((n) => n.kind === "element" || n.kind === "raw");
        const tags = first.map((n) => (n.tag === "link" ? `link:${n.attrs.rel}` : n.tag));
        const main = tags.indexOf("main"), preload = tags.indexOf("link:preload"), style = tags.indexOf("link:stylesheet"), script = tags.indexOf("script");
        if (p.preloads.length && preload !== 0) fail(`${p.slug}: the hero preload is not the first thing in ${body[0]}`);
        if (main < 0 || (style >= 0 && style > main) || script > main || script < 0) fail(`${p.slug}: expected preload, settings script, family stylesheet, then <main> in ${body[0]}; found ${tags.slice(0, 8).join(", ")}`);
        const fam = first.filter((n) => n.tag === "link" && n.attrs.rel === "stylesheet").map((n) => n.attrs.href);
        const wantFam = p.stylesheets.filter((s) => !/\/(site|builder)\.css$/.test("/" + s) || !pages.every((q) => q.stylesheets.includes(s))).filter((s) => !pages.filter((q) => fieldOf.get(q.slug) && !/^blog/.test(fieldOf.get(q.slug).where)).every((q) => q.stylesheets.includes(s))).map(hostedScript);
        if (fam.join("|") !== wantFam.join("|")) fail(`${p.slug}: family stylesheets in the body block ${fam.join(", ") || "(none)"}; the built page has ${wantFam.join(", ") || "(none)"}`);
        // the page data is in the block, or in its own file
        const dataIn = body.concat(has(`pages/${p.slug}.schema.html`) ? [`pages/${p.slug}.schema.html`] : []).map(get).join("\n");
        const nData = (dataIn.match(/<script type="application\/ld\+json"/g) || []).length, shared = pages.every((q) => q.jsonld.includes(p.jsonld[0])) ? 1 : 0;
        if (nData !== p.jsonld.length - shared) fail(`${p.slug}: ${p.jsonld.length - shared} page-data blocks of its own in the built page, ${nData} in its blocks`);
      }
    } else if (/\bpp-blog-native-post\b/.test(p.mainInner)) {
      const nodes = topLevel(p.mainInner).filter((n) => n.kind === "element"), at = nodes.findIndex((n) => /\bpp-blog-native-post\b/.test(n.html));
      const keep = nodes.filter((n, i) => i !== at && !(i < at && (hasClass(n, "cover") || hasClass(n, "facts"))));
      const approved = [p.headerHtml, ...keep.map((n) => n.html), p.footerHtml].join("\n");
      if (!has("blog/post-1-header.html") || !has("blog/post-3-footer.html")) { fail(`${p.slug}: the blog-post template blocks are missing`); continue; }
      compare(p.slug + " (blog-post template, without the builder's hero and facts strip and without the native post)", kind, approved, [{ file: "blog/post-1-header.html", role: "header" }, { file: "blog/post-3-footer.html", role: "footer" }], inPlace);
      settingsBlock = get("blog/post-1-header.html");
      if (!/<link rel="stylesheet" href="[^"]*blog-native\.css">/.test(settingsBlock)) fail(`${p.slug}: blog/post-1-header.html does not link the native post's stylesheet`);
      if (!has("blog/post-2-NATIVE-blog-content-element.txt")) fail("blog: the marker file for the native Blog Content element is missing");
    } else {
      const body = bodyOf(p.slug, "blog/home-1-header-and-index");
      if (!body.length || !has("blog/home-3-footer.html")) { fail(`${p.slug}: the blog-home template blocks are missing`); continue; }
      compare(p.slug + " (blog-home template)", kind, p.bodyInner, [...body.map((file, i) => ({ file, role: i === 0 ? "header" : "body" })), { file: "blog/home-3-footer.html", role: "footer" }], inPlace);
      settingsBlock = get(body[0]);
      if (!has("blog/home-2-NATIVE-blog-posts-element.txt")) fail("blog: the marker file for the native Blog Posts element is missing");
    }
    // 9 body settings and scripts
    for (const [k, v] of Object.entries(p.bodyAttrs)) if (!settingsBlock.includes(`b.setAttribute(${JSON.stringify(k)},${v === true ? '""' : JSON.stringify(v)})`)) fail(`${p.slug}: the body setting ${k}${v === true ? "" : '="' + v + '"'} is not carried by its block`);
    const pp = /w\.PPPage=\{slug:("[^"]*"),price:([01]),scripts:(\[[^\]]*\])\}/.exec(settingsBlock), lists = loaderLists(loaderText(kind, p));
    if (!pp) fail(`${p.slug}: no page settings (window.PPPage) in its block`);
    else if (!lists) fail(`${p.slug}: the script loader was not found in ${cfg.scriptsPlacement === "footer" ? "its footer block " + footerOf(p, kind) : "the " + (kind === "blog" ? "blog" : "site") + " body code"}`);
    else {
      const price = pp[2] === "1", order = [...(price ? lists.before : []), ...lists.common, ...JSON.parse(pp[3]), ...(price ? lists.after : [])];
      const want = p.scripts.map(hostedScript);
      const same = cfg.minified ? order.length === want.length : order.join("|") === want.join("|");
      if (!same) fail(`${p.slug}: scripts would load as ${order.map((s) => path.posix.basename(s)).join(", ")}; the built page loads ${p.scripts.map((s) => path.posix.basename(s)).join(", ")}`);
    }
  }
  for (const f of fields) if (!bySlug.has(f.slug)) fail(`${f.slug}: in fields.json but no longer a built page: run build-fragments again`);

  // ---- 3, 4, 5, 6: every block by itself ---------------------------------------------------------------------------------
  const linkTargets = new Set([...Object.values(profile.links.map || {}), ...Object.values(profile.links.pageIds || {}).map((id) => (profile.links.previewBase || PREVIEW_BASE) + id)]);
  const uploadPaths = new Set(manifest.uploadList.files.map((x) => x.path));
  const grow = cfg.sizeGuard && cfg.sizeGuard.placeholder && profile.assetsBase.includes(cfg.sizeGuard.placeholder) ? Math.max(0, cfg.sizeGuard.realLength - cfg.sizeGuard.placeholder.length) : 0;
  const allFiles = [];
  const walk = (d, rel = "") => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name), rel + e.name + "/"); else allFiles.push(rel + e.name); } };
  walk(dir);
  const htmlFiles = allFiles.filter((f) => f.endsWith(".html"));
  for (const f of htmlFiles) if (!blockFiles.includes(f)) fail(`${f}: an .html file in the profile folder that MANIFEST.json does not list`);
  let largest = [];
  for (const b of manifest.blocks) {
    if (!has(b.file)) { fail(`${b.file}: listed in MANIFEST.json but not on disk`); continue; }
    const text = get(b.file); done.blocks += 1;
    if (sha256(text) !== b.sha256) fail(`${b.file}: its SHA-256 is not the one in MANIFEST.json (edited by hand?)`);
    const dated = text.length + grow * (text.split(profile.assetsBase).length - 1);
    largest.push([dated, text.length, Buffer.byteLength(text), b.file]);
    if (dated > cfg.blockLimit) fail(`${b.file}: ${dated} characters with the date filled in (${text.length} now); the limit is ${cfg.blockLimit}`);
    for (const p of balance(text)) fail(`${b.file}: ${p}`);
    for (const t of tokens(text)) {
      if (t.type === "doctype" || ((t.type === "open" || t.type === "close") && /^(html|head|body)$/.test(t.tag))) fail(`${b.file}: holds ${t.raw.slice(0, 30)}, which must not be pasted into a Custom Code block`);
      const urls = [];
      if (t.type === "open") {
        for (const [name, value] of Object.entries(attrsOf(t.attrs))) {
          if (typeof value !== "string") continue;
          if (name === "srcset" || name === "imagesrcset") urls.push(...value.split(",").map((c) => c.trim().split(/\s+/)[0]));
          else if (["src", "href", "action", "poster", "data-guide-css", "data-assets"].includes(name)) urls.push(value);
          else if (name === "style") urls.push(...[...value.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]));
          else if (/^(?:\.\.?\/|css\/|js\/)|^[\w-]+\.html(?:[?#]|$)/.test(value)) fail(`${b.file}: a relative address in <${t.tag} ${name}="${value.slice(0, 60)}">`);
        }
      } else if (t.type === "raw") {
        const o = openTagOfRaw(t.raw), a = attrsOf(o.attrs);
        if (typeof a.src === "string") urls.push(a.src);
        if (o.tag === "style") urls.push(...[...o.inner.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]));
        if (a.type === "application/ld+json") {
          try { const walkJson = (v) => { if (Array.isArray(v)) v.forEach(walkJson); else if (v && typeof v === "object") Object.values(v).forEach(walkJson); else if (typeof v === "string" && /^(?:\.\.?\/|css\/|js\/|[\w-]+\.html(?:[?#]|$))/.test(v)) fail(`${b.file}: a relative address in the page data: ${v.slice(0, 60)}`); }; walkJson(JSON.parse(o.inner)); }
          catch (e) { fail(`${b.file}: page data that is not valid JSON`); }
        }
        if (o.tag === "script" && !a.type && !a.src) for (const m of o.inner.matchAll(/"(https?:\/\/[^"\\]+)"/g)) if (m[1].startsWith(profile.assetsBase + "/") && /\.\w+$/.test(m[1])) urls.push(m[1]);
      }
      for (const raw of urls) {
        const u = decode(raw); done.addresses += 1;
        if (/^data:/i.test(u)) continue;
        if (isRelative(u)) { fail(`${b.file}: a relative address is left: ${u.slice(0, 80)}`); continue; }
        if (linkTargets.has(u.replace(/[?#].*$/, ""))) continue;                 // a page link of a profile that maps links to full addresses
        if (u.startsWith(profile.assetsBase + "/")) {
          const rel = decodeURIComponent(u.slice(profile.assetsBase.length + 1).replace(/[?#].*$/, ""));
          if (!fs.existsSync(path.join(RELEASE, rel))) fail(`${b.file}: names ${rel}, which is not on disk`);
          else if (!uploadPaths.has(rel)) fail(`${b.file}: names ${rel}, which is not on the upload list`);
        }
      }
    }
  }
  for (const m of manifest.uploadList.missing) fail(`upload list: ${m} is asked for (by ${(manifest.uploadList.files.find((x) => x.path === m) || { askedForBy: [] }).askedForBy.join("; ")}) but is not on disk`);
  for (const x of manifest.uploadList.files) if (x.exists && !fs.existsSync(path.join(RELEASE, x.path))) fail(`upload list: ${x.path} was on disk when the blocks were built and is gone now`);

  // ---- 16 where the scripts start -----------------------------------------------------------------------------------------
  const footerMode = cfg.scriptsPlacement === "footer";
  const siteBodies = ["shared/site-body.html", "blog/site-body.html"].filter(has);
  const footerBlocks = manifest.blocks.filter((b) => b.role === "footer" || b.role === "blog-post-footer").map((b) => b.file);
  const loaderCarriers = footerMode ? footerBlocks : siteBodies;
  const LOADER = /<script>\(function\(w,d\)\{\nvar S=w\.PPSite=\{.*\};\nif\(w\.PP5Loaded\)return;w\.PP5Loaded=1;\n[^\n]*\n[^\n]*\n\}\)\(window,document\)<\/script>/g;
  if (footerMode && footerBlocks.length < 2) fail(`scriptsPlacement footer: expected the footer Global Section and at least one more footer block; found ${footerBlocks.join(", ") || "none"}`);
  for (const b of manifest.blocks) {
    if (!has(b.file)) continue;
    const t = get(b.file), found = t.match(LOADER) || [], mentions = t.split("PP5Loaded").length - 1, should = loaderCarriers.includes(b.file);
    if (should) {
      if (found.length !== 1 || mentions !== 2) { fail(`${b.file}: expected exactly one script that sets window.PPSite and loads the scripts; found ${found.length}`); continue; }
      if (footerMode) {
        if (!t.trimEnd().endsWith(found[0])) fail(`${b.file}: the settings and the loader must be the LAST thing in the footer block`);
        if (t.indexOf(found[0]) < t.lastIndexOf("</footer>") || t.lastIndexOf("</footer>") < 0) fail(`${b.file}: the settings and the loader must stand after </footer>`);
      }
    } else if (mentions || /w\.PPSite\s*=/.test(t)) fail(`${b.file}: holds a script loader or sets window.PPSite, which with scriptsPlacement "${cfg.scriptsPlacement}" belongs ${footerMode ? "in the footer blocks only" : "in the site body code only"}`);
  }
  if (footerMode) for (const f of siteBodies) { const t = get(f); if (/<script/i.test(t) || tokens(t).some((x) => x.type !== "comment" && !(x.type === "text" && !x.raw.trim()))) fail(`${f}: with the scripts started from the footer block the site body code must be comment lines only`); if (!t.startsWith("<!--")) fail(`${f}: must start with the comment marker`); }
  for (const f of ["shared/site-head.html", "blog/site-head.html"].filter(has)) if (!get(f).startsWith("<!--")) fail(`${f}: must start with the comment marker <!-- (the paste rule for plain text boxes checks the field against it)`);

  // ---- 17 links of a staging profile ----------------------------------------------------------------------------------------
  for (const p of linksProblems(profile)) fail(`fragments.config.json, profile ${profile.name}: ${p}`);
  const mapped = Boolean(profile.links.fallbackOrigin || Object.keys(profile.links.pageIds || {}).length);
  let linksSeen = 0, toPreview = 0, toLive = 0;
  for (const b of manifest.blocks) {
    if (!has(b.file)) continue;
    for (const t of tokens(get(b.file))) {
      if (t.type !== "open" || !(t.tag === "a" || t.tag === "form")) continue;
      const a = attrsOf(t.attrs), v = typeof (t.tag === "a" ? a.href : a.action) === "string" ? decode(t.tag === "a" ? a.href : a.action) : null;
      if (v === null) continue;
      linksSeen += 1;
      if (/^https:\/\/sites\.leadconnectorhq\.com\//.test(v)) { toPreview += 1; if (!mapped) fail(`${b.file}: a link to a GoHighLevel preview address in a profile that maps no link: ${v.slice(0, 90)}`); else if (!linkTargets.has(v.replace(/[?#].*$/, ""))) fail(`${b.file}: a preview address that is not one of links.pageIds: ${v.slice(0, 90)}`); continue; }
      if (!mapped) continue;
      if (/^(#|sms:|tel:|mailto:)/.test(v)) continue;
      if (!/^https:\/\//.test(v)) { fail(`${b.file}: <${t.tag}> points at "${v.slice(0, 80)}", which is a dead end on a staging site with no domain (expected a preview address or a full live address)`); continue; }
      if (profile.links.fallbackOrigin && v.startsWith(profile.links.fallbackOrigin + "/")) {
        toLive += 1;
        const hit = fields.find((f) => f.publicUrl && new URL(f.publicUrl).origin === cfg.siteOrigin && profile.links.fallbackOrigin + new URL(f.publicUrl).pathname === v.replace(/[?#].*$/, ""));
        if (hit && (profile.links.pageIds || {})[hit.slug]) fail(`${b.file}: links to the LIVE address of ${hit.slug}, which has a staging page id (${v.slice(0, 90)})`);
      }
    }
  }
  if (mapped) for (const [slug, id] of Object.entries(profile.links.pageIds || {})) {
    if (!fieldOf.has(slug)) { fail(`links.pageIds names "${slug}", which is not a built page`); continue; }
    if (fieldOf.get(slug).previewAddress !== (profile.links.previewBase || PREVIEW_BASE) + id) fail(`${slug}: fields.json does not give its preview address`);
  }
  if (!mapped) for (const f of allFiles.filter((x) => /\.(html|txt|md|json)$/.test(x))) if (/sites\.leadconnectorhq\.com\/preview\//.test(get(f))) fail(`${f}: names a GoHighLevel preview address in a profile that maps no link`);

  // ---- 18 what is typed: robots as the page's own tag, the schema file, the paste rule -----------------------------------------
  const sheet = has("FIELDS.md") ? get("FIELDS.md") : "";
  if (!sheet) fail("FIELDS.md is missing");
  if (!/Never press Ctrl\+A/.test(sheet) || !/\*\*Home\*\*/.test(sheet) || !/\*\*Delete\*\*/.test(sheet) || !/start with the comment marker `<!--`/.test(sheet)) fail("FIELDS.md: the paste rule for plain text boxes (never Ctrl+A; Home and Delete; the field starts with <!--) is missing or incomplete");
  const sectionOf = (slug) => { const at = sheet.indexOf(`\n## ${slug}\n`); if (at < 0) return ""; const end = sheet.indexOf("\n## ", at + 4); return sheet.slice(at, end < 0 ? sheet.length : end); };
  let typedOut = [];
  for (const p of pages) {
    const f = fieldOf.get(p.slug); if (!f) continue;
    const sec = sectionOf(p.slug), t = f.typeThese;
    if (!t) { fail(`${p.slug}: fields.json has no "typeThese" entry: run build-fragments again`); continue; }
    if (!sec || !/\*\*Type these\*\*/.test(sec) || !/\*\*Paste these\*\*/.test(sec)) fail(`${p.slug}: FIELDS.md has no "Type these" and "Paste these" tables for it`);
    if (t.title !== p.title || t.description !== p.description || (t.canonical || "") !== (p.canonical || "")) fail(`${p.slug}: the title, description or canonical to type is not the built page's`);
    const tag = (t.customMetaTags || []).find((x) => x.name === "robots"), buildOut = /noindex/i.test(p.robots || "");
    if (buildOut) {
      typedOut.push(p.slug);
      if (!tag || !/noindex/i.test(tag.content)) fail(`${p.slug}: the built page says robots "${p.robots}", but fields.json gives no noindex robots custom meta tag to type`);
      else if (!sec.includes("**REQUIRED, this page must stay out of search:** name `robots`, content `" + tag.content + "`")) fail(`${p.slug}: FIELDS.md does not print its robots custom meta tag as required`);
      if (f.inSitemap) fail(`${p.slug}: must stay out of search but is marked for the sitemap`);
    } else if (tag) fail(`${p.slug}: the built page does not ask to stay out of search, but fields.json gives a robots tag to type (${tag.content})`);
    const schema = `pages/${p.slug}.schema.html`, blogSchema = "blog/home-1-header-and-index.schema.html", ownSchema = has(schema) ? schema : (f.bodyBlocks || []).includes(blogSchema) ? blogSchema : null;
    if ((t.schemaFile || null) !== ownSchema) fail(`${p.slug}: its schema file is ${ownSchema || "none"}, fields.json says ${t.schemaFile || "none"}`);
    if (ownSchema && (!sec.includes("`" + ownSchema + "`") || !/Schema markup > Add schema \| the whole content of/.test(sec))) fail(`${p.slug}: FIELDS.md does not say where ${ownSchema} goes`);
    for (const b of f.pasteBodyBlocks || []) if (!sec.includes("`" + b + "`")) fail(`${p.slug}: FIELDS.md does not list ${b} to paste`);
    if ((f.pasteBodyBlocks || []).some((b) => /\.schema\.html$/.test(b))) fail(`${p.slug}: a schema file is listed as a block to paste into the body`);
  }
  for (const must of cfg.mustStayOutOfSearch || []) if (bySlug.has(must) && !typedOut.includes(must)) fail(`${must}: fragments.config.json "mustStayOutOfSearch" names it, but the built page does not say noindex`);

  // ---- 19 page data in its own file BY SETTING ("pageDataInOwnFile" in the settings file) ----------------------------------
  // A page named there has its page data in <slug>.schema.html in EVERY profile, whatever the block's length: the split
  // is a recorded setting, not a side effect of how long one profile's addresses are.
  const ownFileBySetting = [];
  for (const slug of cfg.pageDataInOwnFile || []) {
    const f = fieldOf.get(slug), dataBlock = manifest.blocks.find((b) => b.page === slug && b.part === "page data");
    if (!bySlug.has(slug) || !f) { fail(`fragments.config.json "pageDataInOwnFile" names ${slug}, which is not a built page with blocks in this folder`); continue; }
    if (!dataBlock || !has(dataBlock.file)) { fail(`${slug}: fragments.config.json "pageDataInOwnFile" names it, but its page data has no file of its own in this folder: run node _work/ghl/build-fragments.mjs again`); continue; }
    const size = manifest.sizes.find((s) => s.block + ".schema.html" === dataBlock.file);
    if (!size || size.level < 1) fail(`${slug}: MANIFEST.json does not record its page data as moved to a file of its own`);
    if (!f.typeThese || f.typeThese.schemaFile !== dataBlock.file) fail(`${slug}: fields.json does not name ${dataBlock.file} as its schema file`);
    for (const b of manifest.blocks.filter((x) => x.page === slug && x.part === "body" && has(x.file))) if (get(b.file).includes('<script type="application/ld+json"')) fail(`${slug}: "pageDataInOwnFile" names it, but ${b.file} still holds page data`);
    if (!get(dataBlock.file).includes('<script type="application/ld+json"')) fail(`${dataBlock.file}: holds no page data`);
    ownFileBySetting.push(slug);
  }

  // ---- 7 tracking and robots ---------------------------------------------------------------------------------------------
  const heads = ["shared/site-head.html", "blog/site-head.html"].filter(has);
  if (!heads.includes("shared/site-head.html")) fail("shared/site-head.html is missing");
  if (profile.tracking) {
    const src = read(path.resolve(HERE, cfg.tracking.headSource)), a = src.indexOf("<!-- Google tag (gtag.js) -->"), endMark = "<!-- End Meta Pixel Code -->", live = src.slice(a, src.indexOf(endMark) + endMark.length);
    for (const h of heads) {
      const t = get(h);
      if (!t.includes(live)) fail(`${h}: the tracking tags are not byte for byte those of the live site's head code (${cfg.tracking.headSource})`);
      const g = [...t.matchAll(/gtag\/js\?id=([A-Z0-9-]+)/g)].map((m) => m[1]), fb = [...t.matchAll(/fbq\('init',\s*'(\d+)'\)/g)].map((m) => m[1]);
      const ids = [...new Set([...(t.match(/\bAW-\d{6,}|\bG-[A-Z0-9]{8,}\b|\bGTM-[A-Z0-9]{4,}\b/g) || []), ...fb])].sort();
      if (g.length !== 1 || fb.length !== 1 || ids.join(",") !== [...cfg.tracking.expected].sort().join(",")) fail(`${h}: expected exactly the two tags ${cfg.tracking.expected.join(" and ")}; found Google ${g.join(",") || "none"}, Meta ${fb.join(",") || "none"}, ids ${ids.join(",")}`);
    }
    // the ONE thing outside the head code that names a tracking id: the conversion label inside window.PPSite, wherever
    // the loader stands (the site body code, or with scriptsPlacement footer each footer block), exactly once per block
    const label = profile.googleAdsSendTo ? `"googleAdsSendTo":${JSON.stringify(profile.googleAdsSendTo)}` : null;
    for (const f of allFiles.filter((x) => /\.(html|txt)$/.test(x) && !heads.includes(x))) {
      let t = get(f);
      if (label && loaderCarriers.includes(f)) { if (t.split(label).length !== 2) fail(`${f}: expected the Google Ads conversion label exactly once, inside window.PPSite`); t = t.split(label).join('"googleAdsSendTo":""'); }
      if (TRACKING.test(t)) fail(`${f}: holds a tracking tag; in production they belong in the site head code only (the conversion label inside window.PPSite, where the loader stands, is the one exception)`);
    }
  } else {
    for (const f of allFiles.filter((x) => /\.(html|txt)$/.test(x))) { const m = TRACKING.exec(get(f)); if (m) fail(`${f}: this profile must hold no tracking tag, found "${m[0]}"`); }
  }
  // ---- 14 the saved-quote token guard stands first in each site head code ------------------------------------------------
  for (const h of heads) {
    const t = get(h), at = t.indexOf(TOKEN_GUARD), firstScript = t.indexOf("<script"), firstTag = t.search(/googletagmanager|fbq\(|connect\.facebook/);
    if (at < 0) fail(`${h}: the saved-quote token guard is missing (TOKEN_GUARD in _work/ghl/lib.mjs)`);
    else {
      if (at !== firstScript) fail(`${h}: the saved-quote token guard is not the first script of the head code`);
      if (firstTag >= 0 && firstTag < at) fail(`${h}: a tracking tag stands before the saved-quote token guard`);
      if (t.split(TOKEN_GUARD).length !== 2) fail(`${h}: the saved-quote token guard appears more than once`);
    }
  }
  {
    // the guard itself, run against made-up addresses (nothing is loaded and nothing is contacted)
    const code = TOKEN_GUARD.replace(/^<script>/, "").replace(/<\/script>$/, ""), token = "T".repeat(43);
    const tryIt = (hash, breakHistory) => {
      const seen = [], w = { location: { hash, pathname: "/quote", search: "?utm_source=x" }, history: { state: null, replaceState: (s, title, to) => { if (breakHistory) throw new Error("blocked"); seen.push(to); w.location.hash = ""; } } };
      new Function("window", code)(w);
      return { hook: typeof w.__ppTakePlanToken, first: w.__ppTakePlanToken ? w.__ppTakePlanToken() : null, second: w.__ppTakePlanToken ? w.__ppTakePlanToken() : null, seen, hash: w.location.hash };
    };
    const good = tryIt("#resume=" + token), bad = tryIt("#resume=short"), none = tryIt("#quote"), empty = tryIt(""), stuck = tryIt("#resume=" + token, true);
    if (!(good.first === token && good.second === "" && good.seen.join() === "/quote?utm_source=x" && good.hash === "")) fail(`token guard: a good token must be handed over once and the address cleaned, keeping the page's own tags; got ${JSON.stringify(good)}`);
    if (!(bad.first === "invalid" && bad.second === "" && bad.seen.length === 1)) fail(`token guard: a malformed token must be reported as "invalid" once and still leave the address; got ${JSON.stringify(bad)}`);
    if (none.hook !== "undefined" || none.seen.length || empty.hook !== "undefined" || empty.seen.length) fail("token guard: with no #resume= it must do nothing at all");
    if (stuck.first !== "invalid") fail("token guard: when the address cannot be cleaned the token must not be used");
  }
  // ---- 15 the settings rules against every spelling of a production host ------------------------------------------------
  if (profile.mode === "staging") {
    const hosts = [...new Set(trustedFromScripts(cfg).builder.map((u) => new URL(u).hostname))];
    for (const hname of hosts) for (const spelled of [hname, hname + ":443", hname + ".", hname.toUpperCase(), "user@" + hname, hname + ".:443"]) {
      const probe = { ...profile, endpoint: `https://${spelled}/submit`, reviewsEndpoint: `https://${spelled}/reviews` };
      if (!settingsProblems(cfg, probe).length) fail(`settings rules: a staging profile aimed at https://${spelled}/submit (a production host) was not refused`);
    }
  }
  for (const h of heads) {
    const robots = /<meta name="robots" content="([^"]*)">/.exec(get(h));
    if (profile.robots ? !robots || !/noindex/.test(robots[1]) : robots) fail(`${h}: ${profile.robots ? "the noindex robots meta is missing" : "a site-wide robots meta in a profile that should have none"}`);
  }

  // ---- 11 window.PPSite, 12 the review line, 13 the retired stopgaps ---------------------------------------------------------
  for (const p of settingsProblems(cfg, profile)) fail(`fragments.config.json, profile ${profile.name}: ${p}`);
  const want = siteSettings(cfg, profile), trusted = trustedFromScripts(cfg);
  const core = createRequire(import.meta.url)(path.join(RELEASE, profile.engineFile || cfg.engineFile));
  let sendLine = "";
  for (const f of loaderCarriers.filter(has)) {
    const t = get(f), m = /var S=w\.PPSite=(\{.*\});\n/.exec(t);
    if (!/PP5Loaded/.test(t)) { fail(`${f}: the script loader is missing`); continue; }
    if (!m) { fail(`${f}: window.PPSite was not found in the loader`); continue; }
    let got; try { got = JSON.parse(m[1]); } catch (e) { fail(`${f}: window.PPSite is not valid JSON`); continue; }
    if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${f}: window.PPSite is ${JSON.stringify(got)}; the profile's settings are ${JSON.stringify(want)}. Run build-fragments again.`);
    if (t.indexOf("w.PPSite=") > t.indexOf('createElement("script")')) fail(`${f}: window.PPSite must be set before any script is added`);
    if (/w\.addEventListener\s*=|EventTarget\.prototype|delete w\.addEventListener/.test(t)) fail(`${f}: the loader still replaces window.addEventListener (a retired stopgap)`);
    if (/img\[src\^=/.test(t)) fail(`${f}: the loader still repairs picture addresses (a retired stopgap)`);
    if (!/s\.setAttribute\("data-assets",S\.assets\)/.test(t)) fail(`${f}: the loader no longer gives each script its data-assets`);
    // what the engine itself makes of it, with the production addresses the published js/builder.js trusts
    const o = core.siteOptions(got, { liveEndpoints: trusted.builder });
    if (profile.mode === "live") {
      const exp = { mode: "live", googleAdsSendTo: trusted.googleAdsSendTo, endpoint: trusted.builder[0] };
      if (JSON.stringify(o) !== JSON.stringify(exp)) fail(`${f}: the engine reads window.PPSite as ${JSON.stringify(o)}; production must be ${JSON.stringify(exp)}`);
      if (got.googleAdsSendTo !== core.LIVE_GOOGLE_ADS_SEND_TO) fail(`${f}: the conversion label is not the engine's live label`);
      if (got.reviewsEndpoint !== trusted.builder[0].replace(/\/submit$/, "/reviews")) fail(`${f}: reviewsEndpoint is not the production Worker's /reviews`);
    } else if (profile.mode === "staging") {
      if (o.mode !== "staging" || o.endpoint !== profile.endpoint || "googleAdsSendTo" in o || o.firePixelEvents !== false || ("savedLinkBase" in o) !== Boolean(profile.savedLinkBase)) fail(`${f}: the engine reads window.PPSite as ${JSON.stringify(o)}; staging must be staging mode to ${profile.endpoint}, no conversion label, pixel events off`);
      for (const origin of profile.allowedOrigins || []) if (!(o.allowedOrigins || []).includes(origin)) fail(`${f}: the engine does not allow sending from ${origin}`);
      if (trusted.builder.some((u) => u === o.endpoint) || !(o.productionEndpoints || []).length) fail(`${f}: staging could reach a production address`);
      if ("googleAdsSendTo" in got) fail(`${f}: a staging block names the Google Ads conversion label`);
    } else if (Object.keys(o).length) fail(`${f}: a demo profile must leave the engine in demo; it reads ${JSON.stringify(o)}`);
    sendLine = profile.mode === "live" ? `live -> ${o.endpoint} · reviews ${got.reviewsEndpoint} · conversion label ${o.googleAdsSendTo}` : profile.mode === "staging" ? `staging -> ${o.endpoint} · reviews ${got.reviewsEndpoint} · allowed from ${(profile.allowedOrigins || []).join(", ")} · no conversion label, pixel events off` : "demo";
  }
  for (const f of allFiles.filter((x) => /\.(html|txt)$/.test(x))) if (/foot__review|Review build\./.test(get(f))) fail(`${f}: carries the footer's review-build line`);
  const reviewOnDisk = pages.filter((p) => p.reviewBuildOnDisk).length;

  // ---- 8 stylesheets first in every header block ---------------------------------------------------------------------------
  const siteCss = read(path.join(ROOT, "css/site.css"));
  const bodyFont = /(?:^|\})\s*body\s*\{[^}]*?\bfont:\s*(\d{3})\s+[\d.]+px\s*\/\s*([\d.]+)\s/m.exec(siteCss);
  for (const b of manifest.blocks.filter((x) => x.role === "header" || x.role === "blog-post-header" || (x.role === "blog-home-header-index" && !/\.2\.html$|schema/.test(x.file)))) {
    const first = safeTop(b.file).filter((n) => n.kind === "element" || n.kind === "raw");
    // the block opens with its own small <style> (it must stand before css/site.css, which has to win over it), then the links
    if (first[0] && first[0].tag !== "style") fail(`${b.file}: the wrapper style must be the first thing in the block, before css/site.css`);
    const firstOther = first.findIndex((n) => n.tag !== "link" && n.tag !== "style"), sheets = first.slice(0, firstOther < 0 ? first.length : firstOther).filter((n) => n.attrs.rel === "stylesheet").map((n) => n.attrs.href);
    if (!sheets.some((h) => /\/site\.css$/.test(h)) || !sheets.some((h) => /\/builder\.css$/.test(h)) || !sheets.some((h) => /fonts\.googleapis\.com/.test(h))) fail(`${b.file}: the typeface and stylesheet links are not the first things in the block`);
    const t = get(b.file);
    if (!/\.pp5-w\{display:contents!important\}/.test(t) || !/w\.pp5w=function/.test(t)) fail(`${b.file}: the wrapper rules or their script are missing`);
    if (bodyFont && !t.includes(`{line-height:${bodyFont[2]};font-weight:${bodyFont[1]};`)) fail(`${b.file}: css/site.css now gives <body> font-weight ${bodyFont[1]} and line-height ${bodyFont[2]}; the block restores other values. Run build-fragments again.`);
    for (const root of cfg.bodyAppendedRoots) if (!t.includes(root)) fail(`${b.file}: the wrapper rules do not name ${root}`);
  }
  // a tripwire: the price builder puts its panel, bar and guides straight into <body>; the wrapper rules name each of them
  const appended = (read(path.join(ROOT, "js/builder.js")).match(/doc\.body\.append\(/g) || []).length;
  if (appended !== cfg.bodyAppendedRoots.length) fail(`js/builder.js now puts ${appended} things straight into <body>; fragments.config.json "bodyAppendedRoots" names ${cfg.bodyAppendedRoots.length}. Add the new one's class there and build again.`);

  // ---- report ----------------------------------------------------------------------------------------------------------------
  largest.sort((a, b) => b[0] - a[0]);
  const remedied = manifest.sizes.filter((s) => s.remedy !== "none");
  console.log(`\n${profile.name}: ${fails.length ? "FAIL" : "PASS"}  (${dir.replace(/\\/g, "/").replace(/^.*\/rollout\//, "rollout/")})`);
  console.log(`  ${pages.length} built pages · visible text equal on ${done.text} · ${done.links} links and forms equal · ${done.pictures} picture addresses equal · ${done.blocks} blocks, ${done.addresses} addresses checked, none relative · upload list ${manifest.uploadList.count} files, ${manifest.uploadList.missing.length} missing`);
  console.log(`  largest blocks (characters with the date filled in / now / bytes): ${largest.slice(0, 5).map((l) => `${l[3]} ${l[0]}/${l[1]}/${l[2]}`).join(" · ")}   limit ${cfg.blockLimit}`);
  console.log(`  remedies: ${remedied.length ? remedied.map((s) => `${s.block.replace(/^pages\//, "")} (${s.remedy.replace(/: .*$/, "").replace("a + b", "a+b")})`).join(", ") : "none"}`);
  console.log(`  tracking: ${profile.tracking ? "exactly " + cfg.tracking.expected.join(" and ") + ", in the site head code only" + (profile.googleAdsSendTo ? "; the conversion label once per loader, inside window.PPSite" : "") : "none, and robots " + profile.robots}`);
  console.log(`  scripts start from: ${footerMode ? "the footer block" : "the site body code"} · window.PPSite and the loader exactly once in each of ${loaderCarriers.join(", ")}${footerMode ? " · site body code: comment lines only" : ""}`);
  console.log(`  window.PPSite as the engine reads it: ${sendLine || "(no loader found)"}`);
  console.log(`  links: ${linksSeen} links and forms in the blocks · ${mapped ? `${toPreview} to a staging preview address (${Object.keys(profile.links.pageIds || {}).join(", ") || "no page id yet"}) · ${toLive} to a live address on ${profile.links.fallbackOrigin} · none a bare path` : "paths on the site's own domain; no preview address anywhere"}`);
  console.log(`  typed fields: "Type these" and "Paste these" for ${pages.length} pages · robots typed as the page's own tag on ${typedOut.join(", ") || "none"} · schema file placed for ${fields.filter((f) => f.typeThese && f.typeThese.schemaFile).map((f) => f.slug).join(", ") || "none"} · paste rule for plain text boxes present`);
  console.log(`  page data in its own file by setting ("pageDataInOwnFile": every profile, whatever the length): ${(cfg.pageDataInOwnFile || []).join(", ") || "no page named"}${ownFileBySetting.length === (cfg.pageDataInOwnFile || []).length ? "" : " · NOT so in this folder (see FAIL)"}`);
  console.log(`  review-build line: in no block (pages on disk: ${reviewOnDisk ? "review build, read in their rollout form" : "rollout build"}) · loader stopgaps: none`);
  const ph = placeholders(cfg, profile);
  if (ph.length) console.log(`  still a placeholder (not a failure): ${ph.join("; ")}`);
  for (const w of manifest.warnings || []) console.log(`  builder note: ${w}`);
  for (const f of fails) console.log(`  FAIL ${f}`);
  if (fails.length) failed += 1;
  return manifest;
}

// ---- which profiles ------------------------------------------------------------------------------------------------------
const results = new Map();
if (opt("dir")) {
  const name = opt("profile") || "local", file = path.join(opt("dir"), "profile.json");
  const profile = cfg.profiles[name] || (fs.existsSync(file) ? JSON.parse(read(file)) : null);
  if (!profile) throw new Error(`--dir needs --profile <a name in fragments.config.json>, or a profile.json in the folder`);
  profile.name = profile.name || name; profile.links = Object.assign({ prefix: "", map: {} }, profile.links || {});
  results.set(name, checkProfile(path.resolve(opt("dir")), profile));
} else {
  const want = args.filter((a) => !a.startsWith("--"));
  const names = want.length ? want : Object.keys(cfg.profiles);
  for (const name of names) {
    if (!cfg.profiles[name]) throw new Error(`no profile "${name}" in fragments.config.json`);
    results.set(name, checkProfile(path.join(OUT, name), cfg.profiles[name]));
  }
  // the profiles must have the same structure: the same files, the same remedy for every page
  const list = [...results.entries()].filter(([, m]) => m);
  for (let i = 1; i < list.length; i += 1) {
    const a = list[0][1], b = list[i][1];
    const fa = a.blocks.map((x) => x.file).sort().join("|"), fb = b.blocks.map((x) => x.file).sort().join("|");
    const ra = a.sizes.map((s) => s.block + ":" + s.level + ":" + s.k).sort().join("|"), rb = b.sizes.map((s) => s.block + ":" + s.level + ":" + s.k).sort().join("|");
    if (fa !== fb || ra !== rb) { console.log(`\nFAIL ${list[0][0]} and ${list[i][0]} do not have the same blocks or the same remedies; staging would not test what production gets`); failed += 1; }
    else console.log(`\n${list[0][0]} and ${list[i][0]}: the same ${a.blocks.length} blocks, the same remedy and the same cut for every page`);
  }
}
console.log(failed ? `\nRESULT: FAIL (${failed} profile check(s) failed)` : `\nRESULT: PASS (all checks, ${results.size} profile(s))`);
process.exit(failed ? 1 : 0);
