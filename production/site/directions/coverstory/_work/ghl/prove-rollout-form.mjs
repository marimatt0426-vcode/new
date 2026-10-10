// prove-rollout-form.mjs : proves that the "rollout form" the fragment tools read (lib.mjs rolloutForm: the built page
// without the footer's one review-build line) is byte for byte what the site builder writes as a ROLLOUT build.
//
//   node _work/ghl/prove-rollout-form.mjs
//
// It builds every registered, built page twice with the real site builder and compares:
//   1. PP_REVIEW=0 node _work/build-site.mjs <pages>     the rollout build; every page is read and hashed
//   2. PP_REVIEW=1 node _work/build-site.mjs <pages>     the review build; rolloutForm() of every page is hashed
//   3. the two hashes must be equal for every page, the rollout pages must hold no review line, and every review page must
//   4. the build that stood on disk before (review or rollout, by _work/partials/site.json and PP_REVIEW) is put back
// Only the pages the site builder already knows are named, so a new page source that is not registered yet is left alone.
// Writes nothing but the built pages themselves (which end as they began). Exit code 0 only when every page agrees.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { HERE, ROOT, read, sha256, rolloutForm, discoverPages } from "./lib.mjs";

const slugs = discoverPages().map((p) => p.slug);
const settings = JSON.parse(read(path.join(HERE, "../partials/site.json")));
const before = process.env.PP_REVIEW !== undefined ? process.env.PP_REVIEW === "1" : settings.review === true;
const build = (review) => {
  const r = spawnSync(process.execPath, [path.join(HERE, "../build-site.mjs"), ...slugs], { cwd: ROOT, env: Object.assign({}, process.env, { PP_REVIEW: review ? "1" : "0" }), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`the site build (PP_REVIEW=${review ? 1 : 0}) ended with exit code ${r.status}:\n${(r.stdout || "").split("\n").slice(-12).join("\n")}\n${r.stderr || ""}`);
  return (r.stdout || "").trim().split("\n").filter((l) => /Review build:|ROLLOUT build:/.test(l)).pop() || "";
};
const page = (slug) => read(path.join(ROOT, slug + ".html"));
let bad = 0;
try {
  const saidRollout = build(false);
  const rollout = new Map(slugs.map((s) => [s, page(s)]));
  const saidReview = build(true);
  for (const s of slugs) {
    const review = page(s), want = rollout.get(s), problems = [];
    if (/foot__review|Review build\./.test(want)) problems.push("the ROLLOUT build still holds the review line");
    if (!/<p class="foot__review">/.test(review)) problems.push("the REVIEW build does not hold the review line");
    if (sha256(rolloutForm(review, s + ".html")) !== sha256(want)) problems.push("the rollout form of the review build is NOT the rollout build");
    if (rolloutForm(want, s + ".html") !== want) problems.push("rolloutForm changes a rollout page");
    if (problems.length) { bad += 1; console.log(`  FAIL ${s}: ${problems.join("; ")}`); }
  }
  console.log(`  the builder said: ${saidRollout.slice(0, 90)}`);
  console.log(`  the builder said: ${saidReview.slice(0, 90)}`);
} finally {
  const said = build(before);
  console.log(`  put back as it was: ${before ? "review build" : "rollout build"} (${said.slice(0, 60)}...)`);
}
console.log(bad ? `RESULT: FAIL (${bad} of ${slugs.length} pages)` : `RESULT: PASS. ${slugs.length} of ${slugs.length} pages: the review build without its one review line is byte for byte the rollout build.`);
process.exit(bad ? 1 : 0);
