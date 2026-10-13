// verify-blocks.mjs : proves that the paste-ready blocks in production/website are exactly what the packaging tool
// makes from the built pages in production/site, then runs the packaging tool's own checker.
//
//   node production/site/verify-blocks.mjs        (npm run test:site)
//
// It writes only to production/site/rollout/ (the packaging tool's output folder, ignored by git).
// Nothing is deployed, pasted or sent anywhere.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tools = path.join(here, "directions/coverstory/_work/ghl");
const made = path.join(here, "rollout/ghl-fragments/production");
const website = path.join(here, "../website");
const failures = [];

function run(tool) {
  const r = spawnSync(process.execPath, [path.join(tools, tool), "production"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(r.stdout + r.stderr); throw new Error(`${tool} production ended with code ${r.status}`); }
  return r.stdout;
}
const undated = (file) => fs.readFileSync(file, "utf8").replace(/"generated":\s*"[^"]*"/g, '"generated": ""');
const same = (a, b, text) => (text ? undated(a) === undated(b) : fs.readFileSync(a).equals(fs.readFileSync(b)));

run("build-fragments.mjs");

// made folder -> where the repository keeps it
const places = [["pages", "pages"], ["shared", "shared"], ["blog", "blog/blocks"]];
let compared = 0;
for (const [from, to] of places) {
  const want = fs.readdirSync(path.join(made, from)).sort();
  for (const name of want) {
    const kept = path.join(website, to, name);
    if (!fs.existsSync(kept)) failures.push(`${to}/${name} is missing from production/website`);
    else if (!same(path.join(made, from, name), kept)) failures.push(`${to}/${name} differs from what the packaging tool makes from the built pages`);
    compared += 1;
  }
  // nothing extra: shared/ also holds the tracking source (head.html, body.html) the packaging tool copies its tags from
  const allowed = new Set([...want, ...(to === "shared" ? ["head.html", "body.html"] : [])]);
  for (const name of fs.readdirSync(path.join(website, to))) if (!allowed.has(name)) failures.push(`${to}/${name} is in production/website but the packaging tool does not make it`);
}
for (const [from, to, text] of [["FIELDS.md", "FIELDS.md", false], ["fields.json", "fields.json", true], ["MANIFEST.json", "BLOCKS-MANIFEST.json", true]]) {
  if (!same(path.join(made, from), path.join(website, to), text)) failures.push(`${to} differs from what the packaging tool writes`);
  compared += 1;
}

const checked = run("check-fragments.mjs");
if (!/RESULT: PASS/.test(checked)) failures.push("check-fragments.mjs did not report PASS");

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(path.join(website, "BLOCKS-MANIFEST.json"), "utf8"));
const waiting = manifest.placeholdersStillInUse.length ? ` Placeholder still in the blocks: ${manifest.placeholdersStillInUse[0]}.` : "";
console.log(`PASS: ${compared} block and field files equal a fresh packaging of the built pages; packaging checker PASS.${waiting}`);
