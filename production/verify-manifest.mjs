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
assert.equal(sha(fs.readFileSync(path.join(here, 'quote/dist/worker.mjs'))),
  '113ce3beee7ac937605d7da6eb7453052bfe03ee95c92e520e623396bffea95c',
  'Quote rebuild differs from approved October 5 pixel step release');
const metadata = JSON.parse(fs.readFileSync(path.join(here, 'website/pages/metadata.json')));
assert.equal(metadata.routes.length, 27);
for (const route of metadata.routes) assert.ok(fs.existsSync(path.join(here, 'website/pages', route.id + '.html')));
const articles = JSON.parse(fs.readFileSync(path.join(here, 'website/blog/articles/MANIFEST.json')));
assert.equal(articles.articles.length, 45);
for (const article of articles.articles) {
  assert.equal(article.status, 200);
  assert.equal(article.canonical.replace(/\/$/, ''), article.url.replace(/\/$/, ''));
  assert.equal(sha(fs.readFileSync(path.join(here, 'website/blog/articles', article.bodyFile))), article.bodySha256);
  assert.ok(article.cover?.src && article.cover?.alt, 'Missing cover source/alt');
}
console.log(`PASS: ${manifest.files.length} source hashes; exact production Worker rebuild; 27 pages; 45 public article snapshots.`);
