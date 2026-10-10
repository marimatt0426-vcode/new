// Runs the AUTHOR'S test suite (../tests) once clean and once per single-place
// fault in pricing-mutations.cjs. The fault is applied in memory by
// pricing-mutate-preload.cjs; no file is written and ../pp-quote-core.js is untouched.
// A fault "survives" when the author's suite still reports zero failures.
//
// Run:  node shared/verify/pricing-author-suite-vs-faults.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const faults = createRequire(import.meta.url)("./pricing-mutations.cjs");
const preload = path.join(here, "pricing-mutate-preload.cjs").replace(/\\/g, "/");
const tests = path.resolve(here, "../tests") + path.sep;

function run(index) {
  const env = Object.assign({}, process.env, { NODE_OPTIONS: "--require " + preload });
  if (index === null) delete env.PP_MUTATION; else env.PP_MUTATION = String(index);
  const result = spawnSync(process.execPath, ["--test", tests], { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const text = String(result.stdout || "") + String(result.stderr || "");
  const number = (name) => { const match = text.match(new RegExp("^. " + name + " (\\d+)", "m")); return match ? Number(match[1]) : null; };
  const failing = Array.from(text.matchAll(/^✖ (.+?) \(\d/gm)).map((m) => m[1]);
  return { tests: number("tests"), pass: number("pass"), fail: number("fail"), failing: Array.from(new Set(failing)), notApplied: /does not apply exactly once/.test(text) };
}

const clean = run(null);
console.log("clean run: tests " + clean.tests + ", pass " + clean.pass + ", fail " + clean.fail);
let survived = 0;
faults.forEach((fault, index) => {
  const outcome = run(index);
  const caught = outcome.fail > 0 && !outcome.notApplied;
  if (!caught) survived += 1;
  console.log((outcome.notApplied ? "NOT APPLIED " : caught ? "caught (" + String(outcome.fail).padStart(3) + " failing)  " : "SURVIVED            ") + fault[0] +
    (caught ? "   e.g. " + (outcome.failing[0] || "") : ""));
});
console.log("\n" + faults.length + " faults: " + (faults.length - survived) + " caught by the author's suite, " + survived + " survived or not applied");
