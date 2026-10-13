// candidate-check.mjs : the engine against the quote Worker CANDIDATE (the v5 rollout branch of the production
// repository), as well as against the pinned live source. Reads only; nothing is sent, nothing is deployed.
//
//   node shared/verify/candidate-check.mjs
//   node shared/verify/candidate-check.mjs --src <folder holding the candidate's worker.template.mjs>
//
// What it does:
//   1. Finds the candidate's worker.template.mjs (default: purge-pros-production/production/quote/src, which must be
//      the candidate: it names __PP_BUNDLE_LAUNCHER_JS__ and no longer carries the old widget).
//   2. Makes a scratch folder holding that file and the pinned live widget.js (the candidate branch has no widget; the
//      engine is compared with the live widget's strings either way).
//   3. Runs the whole contract checker (contract-check.mjs: the candidate evaluated WHOLE in process, every request
//      through its real /submit, ledger and save-link code, network tripwires armed) with PP_PRODUCTION_SRC = scratch.
//      Every check must pass.
//   4. Runs the engine's test suite the same way. Exactly the EXPECTED differences may fail (rollout/WORKER-CANDIDATE.md):
//        - the tests' cut-out harness cannot evaluate the candidate's buildV3Forward (it calls termsVersionCheck, which
//          the harness does not cut out; step 3 covers the same ground with the whole Worker);
//        - the candidate builds the saved link from a setting (default https://quote.itspurgepros.com/, today's link),
//          so the old literal line is gone;
//        - the Google Ads label is no longer in the Worker (the old widget carried it; the engine carries it now).
//      Any other failing test is a finding and fails this check.
// Exit code 0 only when step 3 passes whole and step 4 fails nowhere unexpected.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PINNED_LIVE_SRC } from "./pinned-live-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), at = args.indexOf("--src");
const src = at >= 0 ? path.resolve(args[at + 1]) : path.resolve(here, "../../../quote/src");
const workerFile = path.join(src, "worker.template.mjs");
if (!fs.existsSync(workerFile)) { console.log("FAIL  no worker.template.mjs in " + src); process.exit(1); }
const workerText = fs.readFileSync(workerFile, "utf8");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const pinnedSha = sha(fs.readFileSync(path.join(PINNED_LIVE_SRC, "worker.template.mjs")));
if (sha(workerText) === pinnedSha) { console.log("FAIL  " + workerFile + " is the pinned LIVE Worker, not a candidate. Check out the candidate branch or pass --src."); process.exit(1); }
if (!/__PP_BUNDLE_LAUNCHER_JS__/.test(workerText)) console.log("note  this Worker source has no __PP_BUNDLE_LAUNCHER_JS__ placeholder; it may not be the v5 candidate");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pp-candidate-"));
fs.copyFileSync(workerFile, path.join(scratch, "worker.template.mjs"));
fs.copyFileSync(path.join(PINNED_LIVE_SRC, "widget.js"), path.join(scratch, "widget.js"));
const env = Object.assign({}, process.env, { PP_PRODUCTION_SRC: scratch });
console.log("candidate Worker: " + workerFile.replace(/\\/g, "/"));
console.log("         sha256 " + sha(workerText));
console.log("live widget:      " + path.join(PINNED_LIVE_SRC, "widget.js").replace(/\\/g, "/") + " (pinned, commit aa9f81d)");

let failed = 0;
// ---- 3. the contract checker, whole -------------------------------------------------------------------------------
const contract = spawnSync(process.execPath, [path.join(here, "contract-check.mjs")], { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const contractOut = (contract.stdout || "") + (contract.stderr || "");
const contractLast = contractOut.trim().split(/\r?\n/).filter(Boolean).pop() || "(no output)";
const contractFails = contractOut.split(/\r?\n/).filter((l) => /^\s*FAIL\b/.test(l));
console.log("\n1. contract-check.mjs against the candidate (the Worker evaluated whole)");
console.log("   " + contractLast);
for (const l of contractFails) console.log("   " + l.trim());
if (contract.status !== 0 || contractFails.length || !/, 0 failed\. Real network attempts: 0\.$/.test(contractLast)) { failed += 1; console.log("   FINDING: the contract checker does not pass whole against the candidate"); }

// ---- 4. the engine's tests, with the expected differences named ----------------------------------------------------
const EXPECTED = [
  { test: "every intent x reply method x plan: the Worker's own validateV3 accepts the engine's payload", because: /termsVersionCheck is not defined/, why: "the tests' cut-out harness does not carry the candidate's termsVersionCheck (the whole-Worker run above covers it)" },
  { test: "save-link constants match the Worker and the widget", because: /quote\.itspurgepros\.com\/#resume=/, why: "the candidate builds the saved link from SAVED_LINK_BASE (default: today's https://quote.itspurgepros.com/)" },
  { test: "the Google Ads label and allowed origins match the Worker source", because: /GOOGLE_ADS_SEND_TO/, why: "the Google Ads label left the Worker with the old widget; the engine carries it" },
];
const suite = spawnSync(process.execPath, ["--test", "--test-reporter=tap", path.resolve(here, "../tests/")], { env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const tap = (suite.stdout || "") + (suite.stderr || "");
const count = (name) => { const m = new RegExp("^# " + name + " (\\d+)", "m").exec(tap); return m ? Number(m[1]) : -1; };
// top-level failures only (a file's own summary line is a subtest holder, not a test)
const notOk = [];
const lines = tap.split(/\r?\n/);
for (let i = 0; i < lines.length; i += 1) {
  const m = /^(\s*)not ok \d+ - (.*)$/.exec(lines[i]);
  if (!m) continue;
  let block = "";
  for (let j = i + 1; j < lines.length && !/^\s*(not ok|ok) \d+ - /.test(lines[j]) && j < i + 60; j += 1) block += lines[j] + "\n";
  notOk.push({ name: m[2].trim(), block });
}
const real = notOk.filter((f) => !/\.test\.mjs$|index\.js$/.test(f.name) && !/type: 'suite'|subtestsFailed|type: 'test'[\s\S]*failureType: 'subtestsFailed'/.test(f.block));
console.log("\n2. node --test shared/tests/ against the candidate");
console.log(`   tests ${count("tests")} · pass ${count("pass")} · fail ${count("fail")}`);
const unexpected = [];
for (const f of real) {
  const e = EXPECTED.find((x) => x.test === f.name && x.because.test(f.block));
  if (e) console.log("   expected difference: \"" + f.name + "\"\n       " + e.why);
  else { unexpected.push(f); console.log("   FINDING: \"" + f.name + "\"\n" + f.block.split("\n").slice(0, 12).map((l) => "       " + l).join("\n")); }
}
const missing = EXPECTED.filter((e) => !real.some((f) => f.name === e.test));
for (const e of missing) console.log("   note: the expected difference \"" + e.test + "\" did not appear (the candidate or the tests changed; update this list)");
if (unexpected.length || count("tests") < 0 || count("fail") !== real.length) { failed += 1; if (count("fail") !== real.length) console.log(`   FINDING: ${count("fail")} failing tests counted by the runner, ${real.length} read from its output`); }

fs.rmSync(scratch, { recursive: true, force: true });
console.log(failed ? `\nRESULT: FAIL (${failed} part(s) with a finding)` : `\nRESULT: PASS. The engine agrees with the Worker candidate; the only differences are the ${real.length} expected ones.`);
process.exit(failed ? 1 : 0);
