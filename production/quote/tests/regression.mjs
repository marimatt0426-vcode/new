import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(process.argv[2] || path.join(here, 'fixtures', 'pre-icons-worker.mjs'));
const candidatePath = path.resolve(process.argv[3] || path.join(here, '..', 'dist', 'worker.mjs'));
const evidencePath = path.join(here, '..', 'test-output', 'REGRESSION.json');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(file, 'utf8');

const REQUIRED_KEYS = [
  'dog-1', 'dog-2', 'dog-3', 'dog-4', 'dog-5', 'dog-6', 'dog-7', 'dog-8', 'dog-9', 'dog-10plus',
  'frequency-twice-weekly', 'frequency-weekly', 'frequency-every-other-week', 'frequency-one-time', 'frequency-custom',
  'area-back', 'area-front', 'area-sides', 'area-all'
];

function bundledString(source, name) {
  const marker = `var ${name} = `;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing ${name}`);
  const literalStart = markerIndex + marker.length;
  const quote = source[literalStart];
  let escaped = false;
  let literalEnd = -1;
  for (let index = literalStart + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character === quote) { literalEnd = index + 1; break; }
  }
  assert.notEqual(literalEnd, -1, `Unterminated ${name}`);
  return JSON.parse(source.slice(literalStart, literalEnd));
}

function replaceBundledString(source, name, value) {
  const marker = `var ${name} = `;
  const markerIndex = source.indexOf(marker);
  const literalStart = markerIndex + marker.length;
  const quote = source[literalStart];
  let escaped = false;
  let literalEnd = -1;
  for (let index = literalStart + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character === quote) { literalEnd = index + 1; break; }
  }
  assert.notEqual(literalEnd, -1, `Unterminated ${name}`);
  return source.slice(0, literalStart) + JSON.stringify(value) + source.slice(literalEnd);
}

function block(source, start, end) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1, `Missing block start: ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `Missing block end: ${end}`);
  return source.slice(a, b);
}

const sourceWorker = read(sourcePath);
const candidateWorker = read(candidatePath);
const sourceWidget = bundledString(sourceWorker, 'WIDGET_JS');
const candidateWidget = bundledString(candidateWorker, 'WIDGET_JS');

const protectedBlocks = [
  ['configuration', '  const CONFIG = {', '\n\n  const ATTRIBUTION_KEYS'],
  ['price calculator', '  function calculateQuote(input) {', '\n\n  function currentQuote()'],
  ['validation', '  function validatePlan() {', '\n\n  function validateDetails()'],
  ['detail validation', '  function validateDetails() {', '\n\n  function requestId()'],
  ['payload', '  function buildPayload() {', '\n\n  function submissionFingerprint'],
  ['submission fingerprint', '  function submissionFingerprint(payload) {', '\n\n  function payloadForSubmission()'],
  ['submission flow', '  async function submit() {', '\n\n  function handleInput'],
  ['tracking hooks', '  function track(name, params) {', '\n\n  function trackSuccess'],
  ['conversion hooks', '  function trackSuccess(payload, requestId) {', '\n\n  function shellHtml()']
];
const protectedEvidence = {};
for (const [label, start, end] of protectedBlocks) {
  const before = block(sourceWidget, start, end);
  const after = block(candidateWidget, start, end);
  assert.equal(after, before, `${label} changed`);
  protectedEvidence[label] = sha256(after);
}

function evaluator(widget) {
  const configBlock = block(widget, '  const CONFIG = {', '\n\n  const ATTRIBUTION_KEYS');
  const objectText = configBlock.slice(configBlock.indexOf('{'), configBlock.lastIndexOf('};') + 1);
  const calculateText = block(widget, '  function calculateQuote(input) {', '\n\n  function currentQuote()').trim();
  const context = {};
  vm.createContext(context);
  vm.runInContext(`const CONFIG = ${objectText}; ${calculateText}; this.CONFIG = CONFIG; this.calculateQuote = calculateQuote;`, context);
  return context;
}

