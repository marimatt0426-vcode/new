// update-manifest.mjs : rewrites production/SOURCE-MANIFEST.json from the files in production/.
//
//   node production/update-manifest.mjs --source "<where the new or changed files come from and why>"
//        [--date YYYY-MM-DD] [--basis "<one sentence for the manifest's basis line>"] [--fresh <path prefix> ...]
//
// A file whose hash is unchanged keeps its entry. A changed file gets its new hash and the --source text appended to
// its provenance; under a --fresh prefix (a file replaced by an unrelated one of the same name) it gets the --source text
// alone. A new file gets the --source text. A file that is gone leaves the manifest. Explain the change first
// (AGENTS.md); this tool only records it. It lists what git would track (so ignored files stay out) and edits nothing else.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const source = arg("--source");
const fresh = process.argv.flatMap((a, i) => (a === "--fresh" ? [process.argv[i + 1]] : []));
if (!source) { console.error('usage: node production/update-manifest.mjs --source "<provenance of the new or changed files>" [--date YYYY-MM-DD] [--basis "<text>"]'); process.exit(1); }

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const file = path.join(here, "SOURCE-MANIFEST.json");
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const before = new Map(manifest.files.map((f) => [f.path, f]));
const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "production"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\0").filter((p) => p && p !== "production/SOURCE-MANIFEST.json" && fs.existsSync(path.join(root, p))).sort();

let kept = 0, changed = 0, added = 0;
const files = listed.map((p) => {
  const hash = sha(fs.readFileSync(path.join(root, p))), old = before.get(p);
  if (old && old.sha256 === hash) { kept += 1; return old; }
  if (old) { changed += 1; return { path: p, sha256: hash, source: fresh.some((f) => p.startsWith(f)) ? source : old.source.includes(source) ? old.source : `${old.source}; ${source}` }; }
  added += 1; return { path: p, sha256: hash, source };
});
const removed = [...before.keys()].filter((p) => !listed.includes(p)).length;

manifest.files = files;
if (arg("--date")) manifest.date = arg("--date");
if (arg("--basis")) manifest.basis = arg("--basis");
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(`SOURCE-MANIFEST.json: ${files.length} files (${kept} unchanged, ${changed} changed, ${added} added, ${removed} removed).`);
