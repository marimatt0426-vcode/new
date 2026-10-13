// check-map.mjs : measures every map of the site in the browser and FAILS when a map is not fit to show.
//
//   node _work/check-map.mjs                  the shared area map (both drawings) and the map of every town page
//   node _work/check-map.mjs --shared         the shared area map only
//   node _work/check-map.mjs carmel avon      only these town pages
//   node _work/check-map.mjs --keep           leave the test page _work/.map-test.html in place afterwards
//   node _work/check-map.mjs --measure        measure every name, the flag, the pin's picture and the height of a line
//                                             of text in the browser and write _work/map-names.json, which
//                                             _work/city-map.mjs lays the town maps out with (run it after adding a town)
//
// It starts a headless browser: on this computer run it through the headless lock, one browser job at a time.
// It reads the BUILT pages (what is packaged), so build first: node _work/build-map.mjs, then
// node _work/city-map.mjs <slug> --write for the town pages, then node _work/build-site.mjs.
// It writes _work/.map-test.html (deleted afterwards) and one picture, shots/fix-pages/w/map-test.jpg.
//
// A map fails when
//   1. a pin has no name. On the shared map and on the Indianapolis page: every community of
//      assets/map/communities.json that has a page. On a town page: every town of the page's own list of closest
//      service areas (the chips beside the map), the town itself (its flag) and Indianapolis;
//   2. a name collides: with another name, a pin, the I-465 ring, the flag or the gold seal of the lit town, the edge
//      of the plate or its rounded corner; or a name stands away from its own pin; or two names stand side by side on
//      one line so close that they read as one place; or the flag sits on a pin;
//   3. a pin lies outside the shaded service area (its centre is not on the shape). A pin that only crosses the
//      dotted outline is listed as a note; so is a gold seal that reaches a neighbour's pin (the pin is drawn over it);
//   4. two pins overlap, or a pin sits on the ring;
//   5. a hidden description gives a count that is not the number of communities (25 nearby, 26 with Indianapolis);
//   6. a page that carries the shared map does not carry the drawing that was measured here, or a town map's shaded
//      shape is not the shared map's;
//   7. _work/map-names.json no longer holds what the browser draws (a width off by more than one unit).
// Every drawing is measured at the widest and the narrowest plate the pages show it at, and at widths between,
// because the browser rounds the height of a line of text differently at each size.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.resolve(root, "../..");
const args = process.argv.slice(2), only = args.filter((a) => !a.startsWith("--"));
const sharedOnly = args.includes("--shared"), measuring = args.includes("--measure");
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="../css/site.css"><link rel="stylesheet" href="../css/family-city.css">';
const PIN_FILE = path.join(release, "assets/brand-icons/pp-local-area.webp"), NAMES_FILE = path.join(root, "_work", "map-names.json");
// plate widths the pages really show (measured October 12, 2026 at windows of 320 to 1440): the shared plate is
// 288 to 460 wide with the tall drawing and 538 to 860 with the wide one; a town page's plate 288 to 460 and 538 to 772
const W_SHARED = [860, 792, 720, 588, 538, 460, 448, 398, 358, 328, 288], W_TOWN = [772, 588, 538, 460, 358, 288];
const NARROWEST = { wide: 538, tall: 288 };
const test = path.join(root, "_work", ".map-test.html"), shot = path.join(root, "shots", "fix-pages", "w", "map-test.jpg");
function inBrowser(html, call) {
  fs.writeFileSync(test, html);
  try {
    const r = execFileSync("node", [((process.env.PP_PPTR_DIR || "tools/pptr") + "/shot.mjs"), "--url", test, "--out", shot, "--w", "1440", "--h", "1250", "--wait", "1500", "--steps", JSON.stringify([{ eval: call }])], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(r.slice(r.indexOf("{")));
  } finally { if (!args.includes("--keep")) fs.unlinkSync(test); }
}

const communities = JSON.parse(fs.readFileSync(path.join(release, "assets/map/communities.json"), "utf8")).communities;
const withPage = communities.filter((c) => c.hasPage).map((c) => c.name), nearby = withPage.filter((n) => n !== "Indianapolis");
const nameOfSlug = new Map(communities.map((c) => [c.slug, c.name]));

// ---- --measure : what the browser really draws, written to _work/map-names.json ----------------------------------
if (measuring) {
  const names = communities.map((c) => c.name);
  const block = (kind, w) => `<div style="width:${w}px"><div class="map city-map" data-kind="${kind}"><svg class="map__${kind}" style="display:block" viewBox="${kind === "tall" ? "0 0 400 500" : "0 0 640 470"}"><text class="map__ring-label" data-k="ring" x="500" y="20">I-465</text>${names.map((n, i) => `<text data-k="name" data-n="${n}" x="10" y="${20 + i * 16}">${n}</text><g class="city-map__flag"><text data-k="flag" data-n="${n}" x="200" y="${20 + i * 16}">${n}</text></g><text class="map__big" data-k="big" data-n="${n}" x="320" y="${20 + i * 16}">${n}</text>`).join("")}</svg></div></div>`;
  const probe = async () => {
    await document.fonts.ready;
    const out = { fonts: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "") + " " + f.weight), rows: [] };
    for (const m of document.querySelectorAll(".map")) for (const t of m.querySelectorAll("text")) { const b = t.getBBox(), y = +t.getAttribute("y"); out.rows.push({ kind: m.dataset.kind, k: t.dataset.k, n: t.dataset.n || "", w: t.getComputedTextLength(), size: parseFloat(getComputedStyle(t).fontSize), up: y - b.y, down: b.y + b.height - y }); }
    // the pin's picture: where it has colour, row by row
    const im = document.getElementById("pin"); await im.decode();
    const N = 200, c = document.createElement("canvas"); c.width = N; c.height = N;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0, N, N);
    const a = g.getImageData(0, 0, N, N).data, ink = [];
    for (let y = 0; y < N; y += 1) { let x0 = -1, x1 = -1; for (let x = 0; x < N; x += 1) if (a[(y * N + x) * 4 + 3] > 60) { if (x0 < 0) x0 = x; x1 = x; } if (x0 >= 0) ink.push([y / N - 0.5, x0 / N - 0.5, (x1 + 1) / N - 0.5]); }
    out.ink = ink;
    return JSON.stringify(out);
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">${FONTS}</head><body style="margin:0;padding:8px">${[...W_SHARED.filter((w) => w < 520).map((w) => block("tall", w)), ...W_SHARED.filter((w) => w >= 520).map((w) => block("wide", w))].join("")}<img id="pin" alt="" src="data:image/webp;base64,${fs.readFileSync(PIN_FILE).toString("base64")}"><script>window.__mapMeasure = ${probe.toString()};</script></body></html>`;
  const rep = inBrowser(html, "window.__mapMeasure()"), got = JSON.parse(rep.evals[0]);
  for (const need of ["Figtree 600", "Figtree 800", "Barlow Condensed 800"]) if (!got.fonts.includes(need)) { console.error(`check-map --measure: the font ${need} did not load (${got.fonts.join(", ") || "no font"}): nothing written`); process.exit(1); }
  const r2 = (n) => Math.round(n * 100) / 100, up1 = (n) => Math.ceil(n * 10 - 1e-9) / 10, r3 = (n) => Math.round(n * 1000) / 1000;
  const per100 = (k, n) => r2(Math.max(...got.rows.filter((r) => r.k === k && r.n === n).map((r) => (r.w / r.size) * 100)));
  const box = {};
  for (const kind of ["wide", "tall"]) { const of = (k, f) => Math.max(...got.rows.filter((r) => r.kind === kind && r.k === k).map((r) => r[f])); box[kind] = { up: up1(of("name", "up") - 2.5), down: up1(of("name", "down") - 2.5), bigUp: up1(of("big", "up") - 2.5), bigDown: up1(of("big", "down") - 2.5) }; }
  // the drawn pin: a round head (the widest row gives its radius and its height) on a point that ends in a wider foot
  const widest = got.ink.reduce((a, b) => (b[2] - b[1] > a[2] - a[1] ? b : a)), top = got.ink[0][0], foot = got.ink[got.ink.length - 1][0];
  const headR = (widest[2] - widest[1]) / 2, lower = got.ink.filter((r) => r[0] > top + headR * 2);
  const pin = { headY: r3(top + headR), headR: r3(headR), stem: r3(Math.max(...lower.map((r) => Math.max(-r[1], r[2])))), foot: r3(foot + 1 / 200) };
  const out = { _note: "The sizes the browser really draws on the maps. WRITTEN BY node _work/check-map.mjs --measure : do not edit by hand. names: the width of each name for a font size of 100 (name: a plain name on the map; flag: the name on the navy flag, with its letter spacing; big: the large Indianapolis). ring: the width of the I-465 label. box: how far the box that check-map.mjs gives a line of text reaches above and below its baseline, at its tallest over the plate widths. pin: the drawn shape inside the pin's square picture, as fractions of the picture's size from its centre (a round head on a point). narrowest: the narrowest plate each drawing is shown on.",
    names: Object.fromEntries(names.map((n) => [n, { name: per100("name", n), flag: per100("flag", n), big: per100("big", n) }])), ring: per100("ring", ""), box, pin, narrowest: NARROWEST };
  const body = "{\n" + Object.entries(out).map(([k, v]) => (k === "names" ? '  "names": {\n' + Object.entries(v).map(([n, e]) => `    ${JSON.stringify(n)}: ${JSON.stringify(e)}`).join(",\n") + "\n  }" : `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)).join(",\n") + "\n}\n";
  const before = fs.existsSync(NAMES_FILE) ? fs.readFileSync(NAMES_FILE, "utf8") : "";
  if (before !== body) fs.writeFileSync(NAMES_FILE, body);
  console.log(`_work/map-names.json ${before === body ? "unchanged" : "written"}: ${names.length} names, the I-465 label, the height of a line on both drawings, the pin's shape (${JSON.stringify(pin)}).`);
  if (before !== body) console.log("Sizes changed: draw the town maps again (node _work/city-map.mjs <slug> --write for every town page), build, and run node _work/check-map.mjs");
  process.exit(0);
}

// ---- what must be on a map ---------------------------------------------------------------------------------------
if (!fs.existsSync(NAMES_FILE)) throw new Error("check-map: _work/map-names.json is missing (run node _work/check-map.mjs --measure)");
const REAL = JSON.parse(fs.readFileSync(NAMES_FILE, "utf8"));
// where each pin stands: the table of build-map.mjs, read, never copied
const tableSrc = /const PLACES = (\[[\s\S]*?\n\]);/.exec(fs.readFileSync(path.join(root, "_work", "build-map.mjs"), "utf8"));
if (!tableSrc) throw new Error("check-map: the PLACES table was not found in _work/build-map.mjs");
const table = { wide: {}, tall: {} };
for (const [name, , wide, tall] of Function(`"use strict"; return ${tableSrc[1]};`)()) { table.wide[name] = [wide[0], wide[1]]; table.tall[name] = [tall[0], tall[1]]; }

const problems = [];   // found without a browser
const flat = (s) => s.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
const between = (text, start, end) => { const a = text.indexOf(start), b = text.indexOf(end, a); return a < 0 || b < 0 ? null : text.slice(a, b + end.length); };
const shapes = (block) => [...block.matchAll(/<svg class="map__(wide|tall)"[\s\S]*?<path d="([^"]+)"/g)].map((m) => m[1] + " " + m[2]).join("\n");
const descCounts = (label, block) => {
  const said = new Set();
  for (const m of block.matchAll(/<desc[^>]*>([^<]*)<\/desc>/g)) for (const n of m[1].match(/\b\d+\b/g) || []) {
    if (/^\d{5}$/.test(n) || n === "465" || said.has(n)) continue;   // a ZIP code, the ring road, said already
    said.add(n);
    if (+n !== nearby.length && +n !== withPage.length) problems.push(`${label}: the hidden description says ${n}; there are ${nearby.length} nearby communities (${withPage.length} with Indianapolis): "${m[1].slice(0, 130)}…"`);
  }
};

// ---- the drawings ------------------------------------------------------------------------------------------------
const kit = fs.readFileSync(path.join(root, "kit.html"), "utf8");
const sharedBlock = between(kit, "<!-- MAP START", "<!-- MAP END -->");
if (!sharedBlock) throw new Error("check-map: kit.html has no map (run node _work/build-map.mjs first)");
const built = fs.readdirSync(root).filter((f) => f.endsWith(".html") && !f.startsWith("_")).sort();
const sharedPages = [], towns = [];
for (const f of built) {
  const slug = f.replace(/\.html$/, ""), html = fs.readFileSync(path.join(root, f), "utf8");
  const own = between(html, "<!-- MAP START", "<!-- MAP END -->");
  if (own && slug !== "kit") { sharedPages.push(slug); if (flat(own) !== flat(sharedBlock)) problems.push(`${f}: its area map is not the drawing in kit.html (run node _work/build-map.mjs, then node _work/build-site.mjs)`); }
  const city = between(html, "<!-- CITY MAP START", "<!-- CITY MAP END -->");
  if (!city || slug.startsWith("kit")) continue;
  const lit = (/<!-- CITY MAP START: ([a-z-]+) /.exec(city) || [])[1];
  const list = /<ul class="[^"]*\bcity-chips\b[^"]*">([\s\S]*?)<\/ul>/.exec(html);
  const chips = list ? [...list[1].matchAll(/<a class="chip" href="([a-z-]+)\.html"/g)].map((m) => nameOfSlug.get(m[1])).filter((n) => n && n !== "Indianapolis") : [];
  if (lit !== slug) problems.push(`${f}: its map lights ${lit}, not ${slug}`);
  if (!list) problems.push(`${f}: no list of closest service areas (ul.city-chips) was found beside the map`);
  if (shapes(city) !== shapes(sharedBlock)) problems.push(`${f}: the shaded shape of its map is not the shared map's (run node _work/city-map.mjs ${slug} --write, then node _work/build-site.mjs ${slug})`);
  towns.push({ slug, name: nameOfSlug.get(slug), block: city, chips });
}
for (const s of only) if (!towns.some((t) => t.slug === s)) throw new Error(`check-map: ${s}.html is not a built town page with a map`);
const doShared = !only.length, doTowns = sharedOnly ? [] : only.length ? towns.filter((t) => only.includes(t.slug)) : towns;
if (doShared) descCounts("the shared map (kit.html)", sharedBlock);
for (const t of doTowns) descCounts(t.slug + ".html", t.block);

const strip = (block, tag) => block.replace(/<!--[\s\S]*?-->/g, "").replace(/id="(?:city)?map-/g, `id="${tag}-`).replace(/ aria-labelledby="[^"]*"/g, "").replace(/\.\.\/\.\.\/assets/g, "../../../assets");
const plates = [];
if (doShared) for (const w of W_SHARED) plates.push(`<div style="width:${w}px"><div class="map" data-page="" data-all="1" data-w="${w}">${strip(sharedBlock, "s" + w)}<p class="map__note">shared map, ${w}px plate</p></div></div>`);
for (const t of doTowns) for (const w of W_TOWN) {
  const inner = strip(t.block, t.slug + w).replace(/^\s*<div class="map city-map">/, "").replace(/<\/div>\s*$/, "");
  plates.push(`<div style="width:${w}px"><div class="map city-map" data-page="${t.slug}" data-lit="${t.name}" data-all="${t.slug === "indianapolis" ? 1 : ""}" data-expect="${t.chips.join("|")}" data-w="${w}">${inner}</div></div>`);
}

// ---- the measuring, in the page (keep the rules of measure in _work/city-map.mjs alike) ---------------------------
const probe = async () => {
  await document.fonts.ready;
  const DATA = JSON.parse(document.getElementById("map-check-data").textContent), res = [];
  const gap = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  const r1 = (n) => Math.round(n * 10) / 10;
  for (const map of document.querySelectorAll(".map")) {
    const svg = [...map.querySelectorAll("svg")].find((s) => getComputedStyle(s).display !== "none");
    const kind = svg.classList.contains("map__tall") ? "tall" : "wide", vb = svg.viewBox.baseVal;
    const scale = svg.getBoundingClientRect().width / vb.width, page = map.dataset.page, lit = map.dataset.lit || "";
    const expect = (map.dataset.expect || "").split("|").filter(Boolean), all = map.dataset.all === "1";
    const hits = [], notes = [], widths = [];
    const ringEl = svg.querySelector(".map__ring"), ring = { x: +ringEl.getAttribute("cx"), y: +ringEl.getAttribute("cy"), r: +ringEl.getAttribute("r") };
    const sealEl = svg.querySelector(".city-map__here circle");
    const seal = sealEl ? { x: +sealEl.getAttribute("cx"), y: +sealEl.getAttribute("cy"), R: +sealEl.getAttribute("r") + (parseFloat(sealEl.getAttribute("stroke-width")) || 0) / 2 } : null;
    const shape = svg.querySelector("path"), pt = svg.createSVGPoint();
    const onShape = (x, y) => { pt.x = x; pt.y = y; return shape.isPointInFill(pt); };
    // pins: which town each one is; the box the names keep clear of, and the drawn pin (a round head on a point)
    const pins = [...svg.querySelectorAll("image")].map((im) => { const b = im.getBBox(), s = b.width, cx = b.x + s / 2, cy = b.y + s / 2; return { cx, cy, size: s, x0: b.x + 3, x1: b.x + s - 3, y0: b.y + 1, y1: b.y + s - 1, head: { x: cx, y: cy + DATA.pin.headY * s, r: DATA.pin.headR * s }, stem: { x0: cx - DATA.pin.stem * s, x1: cx + DATA.pin.stem * s, y0: cy + DATA.pin.headY * s, y1: cy + DATA.pin.foot * s } }; });
    for (const p of pins) {
      if (seal && Math.hypot(p.cx - seal.x, p.cy + 2 - seal.y) < 3) { p.town = lit; p.lit = true; continue; }
      if (p.size > 30 && Math.abs(p.cx - ring.x) < 1 && Math.abs(p.cy - ring.y) < 14) { p.town = "Indianapolis"; p.big = true; continue; }
      for (const [name, at] of Object.entries(DATA.table[kind])) if (Math.abs(at[0] - p.cx) < 0.6 && Math.abs(at[1] - p.cy) < 0.6) p.town = name;
      if (!p.town) hits.push(`a pin at ${r1(p.cx)}, ${r1(p.cy)} is not a place of the table in _work/build-map.mjs`);
    }
    for (const n of DATA.towns) if (!pins.some((p) => p.town === n)) hits.push(`${n} has no pin`);
    // names
    const flagG = svg.querySelector(".city-map__flag"), names = [];
    for (const t of svg.querySelectorAll("text")) {
      const size = parseFloat(getComputedStyle(t).fontSize), inFlag = Boolean(flagG && flagG.contains(t));
      widths.push([t.textContent, inFlag ? "flag" : t.classList.contains("map__big") ? "big" : t.classList.contains("map__ring-label") ? "ring" : t.classList.contains("map__soft") ? "soft" : "name", t.getComputedTextLength(), size]);
      if (inFlag) continue;
      const b = t.getBBox();
      names.push({ name: t.textContent, x0: b.x, x1: b.x + b.width, y0: b.y + 2.5, y1: b.y + b.height - 2.5, ringLabel: t.classList.contains("map__ring-label"), big: t.classList.contains("map__big"), px: size * scale });
    }
    let flag = null;
    if (flagG) {
      const b = flagG.querySelector("rect").getBBox(), h = b.height, tb = flagG.querySelector("text").getBBox();
      flag = { name: flagG.textContent.trim(), x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + h, rad: h / 2 + 1.25, sx0: b.x + h / 2, sx1: b.x + b.width - h / 2, sy: b.y + h / 2 };
      if (tb.x < b.x + 6 || tb.x + tb.width > b.x + b.width - 6) hits.push(`the flag is too short for the name ${flag.name}`);
    }
    const flagToBox = (o) => Math.hypot(Math.max(0, flag.sx0 - o.x1, o.x0 - flag.sx1), Math.max(0, o.y0 - flag.sy, flag.sy - o.y1)) - flag.rad;
    const flagToDisc = (o) => Math.hypot(Math.max(0, flag.sx0 - o.x, o.x - flag.sx1), o.y - flag.sy) - flag.rad - o.r;
    const sealToBox = (o) => Math.hypot(Math.max(o.x0, Math.min(seal.x, o.x1)) - seal.x, Math.max(o.y0, Math.min(seal.y, o.y1)) - seal.y) - seal.R;
    // 1. every pin that must have a name has one
    const isNamed = (n) => names.some((l) => l.name === n && !l.ringLabel) || (flag && flag.name === n);
    if (all) { for (const n of DATA.towns) if (!isNamed(n)) hits.push(`${n} has a pin and no name`); }
    else {
      for (const n of expect) if (!isNamed(n)) hits.push(`${n}, a town this page lists beside the map, has a pin and no name`);
      if (!isNamed("Indianapolis")) hits.push("Indianapolis has no name");
    }
    if (page && (!flag || flag.name !== lit)) hits.push(`the flag does not name ${lit}`);
    const seen = new Set();
    for (const l of names) {
      if (l.ringLabel) continue;
      if (seen.has(l.name)) hits.push(`${l.name} is named twice`);
      seen.add(l.name);
      const own = pins.find((p) => p.town === l.name);
      if (!own) hits.push(`the name ${l.name} has no pin`);
      else if (!l.big && gap(l, own) > 14.5) hits.push(`the name ${l.name} stands ${r1(gap(l, own))} away from its pin`);
    }
    // 2. a name collides
    names.forEach((l, i) => {
      names.forEach((o, j) => {
        if (j <= i) return;
        if (gap(l, o) < 1) hits.push(`${l.name} x ${o.name}`);
        // two names side by side on one line, closer than two word spaces, read as one place
        else if (!l.big && !o.big && !l.ringLabel && !o.ringLabel && Math.min(l.y1, o.y1) - Math.max(l.y0, o.y0) >= 5 && gap(l, o) < 8) hits.push(`${l.name} and ${o.name} stand on one line only ${r1(gap(l, o))} apart (they read as one name)`);
      });
      for (const p of pins) if (gap(l, p) < 1) hits.push(`${l.name} x the pin of ${p.town || "?"}`);
      if (!l.big) {
        let near = false;
        for (let k = 0; k <= 20 && !near; k += 1) for (const yy of [l.y0, (l.y0 + l.y1) / 2, l.y1]) { const xx = l.x0 + ((l.x1 - l.x0) * k) / 20; if (Math.abs(Math.hypot(xx - ring.x, yy - ring.y) - ring.r) < 7) near = true; }
        if (near) hits.push(`${l.name} x RING`);
      }
      if (l.x0 < 4 || l.x1 > vb.width - 4 || l.y0 < 4 || l.y1 > vb.height - 4) hits.push(`${l.name} x EDGE`);
      const R = 28 / scale, F = 5 / scale;   // the plate's rounded top corners (28px on screen, with a 5px white frame)
      for (const [x, y] of [[l.x0, l.y0], [l.x1, l.y0]]) { const ex = Math.min(x, vb.width - x); if (ex < R && y < R && Math.hypot(R - ex, R - y) > R - F - 1) hits.push(`${l.name} x CORNER`); }
      if (flag && flagToBox(l) < 1) hits.push(`${l.name} x the flag of ${flag.name}`);
      if (seal && sealToBox(l) < 1) hits.push(`${l.name} x the gold seal`);
    });
    if (flag) {
      for (const p of pins) if (!p.lit && (flagToDisc(p.head) < 1 || flagToBox(p.stem) < 1)) hits.push(`the flag of ${flag.name} x the pin of ${p.town || "?"}`);
      if (flag.x0 < 4 || flag.x1 > vb.width - 4 || flag.y0 < 4 || flag.y1 > vb.height - 4) hits.push(`the flag of ${flag.name} x EDGE`);
      if (lit !== "Indianapolis") { let cross = false; for (let k = 0; k <= 20; k += 1) { const xx = flag.x0 + ((flag.x1 - flag.x0) * k) / 20; for (const yy of [flag.y0, flag.y1]) if (Math.abs(Math.hypot(xx - ring.x, yy - ring.y) - ring.r) < 4) cross = true; } if (cross) notes.push(`the flag of ${flag.name} touches the ring`); }
    }
    if (seal) for (const p of pins) if (!p.lit && Math.hypot(p.head.x - seal.x, p.head.y - seal.y) < seal.R + p.head.r + 0.5) notes.push(`the gold seal reaches the pin of ${p.town || "?"}`);
    // 3. every pin on the shaded area   4. pins clear of each other and of the ring
    const plain = pins.filter((p) => !p.lit);
    for (const p of pins) {
      const cy = p.lit ? p.cy + 2 : p.cy;
      if (!onShape(p.cx, cy)) hits.push(`the pin of ${p.town || "?"} lies outside the shaded area`);
      else if (!p.lit && ![[p.x0, p.y0], [p.x1, p.y0], [p.x0, p.y1], [p.x1, p.y1]].every(([x, y]) => onShape(x, y))) notes.push(`the pin of ${p.town || "?"} crosses the outline of the shaded area`);
    }
    for (const p of plain) if (!p.big && Math.abs(Math.hypot(p.cx - ring.x, p.cy - ring.y) - ring.r) < 12) hits.push(`the pin of ${p.town || "?"} x RING`);
    for (let i = 0; i < plain.length; i += 1) for (let j = i + 1; j < plain.length; j += 1) if (gap(plain[i], plain[j]) < 0) hits.push(`the pin of ${plain[i].town || "?"} x the pin of ${plain[j].town || "?"}`);
    const small = names.filter((l) => !l.big && !l.ringLabel).map((l) => l.px);
    res.push({ page, kind, plate: +map.dataset.w, pins: pins.length, names: names.filter((l) => !l.ringLabel).length + (flag ? 1 : 0), smallest: small.length ? r1(Math.min(...small)) : null, hits, notes, widths });
  }
  return JSON.stringify(res);
};
const data = JSON.stringify({ table, towns: withPage, pin: REAL.pin }).replace(/</g, "\\u003c");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">${FONTS}</head>
<body style="margin:0;padding:16px;background:#e8f6da;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
${plates.join("\n")}
<script type="application/json" id="map-check-data">${data}</script>
<script>window.__mapCheck = ${probe.toString()};</script>
</body></html>`;
const rep = inBrowser(html, "window.__mapCheck()");

// ---- the report --------------------------------------------------------------------------------------------------
let bad = 0, noteCount = 0;
const rows = JSON.parse(rep.evals[0]), groups = new Map();
// 7. the sizes city-map.mjs lays the town maps out with are still the sizes the browser draws
const stale = new Set();
for (const m of rows) for (const [name, what, w, size] of m.widths) {
  const want = what === "ring" ? REAL.ring : what === "soft" ? null : (REAL.names[name] || {})[what];
  if (want === null) continue;
  if (want === undefined) stale.add(`${name} has no measured width`);
  else if (Math.abs((want * size) / 100 - w) > 1) stale.add(`${name} (${what}) is ${Math.round(w * 10) / 10} wide at ${size}px, the file says ${Math.round(want * size) / 100}`);
}
for (const s of stale) problems.push(`_work/map-names.json is out of date: ${s}. Run node _work/check-map.mjs --measure, then draw the town maps again`);
for (const p of problems) { console.log("FAIL  " + p); bad += 1; }
for (const m of rows) { const k = m.page || "shared map"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
for (const [name, list] of groups) {
  const fails = new Map(), notes = new Map();
  for (const m of list) { for (const h of m.hits) { const k = `${m.kind} drawing: ${h}`; fails.set(k, [...(fails.get(k) || []), m.plate]); } for (const h of m.notes) { const k = `${m.kind} drawing: ${h}`; notes.set(k, [...(notes.get(k) || []), m.plate]); } }
  const sizes = ["wide", "tall"].map((k) => { const l = list.filter((m) => m.kind === k); return l.length ? `${k}: ${l[0].pins} pins, ${l[0].names} names, smallest name ${Math.min(...l.map((m) => m.smallest))}px on a ${Math.min(...l.map((m) => m.plate))}px plate` : ""; }).filter(Boolean).join("; ");
  console.log(`${fails.size ? "FAIL " : "ok   "} ${name}  (${sizes})`);
  for (const [k, w] of fails) { console.log(`        ${k}   [plates ${w.join(", ")}]`); bad += 1; }
  for (const [k, w] of notes) { console.log(`        note: ${k}   [plates ${w.join(", ")}]`); noteCount += 1; }
  for (const k of ["wide", "tall"]) { const s = list.filter((m) => m.kind === k).map((m) => m.smallest).filter((v) => v !== null); if (s.length && Math.min(...s) < 10) { console.log(`        ${k} drawing: the smallest name is ${Math.min(...s)}px on screen (under 10px)`); bad += 1; } }
}
if (rep.consoleErrors.length || rep.brokenImages.length || (rep.failedRequests || []).length) { console.log("FAIL  the test page did not load cleanly:", JSON.stringify({ console: rep.consoleErrors, images: rep.brokenImages, requests: rep.failedRequests })); bad += 1; }
console.log(`\n${doShared ? `shared map on ${sharedPages.length} pages (${sharedPages.join(", ")}); ` : ""}${doTowns.length} town page(s); ${rows.length} drawings measured.`);
console.log(bad ? `MAP CHECK FAILED: ${bad} thing(s) to put right${noteCount ? `, ${noteCount} note(s)` : ""}` : `Map check clean${noteCount ? ` (${noteCount} note(s) above)` : ""}. Picture: shots/fix-pages/w/map-test.jpg`);
process.exit(bad ? 1 : 0);
