// VERIFIER FILE. Do the tracking tests have teeth? Each entry of tracking-mutations.cjs breaks the engine's
// 1.4.0 additions in ONE place, IN MEMORY ONLY (no file is written, ../pp-quote-core.js is untouched), and the
// four test files that cover them must then report at least one failure.
//   node "production/site/shared/verify/tracking-mutation-sanity.mjs"
// Offline: it only runs the test suite, which is offline by construction. Takes a minute or two.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const list = createRequire(import.meta.url)("./tracking-mutations.cjs");
const files = ["tracking.test.mjs", "funnel-events.test.mjs", "attribution-kept.test.mjs", "browser-and-hooks.test.mjs"].map((name) => path.join(here, "..", "tests", name));
const preload = path.join(here, "tracking-mutate-preload.cjs");

function runOne(index) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--require", preload, "--test", ...files], { env: Object.assign({}, process.env, { PP_TRACKING_MUTATION: String(index) }) });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { out += chunk; });
    child.on("close", () => {
      const failed = /^ℹ fail (\d+)$/m.exec(out);
      const notApplied = /does not apply exactly once/.test(out);
      const first = /^✖ (.*)$/m.exec(out);
      resolve({ index, failed: failed ? Number(failed[1]) : -1, notApplied, first: first ? first[1].replace(/ \(\d+(\.\d+)?ms\)$/, "").slice(0, 80) : "" });
    });
  });
}

// The suite must be clean before any fault means anything.
const clean = await runOne(-1);
if (clean.failed !== 0) { console.log("The unbroken engine does not pass these tests (" + clean.failed + " failed): fix that first."); process.exit(1); }

const queue = list.map((unused, index) => index);
const results = [];
async function worker() { while (queue.length) results.push(await runOne(queue.shift())); }
await Promise.all(Array.from({ length: Math.max(1, Math.min(6, os.cpus().length)) }, worker));
results.sort((a, b) => a.index - b.index);

let caught = 0, secondGuards = 0, unexpected = 0;
for (const result of results) {
  const [label, , , kind] = list[result.index];
  if (result.notApplied) { unexpected += 1; console.log("SETUP    " + label + " :: the text to break was not found exactly once"); }
  else if (result.failed > 0) { caught += 1; console.log("caught   (" + String(result.failed).padStart(2) + " tests)   " + label + "   <- " + result.first); }
  else if (kind === "second guard") { secondGuards += 1; console.log("guarded  (second guard, cannot be reached through the public API)   " + label); }
  else { unexpected += 1; console.log("SURVIVED " + label); }
}
console.log("\n" + list.length + " single-place faults: " + caught + " caught, " + secondGuards + " second guards that cannot be reached, " + unexpected + " survived or not applied");
process.exit(unexpected ? 1 : 0);
