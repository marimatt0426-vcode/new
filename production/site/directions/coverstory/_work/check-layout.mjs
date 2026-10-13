// Layout check of the built pages in a real browser, at phone, tablet and desktop sizes.
// Run:  node _work/check-layout.mjs                  every built page of the thirty (exit code 1 if anything is a problem)
//       node _work/check-layout.mjs carmel fishers   only these pages (about 40 seconds a page)
//       node _work/check-layout.mjs --verbose        also prints every grid's rows and every heading's alignment
// It reports: one section rhythm, heading alignment (all centred under 900px; the documented left/centre system above),
// grids with an unfilled last row, text under 12.5px, tap targets under 44px outside the builder,
// images drawn at the wrong proportions, a hero pose that does not stand on its lawn (or a drawn hero taller than 62% of a
// desktop window, a spark cut by the price card, stacked hero buttons of unequal width), sideways scroll, console errors,
// failed requests and broken images.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { builtFiles } from "./site-lib.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probe = fs.readFileSync(path.join(root, "_work", "probe-page.js"), "utf8");
const verbose = process.argv.includes("--verbose");
const named = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((a) => a.replace(/[.]html$/, "") + ".html");
const PAGES = named.length ? named : builtFiles().pages;
for (const page of PAGES) if (!fs.existsSync(path.join(root, page))) { console.error(page + ": no built page of that name. Build it first: node _work/build-site.mjs"); process.exit(1); }
const SIZES = [[360, 740, true], [390, 844, true], [768, 1024, false], [1024, 768, false], [1366, 768, false], [1440, 900, false]];
const GAP = (w) => (w < 700 ? 85 : w < 1000 ? 112 : 128);
const tmp = path.join(root, "shots", "check", "_layout-probe-" + process.pid + ".jpg");
fs.mkdirSync(path.dirname(tmp), { recursive: true });
let bad = 0;
const flag = (m) => { bad += 1; console.log("    PROBLEM " + m); };
for (const page of PAGES) {
  for (const [w, h, phone] of SIZES) {
    const args = [((process.env.PP_PPTR_DIR || "tools/pptr") + "/shot.mjs"), "--url", path.join(root, page), "--out", tmp, "--no-motion", "--steps", JSON.stringify([{ eval: probe }])];
    if (phone && w === 390) args.push("--mobile"); else args.push("--w", String(w), "--h", String(h));
    const out = execFileSync("node", args, { encoding: "utf8", maxBuffer: 1 << 26 });
    const rep = JSON.parse(out.slice(out.indexOf("{")));
    const d = JSON.parse(rep.evals[0]);
    console.log(`${page} ${w}x${h}: page ${rep.pageHeight}px, gaps ${[...new Set(d.gaps)].join("/")}, ${d.heads.length} headings, ${d.grids.length} grids`);
    if (rep.consoleErrors.length) flag("console errors " + JSON.stringify(rep.consoleErrors).slice(0, 300));
    if (rep.failedRequests.length) flag("failed requests " + JSON.stringify(rep.failedRequests).slice(0, 300));
    if (rep.brokenImages.length) flag("broken images " + JSON.stringify(rep.brokenImages).slice(0, 300));
    if (rep.horizontalOverflow || d.overflowX) flag("sideways scroll");
    if (d.h1.length !== 1) flag("h1 count " + d.h1.length);
    for (const g of d.gaps) if (Math.abs(g - GAP(w)) > 1.5) { flag(`section gap ${g}px (the rhythm at this width is ${GAP(w)}px): all gaps ${d.gaps.join(" ")}`); break; }
    if (w < 900) { for (const hd of d.heads) if (!hd.centred) flag(`heading not centred on one column: ${hd.id} (left ${hd.left})`); }
    else { const edge = Math.max(40, (w - 1200) / 2); for (const hd of d.heads) if (!hd.centred && Math.abs(hd.left - edge) > 2 && Math.abs(hd.left - (edge + (Math.min(w, 1280) - 80 - 11 * 24) / 12 * 7 + 7 * 24)) > 3) flag(`heading edge off the system: ${hd.id} at ${hd.left}`); }
    for (const g of d.grids) if (g.orphan) flag(`grid with an unfilled last row: ${g.g} rows ${g.rows}`);
    for (const s of d.small) flag("text under 12.5px: " + s);
    for (const t of d.taps) flag("tap target under 44px: " + t);
    for (const s of d.stretched) flag("image out of proportion: " + s);
    for (const s of d.hero || []) flag("hero: " + s);
    if (verbose) { console.log("    headings: " + d.heads.map((x) => x.id + ":" + (x.centred ? "centre" : x.left)).join("  ")); console.log("    grids: " + d.grids.map((x) => x.g + " " + x.rows).join(" | ")); }
  }
}
try { fs.unlinkSync(tmp); } catch (_) { /* nothing to remove */ }
console.log(bad ? `\n${bad} problem(s)` : "\nLayout check clean: one rhythm, one heading alignment per width, no orphan, no small text, no small tap target, no stretched image, every hero pose on its lawn.");
process.exit(bad ? 1 : 0);