const beforeRuntime = evaluator(sourceWidget);
const afterRuntime = evaluator(candidateWidget);
const dogCounts = Array.from({ length: 10 }, (_, index) => index + 1);
const frequencies = Object.keys(beforeRuntime.CONFIG.frequencies);
const yardSizes = Object.keys(beforeRuntime.CONFIG.yardSizes);
const areaSets = [['back'], ['front'], ['back', 'front'], ['back', 'front', 'side']];
let pricingCases = 0;
for (const dogCount of dogCounts) for (const frequency of frequencies) for (const yardSize of yardSizes) for (const areas of areaSets) {
  const input = { dogCount, frequency, yardSize, areas };
  assert.deepEqual(JSON.parse(JSON.stringify(afterRuntime.calculateQuote(input))), JSON.parse(JSON.stringify(beforeRuntime.calculateQuote(input))), `Pricing changed: ${JSON.stringify(input)}`);
  pricingCases += 1;
}
assert.equal(pricingCases, 1000);
assert.equal(afterRuntime.calculateQuote({ dogCount: 1, frequency: 'weekly', yardSize: 's', areas: ['back'] }).priceCents, 1999);
assert.equal(afterRuntime.calculateQuote({ dogCount: 1, frequency: 'twice', yardSize: 's', areas: ['back'] }).priceCents, 1599);
assert.equal(afterRuntime.calculateQuote({ dogCount: 1, frequency: 'biweekly', yardSize: 's', areas: ['back'] }).priceCents, 2999);
assert.equal(afterRuntime.calculateQuote({ dogCount: 1, frequency: 'weekly', yardSize: 'm', areas: ['back', 'front'] }).priceCents, 2649);
assert.equal(afterRuntime.calculateQuote({ dogCount: 3, frequency: 'onetime', yardSize: 'xl', areas: ['back', 'front', 'side'] }).priceCents, 8999);
assert.equal(afterRuntime.calculateQuote({ dogCount: 10, frequency: 'custom', yardSize: 'over', areas: ['back'] }).custom, true);

const mapMatch = candidateWidget.match(/const QUOTE_ICON_ASSET_URLS = (\{[^;]+\});/);
assert.ok(mapMatch, 'Final quote icon URL map missing');
const iconMap = JSON.parse(mapMatch[1]);
assert.deepEqual(Object.keys(iconMap).sort(), REQUIRED_KEYS.slice().sort(), 'Final quote icon key set changed');
for (const [key, url] of Object.entries(iconMap)) {
  assert.match(url, new RegExp(`/quote-icons/${key}-`), `Final URL does not retain stable key: ${key}`);
  assert.match(url, /\.webp$/, `Final URL is not WebP: ${key}`);
}
for (const expression of [
  'iconHtml(dog === 10 ? "dog-10plus" : "dog-" + dog, "dog-choice-art")',
  'frequency-twice-weekly', 'frequency-weekly', 'frequency-every-other-week', 'frequency-one-time', 'frequency-custom',
  'area-back', 'area-front', 'area-sides', 'area-all',
  '.dog-choice .dog-choice-art, .choice[data-frequency] .choice-art, .choice[data-area] .choice-art { mix-blend-mode: multiply; }',
  '.dog-choice-art { width: 56px; height: 56px;', '.dog-choice-art { width: 48px; height: 48px;',
  '.choice-art { position: absolute; top: 50%; left: 15px; width: 52px; height: 52px;',
  '.choice-art { left: 10px; width: 44px; height: 44px;'
]) assert.ok(candidateWidget.includes(expression), `Expected icon installation expression missing: ${expression}`);

const normalizedCandidate = replaceBundledString(candidateWorker, 'WIDGET_JS', sourceWidget);
assert.equal(normalizedCandidate, sourceWorker, 'Worker wrapper/landing changed outside WIDGET_JS');
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
const result = {
  status: 'pass',
  sourceWorkerPath: sourcePath,
  sourceWorkerSha256: sha256(sourceWorker),
  sourceWidgetSha256: sha256(sourceWidget),
  candidateWorkerPath: candidatePath,
  candidateWorkerSha256: sha256(candidateWorker),
  candidateWidgetSha256: sha256(candidateWidget),
  protectedBusinessBlocksByteExact: protectedEvidence,
  pricingCasesCompared: pricingCases,
  expectedPricingAssertions: 6,
  quoteIconKeysVerified: REQUIRED_KEYS,
  wrapperAndLandingOutsideWidgetByteExact: true,
  deploymentState: 'source regression scope only; not deployed'
};
fs.writeFileSync(evidencePath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
