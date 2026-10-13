// simulate.mjs : a local stand-in for GoHighLevel's page wrapper, to see the blocks inside it before any paste.
//
//   node _work/ghl/simulate.mjs                 build the local blocks and the simulation pages
//   node _work/ghl/simulate.mjs --measure       also measure every element of each simulation page against the approved page
//   node _work/ghl/simulate.mjs --shots         also take the screenshots (approved and simulation, 390 and 1440 wide)
//   node _work/ghl/simulate.mjs --pages carmel,welcome     only these pages (default: the eight named in SHOT_PAGES, plus blog-post)
//   node _work/ghl/simulate.mjs --probes        also try what a still picture does not show (menus, the builder panel after a tap,
//                                               the pinned price bar, arriving at a section by its address, the legal contents list)
//   node _work/ghl/simulate.mjs --tag r2        the folder the screenshots go to (rollout/ghl-sim/shots/<tag>/; default r1)
//   node _work/ghl/simulate.mjs --variant <name> --placement footer    a second set in rollout/ghl-sim/variants/<name>/ with the
//                                               script loader in the footer block instead of the site body code
//   node _work/ghl/simulate.mjs --variant <name> --mech class|has|none  the same with only one (or neither) of the two ways the
//                                               wrappers lose their boxes: the control, and the proof that either way is enough
//   node _work/ghl/simulate.mjs --hold ghl      "GOHIGHLEVEL HOLDS SITE CODE" MODE (staging gate, October 9): every simulation page
//                                               written by this run keeps the site head and body code back as GoHighLevel was
//                                               measured to: until the visitor's first touch (pointerdown, keydown, touchstart,
//                                               scroll, mousemove) AFTER GoHighLevel's own script has finished ("hydration"), or
//                                               4 seconds after that, whichever is first. A touch before hydration releases nothing.
//                                               Any page can also be opened that way by address: ?late=ghl&hydrate=<ms>&hold=<ms>
//                                               (hydration <ms> after the load event, default 1500; measured 1,300 to 9,100).
//   node _work/ghl/simulate.mjs --early-tap     the test the gate failed: on pages that hold the builder, tap the "2 dogs" tile
//                                               in the first second after load, while the site code is still held, and say whether
//                                               the builder opened in place or the browser left for the quote page. With
//                                               --variant <name> --placement site-body it is the control (the loader held too).
//                                               --hydrate <ms> sets the stand-in hydration time for this test (default 2500).
// --measure is the strict comparison: every element of the header, <main> and the footer is located and its type read on
// both pages; it prints how many of them differ in any of eleven properties (0 = the same page).
//
// WHAT IT DOES
// 1. The wrapper. rollout/ghl-sim/live-shell/ holds the public HTML of three live pages (home, /carmel, /welcome), fetched
//    ONCE with curl (no script runs; fetched again only when a file is missing). From it this script keeps everything
//    GoHighLevel puts around a Custom Code block: the eight wrapper elements with their ids and classes, and every
//    <style> of the page head (GoHighLevel's page stylesheet and the page's own section settings).
// 2. Nothing fires. Every <script>, <noscript>, preload, icon and link to GoHighLevel is removed from the shell, and a
//    font file of GoHighLevel's named in its stylesheet is blanked. Only Google Fonts is asked for.
// 3. The three Custom Code contents are replaced by the new blocks, built with a "local" profile whose addresses are
//    the folders on this disk (rollout/ghl-sim/fragments-local/), with the same remedies and cuts as staging and production.
// 4. Late head code. GoHighLevel adds the site's head and body code in the browser after the page has loaded. The
//    simulation does the same 600 ms after the load event (?late=<ms> changes it, ?late=never leaves it out, which
//    is how the "before" screenshots are taken).
// WHAT IT CANNOT SHOW: what GoHighLevel's own script does to the page after load (it is removed here), its editor,
// its size limit, its publishing. Those are listed in rollout/FRAGMENT-NOTES.md under "can only be settled in GoHighLevel".
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ROOT, RELEASE, SIM, HERE, posix, read, write, loadConfig, tokens, attrsOf, discoverPages } from "./lib.mjs";
import { buildProfile, writeProfile, planFor } from "./build-fragments.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes("--" + n);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1]; };
const SHOT = ((process.env.PP_PPTR_DIR || "tools/pptr") + "/shot.mjs");
// --variant <name> writes a second set (rollout/ghl-sim/variants/<name>/) and leaves the main simulation alone; used with --placement and --mech
const VARIANT = opt("variant", ""), BASE = VARIANT ? path.join(SIM, "variants", VARIANT) : SIM;
const SHELL = path.join(SIM, "live-shell"), PAGES = path.join(BASE, "pages"), SHOTS = path.join(BASE, "shots"), LOCAL = path.join(BASE, "fragments-local");
const LIVE = { home: "https://itspurgepros.com/", carmel: "https://itspurgepros.com/carmel", welcome: "https://itspurgepros.com/welcome" };
const SHOT_PAGES = ["dog-waste-removal", "carmel", "welcome", "index", "quote", "additional", "terms-conditions", "yard-guide"];

// ---- 1. the live shell, fetched once -------------------------------------------------------------------------------------
fs.mkdirSync(SHELL, { recursive: true });
for (const [name, url] of Object.entries(LIVE)) {
  const file = path.join(SHELL, name + ".html");
  if (fs.existsSync(file) && fs.statSync(file).size > 20000) continue;
  console.log(`fetching ${url} once, as plain HTML (no script runs)`);
  execFileSync("curl", ["-sS", "-L", "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", "-o", file, url], { stdio: "inherit" });
}

