// Does pricing-check.mjs have teeth? Each entry below breaks the engine in ONE
// place, IN MEMORY ONLY (no file is written, ../pp-quote-core.js is untouched),
// and the checker must then report at least one failure.
//
// Run:  node shared/verify/pricing-mutation-sanity.mjs
import { createRequire } from "node:module";
import { loadWorker, loadEngine } from "./pricing-lib.mjs";
import { runAll } from "./pricing-check.mjs";

const MUTATIONS = createRequire(import.meta.url)("./pricing-mutations.cjs");

const W = loadWorker();
let survived = 0;
const normaliseNewlines = (text) => text.replace(/\r\n/g, "\n");
for (const [label, from, to] of MUTATIONS) {
  let PP;
  try {
    PP = loadEngine((source) => {
      const text = normaliseNewlines(source);
      const count = text.split(from).length - 1;
      if (count !== 1) throw new Error("expected exactly one place to mutate, found " + count);
      return text.replace(from, to);
    });
  } catch (error) {
    console.log("SETUP  " + label + " :: " + error.message);
    survived += 1;
    continue;
  }
  let outcome;
  try {
    const R = await runAll(PP, W, { walkSteps: 6000, sweep: false });
    const first = R.failures.values().next().value;
    outcome = R.failures.size ? "caught   (" + String(R.failures.size).padStart(2) + " distinct) e.g. [" + first.area + "] " + first.title : "SURVIVED";
    if (!R.failures.size) survived += 1;
  } catch (error) {
    outcome = "caught   (checker threw: " + String(error.message).slice(0, 80) + ")";
  }
  console.log(outcome.startsWith("SURVIVED") ? "SURVIVED " + label : outcome + "   <- " + label);
}
console.log("\n" + MUTATIONS.length + " single-place faults, " + (MUTATIONS.length - survived) + " caught, " + survived + " survived or not applied");
process.exit(survived ? 1 : 0);
