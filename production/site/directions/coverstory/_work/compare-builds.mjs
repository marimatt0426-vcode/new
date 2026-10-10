// compare-builds.mjs : proves that two builds of a page are the same page in a browser.
//
//   node _work/compare-builds.mjs <old.html> <new.html> [--shots <folder>]
//
// Both files must sit in the coverstory folder (so ../../assets resolves). For a phone (390 by 844) and a desktop
// (1440 by 900) it loads both and compares: the visible text, the element tree (tags, attributes and text; HTML
// comments and white space between tags ignored), the page height, and a screenshot of every screenful, pixel by pixel.
// Exit code 1 if anything differs. Used on 2026-10-08 to retire build-pages.mjs; use it again whenever a shared
// partial is rewritten and the pages must not move.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const puppeteer = createRequire((process.env.PP_PPTR_DIR || "tools/pptr") + "/package.json")("puppeteer-core");
const CHROME = (process.env.PP_CHROME || "chrome");
const args = process.argv.slice(2);
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--shots");
const shotsDir = args.includes("--shots") ? path.resolve(args[args.indexOf("--shots") + 1]) : null;
if (files.length !== 2) { console.error("usage: node _work/compare-builds.mjs <old.html> <new.html> [--shots <folder>]"); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWS = [{ name: "phone-390", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { name: "desktop-1440", width: 1440, height: 900, deviceScaleFactor: 1 }];

// The element tree as text: one line per element or text node. Comments and white-space-only text are left out.
const TREE = `(() => { const out = []; const walk = (n, d) => {
  if (n.nodeType === 3) { const t = n.nodeValue.replace(/\\s+/g, " ").trim(); if (t) out.push(" ".repeat(d) + JSON.stringify(t)); return; }
  if (n.nodeType !== 1) return;
  const attrs = [...n.attributes].map((a) => a.name + "=" + JSON.stringify(a.value)).sort().join(" ");
  out.push(" ".repeat(d) + "<" + n.tagName.toLowerCase() + (attrs ? " " + attrs : "") + ">");
  for (const c of n.childNodes) walk(c, d + 1);
}; walk(document.documentElement, 0); return out.join("\\n"); })()`;

const profile = path.join(((process.env.PP_PPTR_DIR || "tools/pptr") + "/profiles"), "cmp" + process.pid);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", userDataDir: profile, args: ["--hide-scrollbars", "--disable-gpu", "--no-first-run", "--allow-file-access-from-files"] });
let different = 0;
const say = (ok, text) => { if (!ok) different += 1; console.log((ok ? "  same      " : "  DIFFERENT ") + text); };

async function capture(file, view) {
  const page = await browser.newPage();
  const errors = [];
  await page.setViewport(view);
  if (view.isMobile) await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36");
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
  page.on("requestfailed", (r) => errors.push("failed: " + r.url().slice(0, 160)));
  await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: "networkidle2", timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}" });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += view.height) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(120); }   // wake every lazy picture
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  // the tree before the builder script has changed anything would be the file itself; this is the tree a visitor gets
  const tree = await page.evaluate(TREE), text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
  const tiles = [];
  for (let y = 0; y < height; y += view.height) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(350); tiles.push(Buffer.from(await page.screenshot({ type: "png" }))); }
  await page.close();
  return { tree, text, height, tiles, errors };
}
// pixels that differ between two PNG screenshots. The PNGs are decoded here (zlib is part of Node): 8-bit RGB or RGBA,
// not interlaced, which is what Chrome writes.
function pixels(png) {
  let pos = 8, width = 0, height = 0, channels = 0; const data = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos), type = png.toString("ascii", pos + 4, pos + 8), body = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); channels = { 2: 3, 6: 4 }[body[9]]; if (body[8] !== 8 || !channels || body[12]) throw new Error("unexpected PNG format"); }
    if (type === "IDAT") data.push(body);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(data)), stride = width * channels, out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)], row = y * stride, src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[row + x - channels] : 0, up = y ? out[row - stride + x] : 0, upLeft = y && x >= channels ? out[row - stride + x - channels] : 0;
      let predict = 0;
      if (filter === 1) predict = left; else if (filter === 2) predict = up; else if (filter === 3) predict = (left + up) >> 1;
      else if (filter === 4) { const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft); predict = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft; }
      out[row + x] = (raw[src + x] + predict) & 255;
    }
  }
  return { width, height, channels, out };
}
function pixelDiff(a, b) {
  if (Buffer.compare(a, b) === 0) return 0;
  const pa = pixels(a), pb = pixels(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return -1;
  let diff = 0;
  for (let i = 0, j = 0; i < pa.out.length; i += pa.channels, j += pb.channels) if (pa.out[i] !== pb.out[j] || pa.out[i + 1] !== pb.out[j + 1] || pa.out[i + 2] !== pb.out[j + 2]) diff += 1;
  return diff;
}

try {
  console.log(`Comparing ${files[0]} (old) with ${files[1]} (new)`);
  for (const view of VIEWS) {
    console.log(`\n${view.name} (${view.width} by ${view.height})`);
    const oldB = await capture(files[0], view), newB = await capture(files[1], view);
    say(oldB.text === newB.text, `visible text (${newB.text.length} characters, ${newB.text.split(" ").length} words)`);
    say(oldB.tree === newB.tree, `element tree (${newB.tree.split("\n").length} elements and text nodes; tags, attributes, text)`);
    if (oldB.tree !== newB.tree) { const a = oldB.tree.split("\n"), b = newB.tree.split("\n"); const i = a.findIndex((l, k) => l !== b[k]); console.log(`            first difference at node ${i}:\n              old ${a[i]}\n              new ${b[i]}`); }
    say(oldB.height === newB.height, `page height ${newB.height}px` + (oldB.height === newB.height ? "" : ` (old ${oldB.height}px)`));
    say(!oldB.errors.length && !newB.errors.length, "no console errors or failed requests" + (oldB.errors.length || newB.errors.length ? ": " + JSON.stringify([...oldB.errors, ...newB.errors]).slice(0, 300) : ""));
    let worst = 0, total = 0;
    for (let i = 0; i < Math.max(oldB.tiles.length, newB.tiles.length); i += 1) {
      const d = oldB.tiles[i] && newB.tiles[i] ? pixelDiff(oldB.tiles[i], newB.tiles[i]) : -1;
      if (d !== 0) { total += d < 0 ? 1e9 : d; worst = Math.max(worst, d < 0 ? 1e9 : d); console.log(`            screen ${i + 1}: ${d < 0 ? "missing or a different size" : d + " pixels differ"}`); }
      if (shotsDir) { fs.mkdirSync(shotsDir, { recursive: true }); const base = path.basename(files[1], ".html") + "-" + view.name + "-" + String(i + 1).padStart(2, "0");
        if (oldB.tiles[i]) fs.writeFileSync(path.join(shotsDir, base + "-old.png"), oldB.tiles[i]); if (newB.tiles[i]) fs.writeFileSync(path.join(shotsDir, base + "-new.png"), newB.tiles[i]); }
    }
    say(total === 0, `screenshots: ${newB.tiles.length} screens, ${total === 0 ? "every pixel equal" : total + " pixels differ in all"}`);
  }
} finally {
  await browser.close().catch(() => {});
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* nothing to remove */ }
}
console.log(different ? `\n${different} difference(s)` : "\nSAME PAGE: text, element tree, height and every screenshot pixel match on phone and desktop.");
process.exit(different ? 1 : 0);
