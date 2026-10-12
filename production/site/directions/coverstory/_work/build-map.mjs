// Draws the two service-area maps (wide for desktop and tablets, tall for phones and narrow columns) from one
// table of places and writes them into kit.html between the MAP START / MAP END markers.
// Run:  node _work/build-map.mjs   then  node _work/build-site.mjs   (it also writes _work/partials/map.html, which the pages use)
// Positions are illustrative: the wide map keeps the projected positions from assets/map/communities.json;
// the tall map is the same places re-set for a 4:5 portrait plate (names 13px on a 390px phone, 10.4px on a 320px one).
// EVERY pin carries its town's name on BOTH drawings, and every pin stands inside the shaded shape (October 12, 2026).
// After changing a position, a side or a shape run  node _work/check-map.mjs  : it measures every map in the browser
// and FAILS when a pin has no name, a name touches another name, a pin, a dot or the I-465 ring, or a pin lies outside
// the shape. The town pages draw their maps from this table and these shapes (_work/city-map.mjs reads them): after a
// change here run  node _work/city-map.mjs <slug> --write  for every town page, then  node _work/build-site.mjs .
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PIN = "../../assets/brand-icons/pp-local-area.webp";

// name, linked?, wide: [pin centre x, y, label side], tall: [pin centre x, y, label side]
// label side: r (right of the pin), l (left), a (above), b (below), b+ (below, starting at the pin's left edge),
//             b- (below, ending at the pin's right edge), a+ and a- (the same above), r^ and l^ (beside the pin's
//             head instead of its point). Every row needs a side on both drawings: a pin is never left without its name.
const PLACES = [
  ["Carmel",        1, [293.2, 145.2, "l"],  [167, 152, "l"]],
  ["Fishers",       1, [350.1, 160.4, "r"],  [210, 141, "r"]],
  ["Noblesville",   1, [352.7,  97.5, "a"],  [215,  88, "r"]],
  ["Westfield",     1, [288.0,  99.6, "l"],  [150,  94, "l"]],
  ["Anderson",      1, [531.2,  55.3, "a"],  [346,  49, "l"]],
  ["Avon",          1, [140.1, 297.9, "a"],  [ 64, 318, "l"]],
  ["Brownsburg",    1, [141.1, 240.8, "a"],  [ 60, 240, "a"]],
  ["Danville",      1, [ 71.2, 299.4, "b"],  [ 27, 348, "b+"]],
  ["Fortville",     1, [440.0, 177.8, "r"],  [307, 190, "l"]],
  ["Greenfield",    1, [482.7, 282.0, "r"],  [322, 301, "b"]],
  ["Greenwood",     1, [299.4, 403.5, "r"],  [186, 437, "r"]],
  ["Ingalls",       1, [463.4, 160.3, "r"],  [318, 152, "r"]],
  ["Lawrence",      1, [358.6, 231.1, "r"],  [222, 264, "r"]],
  ["McCordsville",  1, [399.3, 195.0, "b+"], [250, 228, "r"]],
  ["New Palestine", 1, [417.6, 326.8, "r"],  [268, 358, "r"]],
  ["Plainfield",    1, [140.2, 339.4, "b"],  [ 70, 405, "b"]],
  ["Cicero",        1, [350.1,  53.3, "r"],  [224,  46, "l"]],
  ["Lapel",         1, [439.8,  92.6, "r"],  [291, 123, "l"]],
  ["Markleville",   1, [566.8, 156.8, "b"],  [372, 191, "b-"]],
  ["Pendleton",     1, [498.1, 142.9, "a"],  [350, 124, "a"]],
  ["Whitestown",    1, [169.4, 143.0, "a"],  [ 78, 148, "a"]],
  ["Zionsville",    1, [215.0, 175.8, "l"],  [131, 190, "r"]],
  ["Camby",         1, [185.4, 380.1, "l"],  [128, 407, "r"]],
  ["Mooresville",   1, [153.9, 415.3, "r"],  [115, 464, "r"]],
  ["Pittsboro",     1, [103.5, 237.4, "l"],  [ 34, 269, "b+"]],
];
// The shaded service area of each drawing: the wide one a path, the tall one the points of a smooth outline
// (blobPath). Every pin stands inside its shape with room to spare. _work/city-map.mjs reads these two lines.
const SHAPE_WIDE = "M46 300C30 248 58 178 114 150C158 128 196 80 262 52C336 22 430 8 500 14C566 20 610 84 610 168C610 240 572 290 514 322C466 348 444 400 388 426C326 455 236 472 168 452C102 432 62 352 46 300Z";
const SHAPE_TALL = [[8, 318], [22, 232], [62, 132], [132, 62], [226, 20], [330, 16], [388, 78], [394, 190], [380, 296], [340, 384], [276, 444], [200, 486], [112, 488], [44, 440], [10, 384]];
// what a screen reader is told (the same sentence on both drawings; the count is the table's own)
const TOWNS = PLACES.filter((p) => p[1]).length;
const DESC = `An illustrative map of Indianapolis, the I-465 ring and the ${TOWNS} nearby communities, each with its own page. Coverage is decided by ZIP code, not by this map.`;
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
  if (side === "b-") return `<text${cls} x="${f(cx + pin)}" y="${f(cy + pin + 14)}" text-anchor="end">${name}</text>`;
  if (side === "a+") return `<text${cls} x="${f(cx - pin)}" y="${f(cy - pin - 5)}" text-anchor="start">${name}</text>`;
  if (side === "a-") return `<text${cls} x="${f(cx + pin)}" y="${f(cy - pin - 5)}" text-anchor="end">${name}</text>`;
  if (side === "r^") return `<text${cls} x="${f(cx + pin + gap)}" y="${f(cy + 3)}" text-anchor="start">${name}</text>`;
  if (side === "l^") return `<text${cls} x="${f(cx - pin - gap)}" y="${f(cy + 3)}" text-anchor="end">${name}</text>`;
  throw new Error(`build-map: ${name} has ${side ? `the label side "${side}", which is not one of r, l, a, b, b+, b-, a+, a-, r^, l^` : "no label side: every pin carries its town's name on both drawings"}`);
}

