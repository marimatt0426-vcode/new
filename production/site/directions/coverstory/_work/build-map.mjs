// Draws the two service-area maps (wide for desktop and tablets, tall for phones and narrow columns) from one
// table of places and writes them into kit.html between the MAP START / MAP END markers.
// Run:  node _work/build-map.mjs   then  node _work/build-site.mjs   (it also writes _work/partials/map.html, which the pages use)
// Positions are illustrative: the wide map keeps the projected positions from assets/map/communities.json;
// the tall map is the same places re-set for a 4:5 portrait plate so that every label is at least 11px on a phone.
// After changing a position run  node _work/check-map.mjs  : it measures every label in the browser and lists
// any label that touches another label, a pin, a dot or the I-465 ring.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PIN = "../../assets/brand-icons/pp-local-area.webp";

// name, linked?, wide: [pin centre x, y, label side], tall: [pin centre x, y, label side]
// label side: r (right of the pin), l (left), a (above), b (below), b+ (below, starting at the pin's left edge)
const PLACES = [
  ["Carmel",        1, [293.2, 145.2, "l"],  [156, 152, "l"]],
  ["Fishers",       1, [350.1, 160.4, "r"],  [224, 160, "r"]],
  ["Noblesville",   1, [352.7,  97.5, "a"],  [230,  88, "r"]],
  ["Westfield",     1, [288.0,  99.6, "l"],  [150,  94, "l"]],
  ["Anderson",      1, [531.2,  55.3, "a"],  [338,  54, "l"]],
  ["Avon",          1, [140.1, 297.9, "a"],  [ 64, 318, "a"]],
  ["Brownsburg",    1, [141.1, 240.8, "a"],  [ 72, 250, "a"]],
  ["Danville",      1, [ 71.2, 299.4, "b"],  [ 26, 338, "b+"]],
  ["Fortville",     1, [440.0, 177.8, "r"],  [300, 198, "l"]],
  ["Greenfield",    1, [482.7, 282.0, "r"],  [322, 300, "b"]],
  ["Greenwood",     1, [299.4, 403.5, "r"],  [186, 436, "r"]],
  ["Ingalls",       1, [463.4, 160.3, "r"],  [318, 152, "r"]],
  ["Lawrence",      1, [358.6, 231.1, "r"],  [222, 264, "r"]],
  ["McCordsville",  1, [399.3, 195.0, "b+"], [258, 228, "r"]],
  ["New Palestine", 1, [417.6, 326.8, "r"],  [268, 358, "r"]],
  ["Plainfield",    1, [140.2, 339.4, "b"],  [ 70, 392, "b"]],
  ["Cicero",        1, [350.1,  53.3, "r"],  [228,  46, "l"]],
  ["Lapel",         1, [439.8,  92.6, "r"],  [300, 114, "l"]],
  ["Markleville",   1, [566.8, 156.8, "b"],  [372, 186]],
  ["Pendleton",     1, [498.1, 142.9, "a"],  [344, 124]],
  ["Whitestown",    1, [169.4, 143.0, "a"],  [ 78, 140, "a"]],
  ["Zionsville",    1, [215.0, 175.8, "l"],  [118, 190, "r"]],
  ["Camby",         1, [185.4, 380.1, "l"],  [128, 416]],
  ["Mooresville",   1, [153.9, 415.3, "r"],  [104, 458, "r"]],
  ["Pittsboro",     1, [103.5, 237.4, "l"],  [ 30, 266]],
];
const f = (n) => String(Math.round(n * 10) / 10);

