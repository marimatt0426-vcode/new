// Measures the two maps in the browser: every label against every other label, pin, dot and the I-465 ring,
// and the rendered label size at the widths the map is shown at. Run:  node _work/check-map.mjs
// It writes _work/.map-test.html (deleted afterwards) and screenshots into shots/fix-pages/w/.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kit = fs.readFileSync(path.join(root, "kit.html"), "utf8");
const a = kit.indexOf("<!-- MAP START"), b = kit.indexOf("<!-- MAP END -->");
if (a < 0 || b < 0) throw new Error("run build-map.mjs first");
const svgs = kit.slice(a, b);
const widths = [588, 540, 448, 358, 328];   // desktop column, 1180 column, 1000 column, 390 phone, 360 phone
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="../css/site.css"></head>
<body style="margin:0;padding:16px;background:#e8f6da;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
${widths.map((w) => `<div style="width:${w}px"><div class="map">${svgs.replace(/id="map-/g, `id="m${w}-`).replace(/aria-labelledby="[^"]*"/g, "").replace(/\.\.\/\.\.\/assets/g, "../../../assets")}<p class="map__note">${w}px wide</p></div></div>`).join("\n")}
</body></html>`;
const test = path.join(root, "_work", ".map-test.html");
fs.writeFileSync(test, html);
const probe = `(async () => {
  await document.fonts.ready;
  const res = [];
  for (const map of document.querySelectorAll(".map")) {
    const w = map.parentElement.style.width;
    for (const svg of map.querySelectorAll("svg")) {
      if (getComputedStyle(svg).display === "none") continue;
      const kind = svg.classList.contains("map__tall") ? "tall" : "wide";
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      const texts = [...svg.querySelectorAll("text")], boxes = [];
      for (const t of texts) { const r = t.getBBox(); boxes.push({ name: t.textContent, x0: r.x, y0: r.y + 2.5, x1: r.x + r.width, y1: r.y + r.height - 2.5, t: "label", px: parseFloat(getComputedStyle(t).fontSize) * scale }); }
      for (const im of svg.querySelectorAll("image")) { const r = im.getBBox(); boxes.push({ name: "pin@" + Math.round(r.x + r.width / 2) + "," + Math.round(r.y + r.height / 2), x0: r.x + 3, y0: r.y + 1, x1: r.x + r.width - 3, y1: r.y + r.height - 1, t: "pin" }); }
      for (const d of svg.querySelectorAll(".map__dot")) { const cx = +d.getAttribute("cx"), cy = +d.getAttribute("cy"); boxes.push({ name: "dot@" + cx + "," + cy, x0: cx - 6, y0: cy - 6, x1: cx + 6, y1: cy + 6, t: "dot" }); }
      const ring = svg.querySelector(".map__ring"), rc = { x: +ring.getAttribute("cx"), y: +ring.getAttribute("cy"), r: +ring.getAttribute("r") };
      const vb = svg.viewBox.baseVal, hits = [];
      const labels = boxes.filter((q) => q.t === "label");
      for (const l of labels) {
        for (const o of boxes) { if (o === l || (o.t === "label" && labels.indexOf(o) < labels.indexOf(l))) continue;
          const own = o.t !== "label" && Math.abs((o.x0 + o.x1) / 2 - (l.x0 + l.x1) / 2) < 1 && false;
          if (!own && l.x0 < o.x1 + 1 && l.x1 > o.x0 - 1 && l.y0 < o.y1 + 1 && l.y1 > o.y0 - 1) hits.push(l.name + " x " + o.name); }
        if (l.name !== "Indianapolis") {   // ring: sample points along the label box edges
          let near = false;
          for (let i = 0; i <= 20 && !near; i += 1) for (const yy of [l.y0, (l.y0 + l.y1) / 2, l.y1]) { const xx = l.x0 + (l.x1 - l.x0) * i / 20; const d = Math.hypot(xx - rc.x, yy - rc.y); if (Math.abs(d - rc.r) < 7) near = true; }
          if (near) hits.push(l.name + " x RING");
        }
        if (l.x0 < 4 || l.x1 > vb.width - 4 || l.y0 < 4 || l.y1 > vb.height - 4) hits.push(l.name + " x EDGE");
      }
      for (const p of boxes.filter((q) => q.t === "pin")) { const cx = (p.x0 + p.x1) / 2, by = p.y1; const d = Math.hypot(cx - rc.x, (p.y0 + p.y1) / 2 - rc.y); if (Math.abs(d - rc.r) < 12 ) hits.push(p.name + " x RING"); }
      const pins = boxes.filter((q) => q.t !== "label");
      for (let i = 0; i < pins.length; i += 1) for (let j = i + 1; j < pins.length; j += 1) { const p = pins[i], o = pins[j]; if (p.x0 < o.x1 && p.x1 > o.x0 && p.y0 < o.y1 && p.y1 > o.y0) hits.push(p.name + " x " + o.name); }
      const sizes = labels.map((l) => l.px);
      res.push({ width: w, map: kind, smallestLabelPx: +Math.min(...sizes).toFixed(1), hits });
    }
  }
  return JSON.stringify(res);
})()`;
const out = path.join(root, "shots", "fix-pages", "w", "map-test.jpg");
const r = execFileSync("node", [((process.env.PP_PPTR_DIR || "tools/pptr") + "/shot.mjs"), "--url", test, "--out", out, "--w", "1440", "--h", "1250", "--steps", JSON.stringify([{ eval: probe }])], { encoding: "utf8" });
fs.unlinkSync(test);
const rep = JSON.parse(r.slice(r.indexOf("{")));
let bad = 0;
for (const m of JSON.parse(rep.evals[0])) { console.log(`${m.width} ${m.map}: smallest label ${m.smallestLabelPx}px` + (m.hits.length ? "\n   " + m.hits.join("\n   ") : "  (no label touches anything)")); bad += m.hits.length; }
if (rep.consoleErrors.length || rep.brokenImages.length) { console.log("errors", rep.consoleErrors, rep.brokenImages); bad += 1; }
console.log(bad ? "\n" + bad + " thing(s) to look at" : "\nMap check clean. Screenshot: shots/fix-pages/w/map-test.jpg");
process.exit(bad ? 1 : 0);