function wide() {
  const cx = 271.4, cy = 298, r = 89.7, P = 14;
  const blob = SHAPE_WIDE;
  const out = [];
  out.push('<svg class="map__wide" viewBox="0 0 640 470" role="img" aria-labelledby="map-title map-desc">');
  out.push('<title id="map-title">Purge Pros service area</title>');
  out.push(`<desc id="map-desc">${DESC}</desc>`);
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
  const blob = blobPath(SHAPE_TALL);
  const out = [];
  out.push('<svg class="map__tall" viewBox="0 0 400 500" role="img" aria-labelledby="map-t-title map-t-desc">');
  out.push('<title id="map-t-title">Purge Pros service area</title>');
  out.push(`<desc id="map-t-desc">${DESC}</desc>`);
  out.push(`<path d="${blob}" fill="#c9ecab"/>`);
  out.push(`<path d="${blob}" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="1 12" stroke-linecap="round" opacity=".9"/>`);
  out.push(`<circle class="map__ring" cx="${cx}" cy="${cy}" r="${r}" fill="#dff5c8" stroke="#fff" stroke-width="9"/>`);
  out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#0877b9" stroke-width="2" stroke-dasharray="7 6"/>`);
  out.push(`<text class="map__ring-label" x="${cx}" y="${f(cy - r - 9)}" text-anchor="middle">I-465</text>`);
  for (const [, linked, , t] of PLACES) if (!linked) out.push(`<circle class="map__dot" cx="${t[0]}" cy="${t[1]}" r="4.5" fill="#fff" stroke="#0877b9" stroke-width="2.5"/>`);
  out.push(`<image href="${PIN}" x="${f(cx - 19)}" y="${f(cy - 30)}" width="38" height="38"/>`);
  for (const [, linked, , t] of PLACES) if (linked) out.push(`<image href="${PIN}" x="${f(t[0] - P)}" y="${f(t[1] - P)}" width="26" height="26"/>`);
  out.push(`<text class="map__big" x="${cx}" y="${f(cy + 28)}" text-anchor="middle">Indianapolis</text>`);
  for (const [name, linked, , t] of PLACES) if (linked) out.push(label(name, t[0], t[1], t[2], P, false));   // a row with no side stops the build: no pin without its name
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