// pin: half-size of the marker the label sits beside
function label(name, cx, cy, side, pin, soft) {
  const cls = soft ? ' class="map__soft"' : "";
  const gap = soft ? 5 : 1;
  if (side === "r") return `<text${cls} x="${f(cx + pin + gap)}" y="${f(cy + (soft ? 4.5 : 9))}" text-anchor="start">${name}</text>`;
  if (side === "l") return `<text${cls} x="${f(cx - pin - gap)}" y="${f(cy + (soft ? 4.5 : 9))}" text-anchor="end">${name}</text>`;
  if (side === "a") return `<text${cls} x="${f(cx)}" y="${f(cy - pin - (soft ? 6 : 5))}" text-anchor="middle">${name}</text>`;
  if (side === "b") return `<text${cls} x="${f(cx)}" y="${f(cy + pin + (soft ? 13 : 14))}" text-anchor="middle">${name}</text>`;
  if (side === "b+") return `<text${cls} x="${f(cx - pin)}" y="${f(cy + pin + 14)}" text-anchor="start">${name}</text>`;
  throw new Error("label side " + side);
}

function wide() {
  const cx = 271.4, cy = 298, r = 89.7, P = 14;
  const blob = "M52 300c-18-52 6-122 62-150 44-22 82-66 150-92 70-27 150-16 226 8 62 20 110 62 116 124 6 60-34 100-92 132-48 26-70 78-126 104-62 29-140 26-204 0-58-24-110-62-132-126Z";
  const out = [];
  out.push('<svg class="map__wide" viewBox="0 0 640 470" role="img" aria-labelledby="map-title map-desc">');
  out.push('<title id="map-title">Purge Pros service area</title>');
  out.push('<desc id="map-desc">An illustrative map of the 26 Central Indiana communities Purge Pros serves, around the I-465 ring. Coverage is decided by ZIP code, not by this map.</desc>');
  out.push(`<path d="${blob}" fill="#c9ecab"/>`);
  out.push(`<path d="${blob}" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="1 12" stroke-linecap="round" opacity=".9"/>`);
  out.push(`<circle class="map__ring" cx="${cx}" cy="${cy}" r="${r}" fill="#dff5c8" stroke="#fff" stroke-width="9"/>`);
  out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#0877b9" stroke-width="2" stroke-dasharray="7 6"/>`);
  out.push(`<text class="map__ring-label" x="${cx}" y="${f(cy - r - 9)}" text-anchor="middle">I-465</text>`);
  for (const [, linked, w] of PLACES) if (!linked) out.push(`<circle class="map__dot" cx="${w[0]}" cy="${w[1]}" r="5" fill="#fff" stroke="#0877b9" stroke-width="2.5"/>`);
  out.push(`<image href="${PIN}" x="${f(cx - 20)}" y="${f(cy - 28.9)}" width="40" height="40"/>`);
  for (const [, linked, w] of PLACES) if (linked) out.push(`<image href="${PIN}" x="${f(w[0] - P)}" y="${f(w[1] - P)}" width="28" height="28"/>`);
  out.push(`<text class="map__big" x="${cx}" y="${f(cy + 30)}" text-anchor="middle">Indianapolis</text>`);
  for (const [name, linked, w] of PLACES) out.push(label(name, w[0], w[1], w[2], linked ? P : 5, !linked));
  out.push("</svg>");
  return out.join("\n");
}

// a smooth closed outline through the given points (Catmull-Rom to cubic Bezier)
function blobPath(pts) {
  const n = pts.length, seg = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    seg.push(`C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`);
  }
  return `M${f(pts[0][0])} ${f(pts[0][1])}` + seg.join("") + "Z";
}

