import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, "$1:"));
const prepared = path.join(here, "prepared");
const inventoryPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(here, "published-cards.json");
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const expectedPosts = inventory.posts;
if (!Array.isArray(expectedPosts) || expectedPosts.length === 0) throw new Error("Inventory must contain a non-empty posts array.");
const files = fs.readdirSync(prepared).filter((name) => /\.(?:html|css|js)$/.test(name));
const text = Object.fromEntries(files.map((name) => [name, fs.readFileSync(path.join(prepared, name), "utf8")]));
const joined = Object.values(text).join("\n");
const failures = [];

for (const forbidden of ["noindex", "pp-environment", "staging-routes", "staging-bootstrap", "#pp-staging-quote", "data-pbn-staging-route", "?notrack=true"]) {
  if (joined.includes(forbidden)) failures.push(`forbidden staging token remains: ${forbidden}`);
}
for (const file of ["home-header.html", "home-header-and-index.html", "post-before.html"]) {
  if (!text[file]?.includes("revision-2-theme-bff7357b4799b11f.css")) failures.push(`${file} lacks production BFF theme`);
  if (!text[file]?.includes("blog-r2-d5af1780ac0cca4a.css")) failures.push(`${file} lacks production blog CSS`);
}
for (const file of ["home-header.html", "home-footer.html", "post-before.html", "post-after.html"]) {
  if (!text[file]?.includes("data-purge-quote")) failures.push(`${file} lacks quote launch hook`);
  if (!text[file]?.includes("https://quote.itspurgepros.com/?open_quote=1")) failures.push(`${file} lacks production quote fallback`);
}
const cards = [...text["home-index.html"].matchAll(/<article class="pbr2-card"\s/g)].length;
const slugs = [...text["home-index.html"].matchAll(/https:\/\/blog\.itspurgepros\.com\/post\/([a-z0-9-]+)/g)].map((m) => m[1]);
const unique = new Set(slugs);
if (cards !== expectedPosts.length) failures.push(`expected ${expectedPosts.length} index cards from inventory, found ${cards}`);
if (unique.size !== expectedPosts.length) failures.push(`expected ${expectedPosts.length} unique article slugs from inventory, found ${unique.size}`);
if (!text["post-before.html"].includes("pbr2-breadcrumb")) failures.push("post-before lacks article breadcrumb");
if (!text["post-after.html"].includes("pbr2-cta")) failures.push("post-after lacks article CTA");
if (!text["blog-head-tracking.html"].includes("AW-17767139897") || !text["blog-head-tracking.html"].includes("770811879146972") || !text["blog-head-tracking.html"].includes("purge-quote.js")) failures.push("blog head tracking lacks preserved Google, Meta or quote tag");
if (text["blog-head-tracking.html"].includes("application/ld+json")) failures.push("blog head tracking must not include main website schema");
if (!text["blog-body-tracking.html"].includes("production-bootstrap-3168ae9355832820.js") || !text["blog-body-tracking.html"].includes("blog-r2-ed911b97fb10aab3.js")) failures.push("blog body tracking lacks production bootstrap or blog runtime");
if (!text["post-custom-css.css"].includes("object-fit:contain")) failures.push("post custom CSS does not preserve whole covers");

const manifest = files.map((name) => {
  const bytes = fs.readFileSync(path.join(prepared, name));
  return { path: name, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
});
fs.writeFileSync(path.join(here, "prepared-files.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2)}\n`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`PASS: ${files.length} prepared files; ${cards} cards; ${unique.size} unique slugs; inventory ${inventoryPath}; no staging-only tokens.`);