// ---- 2. the local profile ----------------------------------------------------------------------------------------------------
const cfg = loadConfig();
if (opt("placement")) cfg.scriptsPlacement = opt("placement");
const pages = discoverPages();
const simName = (p) => (p.kind === "blog" ? (p.nativePost ? "blog-post" : p.slug) : p.slug);
const plan = planFor(cfg, pages);                                   // the remedies and cuts of the real profiles
const local = { name: "local", environment: "local-simulation", assetsBase: pathToFileURL(RELEASE).href.replace(/\/+$/, ""), mode: "demo", endpoint: "", allowedOrigins: [], firePixelEvents: false,
  tracking: false, robots: "noindex, nofollow, noarchive", links: { prefix: "", map: {} } };
{ // every link goes to the simulation page of its target; kinds are known only after a first analysis
  const first = buildProfile(cfg, local, pages, plan);
  for (const p of first.site.pages) local.links.map[p.slug] = pathToFileURL(path.join(PAGES, simName(p) + ".html")).href;
}
const result = buildProfile(cfg, local, pages, plan);
writeProfile(result, LOCAL);
write(path.join(LOCAL, "profile.json"), JSON.stringify(local, null, 2) + "\n");
const block = (rel) => (result.files.has(rel) ? result.files.get(rel) : null);