function tall() {
  const cx = 160, cy = 318, r = 68, P = 13;
  const blob = blobPath([[8, 318], [22, 232], [62, 132], [132, 62], [226, 20], [330, 16], [388, 78], [394, 190], [380, 296], [340, 384], [276, 444], [200, 486], [112, 488], [44, 440], [10, 384]]);
  const out = [];
  out.push('<svg class="map__tall" viewBox="0 0 400 500" role="img" aria-labelledby="map-t-title map-t-desc">');
  out.push('<title id="map-t-title">Purge Pros service area</title>');
  out.push('<desc id="map-t-desc">An illustrative map of Indianapolis, the I-465 ring and the 25 nearby communities, each with its own page. Coverage is decided by ZIP code, not by this map.</desc>');
  out.push(`<path d="${blob}" fill="#c9ecab"/>`);
  out.push(`<path d="${blob}" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="1 12" stroke-linecap="round" opacity=".9"/>`);
  out.push(`<circle class="map__ring" cx="${cx}" cy="${cy}" r="${r}" fill="#dff5c8" stroke="#fff" stroke-width="9"/>`);
  out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#0877b9" stroke-width="2" stroke-dasharray="7 6"/>`);
  out.push(`<text class="map__ring-label" x="${cx}" y="${f(cy - r - 9)}" text-anchor="middle">I-465</text>`);
  for (const [, linked, , t] of PLACES) if (!linked) out.push(`<circle class="map__dot" cx="${t[0]}" cy="${t[1]}" r="4.5" fill="#fff" stroke="#0877b9" stroke-width="2.5"/>`);
  out.push(`<image href="${PIN}" x="${f(cx - 19)}" y="${f(cy - 30)}" width="38" height="38"/>`);
  for (const [, linked, , t] of PLACES) if (linked) out.push(`<image href="${PIN}" x="${f(t[0] - P)}" y="${f(t[1] - P)}" width="26" height="26"/>`);
  out.push(`<text class="map__big" x="${cx}" y="${f(cy + 28)}" text-anchor="middle">Indianapolis</text>`);
  for (const [name, linked, , t] of PLACES) if (linked && t[2]) out.push(label(name, t[0], t[1], t[2], P, false));   // a row with no side on this drawing is a pin without a name
  out.push("</svg>");
  return out.join("\n");
}

const START = "<!-- MAP START (drawn by _work/build-map.mjs) -->", END = "<!-- MAP END -->";
const block = START + "\n" + wide() + "\n" + tall() + "\n" + END;
if (process.argv.includes("--print")) { console.log(block); process.exit(0); }
const file = path.join(root, "kit.html");
let kit = fs.readFileSync(file, "utf8");
const a = kit.indexOf(START);
if (a >= 0) kit = kit.slice(0, a) + block + kit.slice(kit.indexOf(END, a) + END.length);
else {
  const s = kit.indexOf('<svg viewBox="0 0 640 470" role="img" aria-labelledby="map-title map-desc">');
  const e = kit.indexOf("</svg>", s);
  if (s < 0 || e < 0) throw new Error("the kit map was not found");
  kit = kit.slice(0, s) + block + kit.slice(e + "</svg>".length);
}
fs.writeFileSync(file, kit);
console.log("kit.html map written:", PLACES.filter((p) => p[1]).length + 1, "linked places,", PLACES.filter((p) => !p[1]).length, "others");

// The pages take the map from _work/partials/map.html (the {{MAP}} token of build-site.mjs): the same plate as the kit's,
// both drawings and the note, written here so the kit and the pages can never show different maps.
{
  const from = kit.indexOf('<div class="map">'), to = kit.indexOf('<div class="areas__list">', from);
  if (from < 0 || to < 0) throw new Error("the map plate was not found in kit.html");
  const withWrapperEnd = kit.slice(from, to).trimEnd();
  const plate = withWrapperEnd.slice(0, withWrapperEnd.lastIndexOf("</div>")).trimEnd();   // without the closing tag of .areas__map
  const note = "<!--# The service-area map plate, page token {{MAP}}. WRITTEN BY node _work/build-map.mjs (which also draws it into kit.html):\n      do not edit by hand. Illustrative only: coverage is decided by ZIP. -->\n";
  fs.writeFileSync(path.join(root, "_work", "partials", "map.html"), note + plate + "\n");
  console.log("_work/partials/map.html written (run node _work/build-site.mjs to put it on the pages)");
}
