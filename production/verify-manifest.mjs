import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'SOURCE-MANIFEST.json')));
for (const file of manifest.files) {
  const target = path.resolve(root, file.path);
  assert.ok(target.startsWith(here + path.sep), 'Manifest path escapes production');
  assert.equal(sha(fs.readFileSync(target)), file.sha256, `Source changed: ${file.path}; reconcile provenance before updating its hash`);
}
// The October 5 release, live until a deployment is approved, stays in the tree as the regression reference.
assert.equal(sha(fs.readFileSync(path.join(here, 'quote/tests/fixtures/2026-10-05-live-worker.mjs'))),
  '113ce3beee7ac937605d7da6eb7453052bfe03ee95c92e520e623396bffea95c',
  'Regression reference is not the October 5 pixel step release');
// The quote Worker prepared on branch ghl-handoff-reply-log (October 15, 2026; prepared and locally tested, not deployed):
// the Worker of build v5-20261013 (deployed October 13, 2026, SHA-256 235713cd...2300: ZIP 46290, the optional "Who sent you?"
// name, the read-only request status operation) plus one log line when the hand-off to GoHighLevel fails (ghl_handoff_failed).
assert.equal(sha(fs.readFileSync(path.join(here, 'quote/dist/worker.mjs'))),
  "06b43e9d5b56a0a6479fa79de1bd70a5f525e02bb66ad739124f66efcd47e50f",
  'Quote rebuild differs from the prepared hand-off log candidate; run npm run build, or reconcile before updating this hash');
// The rebuilt website (v5): the paste-ready blocks, their field sheet and the hosted files they name.
// Prepared and locally tested; not installed until the owner approves the switch (OPERATIONS.md).
const fields = JSON.parse(fs.readFileSync(path.join(here, 'website/fields.json')));
const blocks = JSON.parse(fs.readFileSync(path.join(here, 'website/BLOCKS-MANIFEST.json')));
const listed = new Set(manifest.files.map(f => f.path));
const kept = file => 'website/' + (file.startsWith('blog/') ? 'blog/blocks/' + file.slice(5) : file);
assert.equal(fields.profile, 'production');
assert.equal(blocks.profile, 'production');
assert.equal(fields.pages.length, 40, 'Expected 38 website pages and the two blog templates');
assert.equal(fields.pages.filter(p => p.where === 'website page').length, 38);
for (const page of fields.pages) {
  for (const block of [...page.pasteBodyBlocks, ...(page.typeThese.schemaFile ? [page.typeThese.schemaFile] : [])]) {
    if (/NATIVE/.test(block)) continue;
    assert.ok(fs.existsSync(path.join(here, kept(block))), `Missing block ${block} of page ${page.slug}`);
  }
}
for (const block of blocks.blocks) {
  assert.equal(sha(fs.readFileSync(path.join(here, kept(block.file)))), block.sha256, `Block changed without repackaging: ${block.file}`);
  assert.ok(listed.has('production/' + kept(block.file)), `Block not in SOURCE-MANIFEST.json: ${block.file}`);
}
assert.deepEqual(blocks.uploadList.missing, []);
for (const file of blocks.uploadList.files) {
  assert.equal(sha(fs.readFileSync(path.join(here, 'site', file.path))), file.sha256, `Hosted file differs from the one the blocks were packaged with: ${file.path}`);
}
const placeholder = blocks.placeholdersStillInUse.length ? `; placeholder still in use: ${blocks.placeholdersStillInUse[0]}` : '';
const articles = JSON.parse(fs.readFileSync(path.join(here, 'website/blog/articles/MANIFEST.json')));
assert.equal(articles.articles.length, 45);
for (const article of articles.articles) {
  assert.equal(article.status, 200);
  assert.equal(article.canonical.replace(/\/$/, ''), article.url.replace(/\/$/, ''));
  assert.equal(sha(fs.readFileSync(path.join(here, 'website/blog/articles', article.bodyFile))), article.bodySha256);
  assert.ok(article.cover?.src && article.cover?.alt, 'Missing cover source/alt');
}
console.log(`PASS: ${manifest.files.length} source hashes; exact quote Worker candidate rebuild; ${fields.pages.length} pages in ${blocks.blocks.length} blocks; ${blocks.uploadList.files.length} hosted files${placeholder}; 45 public article snapshots.`);