// ---- 3. the wrapper around the blocks -------------------------------------------------------------------------------------------
// Cuts a live page into: its cleaned head, what stands before the first section, the three sections (each as
// before-the-code / after-the-code), and what stands after the last.
function shellOf(name) {
  const html = read(path.join(SHELL, name + ".html"));
  const headEnd = html.indexOf("</head>"), bodyAt = html.indexOf("<body", headEnd), bodyOpenEnd = html.indexOf(">", bodyAt) + 1, bodyEnd = html.lastIndexOf("</body>");
  let head = html.slice(html.indexOf("<head>") + 6, headEnd), keptStyles = 0;
  head = tokens(head).map((t) => {
    if (t.type === "raw" && t.tag === "style") { keptStyles += 1; return t.raw.replace(/url\(\s*["']?(https?:)?\/\/(?!fonts\.(googleapis|gstatic)\.com)[^)]*\)/g, 'url("data:,")'); }
    if (t.type === "raw") return "";                                                       // every script of the head
    if (t.type === "open" && t.tag === "link") { const a = attrsOf(t.attrs); return a.rel === "stylesheet" && /fonts\.googleapis\.com/.test(String(a.href)) ? t.raw : ""; }
    if (t.type === "open" && t.tag === "meta") { const a = attrsOf(t.attrs); return a.charset || a.name === "viewport" ? t.raw : ""; }
    if (t.type === "open" && (t.tag === "title" || t.tag === "noscript")) return "";
    if (t.type === "close" && (t.tag === "title" || t.tag === "noscript")) return "";
    if (t.type === "text") return /\S/.test(t.raw) && !/^\s*</.test(t.raw) ? "" : t.raw;      // the title's own words
    return t.type === "comment" ? "" : t.raw;
  }).join("").replace(/\n\s*\n/g, "\n");
  const body = html.slice(bodyOpenEnd, bodyEnd);
  // find each div.custom-code-container and the matching end of it and of its eight wrappers
  const toks = tokens(body), stack = [], found = [];
  for (const t of toks) {
    if (t.type === "open" && !t.selfClosed && !/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(t.tag)) stack.push(t);
    else if (t.type === "close" && stack.length) {
      const open = stack.pop();
      if (open.tag !== t.tag) { const at = stack.map((s) => s.tag).lastIndexOf(t.tag); if (at >= 0) stack.length = at; continue; }
      const cls = String(attrsOf(open.attrs).class || "");
      if (/\bcustom-code-container\b/.test(cls)) found.push({ innerStart: open.end, innerEnd: t.start, outerOpen: stack[stack.length - 1], containerOpen: open, containerCloseEnd: t.end });
      if (/\bc-section\b/.test(cls) && found.length && !found[found.length - 1].sectionStart && open.start < found[found.length - 1].innerStart) Object.assign(found[found.length - 1], { sectionStart: open.start, sectionEnd: t.end });
      if (/\bc-custom-code\b/.test(cls) && found.length && found[found.length - 1].outerOpen === open) Object.assign(found[found.length - 1], { codeStart: open.start, codeEnd: t.end });
    }
  }
  if (found.length !== 3 || found.some((f) => !f.sectionStart || !f.codeStart)) throw new Error(`live-shell/${name}.html: expected three Custom Code blocks each inside a section, found ${found.length}. GoHighLevel's page structure changed; read the file and adapt shellOf().`);
  const strip = (s) => tokens(s).filter((t) => t.type !== "raw" || t.tag === "style").map((t) => t.raw).join("");   // no script survives, GoHighLevel's or anyone's
  const sections = found.map((f) => ({
    before: strip(body.slice(f.sectionStart, f.codeStart)),                    // section > .inner > row > .inner > column > .inner
    codeOpen: body.slice(f.codeStart, f.innerStart),                         // div.c-custom-code > div.custom-code-container
    codeClose: body.slice(f.innerEnd, f.codeEnd),
    after: strip(body.slice(f.codeEnd, f.sectionEnd)),
  }));
  return { head, keptStyles, pre: strip(body.slice(0, found[0].sectionStart)), sections, post: strip(body.slice(found[2].sectionEnd)) };
}
const shells = {};
const shell = (name) => (shells[name] ||= shellOf(name));
// one Custom Code element (or two, one under the other in the same column, when the body was cut in two)
const section = (s, contents, idTag = "") => s.before + contents.map((c, i) => (i || idTag ? s.codeOpen.replace(/id="(custom-code-[\w-]+?)(__custom-code)?"/g, (m, id, tail) => `id="${id}${idTag}${i ? "-part" + (i + 1) : ""}${tail || ""}"`) : s.codeOpen) + "\n" + c + "\n" + s.codeClose).join("\n") + s.after;
const scriptSafe = (s) => JSON.stringify(s).replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
// The default of the pages this run writes: "600" (a plain delay, as before) or "ghl" (--hold ghl).
const DEFAULT_LATE = opt("hold") === "ghl" ? "ghl" : "600";
if (opt("hold") && opt("hold") !== "ghl") throw new Error(`--hold takes "ghl"; got "${opt("hold")}"`);
const lateScript = (headCode, bodyCode) => `<script id="ghl-sim-late">
/* SIMULATION ONLY: adds the site's head and body code after load, as GoHighLevel does.
   ?late=<ms>   a plain delay after the load event
   ?late=never  leaves the site code out
   ?late=ghl    GOHIGHLEVEL HOLDS SITE CODE, as measured on the staging preview on October 9, 2026: GoHighLevel's own script
                finishes ("hydration") ?hydrate=<ms> after the load event (default 1500; measured 1,300 to 9,100); only THEN
                does it listen for the visitor's first pointerdown, keydown, touchstart, scroll or mousemove, and it adds the
                site code at that touch or ?hold=<ms> later (default 4000), whichever is first. A touch before hydration
                releases nothing. The body code is written into <div id="gb-track-hl-custom-code">, as GoHighLevel writes it.
   This page's default: ${DEFAULT_LATE}. What happened is left on <html>: data-ghl-sim-late (the state), data-ghl-sim-late-at
   (ms after load when the code was added), and window.__ghlSim.sinceLoad() for a test to read the clock. */
(function(){var q=new URLSearchParams(location.search),L=q.get("late")||${JSON.stringify(DEFAULT_LATE)},root=document.documentElement,loadAt=null,HEAD=${scriptSafe(headCode)},BODY=${scriptSafe(bodyCode)};
function put(html,parent){var t=document.createElement("template");t.innerHTML=html;[].slice.call(t.content.childNodes).forEach(function(n){if(n.nodeName==="SCRIPT"){var s=document.createElement("script");[].forEach.call(n.attributes,function(a){s.setAttribute(a.name,a.value)});s.text=n.textContent;parent.appendChild(s)}else parent.appendChild(n)})}
function state(s){root.setAttribute("data-ghl-sim-late",s)}
function add(held){if(root.getAttribute("data-ghl-sim-late")==="done")return;var where=document.body;if(held){where=document.getElementById("gb-track-hl-custom-code");if(!where){where=document.createElement("div");where.id="gb-track-hl-custom-code";document.body.appendChild(where)}}put(HEAD,document.head);put(BODY,where);state("done");root.setAttribute("data-ghl-sim-late-at",String(Math.round(performance.now()-loadAt)))}
window.__ghlSim={mode:L,sinceLoad:function(){return loadAt===null?null:Math.round(performance.now()-loadAt)}};
function start(){loadAt=performance.now();if(L==="never"){state("left out");return}
if(L==="ghl"){var H=+(q.get("hydrate")||1500),T=+(q.get("hold")||4000);state("held: GoHighLevel has not hydrated yet");
setTimeout(function(){state("held: waiting for the first touch or "+T+" ms");var done=false,timer=setTimeout(go,T);function go(){if(done)return;done=true;clearTimeout(timer);add(true)}
["pointerdown","keydown","touchstart","scroll","mousemove"].forEach(function(e){window.addEventListener(e,go,{once:true,passive:true,capture:true})})},H);return}
setTimeout(function(){add(false)},+L||600)}
if(document.readyState==="complete")start();else window.addEventListener("load",start);
})();
</script>`;
function simPage(title, shellName, parts, headCode, bodyCode) {
  const s = shell(shellName);
  return `<!doctype html>
<html lang="en">
<head>
<!-- SIMULATION, written by _work/ghl/simulate.mjs. GoHighLevel's page wrapper and page stylesheet (from rollout/ghl-sim/live-shell/${shellName}.html, every script removed) around the new blocks. Not a page of the site; never publish. -->
<meta name="robots" content="noindex, nofollow">
<title>SIM · ${title}</title>
${s.head}
</head>
<body>
${s.pre}${parts.join("\n")}${s.post}
${lateScript(headCode, bodyCode)}
</body>
</html>
`;
}
// A page cut over several code elements: .1, .2, then the Yard Guide's older-card blocks (.older-1, .older-2 ...) in
// the order the template holds them (the packaging tool adds them when the index outgrows one element).
const olderParts = (base) => [...result.files.keys()].filter((k) => k.startsWith(`${base}.older-`) && k.endsWith(".html"))
  .sort((a, b) => parseInt(a.slice(`${base}.older-`.length), 10) - parseInt(b.slice(`${base}.older-`.length), 10)).map(block);
const bodyParts = (base) => (block(`${base}.html`) ? [block(`${base}.html`)] : [block(`${base}.1.html`), block(`${base}.2.html`), ...olderParts(base)]);
const written = [];
for (const p of result.site.pages) {
  const name = simName(p), which = p.slug === "index" ? "home" : p.customer ? "welcome" : "carmel", s = shell(which);
  let html;
  if (p.kind === "site") {
    const own = p.customer ? [`shared/${p.slug}-header.html`, `shared/${p.slug}-footer.html`] : ["shared/header.html", "shared/footer.html"];
    html = simPage(p.slug, which, [section(s.sections[0], [block(own[0])]), section(s.sections[1], bodyParts(`pages/${p.slug}`)), section(s.sections[2], [block(own[1])])], block("shared/site-head.html"), block("shared/site-body.html"));
  } else if (p.nativePost) {
    // the native post: GoHighLevel's own markup for one post as the built page holds it (its own wrappers included), in a section between the two blocks
    const native = result.blog.native.html.replace(/\ssrc="(\.\.\/[^"]+)"/g, (m, v) => ` src="${local.assetsBase}/${posix(path.posix.normalize(cfg.siteDir + "/" + v))}"`);
    html = simPage("blog-post template (from " + p.slug + ")", which, [section(s.sections[0], [block("blog/post-1-header.html")]), `<!-- NATIVE Blog Content element (stand-in: the post markup of the built page) -->\n${native.replace(/^<div class="guide-native"[^>]*>/, "<div>")}`, section(s.sections[2], [block("blog/post-3-footer.html")])], block("blog/site-head.html"), block("blog/site-body.html"));
  } else {
    const nativeList = s.sections[1].before.replace(/id="section-[\w-]+"/, 'id="section-sim-native-posts" style="display:none!important"') + `<div class="hl-blog-post-home">(GoHighLevel's native Blog Posts element stands here; the template's Custom CSS keeps it out of view, as today)</div>` + s.sections[1].after;
    html = simPage("blog-home template (from " + p.slug + ")", which, [section(s.sections[0], bodyParts("blog/home-1-header-and-index")), nativeList, section(s.sections[2], [block("blog/home-3-footer.html")])], block("blog/site-head.html"), block("blog/site-body.html"));
  }
  // --mech class: as a browser without :has() sees it (only the class pp5-w, set by each block's script, removes the wrappers' boxes)
  // --mech has:   as if GoHighLevel's own script took the class off again (only the :has() rule is left)
  // --mech none:  neither (what GoHighLevel's wrapper does to the pages when nothing answers it; the control)
  if (opt("mech") === "none") html = html.split('n.classList.add("pp5-w");').join("");
  if (opt("mech") === "class" || opt("mech") === "none") html = html.split(":is(.c-section,").map((piece, i) => (i === 0 ? piece : piece.slice(piece.indexOf(",.pp5-w{") + 1))).join("");
  if (opt("mech") === "has") html = html.split('n.classList.add("pp5-w");').join("");
  write(path.join(PAGES, name + ".html"), html);
  written.push(name);
}
console.log(`simulation: ${written.length} pages in ${posix(path.relative(RELEASE, PAGES))}/ · wrapper from live-shell (${Object.keys(shells).map((k) => `${k}: ${shells[k].keptStyles} style blocks kept`).join(", ")}) · local blocks in ${posix(path.relative(RELEASE, LOCAL))}/ · scripts start from: ${cfg.scriptsPlacement} · site code: ${DEFAULT_LATE === "ghl" ? "HELD as GoHighLevel holds it (first touch after hydration, or 4 s)" : "added 600 ms after load"}`);
// under the hold nothing arrives before hydration (1.5 s) + 4 s unless the page is touched: the measuring runs wait for it
const SETTLE = DEFAULT_LATE === "ghl" ? "6400" : "3200";

// ---- 4. measuring and screenshots ----------------------------------------------------------------------------------------------
const want = (opt("pages") || [...SHOT_PAGES, "blog-post"].join(",")).split(",").filter(Boolean);
const approvedOf = (name) => path.join(ROOT, (name === "blog-post" ? result.blog.post.slug : name) + ".html");
const run = (argv) => { const out = execFileSync("node", [SHOT, ...argv], { encoding: "utf8", maxBuffer: 1 << 28 }); return JSON.parse(out.slice(out.indexOf("{"))); };
const SIZES = [{ w: 390, argv: ["--mobile"] }, { w: 1440, argv: ["--w", "1440", "--h", "900"] }];
// every element of the header, <main> and the footer: where it is and how its text is set
// The approved page on disk may be a REVIEW build, which prints one line the blocks never carry (the footer's
// p.foot__review; lib.mjs rolloutForm). It is taken out before measuring, so the approved page is measured in its rollout
// form, the form the blocks were made from; on the simulation page there is none to take out.
const DIGEST = `(function(){[].forEach.call(document.querySelectorAll("p.foot__review"),function(e){e.parentNode.removeChild(e)});var out=[],sy=window.scrollY;[].forEach.call(document.querySelectorAll(".skip,.hdr,.hdr *,.mnav,.mnav *,main,main *,#main,#main *,.guide-after,.guide-after *,.foot,.foot *,.ppb-bar,.ppb-bar *"),function(e){if(e.closest("svg")&&e.tagName.toLowerCase()!=="svg")return;if(e.closest(".guide-native"))return;var r=e.getBoundingClientRect(),c=getComputedStyle(e);out.push([e.tagName.toLowerCase()+(e.id?"#"+e.id:"")+(typeof e.className==="string"&&e.className?"."+e.className.trim().split(/\\s+/).join("."):""),Math.round(r.left*2)/2,Math.round((r.top+sy)*2)/2,Math.round(r.width*2)/2,Math.round(r.height*2)/2,c.fontSize,c.fontWeight,c.lineHeight,c.color,c.display,c.position,c.fontFamily.split(",")[0]])});return JSON.stringify({late:document.documentElement.getAttribute("data-ghl-sim-late"),js:document.documentElement.classList.contains("js"),builder:!!window.PPBuilder,site:window.PPSite?window.PPSite.mode:null,h:document.documentElement.scrollHeight,sw:document.documentElement.scrollWidth,iw:window.innerWidth,els:out})})()`;
const STICKY = `(function(){var h=document.querySelector(".hdr"),b=document.querySelector(".hdr__bar");return JSON.stringify({scrollY:Math.round(window.scrollY),hdrTop:h?Math.round(h.getBoundingClientRect().top):null,barTop:b?Math.round(b.getBoundingClientRect().top):null,stuck:h?h.classList.contains("is-stuck"):null})})()`;
const NAMES = ["element", "left", "top", "width", "height", "font-size", "font-weight", "line-height", "color", "display", "position", "font-family"];

if (flag("measure")) {
  const report = [];
  for (const name of want) {
    if (name === "blog-post") continue;                               // the built article page still holds the builder's hero; compared by eye and by FAMILY-NOTES-guide's own mock
    for (const size of SIZES) {
      const tmp = path.join(BASE, "measure", "_tmp.jpg");
      const steps = JSON.stringify([{ eval: DIGEST }, { scrollY: 1600 }, { eval: STICKY }]);
      const a = run(["--url", approvedOf(name), "--out", tmp, ...size.argv, "--wait", "1500", "--no-motion", "--steps", steps]);
      const s = run(["--url", path.join(PAGES, name + ".html"), "--out", tmp, ...size.argv, "--wait", SETTLE, "--no-motion", "--steps", steps]);
      const A = JSON.parse(a.evals[0]), S = JSON.parse(s.evals[0]), stickyA = JSON.parse(a.evals[1]), stickyS = JSON.parse(s.evals[1]);
      const diffs = [];
      if (A.els.length !== S.els.length) diffs.push(`element count: approved ${A.els.length}, simulation ${S.els.length}`);
      const n = Math.min(A.els.length, S.els.length), props = {};
      for (let i = 0; i < n; i += 1) {
        const x = A.els[i], y = S.els[i];
        if (x[0] !== y[0]) { diffs.push(`element ${i}: approved ${x[0]}, simulation ${y[0]} (order differs; stopping)`); break; }
        for (let k = 1; k < x.length; k += 1) {
          const same = typeof x[k] === "number" ? Math.abs(x[k] - y[k]) <= 0.5 : x[k] === y[k];
          if (!same) { props[NAMES[k]] = (props[NAMES[k]] || 0) + 1; if (diffs.length < 25) diffs.push(`${x[0].slice(0, 70)}: ${NAMES[k]} approved ${x[k]}, simulation ${y[k]}`); }
        }
      }
      const row = { page: name, width: size.w, elements: n, differing: Object.values(props).reduce((p, c) => p + c, 0), byProperty: props, pageHeight: { approved: A.h, simulation: S.h },
        sidewaysScroll: { approved: A.sw > A.iw + 1, simulation: S.sw > S.iw + 1, simulationOverflowBy: S.sw - S.iw }, lateCode: S.late, scriptsRan: { site: S.js, builder: S.builder, mode: S.site },
        sticky: { approved: stickyA, simulation: stickyS }, consoleErrors: s.consoleErrors, failedRequests: s.failedRequests, brokenImages: s.brokenImages, firstDifferences: diffs };
      report.push(row);
      console.log(`measure ${name} @${size.w}: ${n} elements, ${row.differing} property differences${Object.keys(props).length ? " (" + Object.entries(props).map(([k, v]) => k + " " + v).join(", ") + ")" : ""} · height ${A.h}/${S.h} · sideways scroll ${row.sidewaysScroll.simulation ? "YES by " + row.sidewaysScroll.simulationOverflowBy : "no"} · header at ${stickyS.barTop}px after scrolling to ${stickyS.scrollY} (approved ${stickyA.barTop}) · errors ${s.consoleErrors.length} · failed requests ${s.failedRequests.length} · broken pictures ${s.brokenImages.length}`);
      for (const d of diffs.slice(0, 6)) console.log("    " + d);
      for (const e of [...s.consoleErrors, ...s.failedRequests].slice(0, 4)) console.log("    ! " + e);
    }
  }
  try { fs.rmSync(path.join(BASE, "measure", "_tmp.jpg"), { force: true }); } catch {}
  write(path.join(BASE, "measure", `report${opt("tag") ? "-" + opt("tag") : ""}.json`), JSON.stringify({ generated: new Date().toISOString(), scriptsPlacement: cfg.scriptsPlacement, siteCode: DEFAULT_LATE, rows: report }, null, 1) + "\n");
  const bad = report.filter((r) => r.differing || r.pageHeight.approved !== r.pageHeight.simulation || r.sidewaysScroll.simulation || r.lateCode !== "done" || r.consoleErrors.length || r.failedRequests.length || r.brokenImages.length);
  console.log(`measure: ${report.length} page-and-width pairs, ${report.length - bad.length} identical to the approved page with the site code arrived${bad.length ? " · NOT: " + bad.map((r) => r.page + "@" + r.width).join(", ") : ""}`);
  if (bad.length) process.exitCode = 1;
}

// --early-tap: the staging gate's failed test. While GoHighLevel still holds the site code, tap a dog-count tile within the
// first second after load. With the loader in the footer block the builder must open IN PLACE (same address, panel open);
// with the loader in the held site body code (the control) the tile's own link is followed and the page is left.
if (flag("early-tap")) {
  const tag = opt("tag", "r1"), dir = path.join(SHOTS, tag), hydrate = String(+opt("hydrate", "2500") || 2500);
  fs.mkdirSync(dir, { recursive: true });
  const NOW = `JSON.stringify({ms:window.__ghlSim?window.__ghlSim.sinceLoad():null,siteCode:document.documentElement.getAttribute("data-ghl-sim-late"),settings:window.PPSite?window.PPSite.mode:null,loaderRan:!!window.PP5Loaded,builderReady:!!(window.PPBuilder&&window.PPBuilder.store),file:location.pathname.split("/").pop()})`;
  const AFTER = `JSON.stringify({file:location.pathname.split("/").pop(),hash:location.hash,panelOpen:!!document.querySelector("dialog.ppb-sheet[open]"),panels:document.querySelectorAll("dialog.ppb-sheet").length,step:(window.PurgeProsQuote&&PurgeProsQuote.core?PurgeProsQuote.core.getState().step:null),dogs:(window.PurgeProsQuote&&PurgeProsQuote.core?PurgeProsQuote.core.getState().dogCount:null),demo:(window.PurgeProsQuote&&PurgeProsQuote.core?PurgeProsQuote.core.isDemo:null),network:(window.PurgeProsQuote&&PurgeProsQuote.core?PurgeProsQuote.core.networkLog.length:null),siteCode:document.documentElement.getAttribute("data-ghl-sim-late"),siteCodeAt:document.documentElement.getAttribute("data-ghl-sim-late-at"),ms:window.__ghlSim?window.__ghlSim.sinceLoad():null})`;
  // the "2 dogs" tile, whichever stands in the card at that moment: the live builder's (data-ppb-dogs) or the pasted
  // card's own second tile, which is a plain link to the quote page until the builder takes the card over
  const TILE = '[data-ppb-dogs="2"], #pp-builder .ppb-tiles > .ppb-tile:nth-child(2)';
  const rows = [];
  for (const name of want.filter((n) => result.site.bySlug.get(n) && result.site.bySlug.get(n).inPlace).slice(0, 3)) {
    for (const size of SIZES) {
      const base = path.join(dir, `early-tap-${name}-${size.w}`);
      // the screenshot tool taps as soon as the page's requests have gone quiet; on a busy machine that can be later than
      // the first second, which says nothing about the page, so such a run is taken again (three tries)
      let r, before, tries = 0;
      do {
        tries += 1;
        r = run(["--url", path.join(PAGES, name + ".html") + `?late=ghl&hydrate=${hydrate}`, "--out", `${base}-end.jpg`, ...size.argv, "--wait", "0", "--quality", "70",
          "--steps", JSON.stringify([{ eval: NOW }, { click: TILE }, { wait: 900 }, { eval: AFTER }, { shot: `${base}-after-tap.jpg` }, { wait: +hydrate + 4600 }, { eval: AFTER }])]);
        before = JSON.parse(r.evals[0]);
      } while ((before.ms === null || before.ms > 1000) && tries < 3);
      const after = JSON.parse(r.evals[1]), end = JSON.parse(r.evals[2]);
      // a navigation started by the tap can take longer than the 900 ms to show: the page the run ENDS on decides it too
      const left = after.file !== before.file ? after.file : end.file !== before.file ? end.file : null;
      const inPlace = !left && after.panelOpen && after.panels === 1 && after.step === "zip" && String(after.dogs) === "2";
      const held = /^held/.test(String(before.siteCode));
      const row = { page: name, width: size.w, scriptsStartFrom: cfg.scriptsPlacement, hydrationStandInMs: +hydrate, tappedMsAfterLoad: before.ms, siteCodeAtTap: before.siteCode, builderReadyAtTap: before.builderReady, openedInPlace: inPlace, leftThePageFor: left, afterTap: after, atTheEnd: end, consoleErrors: r.consoleErrors, failedRequests: r.failedRequests };
      rows.push(row);
      console.log(`early tap ${name} @${size.w} (scripts start from: ${cfg.scriptsPlacement}): tapped "2 dogs" ${before.ms} ms after load, site code ${before.siteCode} · ${inPlace ? `OPENED IN PLACE (same page, one panel, step ${after.step}, ${after.dogs} dogs, demo ${after.demo}, ${after.network} requests)` : left ? `LEFT THE PAGE for ${left} (the tile's own link was followed)` : `did NOT open (${JSON.stringify(after)})`} · later: on ${end.file}, site code ${end.siteCode}${end.siteCodeAt ? " at " + end.siteCodeAt + " ms" : ""}, panel ${end.panelOpen ? "still open" : "not open"}, ${end.panels} panel(s)${r.consoleErrors.length ? " · errors: " + r.consoleErrors.join(" | ").slice(0, 300) : ""}`);
      const ok = held && before.ms !== null && before.ms <= 1000 && (cfg.scriptsPlacement === "footer" ? inPlace && end.siteCode === "done" && end.panels === 1 && !r.consoleErrors.length : true);
      if (!ok) { process.exitCode = 1; console.log(`    ! not the expected result${held ? "" : " (the site code was not held at the tap)"}${before.ms !== null && before.ms > 1000 ? " (the tap came later than the first second)" : ""}`); }
    }
  }
  write(path.join(BASE, "measure", `early-tap${opt("tag") ? "-" + opt("tag") : ""}.json`), JSON.stringify({ generated: new Date().toISOString(), scriptsPlacement: cfg.scriptsPlacement, rows }, null, 1) + "\n");
  const opened = rows.filter((r) => r.openedInPlace).length;
  console.log(`early tap: ${rows.length} runs, ${opened} opened the builder in place, ${rows.filter((r) => r.leftThePageFor).length} left the page (scripts start from: ${cfg.scriptsPlacement})`);
}

// --probes: the things a still picture of the whole page does not show. Each is done on the approved page and on the
// simulation, the two measurements are compared, and a screenshot of each is kept.
if (flag("probes")) {
  const tag = opt("tag", "r1"), dir = path.join(SHOTS, tag);
  fs.mkdirSync(dir, { recursive: true });
  const box = (sel) => `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return "missing";var r=e.getBoundingClientRect(),c=getComputedStyle(e);return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height),c.display,c.visibility,c.position,e.className].join(" ")})()`;
  const both = (label, name, sizeArgv, steps, query = "") => {
    const file = (who) => path.join(dir, `probe-${label}-${name}-${who}.jpg`);
    const a = run(["--url", approvedOf(name) + query, "--out", file("approved"), ...sizeArgv, "--wait", "1500", "--quality", "70", "--steps", JSON.stringify(steps)]);
    const s = run(["--url", path.join(PAGES, name + ".html") + query, "--out", file("sim"), ...sizeArgv, "--wait", "3200", "--quality", "70", "--steps", JSON.stringify(steps)]);
    const same = JSON.stringify(a.evals) === JSON.stringify(s.evals);
    console.log(`probe ${label} ${name}: ${same ? "SAME" : "DIFFERENT"} · approved ${JSON.stringify(a.evals)}${same ? "" : " · simulation " + JSON.stringify(s.evals)}${s.consoleErrors.length ? " · simulation errors: " + s.consoleErrors.join(" | ").slice(0, 300) : ""}`);
    return same;
  };
  const phone = ["--mobile"], desk = ["--w", "1440", "--h", "900"];
  const builderPage = want.find((n) => result.site.bySlug.get(n) && result.site.bySlug.get(n).inPlace) || "carmel";
  // the phone menu opens over the whole screen
  both("phone-menu", builderPage, phone, [{ click: "[data-burger]" }, { wait: 500 }, { eval: box("#mnav") }, { eval: box(".mnav__foot") }]);
  // a desktop menu drops under the header
  both("desktop-menu", builderPage, desk, [{ click: ".nav__item--menu > .nav__link" }, { wait: 400 }, { eval: box("#menu-services") }]);
  // the builder panel after a tap, then closed: the pinned price bar shows once the hero card is out of view
  both("panel", builderPage, phone, [{ click: '[data-ppb-dogs="2"]' }, { wait: 900 }, { eval: box("dialog.ppb-sheet") }, { eval: `String(!!document.querySelector("dialog.ppb-sheet[open]"))+" step "+PurgeProsQuote.core.getState().step+" demo "+PurgeProsQuote.core.isDemo` }]);
  both("price-bar", builderPage, phone, [{ click: '[data-ppb-dogs="2"]' }, { wait: 900 }, { press: "Escape" }, { wait: 600 }, { scrollY: 2600 }, { eval: box(".ppb-bar") }]);
  both("panel-desktop", builderPage, desk, [{ click: '[data-ppb-dogs="3"]' }, { wait: 900 }, { eval: box("dialog.ppb-sheet") }]);
  // arriving at a section by its address: the page must stop where the approved page stops (site.js does part of this on "load")
  const pg = result.site.bySlug.get(builderPage);
  for (const id of [...pg.mainInner.matchAll(/<section\b[^>]*\sid="([\w-]+)"/g)].map((m) => m[1]).filter((id) => id !== "quote").slice(0, 3)) both("arrive-at-" + id, builderPage, phone, [{ wait: 600 }, { eval: "Math.round(window.scrollY)" }], "#" + id);
  // a page of the legal family: its contents list holds while the text scrolls
  const legal = want.find((n) => result.site.bySlug.get(n) && result.site.bySlug.get(n).ownScripts.some((s) => /legal/.test(s)));
  if (legal) { both("legal-contents", legal, desk, [{ scrollY: 3000 }, { eval: box("[data-legal-toc]") }]); both("legal-contents-phone", legal, phone, [{ scrollY: 3000 }, { eval: box("[data-legal-toc]") }, { eval: box(".legal-toc__bar-chev") }]); }
  // the price board's dog picker (its own script) and a company page's accordion
  const board = want.find((n) => result.site.bySlug.get(n) && result.site.bySlug.get(n).ownScripts.some((s) => /prices/.test(s)));
  if (board) both("price-board", board, phone, [{ scrollTo: "[data-pboard]" }, { eval: box("[data-pboard]") }, { eval: box("[data-pboard] .pboard__rail") }]);
  // the page for existing customers: no price bar, its own header button
  const cust = want.find((n) => result.site.bySlug.get(n) && result.site.bySlug.get(n).customer);
  if (cust) both("customer-page", cust, phone, [{ scrollY: 2600 }, { eval: box(".ppb-bar") }, { eval: box(".hdr__cta") }, { eval: `[].map.call(document.body.attributes,function(a){return a.name+(a.value?"="+a.value:"")}).join(" ")+" builder:"+String(!!window.PPBuilder)` }]);
}

if (flag("shots")) {
  const tag = opt("tag", "r1"), dir = path.join(SHOTS, tag);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of want) {
    for (const size of SIZES) {
      const base = path.join(dir, `${name}-${size.w}`);
      const sim = path.join(PAGES, name + ".html");
      // the whole page, approved and simulation; then the first screen before the late head code, after it, scrolled (the header must hold), and the foot
      run(["--url", approvedOf(name), "--out", `${base}-approved-full.jpg`, ...size.argv, "--wait", "1500", "--full", "--quality", "60"]);
      run(["--url", sim, "--out", `${base}-sim-full.jpg`, ...size.argv, "--wait", "3200", "--full", "--quality", "60"]);
      run(["--url", sim + "?late=never", "--out", `${base}-sim-before-late-code.jpg`, ...size.argv, "--wait", "700", "--quality", "70"]);
      run(["--url", approvedOf(name), "--out", `${base}-approved-top.jpg`, ...size.argv, "--wait", "1500", "--quality", "70", "--steps", JSON.stringify([{ scrollY: 1400 }, { shot: `${base}-approved-scrolled.jpg` }, { scrollY: 0 }])]);
      run(["--url", sim, "--out", `${base}-sim-top.jpg`, ...size.argv, "--wait", "3200", "--quality", "70", "--steps", JSON.stringify([{ scrollY: 1400 }, { shot: `${base}-sim-scrolled.jpg` }, { scrollY: 0 }])]);
      // side by side: approved on the left, simulation on the right, cut into screens that can be read
      const sheet = path.join(dir, `_${name}-${size.w}-pair.html`), colW = size.w === 390 ? 390 : 700;
      write(sheet, `<!doctype html><meta charset="utf-8"><title>${name} ${size.w}: approved | simulation</title><style>body{margin:0;background:#222;font:14px/1.3 system-ui;color:#fff}.r{display:flex;gap:12px;padding:0 6px}.c{width:${colW}px}.c p{margin:0;padding:6px 0;position:sticky;top:0;background:#222}.c img{display:block;width:${colW}px;height:auto}</style><div class="r"><div class="c"><p>APPROVED ${name} @${size.w}</p><img src="${path.basename(base)}-approved-full.jpg"></div><div class="c"><p>IN THE GHL WRAPPER (simulation)</p><img src="${path.basename(base)}-sim-full.jpg"></div></div>`);
      const pair = run(["--url", sheet, "--out", `${base}-pair.jpg`, "--w", String(colW * 2 + 24), "--h", "1000", "--wait", "500", "--tiles", "--quality", "62"]);
      console.log(`shots ${name} @${size.w}: ${pair.tiles} side-by-side screens in rollout/ghl-sim/shots/${tag}/${path.basename(base)}-pair-NN.jpg`);
    }
  }
  // tapping a dog count must still open the builder panel, in demo mode, on a page that holds the builder
  for (const name of want.filter((n) => result.site.bySlug.get(n) && result.site.bySlug.get(n).inPlace).slice(0, 3)) {
    for (const size of SIZES) {
      const base = path.join(dir, `${name}-${size.w}`);
      const tap = run(["--url", path.join(PAGES, name + ".html"), "--out", `${base}-sim-after-tap.jpg`, ...size.argv, "--wait", "3200", "--quality", "70",
        "--steps", JSON.stringify([{ click: '[data-ppb-dogs="2"]' }, { wait: 900 }, { eval: `JSON.stringify({panelOpen:!!document.querySelector("dialog.ppb-sheet[open]"),step:(window.PurgeProsQuote&&PurgeProsQuote.core?PurgeProsQuote.core.getState().step:null),dogs:(window.PurgeProsQuote&&PurgeProsQuote.core?PurgeProsQuote.core.getState().dogCount:null),demo:(window.PurgeProsQuote&&PurgeProsQuote.core?PurgeProsQuote.core.isDemo:null),network:(window.PurgeProsQuote&&PurgeProsQuote.core?PurgeProsQuote.core.networkLog.length:null),gloved:!!document.querySelector('[data-mascot="gloved"]'),bodyAttrs:[].map.call(document.body.attributes,function(a){return a.name+(a.value?"="+a.value:"")})})` }])]);
      console.log(`tap ${name} @${size.w}: ${tap.evals[0]}${tap.consoleErrors.length ? " · errors: " + tap.consoleErrors.join(" | ") : ""}`);
    }
  }
}
