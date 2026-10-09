// Quote Worker regression: what must stay frozen, and proof of what changed.
//
// WHY THE BASELINE CHANGED. Until October 2026 this test pinned the bundle to the
// September 21 fixture (fixtures/pre-icons-worker.mjs, kept as history) and froze the
// bundled widget's wording. Owner decisions of October 5 to 9, 2026 changed two things:
// a new recurring household's first cleanup includes up to 120 minutes (the earlier
// first-cleanup wording is retired), and the bundled widget and its landing page are
// retired in favour of the quote page. The reference is now the last release that
// carried the old behaviour, fixtures/2026-10-05-live-worker.mjs (SHA-256 113ce3be...).
//
// WHAT THIS TEST DOES.
//   a. Differential: the reference and the candidate bundle each answer the same
//      seeded requests (more than 1,000) with every outgoing call replaced by a stand-in
//      and an in-memory request ledger and plan store. HTTP status, headers, body and
//      everything forwarded must be identical except for the approved differences
//      listed below, each asserted to equal its approved value.
//   b. Server prices (1,000 combinations and six fixed prices), the ZIP list and the
//      protected code blocks (ledger, saved-plan store, validation and more) equal the
//      reference.
//   c. New behaviour: the forward to the quote page, the launcher script, the Meta
//      guard, the Terms version modes and the saved-link base.
//   d. A word sweep of the candidate bundle.
// Nothing here deploys or contacts any service. Every address and value is made up.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const referencePath = path.resolve(process.argv[2] || path.join(here, 'fixtures', '2026-10-05-live-worker.mjs'));
const candidatePath = path.resolve(process.argv[3] || path.join(here, '..', 'dist', 'worker.mjs'));
const launcherPath = path.join(here, '..', 'src', 'launcher.js');
const outputDir = path.join(here, '..', 'test-output');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(file, 'utf8');
const clone = value => (value === undefined ? undefined : structuredClone(value));

const REFERENCE_SHA256 = '113ce3beee7ac937605d7da6eb7453052bfe03ee95c92e520e623396bffea95c';
const referenceSource = read(referencePath);
const candidateSource = read(candidatePath);
const launcherSource = read(launcherPath).replace(/\r\n/g, '\n');
assert.equal(sha256(referenceSource), REFERENCE_SHA256, 'Reference fixture is not the October 5 live release');

// ---------------------------------------------------------------------------
// Approved values (owner decisions of October 5 to 9, 2026)
// ---------------------------------------------------------------------------
const OLD_VERSION = '2026-09-08-checkout-clarity';
const NEW_VERSION = '2026-10-08-no-start-up-fee-120';
const OLD_TEAM_NOTE = 'Initial/restart: quoted recurring rate includes 30 minutes; extra time $1/min afterward; base at ETA. Approved new-customer promotion waives ALL additional-time charges. Ordinary maintenance has no time surcharge. Verify account/household and existing promises before approval; never add a second maintenance charge.';
const NEW_TEAM_NOTE = 'First cleanup: NEW recurring household = quoted visit rate, up to 120 minutes included; time beyond 120 minutes only at $1/min agreed with the customer BEFORE work starts. RETURNING or unclear history = restart: quoted rate includes 30 minutes, then $1/min, billed after. Base charged at ETA text. Ordinary visits are never billed by the minute. Verify household history and existing promises before approval; never add a second maintenance charge.';
const OLD_VOICE_STEP = 'This is a recurring maintenance quote, not an approved first-cleanup price. Ask whether the household has used Purge Pros before. Returning, uncertain-history and new-occupant requests require Submit Team Follow-Up Request for review. New-customer promotion eligibility also requires team verification: approved promotional first cleanups have NO additional-time charge. Standard initial/restart cleanup uses the quoted recurring rate for 30 minutes plus $1 per extra minute, billed after cleanup; base at ETA. Ordinary maintenance stays at the agreed rate regardless of time. Never add a second maintenance charge. Do not call service scheduled or confirmed until the team approves it.';
const NEW_VOICE_STEP = 'This is a recurring maintenance quote, not an approved first-cleanup price. Ask whether the household has used Purge Pros before. Returning, uncertain-history and new-occupant requests require Submit Team Follow-Up Request for review. New-household status also requires team verification of service history, once per household. New recurring households: first cleanup at the quoted rate with up to 120 minutes included; time beyond 120 minutes is $1 per minute, agreed before work starts. Returning or unclear-history households: restart at the quoted rate for 30 minutes plus $1 per extra minute, billed after cleanup; base at ETA. Ordinary maintenance stays at the agreed rate regardless of time. Never add a second maintenance charge. Never promise a free or unlimited first cleanup. Do not call service scheduled or confirmed until the team approves it.';
const OLD_FIRST_VISIT = { onetime: 'First visit: One-time base price plus approved extra time', other: 'First visit: Team approval required; maintenance quote is not a confirmed restart charge' };
// The first-visit line now says which case the request is. A returning or unsure household keeps the October 5 text.
const NEW_FIRST_VISIT = {
  custom: 'First visit: Team approval required; price and first-cleanup terms are set by the custom review',
  onetime: 'First visit: One-time cleanup: base price covers the first 30 minutes, then $1/min, billed after the cleanup',
  newHousehold: 'First visit: Team approval required; if household history is verified as new: quoted visit rate, up to 120 minutes included',
  returning: OLD_FIRST_VISIT.other
};
const DEFAULT_QUOTE_PAGE = 'https://itspurgepros.com/quote';
// Saved-plan links are NOT an approved difference: by default they keep the October 5 form,
// which is the only form the quote builder accepts when it creates a link (its SAVE_LINK_PATTERN).
const BUILDER_SAVE_LINK_PATTERN = /^https:\/\/quote\.itspurgepros\.com\/#resume=[A-Za-z0-9_-]{43}$/;
const FORWARD_PATHS = ['/', '/quote', '/quote/', '/demo', '/demo.html'];
const NEW_FORWARD_KEYS = ['newCustomerCleanupIncludedMinutes', 'newCustomerExtraTimeRequiresAgreement'];
// Key names that stay as they are so nothing mapped downstream breaks.
const KEPT_KEY_NAMES = ['promotionalAdditionalMinuteCents', 'automaticPromotionApproved'];

const APPROVED = [
  ['forward.offerVersion', `"${OLD_VERSION}" becomes "${NEW_VERSION}"`],
  ['forward.cleanupPolicyVersion', `"${OLD_VERSION}" becomes "${NEW_VERSION}"`],
  ['forward.promotionalAdditionalMinuteCents', 'key kept; 0 becomes null for a recurring non-custom request (already null otherwise)'],
  ['forward.newCustomerCleanupIncludedMinutes', 'new key: 120 only for a recurring non-custom request from a household that said it is new; null for returning, unsure, one-time and custom'],
  ['forward.newCustomerExtraTimeRequiresAgreement', 'new key: true only for a recurring non-custom request from a household that said it is new; null otherwise'],
  ['forward.quoteSummary team note', 'the one first-cleanup sentence is replaced by the approved 120-minute team note'],
  ['forward.quoteSummary first-visit line', 'names the case for a new household, a one-time cleanup and a custom request; unchanged for a returning or unsure household; every other line identical'],
  ['voice-quote nextStep (recurring price)', 'the instruction describes the 120-minute rule and the 30-minute restart; every other field identical'],
  ['GET /purge-quote.js', 'the retired widget is replaced by the launcher script; same headers'],
  ['GET quote and demo pages', `GET ${FORWARD_PATHS.join(', ')} answer 302 to the quote page with the query string kept`],
  ['Meta result log line', 'one structured console line per Meta copy sent (status, count received, trace id)']
];
const approvedCounts = Object.fromEntries(APPROVED.map(([name]) => [name, 0]));
const count = name => { assert.ok(name in approvedCounts, name); approvedCounts[name] += 1; };

// ---------------------------------------------------------------------------
// Loader: runs a bundle in plain Node. The Cloudflare-only import is replaced
// here, in the test loader; the Worker itself is not changed for the test.
// ---------------------------------------------------------------------------
const CLOUDFLARE_IMPORT = 'import { DurableObject } from "cloudflare:workers";';
async function loadBundle(source, label) {
  assert.equal(source.split(CLOUDFLARE_IMPORT).length, 2, `${label}: expected one Cloudflare import`);
  const text = source.replace(CLOUDFLARE_IMPORT, () => 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }') +
    '\nexport { calculateQuote as __calculateQuote, SERVICE_ZIPS as __SERVICE_ZIPS, FREQUENCIES as __FREQUENCIES, YARD_SIZES as __YARD_SIZES, AREA_ADDERS as __AREA_ADDERS };\n';
  const dir = path.join(outputDir, 'loader');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label}-${sha256(text).slice(0, 16)}.mjs`);
  fs.writeFileSync(file, text);
  return import(pathToFileURL(file).href);
}
const reference = await loadBundle(referenceSource, 'reference');
const candidate = await loadBundle(candidateSource, 'candidate');

// ---------------------------------------------------------------------------
// Stand-ins: clock, randomness, outgoing calls, cache, ledger and plan store
// ---------------------------------------------------------------------------
const RealDate = Date;
let clock = RealDate.UTC(2026, 9, 9, 12, 0, 0);
class FixedDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(clock); }
  static now() { return clock; }
}
globalThis.Date = FixedDate;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let workerRandom = mulberry32(1);
Object.defineProperty(globalThis.crypto, 'getRandomValues', { configurable: true, value(array) {
  for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(workerRandom() * 256);
  return array;
} });
Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value() {
  const hex = Array.from({ length: 32 }, () => Math.floor(workerRandom() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
} });

const HOOK_V3 = 'https://hooks.example.test/v3-intake';
const HOOK_LEGACY = 'https://hooks.example.test/legacy-intake';
let active = null;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const record = { url, method: init.method || 'GET', headers: { ...(init.headers || {}) }, body: null };
  if (typeof init.body === 'string') { try { record.body = JSON.parse(init.body); } catch (_) { record.body = init.body; } }
  active.outgoing.push(record);
  if (url === HOOK_V3 || url === HOOK_LEGACY) {
    if (active.upstream === 'throw') throw new Error('stand-in network failure');
    if (active.upstream === 'fail') return new Response('stand-in failure', { status: 500 });
    return new Response('{"status":"Success: request sent to trigger execution server"}', { status: 200 });
  }
  if (url.startsWith('https://graph.facebook.com/')) {
    if (active.meta === 'throw') throw new Error('stand-in network failure');
    if (active.meta === 'error') return new Response(JSON.stringify({ error: { message: 'stand-in refusal', type: 'OAuthException', code: 190, fbtrace_id: 'TRACE-REFUSED' } }), { status: 400 });
    return new Response(JSON.stringify({ events_received: 1, messages: [], fbtrace_id: 'TRACE-RECEIVED' }), { status: 200 });
  }
  if (url.startsWith('https://places.googleapis.com/')) return new Response(JSON.stringify({ rating: 4.9, userRatingCount: 57 }), { status: 200 });
  throw new Error('Unexpected outgoing call in test: ' + url);
};
globalThis.caches = { default: {
  async match(request) { const hit = active.cache.get(request.url); return hit ? hit.clone() : undefined; },
  async put(request, response) { active.cache.set(request.url, response); }
} };
const realConsoleLog = console.log;
console.log = (...args) => {
  if (active && active.running && typeof args[0] === 'string' && args[0].startsWith('{"event":"')) active.logs.push(JSON.parse(args[0]));
  else if (active && active.running) throw new Error('Unexpected console output from the Worker: ' + String(args[0]).slice(0, 80));
  else realConsoleLog(...args);
};

function makeWorld(module, vars) {
  const world = { module, outgoing: [], logs: [], cache: new Map(), pending: [], upstream: 'ok', meta: 'ok', running: false, objects: new Map() };
  const env = { ...vars };
  env.QUOTE_REQUESTS = {
    idFromName: name => name,
    get(id) {
      let object = world.objects.get(id);
      if (!object) {
        const store = new Map();
        let chain = Promise.resolve();
        object = { store, alarmAt: null };
        const ctx = {
          storage: {
            async get(key) { return clone(store.get(key)); },
            async put(key, value) { store.set(key, clone(value)); },
            async delete(key) { return store.delete(key); },
            async setAlarm(at) { object.alarmAt = at; }
          },
          blockConcurrencyWhile(task) { const run = chain.then(task, task); chain = run.catch(() => {}); return run; },
          waitUntil(promise) { world.pending.push(Promise.resolve(promise).catch(() => {})); }
        };
        object.instance = new module.QuoteRequestLedger(ctx, env);
        world.objects.set(id, object);
      }
      return { fetch: request => object.instance.fetch(request) };
    }
  };
  world.env = env;
  return world;
}

function buildRequest(spec) {
  const init = { method: spec.method, headers: { ...spec.headers } };
  if (spec.body !== undefined) init.body = spec.body;
  return new Request(spec.url, init);
}
async function send(world, spec) {
  active = world;
  world.running = true;
  world.upstream = spec.upstream || 'ok';
  world.meta = spec.meta || 'ok';
  workerRandom = mulberry32(spec.seed || 1);
  if (spec.at !== undefined) clock = spec.at;
  const firstCall = world.outgoing.length;
  const firstLog = world.logs.length;
  const response = await world.module.default.fetch(buildRequest(spec), world.env, { waitUntil(promise) { world.pending.push(Promise.resolve(promise).catch(() => {})); } });
  const text = await response.text();
  while (world.pending.length) await world.pending.shift();
  world.running = false;
  return {
    status: response.status,
    headers: Object.fromEntries([...response.headers.entries()].sort()),
    text,
    outgoing: world.outgoing.slice(firstCall),
    logs: world.logs.slice(firstLog)
  };
}

// ---------------------------------------------------------------------------
// b. Server prices, ZIP list and protected code blocks
// ---------------------------------------------------------------------------
const plain = value => JSON.parse(JSON.stringify(value));
const dogCounts = Array.from({ length: 10 }, (_, index) => index + 1);
const frequencyIds = Object.keys(reference.__FREQUENCIES);
const yardSizeIds = Object.keys(reference.__YARD_SIZES);
const areaSets = [['back'], ['front'], ['back', 'front'], ['back', 'front', 'side']];
assert.deepEqual(frequencyIds, ['twice', 'weekly', 'biweekly', 'onetime', 'custom']);
assert.deepEqual(yardSizeIds, ['s', 'm', 'l', 'xl', 'over']);
let pricingCases = 0;
for (const dogs of dogCounts) for (const frequencyId of frequencyIds) for (const yardSizeId of yardSizeIds) for (const areaIds of areaSets) {
  const input = { dogs, frequencyId, yardSizeId, areaIds };
  assert.deepEqual(plain(candidate.__calculateQuote(input)), plain(reference.__calculateQuote(input)), `Pricing changed: ${JSON.stringify(input)}`);
  pricingCases += 1;
}
assert.equal(pricingCases, 1000);
const price = (dogs, frequencyId, yardSizeId, areaIds) => candidate.__calculateQuote({ dogs, frequencyId, yardSizeId, areaIds });
assert.equal(price(1, 'weekly', 's', ['back']).priceCents, 1999);
assert.equal(price(1, 'twice', 's', ['back']).priceCents, 1599);
assert.equal(price(1, 'biweekly', 's', ['back']).priceCents, 2999);
assert.equal(price(1, 'weekly', 'm', ['back', 'front']).priceCents, 2649);
assert.equal(price(3, 'onetime', 'xl', ['back', 'front', 'side']).priceCents, 8999);
assert.equal(price(10, 'custom', 'over', ['back']).custom, true);
assert.deepEqual(plain(candidate.__FREQUENCIES), plain(reference.__FREQUENCIES), 'Price table changed');
assert.deepEqual(plain(candidate.__YARD_SIZES), plain(reference.__YARD_SIZES), 'Yard-size table changed');
assert.deepEqual(plain(candidate.__AREA_ADDERS), plain(reference.__AREA_ADDERS), 'Area add-on table changed');
const serviceZips = [...reference.__SERVICE_ZIPS];
assert.deepEqual([...candidate.__SERVICE_ZIPS], serviceZips, 'ZIP list changed');
assert.ok(serviceZips.length > 40 && serviceZips.every(zip => /^\d{5}$/.test(zip)));

function slice(source, start, end, label) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1, `${label}: missing block start`);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `${label}: missing block end`);
  return source.slice(a, b);
}
function ledgerBlock(source) {
  const a = source.indexOf('function replayReply(status, body) {');
  const c = source.indexOf('var QuoteRequestLedger = class extends DurableObject {', a);
  const b = source.indexOf('\n};\n', c);
  assert.ok(a > -1 && c > a && b > c, 'ledger block not found');
  return source.slice(a, b + 4);
}
const SAVED_LINK_OLD_LINE = 'url: "https://quote.itspurgepros.com/#resume=" + token,';
const SAVED_LINK_NEW_LINE = 'url: savedLinkBase(env) + "#resume=" + token,';
const protectedBlocks = {};
function protect(label, before, after) {
  assert.equal(after, before, `${label} changed`);
  protectedBlocks[label] = sha256(after);
}
protect('request ledger, replies and request fingerprint', ledgerBlock(referenceSource), ledgerBlock(candidateSource));
protect('versions, default origins, ZIP list, prices, option sets and voice tables',
  slice(referenceSource, 'var SCHEMA_VERSION = ', 'function corsHeaders(', 'constants'), slice(candidateSource, 'var SCHEMA_VERSION = ', 'function corsHeaders(', 'constants'));
protect('origin check, cleaning, price calculator and voice parsing',
  slice(referenceSource, 'function corsHeaders(', 'function voiceQuoteResponse(', 'calculator'), slice(candidateSource, 'function corsHeaders(', 'function voiceQuoteResponse(', 'calculator'));
protect('voice handler, request validation and attribution capture',
  slice(referenceSource, 'function privateJsonResponse(', 'function buildV3Forward(', 'validation'), slice(candidateSource, 'function privateJsonResponse(', 'function buildV3Forward(', 'validation'));
protect('reviews and hashing',
  slice(referenceSource, 'async function handleReviews(', 'async function sendMetaCapi(', 'reviews'), slice(candidateSource, 'async function handleReviews(', 'async function sendMetaCapi(', 'reviews'));
protect('legacy intake dispatch',
  slice(referenceSource, 'async function postToGhl(', 'async function handleLeadSubmission(', 'dispatch'), slice(candidateSource, 'async function postToGhl(', 'async function handleLeadSubmission(', 'dispatch'));
{
  // The saved-plan store may differ by exactly one approved line: where the link base comes from.
  const before = slice(referenceSource, '// Isolated plan-only save links.', 'var worker_default = {', 'saved plans');
  const after = slice(candidateSource, '// Isolated plan-only save links.', 'var worker_default = {', 'saved plans');
  assert.equal(before.split(SAVED_LINK_OLD_LINE).length, 2);
  assert.equal(after.split(SAVED_LINK_NEW_LINE).length, 2, 'approved saved-link line missing or repeated');
  protect('saved-plan store (apart from the one approved link-base line)', before, after.replace(SAVED_LINK_NEW_LINE, SAVED_LINK_OLD_LINE));
}

// The four blocks that carry approved edits are protected too: every approved line is put back
// (each must be present exactly once) and the rest must be byte-equal to the October 5 release.
// A later edit anywhere in these blocks fails here until it is listed as an approved line.
function protectWithApprovedLines(label, before, after, approvedLines) {
  let restored = after;
  for (const [candidateText, referenceText] of approvedLines) {
    assert.equal(restored.split(candidateText).length, 2, `${label}: approved line missing or repeated: ${candidateText.slice(0, 70)}`);
    restored = restored.replace(candidateText, () => referenceText);
  }
  protect(label, before, restored);
}
const text = value => JSON.stringify(value.slice('First visit: '.length));
protectWithApprovedLines('Voice AI price answer (apart from the one approved instruction)',
  slice(referenceSource, 'function voiceQuoteResponse(', 'function privateJsonResponse(', 'voice answer'),
  slice(candidateSource, 'function voiceQuoteResponse(', 'function privateJsonResponse(', 'voice answer'),
  [[JSON.stringify(NEW_VOICE_STEP), JSON.stringify(OLD_VOICE_STEP)]]);
protectWithApprovedLines('forward builder: consent, attribution, contact and every forwarded key (apart from the approved lines)',
  slice(referenceSource, 'function buildV3Forward(', 'async function handleReviews(', 'forward builder'),
  slice(candidateSource, 'function buildV3Forward(', 'async function handleReviews(', 'forward builder'),
  [
    ['function buildV3Forward(lead, values, requestId, request, env) {', 'function buildV3Forward(lead, values, requestId, request) {'],
    ['  const termsCheck = termsVersionCheck(env, values.intent, termsVersion);\n', ''],
    ['  const newHousehold = !quote.custom && quote.frequencyId !== "onetime" && values.customerStatus === "new";\n', ''],
    [`  const firstVisit = quote.custom ? ${text(NEW_FIRST_VISIT.custom)} : quote.frequencyId === "onetime" ? ${text(NEW_FIRST_VISIT.onetime)} : newHousehold ? ${text(NEW_FIRST_VISIT.newHousehold)} : ${text(NEW_FIRST_VISIT.returning)};\n`, ''],
    ['    `First visit: ${firstVisit}`,', `    \`First visit: \${quote.frequencyId === "onetime" ? ${text(OLD_FIRST_VISIT.onetime)} : ${text(OLD_FIRST_VISIT.other)}}\`,`],
    ['    ' + JSON.stringify(NEW_TEAM_NOTE) + ',', '    ' + JSON.stringify(OLD_TEAM_NOTE) + ','],
    ['    termsCheck.outdated ? `Terms version check: the customer accepted Terms version ${termsVersion}; the current version is ${termsCheck.current}. Confirm the current Terms with the customer before approval.` : "",\n', ''],
    [`    offerVersion: "${NEW_VERSION}",`, `    offerVersion: "${OLD_VERSION}",`],
    [`    cleanupPolicyVersion: "${NEW_VERSION}",`, `    cleanupPolicyVersion: "${OLD_VERSION}",`],
    ['    promotionalAdditionalMinuteCents: null,\n    newCustomerCleanupIncludedMinutes: newHousehold ? 120 : null,\n    newCustomerExtraTimeRequiresAgreement: newHousehold ? true : null,', '    promotionalAdditionalMinuteCents: quote.custom || quote.frequencyId === "onetime" ? null : 0,']
  ]);
protectWithApprovedLines('request intake: origin, size, JSON, validation order and dispatch (apart from the Terms version check)',
  slice(referenceSource, 'async function handleLeadSubmission(', '// Isolated plan-only save links.', 'intake'),
  slice(candidateSource, 'async function handleLeadSubmission(', '// Isolated plan-only save links.', 'intake'),
  [
    [`    const termsCheck = termsVersionCheck(env, validation.values.intent, cleanString(lead.termsVersion, 80));
    if (termsCheck.refuse) {
      // Countable in the log; never the customer's details or the text they sent.
      try {
        console.log(JSON.stringify({ event: "terms_version_refused", requestId, stage: validation.values.expectedStage, currentTermsVersion: termsCheck.current }));
      } catch (_) {
      }
      return jsonResponse(400, {
        accepted: false,
        code: "TERMS_VERSION_OUTDATED",
        message: "Our Terms & Conditions have been updated. Please reload this page, review the current terms and send your request again. Nothing has been scheduled or charged by this form.",
        fields: ["termsAccepted"]
      }, cors);
    }
`, ''],
    ['    forward = buildV3Forward(lead, validation.values, requestId, request, env);', '    forward = buildV3Forward(lead, validation.values, requestId, request);']
  ]);
{
  // Router: everything from the reviews address on (intake addresses and their settings) is byte-equal;
  // before it, the candidate has the launcher in place of the widget and one forward line in place of the two pages.
  const ROUTER_TAIL = '    if (url.pathname === "/reviews" && request.method === "GET") return handleReviews(request, env);';
  const before = referenceSource.slice(referenceSource.indexOf('var worker_default = {'));
  const after = candidateSource.slice(candidateSource.indexOf('var worker_default = {'));
  assert.ok(before.includes(ROUTER_TAIL) && after.includes(ROUTER_TAIL), 'router tail not found');
  protect('router: reviews, both intake addresses and their settings', before.slice(before.indexOf(ROUTER_TAIL)), after.slice(after.indexOf(ROUTER_TAIL)));
  const FORWARD_LINE = '    if (request.method === "GET" && QUOTE_FORWARD_PATHS.has(url.pathname)) return quotePageRedirect(request, env);\n';
  const PAGES_START = '    const directQuoteHost = url.hostname.toLowerCase() === "quote.itspurgepros.com";\n';
  const beforeHead = before.slice(0, before.indexOf(ROUTER_TAIL));
  assert.equal(beforeHead.split(PAGES_START).length, 2);
  protectWithApprovedLines('router: saved-plan, voice and script addresses',
    beforeHead.slice(0, beforeHead.indexOf(PAGES_START)), after.slice(0, after.indexOf(ROUTER_TAIL)),
    [['launcherScript(env)', 'widgetScript(request, env)'], [FORWARD_LINE, '']]);
}

// ---------------------------------------------------------------------------
// a. Differential test
// ---------------------------------------------------------------------------
const WORKER = 'https://purge-lead-relay.purgepros.workers.dev';
const QUOTE_HOST = 'https://quote.itspurgepros.com';
const ORIGINS = ['https://itspurgepros.com', 'https://www.itspurgepros.com', 'https://blog.itspurgepros.com'];
const PRODUCTION_LIKE = {
  ALLOWED_ORIGINS: 'https://itspurgepros.com,https://www.itspurgepros.com,https://purge-quote.purgepros.workers.dev,https://blog.itspurgepros.com',
  GOOGLE_PLACE_ID: 'test-place-id',
  GOOGLE_PLACES_API_KEY: 'made-up-places-key',
  GHL_WEBHOOK_URL: HOOK_LEGACY,
  GHL_WEBHOOK_URL_V3: HOOK_V3,
  VOICE_AI_QUOTE_TOKEN: 'made-up-voice-token',
  META_PIXEL_ID: '100000000000001',
  META_CAPI_TOKEN: 'made-up-meta-token'
};
// Second profile: no Meta values and no origin variable, so the built-in origin list is used.
const BARE = { GHL_WEBHOOK_URL: HOOK_LEGACY, GHL_WEBHOOK_URL_V3: HOOK_V3, VOICE_AI_QUOTE_TOKEN: 'made-up-voice-token' };

const LAST_CLEANED = ['Within 1 week', '2–3 weeks', 'About 1 month', '2–4 months', '5–6 months', 'More than 6 months'];
const START_TIMINGS = ['As soon as possible', 'Within the next week', 'In the next few weeks', 'Just researching for now'];
const FIRST_NAMES = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie'];
const LAST_NAMES = ['Example', 'Sample', 'Tester', 'Placeholder'];
const STREETS = ['100 Example Street', '22 Sample Court', '7 Test Lane', '4810 Placeholder Drive'];
const CITIES = ['Carmel', 'Fishers', 'Noblesville', 'Westfield', 'Indianapolis'];
const OUT_OF_AREA_ZIPS = ['46201', '60601', '90210', '47901'].filter(zip => !serviceZips.includes(zip));
assert.ok(OUT_OF_AREA_ZIPS.length >= 3);

function generator(seed) {
  const random = mulberry32(seed);
  const int = max => Math.floor(random() * max);
  const pick = list => list[int(list.length)];
  const chance = p => random() < p;
  const id = () => Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[int(36)]).join('');
  return { random, int, pick, chance, id };
}

function makePlan(g, kind) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const frequencyId = kind === 'onetime' ? 'onetime' : kind === 'custom' ? g.pick(['custom', 'weekly', 'twice', 'biweekly', 'custom']) : g.pick(['twice', 'weekly', 'biweekly']);
    const dogs = kind === 'custom' && g.chance(0.4) ? 10 : 1 + g.int(kind === 'onetime' ? 10 : 9);
    const yardSizeId = kind === 'custom' && frequencyId === 'custom' && g.chance(0.5) ? 'over' : g.pick(['s', 'm', 'l', 'xl']);
    const areaIds = g.pick([['back'], ['front'], ['side'], ['back', 'front'], ['front', 'back'], ['back', 'side'], ['back', 'front', 'side']]);
    const quote = reference.__calculateQuote({ dogs, frequencyId, yardSizeId, areaIds });
    if (!quote.ok) continue;
    if ((kind === 'custom') !== Boolean(quote.custom)) continue;
    return { dogs, frequencyId, yardSizeId, areaIds, quote };
  }
  throw new Error('Could not build a plan: ' + kind);
}

// A complete, valid request as the quote builder sends it.
function makeLead(g, kind, intent, options = {}) {
  const plan = makePlan(g, kind);
  const preferredContact = options.preferredContact || g.pick(['text', 'text', 'email', 'call']);
  const stage = intent === 'question' ? 'question_submitted' : intent === 'quote_delivery' ? 'quote_requested' : plan.quote.custom ? 'estimate_requested' : 'service_requested';
  const stamp = new RealDate(clock - 1000 * g.int(600)).toISOString();
  const lead = {
    schemaVersion: 'cloudflare-widget.v3',
    requestId: g.chance(0.05) ? undefined : 'req-' + g.id(),
    stage,
    intent,
    zip: g.pick(serviceZips),
    dogs: g.chance(0.5) ? plan.dogs : String(plan.dogs),
    frequencyId: plan.frequencyId,
    areaIds: plan.areaIds,
    yardSizeId: plan.yardSizeId,
    lastCleaned: g.pick(LAST_CLEANED),
    customerStatus: options.customerStatus || g.pick(['new', 'new', 'returning', 'not_sure']),
    startTiming: g.pick(START_TIMINGS),
    pricingVersion: '2026-08-cloudflare-v1',
    customEstimate: Boolean(plan.quote.custom),
    clientPriceCents: plan.quote.custom ? null : plan.quote.priceCents,
    firstName: g.pick(FIRST_NAMES),
    lastName: g.pick(LAST_NAMES),
    phone: g.pick(['317555', '(317) 555-', '1317555', '+1 317-555-']) + String(1000 + g.int(9000)),
    email: g.chance(0.8) || preferredContact === 'email' ? `person${g.int(100000)}@example.com` : '',
    street: g.pick(STREETS),
    city: g.pick(CITIES),
    preferredContact,
    smsTransactionalConsent: preferredContact === 'text',
    consentVersion: '2026-08-transactional-v1',
    smsConsentCapturedAt: g.chance(0.7) ? stamp : '',
    termsAccepted: intent === 'service_request',
    termsVersion: OLD_VERSION,
    termsAcceptedAt: g.chance(0.7) ? stamp : '',
    question: intent === 'question' ? 'Do you service yards with a gate code? ' + g.id() : g.chance(0.2) ? 'Please use the side gate.' : '',
    notes: g.chance(0.2) ? 'Dog is friendly.' : '',
    page: 'https://itspurgepros.com/' + g.pick(['', 'pricing', 'carmel', 'quote?utm_source=google']),
    attribution: g.chance(0.5) ? { utm_source: g.pick(['google', 'facebook', 'newsletter']), utm_medium: g.pick(['cpc', 'paid_social', 'email']), utm_campaign: 'campaign-' + g.int(9), utm_content: 'ad-' + g.int(9), utm_term: 'dog waste removal', gclid: 'gclid-' + g.id(), gbraid: g.chance(0.3) ? 'gbraid-' + g.id() : '', wbraid: g.chance(0.3) ? 'wbraid-' + g.id() : '', fbclid: g.chance(0.3) ? 'fbclid-' + g.id() : '', ignored: 'dropped' } : {},
    gclid: g.chance(0.4) ? 'gclid-' + g.id() : '',
    fbclid: g.chance(0.3) ? 'fbclid-' + g.id() : '',
    fbp: g.chance(0.4) ? 'fb.1.1700000000000.' + g.int(1e9) : '',
    fbc: g.chance(0.2) ? 'fb.1.1700000000000.' + g.id() : '',
    submittedAt: stamp,
    website: '',
    // Keys the builder sends that the Worker recomputes and never reads.
    frequency: 'ignored', areas: 'ignored', yardSize: 'ignored', perVisitPrice: '0.01', phoneE164: 'ignored', state: 'ZZ', consent: 'ignored', customReasons: ['IGNORED']
  };
  if (lead.requestId === undefined) delete lead.requestId;
  if (g.chance(0.1)) lead.eventId = 'event-' + g.id();
  return lead;
}

const MUTATIONS = [
  ['wrong client price', lead => { lead.clientPriceCents = (lead.clientPriceCents || 0) + 100; lead.customEstimate = false; }],
  ['out-of-area ZIP', (lead, g) => { lead.zip = g.pick(OUT_OF_AREA_ZIPS); }],
  ['malformed ZIP', lead => { lead.zip = '4603'; }],
  ['missing first name', lead => { lead.firstName = '   '; }],
  ['last-cleaned answer not in the list', lead => { lead.lastCleaned = 'Yesterday'; }],
  ['text without consent', lead => { lead.preferredContact = 'text'; lead.smsTransactionalConsent = false; }],
  ['text without consent version', lead => { lead.preferredContact = 'text'; lead.smsTransactionalConsent = true; lead.consentVersion = ''; }],
  ['bot trap filled', lead => { lead.website = 'https://spam.example'; }],
  ['stage does not match intent', lead => { lead.stage = 'question_submitted'; lead.intent = 'service_request'; }],
  ['wrong pricing version', lead => { lead.pricingVersion = '2025-01-old'; }],
  ['unknown intent', lead => { lead.intent = 'book_now'; }],
  ['bad phone', lead => { lead.phone = '555-12'; }],
  ['bad email', lead => { lead.preferredContact = 'email'; lead.email = 'not-an-email'; }],
  ['terms not accepted', lead => { lead.intent = 'service_request'; lead.stage = lead.customEstimate ? 'estimate_requested' : 'service_requested'; lead.termsAccepted = false; }],
  ['terms version missing', lead => { lead.intent = 'service_request'; lead.stage = lead.customEstimate ? 'estimate_requested' : 'service_requested'; lead.termsVersion = ''; }],
  ['service request without address', lead => { lead.intent = 'service_request'; lead.stage = lead.customEstimate ? 'estimate_requested' : 'service_requested'; lead.street = ''; lead.city = ''; lead.lastName = ''; }],
  ['start timing not in the list', lead => { lead.intent = 'service_request'; lead.stage = lead.customEstimate ? 'estimate_requested' : 'service_requested'; lead.startTiming = 'Next year'; }],
  ['too many dogs', lead => { lead.dogs = 14; }],
  ['unknown frequency', lead => { lead.frequencyId = 'monthly'; }],
  ['unknown yard size', lead => { lead.yardSizeId = 'huge'; }],
  ['unknown area', lead => { lead.areaIds = ['back', 'pool']; }],
  ['no areas', lead => { lead.areaIds = []; }],
  ['frequency not offered for the dog count', lead => { lead.frequencyId = 'biweekly'; lead.dogs = 7; lead.yardSizeId = 's'; }],
  ['unknown customer status', lead => { lead.customerStatus = 'vip'; }],
  ['question too short', lead => { lead.intent = 'question'; lead.stage = 'question_submitted'; lead.question = 'Hi'; }],
  ['unsupported schema version on /submit', lead => { lead.schemaVersion = 'cloudflare-widget.v2'; }],
  ['custom flag does not match', lead => { lead.customEstimate = !lead.customEstimate; }]
];

function submitSpec(lead, extra = {}) {
  return {
    method: 'POST', url: WORKER + '/submit',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://itspurgepros.com', 'User-Agent': 'RegressionBrowser/1.0', 'CF-Connecting-IP': '203.0.113.10' },
    body: JSON.stringify(lead), ...extra
  };
}
function resumeSpec(pathname, body, ip, extra = {}) {
  return {
    method: 'POST', url: WORKER + pathname,
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://itspurgepros.com', 'CF-Connecting-IP': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...extra
  };
}
function voiceSpec(body, token = 'made-up-voice-token', extra = {}) {
  return { method: 'POST', url: WORKER + '/voice-quote', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body), ...extra };
}
function planBody(g, kind = g.pick(['recurring', 'recurring', 'onetime', 'custom'])) {
  const plan = makePlan(g, kind);
  return { zip: g.pick(serviceZips), dogs: plan.dogs, frequencyId: plan.frequencyId, yardSizeId: plan.yardSizeId, areaIds: plan.areaIds, customerStatus: g.pick(['new', 'returning', 'not_sure']) };
}

const isV3Forward = call => (call.url === HOOK_V3 || call.url === HOOK_LEGACY) && call.body && call.body.schemaVersion === 'cloudflare-widget.v3' && call.body.source === 'purge-pros-cloudflare-widget';
const isMetaCall = call => call.url.startsWith('https://graph.facebook.com/');
function expectedLauncher(target) {
  assert.equal(launcherSource.split('var QUOTE_PAGE = "";').length, 2, 'launcher placeholder missing or repeated');
  return launcherSource.replace('var QUOTE_PAGE = "";', () => 'var QUOTE_PAGE = ' + JSON.stringify(target) + ';');
}

// Turns the reference result into what the candidate must return: identical, apart from the approved differences.
function expectedFromReference(spec, ref) {
  const expected = clone(ref);
  const url = new URL(spec.url);
  for (const call of expected.outgoing) {
    if (!isV3Forward(call)) continue;
    const body = call.body;
    assert.equal(body.offerVersion, OLD_VERSION); body.offerVersion = NEW_VERSION; count('forward.offerVersion');
    assert.equal(body.cleanupPolicyVersion, OLD_VERSION); body.cleanupPolicyVersion = NEW_VERSION; count('forward.cleanupPolicyVersion');
    const recurringStandard = body.customEstimate === false && body.frequencyId !== 'onetime';
    assert.equal(body.promotionalAdditionalMinuteCents, recurringStandard ? 0 : null);
    if (recurringStandard) count('forward.promotionalAdditionalMinuteCents');
    body.promotionalAdditionalMinuteCents = null;
    // The 120-minute allowance belongs to a household new to Purge Pros. A returning or unsure
    // household gets a restart (30 minutes, then $1 per minute), so it must never carry 120.
    assert.ok(['new', 'returning', 'not_sure'].includes(body.customerStatus));
    const newHousehold = recurringStandard && body.customerStatus === 'new';
    assert.equal(body.offerEligibility === 'new_customer_review', newHousehold, 'the reference marks exactly these requests as a new household');
    body.newCustomerCleanupIncludedMinutes = newHousehold ? 120 : null; count('forward.newCustomerCleanupIncludedMinutes');
    body.newCustomerExtraTimeRequiresAgreement = newHousehold ? true : null; count('forward.newCustomerExtraTimeRequiresAgreement');
    assert.equal(body.quoteSummary.split(OLD_TEAM_NOTE).length, 2, 'reference summary lacks the old team note');
    body.quoteSummary = body.quoteSummary.replace(OLD_TEAM_NOTE, () => NEW_TEAM_NOTE); count('forward.quoteSummary team note');
    const summaryLines = body.quoteSummary.split('\n');
    assert.equal(summaryLines[10], body.frequencyId === 'onetime' ? OLD_FIRST_VISIT.onetime : OLD_FIRST_VISIT.other, 'reference first-visit line');
    assert.equal(summaryLines[11], NEW_TEAM_NOTE);
    summaryLines[10] = body.customEstimate ? NEW_FIRST_VISIT.custom : body.frequencyId === 'onetime' ? NEW_FIRST_VISIT.onetime : newHousehold ? NEW_FIRST_VISIT.newHousehold : NEW_FIRST_VISIT.returning;
    if (summaryLines[10] !== OLD_FIRST_VISIT.other) count('forward.quoteSummary first-visit line');
    body.quoteSummary = summaryLines.join('\n');
    // Unchanged on purpose: the 30-minute restart and one-time standard, and the $1 per minute rate.
    assert.equal(body.standardCleanupIncludedMinutes, body.customEstimate ? null : 30);
    assert.equal(body.standardAdditionalMinuteCents, body.customEstimate ? null : 100);
  }
  if (url.pathname === '/voice-quote' && ref.status === 200) {
    const body = JSON.parse(ref.text);
    if (body.result === 'standard_price' && body.pricingScope === 'recurring_maintenance') {
      assert.equal(body.nextStep, OLD_VOICE_STEP);
      body.nextStep = NEW_VOICE_STEP;
      expected.text = JSON.stringify(body);
      count('voice-quote nextStep (recurring price)');
    }
  }
  if (url.pathname === '/quote-resume' && ref.status === 201) {
    const body = JSON.parse(ref.text);
    // No approved difference: the candidate must answer the same link, byte for byte.
    assert.match(body.url, BUILDER_SAVE_LINK_PATTERN);
  }
  if (spec.method === 'GET' && url.pathname === '/purge-quote.js') {
    assert.equal(ref.status, 200);
    assert.ok(ref.text.includes('purge-pros-quote-widget'), 'reference no longer serves the widget here');
    expected.text = expectedLauncher(DEFAULT_QUOTE_PAGE);
    count('GET /purge-quote.js');
  }
  if (spec.method === 'GET' && FORWARD_PATHS.includes(url.pathname)) {
    assert.equal(ref.status, 200);
    assert.match(ref.headers['content-type'], /^text\/html/);
    expected.status = 302;
    expected.headers = { 'cache-control': 'no-store', 'location': DEFAULT_QUOTE_PAGE + url.search, 'x-content-type-options': 'nosniff' };
    expected.text = '';
    count('GET quote and demo pages');
  }
  assert.equal(ref.logs.length, 0);
  const toTeam = expected.outgoing.find(call => call.url === HOOK_V3 || call.url === HOOK_LEGACY);
  expected.logs = expected.outgoing.filter(isMetaCall).map(() => {
    count('Meta result log line');
    assert.ok(['service_requested', 'estimate_requested'].includes(toTeam.body.stage));
    return { event: 'meta_capi_result', requestId: toTeam.body.requestId, stage: toTeam.body.stage, testEvent: false, httpStatus: 200, eventsReceived: 1, fbtraceId: 'TRACE-RECEIVED', errorCode: null };
  });
  return expected;
}

const tally = { requests: 0, byKind: {}, byStatus: {}, forwardsV3: 0, forwardsLegacy: 0, metaCalls: 0, plansSaved: 0, plansOpened: 0 };
async function compare(worlds, kind, spec) {
  const [refWorld, candWorld] = worlds;
  const ref = await send(refWorld, spec);
  const cand = await send(candWorld, spec);
  const expected = expectedFromReference(spec, ref);
  const context = `${kind}: ${spec.method} ${spec.url}`;
  assert.equal(cand.status, expected.status, `${context}: status`);
  assert.deepEqual(cand.headers, expected.headers, `${context}: headers`);
  assert.equal(cand.text, expected.text, `${context}: body`);
  assert.deepEqual(cand.outgoing, expected.outgoing, `${context}: outgoing calls`);
  assert.deepEqual(cand.logs, expected.logs, `${context}: log lines`);
  cand.outgoing.forEach((call, index) => {
    if (!isV3Forward(call)) return;
    // Same keys in the same order, with the two new keys and nothing else added.
    assert.deepEqual(Object.keys(call.body).filter(key => !NEW_FORWARD_KEYS.includes(key)), Object.keys(ref.outgoing[index].body), `${context}: forwarded key list`);
    assert.deepEqual(Object.keys(call.body).filter(key => !Object.keys(ref.outgoing[index].body).includes(key)), NEW_FORWARD_KEYS, `${context}: new forwarded keys`);
  });
  tally.requests += 1;
  tally.byKind[kind] = (tally.byKind[kind] || 0) + 1;
  tally.byStatus[cand.status] = (tally.byStatus[cand.status] || 0) + 1;
  tally.forwardsV3 += cand.outgoing.filter(call => call.url === HOOK_V3).length;
  tally.forwardsLegacy += cand.outgoing.filter(call => call.url === HOOK_LEGACY).length;
  tally.metaCalls += cand.outgoing.filter(isMetaCall).length;
  return { ref, cand };
}

async function differential(vars, seed, target, origins = ORIGINS) {
  const worlds = [makeWorld(reference, vars), makeWorld(candidate, vars)];
  const g = generator(seed);
  const accepted = [];
  let step = 0;
  const start = tally.requests;
  while (tally.requests - start < target) {
    step += 1;
    clock += 7000;
    const base = { seed: seed * 100000 + step };
    const ip = `203.0.113.${1 + (step % 250)}`;
    const browser = { 'Content-Type': 'application/json', 'Origin': g.pick(origins), 'User-Agent': 'RegressionBrowser/' + g.int(5), 'CF-Connecting-IP': ip };
    const roll = g.random();
    if (roll < 0.26) {
      const status = g.pick(['new', 'new', 'returning', 'not_sure']);
      const lead = makeLead(g, 'recurring', 'service_request', { customerStatus: status });
      const kind = status === 'new' ? 'service request, new household' : 'service request, returning or unsure household';
      const { cand } = await compare(worlds, kind, submitSpec(lead, { ...base, headers: browser }));
      assert.equal(cand.status, 202, kind);
      accepted.push({ lead, headers: browser });
    } else if (roll < 0.33) {
      const lead = makeLead(g, 'onetime', 'service_request');
      const { cand } = await compare(worlds, 'service request, one-time cleanup', submitSpec(lead, { ...base, headers: browser }));
      assert.equal(cand.status, 202);
      accepted.push({ lead, headers: browser });
    } else if (roll < 0.40) {
      const lead = makeLead(g, 'custom', 'service_request');
      const { cand } = await compare(worlds, 'custom estimate request', submitSpec(lead, { ...base, headers: browser }));
      assert.equal(cand.status, 202);
      assert.equal(cand.outgoing[0].body.stage, 'estimate_requested');
    } else if (roll < 0.50) {
      const contact = g.pick(['text', 'email']);
      const lead = makeLead(g, g.pick(['recurring', 'recurring', 'onetime', 'custom']), 'quote_delivery', { preferredContact: contact });
      const { cand } = await compare(worlds, contact === 'text' ? 'texted quote' : 'emailed quote', submitSpec(lead, { ...base, headers: browser }));
      assert.equal(cand.status, 202);
    } else if (roll < 0.56) {
      const lead = makeLead(g, g.pick(['recurring', 'onetime', 'custom']), 'question');
      const { cand } = await compare(worlds, 'question', submitSpec(lead, { ...base, headers: browser }));
      assert.equal(cand.status, 202);
    } else if (roll < 0.72) {
      const [label, mutate] = g.pick(MUTATIONS);
      const lead = makeLead(g, g.pick(['recurring', 'recurring', 'onetime', 'custom']), g.pick(['service_request', 'service_request', 'quote_delivery', 'question']));
      mutate(lead, g);
      const { cand } = await compare(worlds, 'invalid input: ' + label, submitSpec(lead, { ...base, headers: browser }));
      assert.equal(cand.status, 400, label);
      assert.equal(cand.outgoing.length, 0, label + ': nothing may be forwarded');
    } else if (roll < 0.77 && accepted.length) {
      const again = g.pick(accepted);
      if (!again.lead.requestId) continue;
      if (g.chance(0.7)) {
        const { cand } = await compare(worlds, 'repeated submission (same request)', submitSpec(again.lead, { ...base, headers: again.headers }));
        assert.equal(cand.status, 202);
        assert.equal(cand.outgoing.length, 0, 'a repeated submission must not be forwarded again');
      } else {
        const changed = { ...again.lead, firstName: again.lead.firstName + 'x' };
        const { cand } = await compare(worlds, 'repeated request id with changed details', submitSpec(changed, { ...base, headers: again.headers }));
        assert.equal(cand.status, 409);
        assert.equal(JSON.parse(cand.text).code, 'REQUEST_ID_CONFLICT');
        assert.equal(cand.outgoing.length, 0);
      }
    } else if (roll < 0.80) {
      const lead = makeLead(g, 'recurring', 'service_request');
      const upstream = g.pick(['fail', 'throw']);
      const { cand } = await compare(worlds, 'team system unavailable', submitSpec(lead, { ...base, headers: browser, upstream }));
      assert.equal(cand.status, 409);
      assert.equal(JSON.parse(cand.text).code, 'SUBMISSION_UNCERTAIN');
      if (lead.requestId) {
        clock += 1000;
        const retry = await compare(worlds, 'retry after an uncertain result', submitSpec(lead, { ...base, headers: browser }));
        assert.equal(retry.cand.status, 409);
        assert.equal(retry.cand.outgoing.length, 0, 'an uncertain request is never sent twice');
      }
    } else if (roll < 0.86) {
      const saved = await compare(worlds, 'save plan', resumeSpec('/quote-resume', planBody(g), ip, base));
      assert.equal(saved.cand.status, 201);
      assert.match(JSON.parse(saved.cand.text).url, BUILDER_SAVE_LINK_PATTERN, 'the quote builder refuses any other link form');
      tally.plansSaved += 1;
      const token = JSON.parse(saved.cand.text).url.split('#resume=')[1];
      assert.equal(JSON.parse(saved.ref.text).url.split('#resume=')[1], token);
      clock += g.pick([1000, 3600 * 1000, 3 * 24 * 3600 * 1000]);
      const opened = await compare(worlds, 'open plan', resumeSpec('/quote-resume/open', { token }, ip, base));
      assert.equal(opened.cand.status, 200);
      tally.plansOpened += 1;
    } else if (roll < 0.89) {
      const bad = g.pick([
        ['save plan with an extra key', '/quote-resume', { ...planBody(g), firstName: 'Alex' }],
        ['save plan outside the service area', '/quote-resume', { ...planBody(g), zip: g.pick(OUT_OF_AREA_ZIPS) }],
        ['open plan with a malformed token', '/quote-resume/open', { token: 'short' }],
        ['open plan that was never saved', '/quote-resume/open', { token: 'A'.repeat(43) }],
        ['open plan with an extra key', '/quote-resume/open', { token: 'B'.repeat(43), zip: '46032' }],
        ['save plan with bad JSON', '/quote-resume', '{not json'],
        ['save plan that is too large', '/quote-resume', JSON.stringify({ ...planBody(g), pad: 'x'.repeat(1200) })]
      ]);
      const { cand } = await compare(worlds, 'invalid input: ' + bad[0], resumeSpec(bad[1], bad[2], ip, base));
      assert.ok([400, 404, 413].includes(cand.status), bad[0]);
    } else if (roll < 0.95) {
      const plan = makePlan(g, g.pick(['recurring', 'recurring', 'recurring', 'onetime', 'custom']));
      const body = g.pick([
        () => ({ zip: g.pick(serviceZips), serviceType: plan.frequencyId === 'onetime' ? 'one-time' : 'recurring', propertyType: 'residential', dogs: plan.dogs, areas: plan.areaIds, yardSize: plan.yardSizeId, frequency: plan.frequencyId === 'onetime' ? 'not_applicable' : plan.frequencyId }),
        () => ({ zipCode: g.pick(serviceZips), service: 'recurring', property: 'home', dogCount: 'two', serviceAreas: ['back yard'], yardSizeId: 'quarter acre', serviceFrequency: 'weekly' }),
        () => ({ zip: g.pick(OUT_OF_AREA_ZIPS), serviceType: 'recurring' }),
        () => ({ zip: g.pick(serviceZips) }),
        () => ({ zip: g.pick(serviceZips), serviceType: 'recurring', propertyType: 'kennel', dogs: 12 }),
        () => ({ zip: g.pick(serviceZips), serviceType: 'recurring', propertyType: 'residential', dogs: 7, areas: ['back'], yardSize: 's', frequency: 'every other week' }),
        () => ({ zip: g.pick(serviceZips), serviceType: 'recurring', propertyType: 'residential', dogs: 2, areas: ['back', 'front'], yardSize: 'medium', frequency: 'biweekly' })
      ])();
      const variant = g.random();
      if (variant < 0.85) await compare(worlds, 'voice price request', voiceSpec(body, 'made-up-voice-token', base));
      else if (variant < 0.93) { const { cand } = await compare(worlds, 'voice price request, wrong token', voiceSpec(body, 'wrong-token', base)); assert.equal(cand.status, 401); }
      else await compare(worlds, 'voice price request, bad transport', { ...voiceSpec(body, 'made-up-voice-token', base), ...g.pick([{ body: '{oops' }, { body: '[]' }, { headers: { 'Content-Type': 'text/plain', 'Authorization': 'Bearer made-up-voice-token' } }]) });
    } else if (roll < 0.97) {
      const lead = g.chance(0.5)
        ? { schemaVersion: 'purge-quote-widget.v2', stage: g.pick(['phone_captured', 'quote_updated', 'service_requested', 'out_of_area', 'not_a_stage']), phone: '317555' + String(1000 + g.int(9000)), email: g.chance(0.5) ? 'legacy@example.com' : '', zip: '46032', requestId: 'legacy-' + g.id() }
        : makeLead(g, 'recurring', 'service_request');
      await compare(worlds, 'legacy intake address (POST /)', { ...submitSpec(lead, { ...base, headers: browser }), url: WORKER + '/' });
    } else if (roll < 0.985) {
      const lead = makeLead(g, 'recurring', 'service_request');
      const spec = g.pick([
        () => ({ ...submitSpec(lead, base), body: '{"broken": ' }),
        () => ({ ...submitSpec(lead, base), body: '[1,2,3]' }),
        () => submitSpec(lead, { ...base, headers: { ...browser, 'Content-Type': 'text/plain' } }),
        () => submitSpec(lead, { ...base, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip } }),
        () => submitSpec(lead, { ...base, headers: { ...browser, 'Origin': 'https://not-allowed.example' } }),
        () => submitSpec(lead, { ...base, headers: { ...browser, 'Origin': 'https://purge-lead-relay.purgepros.workers.dev' } }),
        () => submitSpec({ ...lead, notes: 'x'.repeat(31000) }, { ...base, headers: browser }),
        () => ({ method: 'OPTIONS', url: WORKER + '/submit', headers: { 'Origin': browser.Origin }, ...base }),
        () => ({ method: 'GET', url: WORKER + '/submit', headers: {}, ...base }),
        () => ({ method: 'PUT', url: WORKER + '/submit', headers: browser, body: JSON.stringify(lead), ...base })
      ])();
      await compare(worlds, 'transport-level refusal or pre-flight', spec);
    } else {
      const host = g.pick([WORKER, QUOTE_HOST]);
      const query = g.pick(['', '?open_quote=1', '?open_quote=1&utm_source=google&utm_medium=cpc&utm_campaign=fall&gclid=abc123', '?fbclid=fb-1&gbraid=gb-1&wbraid=wb-1']);
      const pathname = g.pick([...FORWARD_PATHS, '/purge-quote.js', '/reviews', '/unknown', '/quote/extra', '/Quote']);
      await compare(worlds, 'page and script addresses (GET)', { method: 'GET', url: host + pathname + (pathname === '/reviews' || pathname === '/purge-quote.js' ? '' : query), headers: {}, ...base });
    }
  }
  return worlds;
}

const mainWorlds = await differential(PRODUCTION_LIKE, 20261009, 1050);
await differential(BARE, 20261005, 200, ORIGINS.slice(0, 2));

// Scripted cases on the main worlds (compared the same way).
{
  const g = generator(77);
  // Every page address, on both hosts, once at least.
  for (const host of [WORKER, QUOTE_HOST]) for (const pathname of [...FORWARD_PATHS, '/purge-quote.js', '/reviews', '/nothing-here']) {
    await compare(mainWorlds, 'page and script addresses (GET)', { method: 'GET', url: host + pathname + (FORWARD_PATHS.includes(pathname) ? '?open_quote=1&utm_source=google&gclid=g-1&gbraid=b-1&wbraid=w-1&fbclid=f-1' : ''), headers: {}, seed: 5 });
  }
  // HEAD and POST on the page addresses behave as before.
  await compare(mainWorlds, 'page and script addresses (other methods)', { method: 'HEAD', url: QUOTE_HOST + '/', headers: {}, seed: 5 });
  await compare(mainWorlds, 'page and script addresses (other methods)', { method: 'POST', url: QUOTE_HOST + '/quote', headers: { 'Content-Type': 'application/json' }, body: '{}', seed: 5 });
  // Seven-day resumption: opens just inside seven days, gone just after.
  const savedAt = clock + 60000;
  const saved = await compare(mainWorlds, 'save plan', resumeSpec('/quote-resume', planBody(g, 'recurring'), '198.51.100.7', { seed: 901, at: savedAt }));
  const token = JSON.parse(saved.cand.text).url.split('#resume=')[1];
  const inside = await compare(mainWorlds, 'open plan', resumeSpec('/quote-resume/open', { token }, '198.51.100.7', { seed: 902, at: savedAt + 7 * 24 * 3600 * 1000 - 1000 }));
  assert.equal(inside.cand.status, 200, 'a saved plan opens inside seven days');
  const after = await compare(mainWorlds, 'open plan after seven days', resumeSpec('/quote-resume/open', { token }, '198.51.100.7', { seed: 903, at: savedAt + 7 * 24 * 3600 * 1000 + 1000 }));
  assert.equal(after.cand.status, 404, 'a saved plan is gone after seven days');
  // Save-link rate limit: ten an hour for one address, the eleventh refused.
  const hour = Math.ceil(clock / 3600000) * 3600000 + 60000;
  for (let n = 1; n <= 11; n += 1) {
    const result = await compare(mainWorlds, 'save plan (rate limit)', resumeSpec('/quote-resume', planBody(g, 'recurring'), '198.51.100.9', { seed: 950 + n, at: hour + n * 1000 }));
    assert.equal(result.cand.status, n <= 10 ? 201 : 429);
  }
  // Save without the edge address header, and from an origin that is not allowed.
  await compare(mainWorlds, 'save plan refused', { ...resumeSpec('/quote-resume', planBody(g), '198.51.100.9', { seed: 970 }), headers: { 'Content-Type': 'application/json', 'Origin': 'https://itspurgepros.com' } });
  await compare(mainWorlds, 'save plan refused', { ...resumeSpec('/quote-resume', planBody(g), '198.51.100.9', { seed: 971 }), headers: { 'Content-Type': 'application/json', 'Origin': 'https://not-allowed.example', 'CF-Connecting-IP': '198.51.100.9' } });
}

// Fixed cases for the blocks that carry approved edits. Each is compared with the reference as above,
// and the value that must hold is also stated here, so the case cannot pass by both bundles being wrong.
{
  const g = generator(909);
  const browser = { 'Content-Type': 'application/json', 'Origin': 'https://itspurgepros.com', 'User-Agent': 'RegressionBrowser/fixed', 'CF-Connecting-IP': '203.0.113.77' };
  const fixed = async (kind, lead, extra = {}) => (await compare(mainWorlds, kind, submitSpec(lead, { seed: 880000 + tally.requests, headers: browser, ...extra }))).cand;
  // Consent is recorded from the reply preference, never from the box alone: a request that prefers
  // email or a call records no text consent even when it carries the box, a version and a time.
  for (const intent of ['service_request', 'quote_delivery', 'question']) for (const preferredContact of ['email', 'call']) {
    const lead = makeLead(g, 'recurring', intent, { preferredContact, customerStatus: 'new' });
    Object.assign(lead, { email: 'person@example.com', smsTransactionalConsent: true, consentVersion: '2026-08-transactional-v1', smsConsentCapturedAt: '2026-10-09T11:59:00.000Z' });
    const cand = await fixed(`consent: ${preferredContact} preference carrying the text-consent box (${intent})`, lead);
    assert.equal(cand.status, 202);
    const body = cand.outgoing[0].body;
    assert.deepEqual([body.preferredContact, body.smsTransactionalConsent, body.consent, body.consentVersion, body.smsConsentCapturedAt], [preferredContact, false, 'no', '', ''], 'no text consent may be recorded for an email or call preference');
    assert.ok(body.quoteSummary.includes('\nService SMS permission: No\n'));
  }
  for (const intent of ['service_request', 'quote_delivery']) {
    const lead = makeLead(g, 'recurring', intent, { preferredContact: 'text', customerStatus: 'new' });
    Object.assign(lead, { smsTransactionalConsent: true, consentVersion: '2026-08-transactional-v1', smsConsentCapturedAt: '2026-10-09T11:59:00.000Z' });
    const body = (await fixed(`consent: text preference (${intent})`, lead)).outgoing[0].body;
    assert.deepEqual([body.smsTransactionalConsent, body.consent, body.consentVersion, body.smsConsentCapturedAt, body.consentUserAgent], [true, 'yes', '2026-08-transactional-v1', '2026-10-09T11:59:00.000Z', 'RegressionBrowser/fixed']);
  }
  // Cleaning of forwarded values.
  {
    const lead = makeLead(g, 'recurring', 'service_request', { preferredContact: 'email', customerStatus: 'returning' });
    Object.assign(lead, { email: '  Person.Mixed@Example.COM ', notes: 'n'.repeat(900), requestId: 'r'.repeat(300) });
    const body = (await fixed('cleaning: mixed-case email, long notes, long request id', lead)).outgoing[0].body;
    assert.equal(body.email, 'person.mixed@example.com');
    assert.equal(body.notes, 'n'.repeat(500));
    assert.equal(body.requestId, 'r'.repeat(120));
  }
  // The first-cleanup fields, one request of each case, stated outright.
  const minuteFields = body => [body.offerEligibility, body.standardCleanupIncludedMinutes, body.standardAdditionalMinuteCents, body.promotionalAdditionalMinuteCents, body.newCustomerCleanupIncludedMinutes, body.newCustomerExtraTimeRequiresAgreement, body.quoteSummary.split('\n')[10]];
  const CASES = [
    ['recurring', 'new', ['new_customer_review', 30, 100, null, 120, true, NEW_FIRST_VISIT.newHousehold]],
    ['recurring', 'returning', ['returning_customer_review', 30, 100, null, null, null, NEW_FIRST_VISIT.returning]],
    ['recurring', 'not_sure', ['returning_customer_review', 30, 100, null, null, null, NEW_FIRST_VISIT.returning]],
    ['onetime', 'new', ['not_applicable', 30, 100, null, null, null, NEW_FIRST_VISIT.onetime]],
    ['onetime', 'returning', ['not_applicable', 30, 100, null, null, null, NEW_FIRST_VISIT.onetime]],
    ['custom', 'new', [null, null, null, null, null, null, NEW_FIRST_VISIT.custom]]
  ];
  for (const intent of ['service_request', 'quote_delivery', 'question']) for (const [plan, customerStatus, want] of CASES) {
    const lead = makeLead(g, plan, intent, { preferredContact: 'email', customerStatus });
    lead.email = 'person@example.com';
    const body = (await fixed(`first-cleanup fields: ${plan}, ${customerStatus} (${intent})`, lead)).outgoing[0].body;
    const got = minuteFields(body);
    if (plan === 'custom') { assert.ok(['custom_review', 'not_applicable'].includes(got[0])); got[0] = null; }
    assert.deepEqual(got, want, `first-cleanup fields: ${plan}, ${customerStatus}, ${intent}`);
    assert.equal(body.newCustomerCleanupIncludedMinutes === 120, body.offerEligibility === 'new_customer_review', 'the 120-minute allowance is forwarded for a new household only');
  }
  // Pre-flight, from an allowed origin and from another one.
  const preflight = await compare(mainWorlds, 'pre-flight (OPTIONS /submit)', { method: 'OPTIONS', url: WORKER + '/submit', headers: { 'Origin': 'https://itspurgepros.com' }, seed: 5 });
  assert.equal(preflight.cand.status, 204);
  assert.equal(preflight.cand.headers['access-control-allow-origin'], 'https://itspurgepros.com');
  const refused = await compare(mainWorlds, 'pre-flight (OPTIONS /submit)', { method: 'OPTIONS', url: WORKER + '/submit', headers: { 'Origin': 'https://not-allowed.example' }, seed: 5 });
  // Existing behaviour, kept: the pre-flight itself answers 204, but names no usable origin, so the browser blocks the request.
  assert.deepEqual([refused.cand.status, refused.cand.headers['access-control-allow-origin']], [204, 'null']);
  // The legacy intake address: unknown stage refused; a failing or unreachable team system is never reported as accepted.
  const legacy = (stage, extra = {}) => compare(mainWorlds, 'legacy intake address (POST /), fixed', { ...submitSpec({ schemaVersion: 'purge-quote-widget.v2', stage, phone: '3175550142', zip: '46032', requestId: 'legacy-fixed-' + stage + (extra.upstream || '') }, { seed: 5, headers: browser, ...extra }), url: WORKER + '/' });
  assert.equal((await legacy('not_a_stage')).cand.status, 400);
  const legacyOk = await legacy('phone_captured');
  assert.deepEqual([legacyOk.cand.status, legacyOk.cand.outgoing.length, legacyOk.cand.outgoing[0].url], [202, 1, HOOK_LEGACY]);
  for (const upstream of ['fail', 'throw']) {
    const failed = await legacy('phone_captured', { upstream });
    assert.equal(failed.cand.status, 502, 'legacy intake with the team system ' + upstream);
    assert.equal(JSON.parse(failed.cand.text).accepted, false);
  }
  // Voice AI prices for each named frequency (the caller's words, and the id the agent's script reads).
  for (const [said, frequencyId, dogs] of [['weekly', 'weekly', 2], ['every other week', 'every_other_week', 2], ['twice weekly', 'twice_weekly', 3]]) {
    const { cand } = await compare(mainWorlds, 'voice price request, fixed', voiceSpec({ zip: serviceZips[0], serviceType: 'recurring', propertyType: 'residential', dogs, areas: ['back'], yardSize: 's', frequency: said }, 'made-up-voice-token', { seed: 5 }));
    const answer = JSON.parse(cand.text);
    assert.deepEqual([cand.status, answer.result, answer.frequencyId, answer.pricingScope, answer.nextStep], [200, 'standard_price', frequencyId, 'recurring_maintenance', NEW_VOICE_STEP], 'voice price: ' + said);
  }
}
// The current-format intake address never falls back to the legacy webhook address.
for (const vars of [{ ...PRODUCTION_LIKE, GHL_WEBHOOK_URL_V3: '' }, { GHL_WEBHOOK_URL: HOOK_LEGACY, VOICE_AI_QUOTE_TOKEN: 'made-up-voice-token' }]) {
  const worlds = [makeWorld(reference, vars), makeWorld(candidate, vars)];
  const lead = makeLead(generator(606), 'recurring', 'service_request', { preferredContact: 'text', customerStatus: 'new' });
  const { cand } = await compare(worlds, 'current-format intake with no webhook address of its own', submitSpec(lead, { seed: 6 }));
  assert.deepEqual([cand.status, JSON.parse(cand.text).message, cand.outgoing.length], [500, 'Relay not configured', 0]);
}

// Idempotency: the same request sent twice at the same moment is forwarded once, on both bundles.
for (const [label, module] of [['reference', reference], ['candidate', candidate]]) {
  const world = makeWorld(module, PRODUCTION_LIKE);
  const lead = makeLead(generator(4242), 'recurring', 'service_request', { customerStatus: 'new', preferredContact: 'text' });
  lead.requestId = 'req-double-submit';
  active = world; world.running = true; workerRandom = mulberry32(9);
  const ctx = { waitUntil(promise) { world.pending.push(Promise.resolve(promise).catch(() => {})); } };
  const [first, second] = await Promise.all([world.module.default.fetch(buildRequest(submitSpec(lead)), world.env, ctx), world.module.default.fetch(buildRequest(submitSpec(lead)), world.env, ctx)]);
  while (world.pending.length) await world.pending.shift();
  world.running = false;
  assert.deepEqual([first.status, second.status], [202, 202], `${label}: double submit`);
  assert.equal(world.outgoing.filter(call => call.url === HOOK_V3).length, 1, `${label}: a double submit must be forwarded once`);
}

const REQUIRED_KINDS = ['service request, new household', 'service request, returning or unsure household', 'service request, one-time cleanup', 'custom estimate request', 'texted quote', 'emailed quote', 'question', 'save plan', 'open plan', 'repeated submission (same request)', 'repeated request id with changed details', 'team system unavailable', 'voice price request', 'legacy intake address (POST /)', 'page and script addresses (GET)', 'transport-level refusal or pre-flight', 'pre-flight (OPTIONS /submit)', 'legacy intake address (POST /), fixed', 'voice price request, fixed', 'current-format intake with no webhook address of its own', 'cleaning: mixed-case email, long notes, long request id'];
for (const kind of REQUIRED_KINDS) assert.ok(tally.byKind[kind] > 0, `No request of kind: ${kind}`);
for (const [label] of MUTATIONS) assert.ok(tally.byKind['invalid input: ' + label] > 0, `No invalid-input case: ${label}`);
assert.ok(tally.requests >= 1000, 'fewer than 1,000 differential requests');
assert.ok(tally.byStatus[202] >= 400 && tally.forwardsV3 >= 400, 'too few accepted requests to be a meaningful comparison');
assert.ok(tally.metaCalls >= 100 && tally.plansSaved >= 20 && tally.plansOpened >= 20);
for (const [name] of APPROVED) assert.ok(approvedCounts[name] > 0, `Approved difference never exercised: ${name}`);

// ---------------------------------------------------------------------------
// c. New behaviour (candidate only)
// ---------------------------------------------------------------------------
const newBehaviour = {};
async function once(vars, spec) { return send(makeWorld(candidate, vars), spec); }
const get = (url, vars = PRODUCTION_LIKE) => once(vars, { method: 'GET', url, headers: {} });

{ // 1. The forward to the quote page.
  const full = '?open_quote=1&utm_source=google&utm_medium=cpc&utm_campaign=fall%20sale&utm_content=ad+1&utm_term=dog%2Bwaste&gclid=Cj0abc_123-x&gbraid=0AAAAA&wbraid=1BBBBB&fbclid=IwAR0xyz';
  for (const pathname of FORWARD_PATHS) {
    const result = await get(QUOTE_HOST + pathname + full);
    assert.equal(result.status, 302);
    assert.equal(result.headers.location, DEFAULT_QUOTE_PAGE + full, 'query string must be kept whole');
    assert.equal(result.text, '');
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.ok(!result.headers.location.includes('#'), 'the forward must not carry a fragment, so the browser keeps #resume=');
  }
  assert.equal((await get(QUOTE_HOST + '/')).headers.location, DEFAULT_QUOTE_PAGE);
  // Overridden target, also one that carries its own query.
  assert.equal((await get(QUOTE_HOST + '/quote?gclid=a', { ...PRODUCTION_LIKE, QUOTE_PAGE_URL: 'https://staging.example.test/quote-test' })).headers.location, 'https://staging.example.test/quote-test?gclid=a');
  assert.equal((await get(QUOTE_HOST + '/quote?gclid=a', { ...PRODUCTION_LIKE, QUOTE_PAGE_URL: ' https://staging.example.test/page?preview=1#top ' })).headers.location, 'https://staging.example.test/page?preview=1&gclid=a');
  // A target that is not a plain https address falls back to the default.
  for (const bad of ['http://itspurgepros.com/quote', 'javascript:alert(1)', '//evil.example/quote', 'not a url', '', 'https://user:pass@evil.example/', 42]) {
    assert.equal((await get(QUOTE_HOST + '/quote', { ...PRODUCTION_LIKE, QUOTE_PAGE_URL: bad })).headers.location, DEFAULT_QUOTE_PAGE, `bad target ${bad}`);
  }
  // A target on the Worker's own host would loop: the default is used instead.
  assert.equal((await get(QUOTE_HOST + '/quote', { ...PRODUCTION_LIKE, QUOTE_PAGE_URL: 'https://quote.itspurgepros.com/quote' })).headers.location, DEFAULT_QUOTE_PAGE);
  // No open redirect: nothing a visitor supplies can change where the forward goes.
  const attempts = ['/quote?next=https://evil.example/', '/quote?url=//evil.example', '/?redirect=https%3A%2F%2Fevil.example&QUOTE_PAGE_URL=https://evil.example', '/quote?@evil.example', '/quote?%0d%0aLocation:%20https://evil.example', '/quote/?\\\\evil.example', '/quote?a=1#@evil.example'];
  for (const attempt of attempts) {
    const result = await get(QUOTE_HOST + attempt);
    assert.equal(result.status, 302, attempt);
    const location = new URL(result.headers.location);
    assert.equal(location.origin + location.pathname, DEFAULT_QUOTE_PAGE, attempt);
    assert.equal(location.hash, '', attempt);
    assert.ok(!/[\r\n]/.test(result.headers.location), attempt);
  }
  for (const pathname of ['//evil.example/quote', '/quote/https://evil.example', '/%2F%2Fevil.example', '/quote%2f..%2f', '/QUOTE', '/quote.html']) {
    assert.equal((await get(QUOTE_HOST + pathname)).status, 404, `${pathname} must not forward`);
  }
  const spoofed = await once(PRODUCTION_LIKE, { method: 'GET', url: 'https://evil.example/quote?x=1', headers: { 'X-Forwarded-Host': 'evil.example', 'Referer': 'https://evil.example/' } });
  assert.equal(spoofed.headers.location, DEFAULT_QUOTE_PAGE + '?x=1');
  newBehaviour.forward = `GET ${FORWARD_PATHS.join(', ')} answer 302 with the whole query kept; default and overridden target; ${attempts.length} open-redirect attempts all stay on the configured page`;
}

function runLauncher(script, { href, existing, stored }) {
  const calls = [];
  const listeners = {};
  const session = new Map(stored || []);
  const window = existing ? { PurgeProsQuote: existing } : {};
  const context = {
    window, URL, URLSearchParams,
    location: { href, assign: address => calls.push(['assign', address]), replace: address => calls.push(['replace', address]) },
    document: { addEventListener: (type, handler) => { listeners[type] = handler; } },
    sessionStorage: { getItem: key => (session.has(key) ? session.get(key) : null), setItem: (key, value) => { session.set(key, value); } }
  };
  vm.runInNewContext(script, context);
  return {
    window, calls, session,
    click(matches, alreadyHandled = false) {
      const event = { defaultPrevented: alreadyHandled, prevented: false, preventDefault() { this.prevented = true; }, target: { closest: () => (matches ? {} : null) } };
      if (listeners.click) listeners.click(event);
      return event;
    }
  };
}
{ // 2. The launcher script served in place of the retired widget.
  const served = await get(WORKER + '/purge-quote.js');
  assert.equal(served.status, 200);
  assert.equal(served.headers['content-type'], 'application/javascript; charset=utf-8');
  assert.equal(served.headers['cache-control'], 'public, max-age=300', 'five-minute cache');
  assert.equal(served.headers['access-control-allow-origin'], '*');
  assert.equal(served.text, expectedLauncher(DEFAULT_QUOTE_PAGE));
  const overridden = await get(WORKER + '/purge-quote.js', { ...PRODUCTION_LIKE, QUOTE_PAGE_URL: 'https://staging.example.test/quote-test' });
  assert.equal(overridden.text, expectedLauncher('https://staging.example.test/quote-test'));
  const lines = launcherSource.trimEnd().split('\n').length;
  assert.ok(lines <= 60, `launcher has ${lines} lines`);
  assert.ok(served.text.length < 4000);
  for (const pattern of [/\$\s?\d/, /\d+\s*(minutes?|min\b)/i, /per (visit|minute)/i, /start-up fee/i, /fbq|gtag|dataLayer|sendBeacon|XMLHttpRequest|fetch\(|new Image|googletagmanager|facebook/i, /terms|consent/i]) {
    assert.ok(!pattern.test(served.text), `launcher must not contain ${pattern}`);
  }
  new vm.Script(served.text);
  // A quote button on an old page sends the visitor to the quote page with the page's query string.
  let page = runLauncher(served.text, { href: 'https://itspurgepros.com/pricing?utm_source=google&utm_medium=cpc&gclid=abc' });
  assert.equal(typeof page.window.PurgeProsQuote.open, 'function');
  assert.equal(typeof page.window.PurgeProsQuote.close, 'function');
  let click = page.click(true);
  assert.equal(click.prevented, true);
  assert.deepEqual(page.calls, [['assign', DEFAULT_QUOTE_PAGE + '?utm_source=google&utm_medium=cpc&gclid=abc&open_quote=1']]);
  assert.equal(page.click(false).prevented, false, 'other clicks are left alone');
  assert.equal(page.click(true, true).prevented, false, 'a click another script already handled is left alone');
  assert.equal(page.calls.length, 1);
  // The global open function, with and without a ZIP.
  page = runLauncher(served.text, { href: 'https://itspurgepros.com/carmel' });
  page.window.PurgeProsQuote.open({ zip: '46032' });
  page.window.PurgeProsQuote.open({ zip: 'abc' });
  page.window.PurgeProsQuote.open();
  assert.deepEqual(page.calls, [['assign', DEFAULT_QUOTE_PAGE + '?zip=46032&open_quote=1'], ['assign', DEFAULT_QUOTE_PAGE + '?open_quote=1'], ['assign', DEFAULT_QUOTE_PAGE + '?open_quote=1']]);
  // An old address that asked for the quote to open goes straight to the quote page.
  page = runLauncher(served.text, { href: 'https://blog.itspurgepros.com/post/some-article?open_quote=1&fbclid=xyz' });
  assert.deepEqual(page.calls, [['replace', DEFAULT_QUOTE_PAGE + '?fbclid=xyz&open_quote=1']]);
  page = runLauncher(served.text, { href: 'https://itspurgepros.com/#get-quote' });
  assert.deepEqual(page.calls, [['replace', DEFAULT_QUOTE_PAGE + '?open_quote=1']]);
  // The arrival source is remembered for the tab and carried from a later page.
  page = runLauncher(served.text, { href: 'https://blog.itspurgepros.com/post/another', stored: [['pp_launcher_arrival_query', '?utm_source=facebook&fbclid=f1&open_quote=1']] });
  page.click(true);
  assert.deepEqual(page.calls, [['assign', DEFAULT_QUOTE_PAGE + '?utm_source=facebook&fbclid=f1&open_quote=1']]);
  page = runLauncher(served.text, { href: 'https://blog.itspurgepros.com/post/first?utm_source=facebook&fbclid=f1' });
  assert.equal(page.session.get('pp_launcher_arrival_query'), '?utm_source=facebook&fbclid=f1');
  // Only campaign and click-id values are remembered for the tab; anything else in the arrival address is not.
  page = runLauncher(served.text, { href: 'https://itspurgepros.com/pricing?utm_source=google&email=someone%40example.com&gclid=G1&name=Alex&token=abc' });
  assert.equal(page.session.get('pp_launcher_arrival_query'), '?utm_source=google&gclid=G1');
  page = runLauncher(served.text, { href: 'https://itspurgepros.com/pricing?email=someone%40example.com' });
  assert.equal(page.session.has('pp_launcher_arrival_query'), false);
  // A stored value from an older copy of the script, or one tampered with, is filtered the same way when used.
  page = runLauncher(served.text, { href: 'https://itspurgepros.com/carmel', stored: [['pp_launcher_arrival_query', '?utm_source=google&email=someone%40example.com&gclid=G1']] });
  page.click(true);
  assert.deepEqual(page.calls, [['assign', DEFAULT_QUOTE_PAGE + '?utm_source=google&gclid=G1&open_quote=1']]);
  // On the quote page itself, or where a builder already owns the launchers, it does nothing.
  for (const href of [DEFAULT_QUOTE_PAGE + '?open_quote=1', DEFAULT_QUOTE_PAGE + '/?open_quote=1#resume=' + 'A'.repeat(43)]) {
    page = runLauncher(served.text, { href });
    assert.equal(page.window.PurgeProsQuote, undefined);
    assert.equal(page.click(true).prevented, false);
    assert.deepEqual(page.calls, []);
  }
  const owner = { open() {}, close() {}, config: {} };
  page = runLauncher(served.text, { href: 'https://itspurgepros.com/?open_quote=1', existing: owner });
  assert.equal(page.window.PurgeProsQuote, owner);
  assert.deepEqual(page.calls, []);
  newBehaviour.launcher = `${lines} lines, ${served.text.length} bytes, five-minute cache; no price, policy wording or tracking call; only campaign values remembered for the tab; launchers, the global open function and auto-open addresses all go to the quote page`;
}

const serviceLead = (overrides = {}) => ({ ...makeLead(generator(31337), 'recurring', 'service_request', { customerStatus: 'new', preferredContact: 'text' }), requestId: 'req-new-behaviour', email: 'person@example.com', fbp: 'fb.1.1700000000000.1', ...overrides });
{ // 3. The Meta guard and the kept answer.
  const metaRun = async (vars, extra = {}, lead = serviceLead()) => {
    const result = await once(vars, submitSpec(lead, extra));
    assert.equal(result.status, 202, 'the customer answer never depends on Meta');
    assert.equal(result.outgoing.filter(call => call.url === HOOK_V3).length, 1, 'the request still reaches the team');
    return { calls: result.outgoing.filter(isMetaCall), logs: result.logs };
  };
  const LOG_KEYS = ['event', 'requestId', 'stage', 'testEvent', 'httpStatus', 'eventsReceived', 'fbtraceId', 'errorCode'];
  // Production, none of the new variables: sent as today, plus the log line.
  let run = await metaRun(PRODUCTION_LIKE);
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].url, 'https://graph.facebook.com/v21.0/100000000000001/events?access_token=made-up-meta-token');
  assert.ok(!('test_event_code' in run.calls[0].body));
  assert.equal(run.calls[0].body.data[0].event_name, 'Lead');
  assert.deepEqual(run.logs, [{ event: 'meta_capi_result', requestId: 'req-new-behaviour', stage: 'service_requested', testEvent: false, httpStatus: 200, eventsReceived: 1, fbtraceId: 'TRACE-RECEIVED', errorCode: null }]);
  assert.deepEqual(Object.keys(run.logs[0]), LOG_KEYS, 'the log line holds these fields and nothing else');
  // Production with a test code: labelled.
  run = await metaRun({ ...PRODUCTION_LIKE, META_TEST_EVENT_CODE: 'TEST12345' });
  assert.equal(run.calls[0].body.test_event_code, 'TEST12345');
  assert.equal(run.logs[0].testEvent, true);
  // Staging without a test code: never sent.
  run = await metaRun({ ...PRODUCTION_LIKE, STAGING: '1' });
  assert.deepEqual([run.calls.length, run.logs.length], [0, 0], 'a staging copy without a test code must send nothing to Meta');
  // Staging with a test code: sent, labelled.
  run = await metaRun({ ...PRODUCTION_LIKE, STAGING: '1', META_TEST_EVENT_CODE: 'TEST12345' });
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].body.test_event_code, 'TEST12345');
  assert.equal(run.logs[0].testEvent, true);
  // Any staging mark stops a real event, however it was typed; a blank test code does not count as a code.
  for (const mark of ['1', 'true', 'TRUE', ' 1', 'yes', 'staging', 1, true]) {
    run = await metaRun({ ...PRODUCTION_LIKE, STAGING: mark });
    assert.deepEqual([run.calls.length, run.logs.length], [0, 0], `STAGING ${JSON.stringify(mark)} without a test code must send nothing to Meta`);
    run = await metaRun({ ...PRODUCTION_LIKE, STAGING: mark, META_TEST_EVENT_CODE: '   ' });
    assert.equal(run.calls.length, 0, `STAGING ${JSON.stringify(mark)} with a blank test code must send nothing to Meta`);
    run = await metaRun({ ...PRODUCTION_LIKE, STAGING: mark, META_TEST_EVENT_CODE: 'TEST12345' });
    assert.equal(run.calls[0].body.test_event_code, 'TEST12345');
  }
  // Explicitly off, or absent: production behaviour.
  for (const mark of ['0', 'false', 'FALSE', '', ' ', null, undefined, 0, false]) {
    run = await metaRun({ ...PRODUCTION_LIKE, STAGING: mark });
    assert.equal(run.calls.length, 1, `STAGING ${JSON.stringify(mark)} is not a staging mark`);
    assert.ok(!('test_event_code' in run.calls[0].body));
  }
  // No Meta values: nothing sent, nothing logged.
  run = await metaRun(BARE);
  assert.deepEqual([run.calls.length, run.logs.length], [0, 0]);
  // Unchanged rule: a request from a workers.dev page sends nothing unless a test code is set.
  const fromWorkersDev = { headers: { 'Content-Type': 'application/json', 'Origin': 'https://purge-quote.purgepros.workers.dev', 'User-Agent': 'RegressionBrowser/1.0', 'CF-Connecting-IP': '203.0.113.10' } };
  run = await metaRun(PRODUCTION_LIKE, fromWorkersDev);
  assert.equal(run.calls.length, 0);
  // A quote copy or a question is never sent to Meta.
  const copy = await once(PRODUCTION_LIKE, submitSpec(makeLead(generator(5), 'recurring', 'quote_delivery', { preferredContact: 'email' })));
  assert.equal(copy.outgoing.filter(isMetaCall).length, 0);
  // Meta refuses, or cannot be reached: recorded, and the customer still gets 202.
  run = await metaRun(PRODUCTION_LIKE, { meta: 'error' });
  assert.deepEqual(run.logs, [{ event: 'meta_capi_result', requestId: 'req-new-behaviour', stage: 'service_requested', testEvent: false, httpStatus: 400, eventsReceived: null, fbtraceId: 'TRACE-REFUSED', errorCode: 190 }]);
  run = await metaRun(PRODUCTION_LIKE, { meta: 'throw' });
  assert.deepEqual(run.logs, [{ event: 'meta_capi_result', requestId: 'req-new-behaviour', stage: 'service_requested', testEvent: false, httpStatus: null, eventsReceived: null, fbtraceId: null, errorCode: 'request_failed' }]);
  // Nothing personal and no secret in any log line.
  const lead = serviceLead();
  const text = JSON.stringify(run.logs) + JSON.stringify((await metaRun({ ...PRODUCTION_LIKE, META_TEST_EVENT_CODE: 'TEST12345' })).logs);
  for (const secret of ['made-up-meta-token', '100000000000001', 'TEST12345', lead.firstName, lead.lastName, lead.email, lead.street, lead.phone.replace(/\D/g, '').slice(-10), 'fb.1.']) assert.ok(!text.includes(secret), `log line leaks ${secret}`);
  newBehaviour.meta = 'production unset: sent as before and answer logged; staging (any mark except 0 or false) without a test code, or with a blank one: nothing sent; staging with a test code: sent with test_event_code; refusal and network failure logged; no personal data or secret in the log line';
}

{ // 4. Terms version: unset, flag and refuse.
  const CURRENT = '2026-10-15-example-terms';
  const termsRun = (vars, lead) => once({ ...PRODUCTION_LIKE, ...vars }, submitSpec(lead));
  const noteLine = `Terms version check: the customer accepted Terms version ${OLD_VERSION}; the current version is ${CURRENT}. Confirm the current Terms with the customer before approval.`;
  // Unset: today's behaviour, any version is recorded as sent.
  let result = await termsRun({}, serviceLead());
  assert.equal(result.status, 202);
  assert.ok(!result.outgoing[0].body.quoteSummary.includes('Terms version check'));
  // Current version sent: accepted, no extra line, in both modes.
  for (const mode of [undefined, 'flag', 'refuse']) {
    result = await termsRun({ CURRENT_TERMS_VERSION: CURRENT, TERMS_VERSION_MODE: mode }, serviceLead({ termsVersion: CURRENT }));
    assert.equal(result.status, 202);
    assert.equal(result.outgoing[0].body.termsVersion, CURRENT);
    assert.ok(!result.outgoing[0].body.quoteSummary.includes('Terms version check'));
  }
  // Flag (the default once a current version is set): accepted, and the team note says which version was accepted.
  for (const mode of [undefined, 'flag', 'FLAG', 'anything-else', '']) {
    result = await termsRun({ CURRENT_TERMS_VERSION: CURRENT, TERMS_VERSION_MODE: mode }, serviceLead());
    assert.equal(result.status, 202, `flag mode (${mode})`);
    const forwarded = result.outgoing[0].body;
    assert.equal(forwarded.termsVersion, OLD_VERSION, 'the version the customer accepted is recorded as sent');
    assert.equal(forwarded.termsAccepted, true);
    const summary = forwarded.quoteSummary.split('\n');
    assert.equal(summary.filter(line => line.startsWith('Terms version check')).length, 1);
    assert.equal(summary[summary.findIndex(line => line.startsWith('Terms accepted: Yes')) + 1], noteLine);
    assert.ok(!result.logs.some(line => line.event === 'terms_version_refused'), 'flag mode refuses nothing');
  }
  // Flag mode does not disturb idempotency: the same request again is not forwarded twice.
  {
    const world = makeWorld(candidate, { ...PRODUCTION_LIKE, CURRENT_TERMS_VERSION: CURRENT });
    assert.equal((await send(world, submitSpec(serviceLead()))).status, 202);
    const again = await send(world, submitSpec(serviceLead()));
    assert.deepEqual([again.status, again.outgoing.length], [202, 0]);
  }
  // Refuse: a clear answer the builder can show against the terms box, and nothing is forwarded or stored.
  for (const mode of ['refuse', 'REFUSE', ' refuse ']) {
    const world = makeWorld(candidate, { ...PRODUCTION_LIKE, CURRENT_TERMS_VERSION: CURRENT, TERMS_VERSION_MODE: mode });
    result = await send(world, submitSpec(serviceLead()));
    assert.equal(result.status, 400);
    assert.deepEqual(JSON.parse(result.text), {
      accepted: false,
      code: 'TERMS_VERSION_OUTDATED',
      message: 'Our Terms & Conditions have been updated. Please reload this page, review the current terms and send your request again. Nothing has been scheduled or charged by this form.',
      fields: ['termsAccepted']
    });
    assert.equal(result.outgoing.length, 0, 'refuse mode forwards nothing');
    assert.equal(world.objects.size, 0, 'refuse mode stores nothing');
    // A refusal is countable in the log: one line, four fields, nothing about the customer.
    assert.deepEqual(result.logs, [{ event: 'terms_version_refused', requestId: 'req-new-behaviour', stage: 'service_requested', currentTermsVersion: CURRENT }]);
    assert.deepEqual(Object.keys(result.logs[0]), ['event', 'requestId', 'stage', 'currentTermsVersion']);
    const refusedLead = serviceLead();
    for (const personal of [refusedLead.firstName, refusedLead.lastName, refusedLead.email, refusedLead.street, refusedLead.phone.replace(/\D/g, '').slice(-10), OLD_VERSION]) assert.ok(!JSON.stringify(result.logs).includes(personal), `refusal log line leaks ${personal}`);
    // Requests that accept no Terms are not affected.
    const copy = await send(world, submitSpec(makeLead(generator(8), 'recurring', 'quote_delivery', { preferredContact: 'email' })));
    const question = await send(world, submitSpec(makeLead(generator(9), 'recurring', 'question', { preferredContact: 'email' })));
    assert.deepEqual([copy.status, question.status], [202, 202]);
    assert.deepEqual([copy.logs.length, question.logs.length], [0, 0]);
    // Ordinary validation still answers first.
    const invalid = await send(world, submitSpec(serviceLead({ firstName: '' })));
    assert.deepEqual(JSON.parse(invalid.text).fields, ['firstName']);
  }
  // A custom estimate request also accepts the Terms, so it is covered too.
  result = await termsRun({ CURRENT_TERMS_VERSION: CURRENT, TERMS_VERSION_MODE: 'refuse' }, makeLead(generator(12), 'custom', 'service_request'));
  assert.equal(result.status, 400);
  // The legacy intake address follows the same rule for a current-format request.
  result = await once({ ...PRODUCTION_LIKE, CURRENT_TERMS_VERSION: CURRENT, TERMS_VERSION_MODE: 'refuse' }, { ...submitSpec(serviceLead()), url: WORKER + '/' });
  assert.deepEqual([result.status, result.outgoing.length], [400, 0]);
  newBehaviour.terms = 'unset: any version recorded as before; flag (default): accepted and one line added to the team note; refuse: 400 TERMS_VERSION_OUTDATED with fields ["termsAccepted"], nothing forwarded or stored, one log line without personal data';
}

{ // 5. Saved-link base.
  const saveRun = async vars => {
    const world = makeWorld(candidate, { ...PRODUCTION_LIKE, ...vars });
    const saved = await send(world, resumeSpec('/quote-resume', planBody(generator(3), 'recurring'), '198.51.100.20', { seed: 3 }));
    assert.equal(saved.status, 201);
    const url = JSON.parse(saved.text).url;
    const opened = await send(world, resumeSpec('/quote-resume/open', { token: url.split('#resume=')[1] }, '198.51.100.20', { seed: 4 }));
    assert.equal(opened.status, 200, 'the saved plan opens whatever the link base is');
    return url;
  };
  const TOKEN = '[A-Za-z0-9_-]{43}';
  // With nothing set, the link is the October 5 form: the only form the quote builder accepts.
  assert.match(await saveRun({}), BUILDER_SAVE_LINK_PATTERN);
  assert.match(await saveRun(BARE), BUILDER_SAVE_LINK_PATTERN);
  // Another form is opt-in, by variable, for when the quote builder accepts it.
  assert.match(await saveRun({ SAVED_LINK_BASE: DEFAULT_QUOTE_PAGE }), new RegExp(`^https://itspurgepros\\.com/quote#resume=${TOKEN}$`));
  assert.match(await saveRun({ SAVED_LINK_BASE: 'https://quote.itspurgepros.com/' }), BUILDER_SAVE_LINK_PATTERN);
  assert.match(await saveRun({ SAVED_LINK_BASE: 'https://staging.example.test/quote-test?x=1#y' }), new RegExp(`^https://staging\\.example\\.test/quote-test#resume=${TOKEN}$`));
  // A value that is not a plain https address falls back to the form the builder accepts.
  for (const bad of ['http://itspurgepros.com/quote', 'javascript:alert(1)', 'nonsense', '', '   ', 'https://user:pass@evil.example/', 42, null]) {
    assert.match(await saveRun({ SAVED_LINK_BASE: bad }), BUILDER_SAVE_LINK_PATTERN, `bad link base ${bad}`);
  }
  // The link base and the forward target are separate settings: moving the quote page does not change the link.
  assert.match(await saveRun({ QUOTE_PAGE_URL: 'https://staging.example.test/quote-test' }), BUILDER_SAVE_LINK_PATTERN);
  // The default link's host is one this Worker forwards to the quote page without a fragment, so the browser keeps #resume=.
  const viaQuoteHost = await get(QUOTE_HOST + '/');
  assert.deepEqual([viaQuoteHost.status, viaQuoteHost.headers.location], [302, DEFAULT_QUOTE_PAGE]);
  newBehaviour.savedLink = 'default https://quote.itspurgepros.com/#resume=<token>, unchanged from October 5 and the only form the quote builder accepts; SAVED_LINK_BASE can set another https base; a bad value falls back to the default; the saved plan opens either way';
}

{ // Allowed origins: the built-in list is unchanged, and a staging copy gets its origin through ALLOWED_ORIGINS.
  const from = (origin, vars) => once(vars, submitSpec(serviceLead(), { headers: { 'Content-Type': 'application/json', 'Origin': origin, 'CF-Connecting-IP': '203.0.113.10' } }));
  assert.equal((await from('https://staging.example.test', BARE)).status, 403);
  assert.equal((await from('https://blog.itspurgepros.com', BARE)).status, 403, 'built-in list unchanged (the live value comes from the variable)');
  assert.equal((await from('https://staging.example.test', { ...BARE, ALLOWED_ORIGINS: 'https://staging.example.test' })).status, 202);
  newBehaviour.origins = 'built-in list unchanged; a staging origin is accepted only through ALLOWED_ORIGINS';
}

// ---------------------------------------------------------------------------
// d. Word sweep of the candidate bundle (whole text: strings, comments and code)
// ---------------------------------------------------------------------------
const RETIRED_WORDS = [/promotion/i, /promotional/i, /promo\b/i, /waive/i, /waiving/i, /initial scoop/i, /surcharge/i, /new-customer offer/i, /first-cleanup offer/i, /introductory offer/i, /\boffers?\b/i, /\bfree\b/i, /unlimited/i, /no extra-time charge/i];
// The only places these words may stand: two kept key names, the instruction that forbids the promise,
// and the plain verb in one Voice AI instruction. Each must be present exactly once or twice as stated.
const ALLOWED_PHRASES = [
  ['Never promise a free or unlimited first cleanup.', 1],
  ['Offer only the available frequency choices.', 1]
];
let swept = candidateSource;
for (const key of KEPT_KEY_NAMES) {
  assert.ok(swept.includes(key), `kept key name missing: ${key}`);
  swept = swept.split(key).join('');
}
for (const [phrase, times] of ALLOWED_PHRASES) {
  assert.equal(swept.split(phrase).length - 1, times, `allowed phrase expected ${times} time(s): ${phrase}`);
  swept = swept.split(phrase).join('');
}
for (const word of RETIRED_WORDS) {
  const hit = word.exec(swept);
  assert.equal(hit, null, `Retired wording in the candidate bundle: "${hit && swept.slice(Math.max(0, hit.index - 60), hit.index + 60)}"`);
}
for (const gone of ['purge-pros-quote-widget', 'Quote Widget Demo', '__PP_WIDGET_SCRIPT__', 'connect.facebook.net', 'PROMO_', 'checkout-clarity']) {
  assert.ok(!candidateSource.includes(gone), `Retired content still bundled: ${gone}`);
}
assert.ok(candidateSource.includes(NEW_TEAM_NOTE) && candidateSource.includes(NEW_VOICE_STEP));
assert.ok(!candidateSource.includes('__PP_BUNDLE_'), 'unfilled bundle marker');

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
const result = {
  status: 'pass',
  referenceWorkerPath: referencePath,
  referenceWorkerSha256: sha256(referenceSource),
  candidateWorkerPath: candidatePath,
  candidateWorkerSha256: sha256(candidateSource),
  launcherSha256: sha256(launcherSource),
  differentialRequests: tally.requests,
  differentialByStatus: tally.byStatus,
  differentialByKind: Object.fromEntries(Object.entries(tally.byKind).sort()),
  forwardedToTeamV3: tally.forwardsV3,
  forwardedToTeamLegacy: tally.forwardsLegacy,
  metaCopiesCompared: tally.metaCalls,
  plansSavedAndOpened: [tally.plansSaved, tally.plansOpened],
  approvedDifferences: APPROVED.map(([name, description]) => ({ name, description, timesSeen: approvedCounts[name] })),
  keptKeyNames: KEPT_KEY_NAMES,
  pricingCasesCompared: pricingCases,
  expectedPricingAssertions: 6,
  serviceZipCount: serviceZips.length,
  protectedBlocksByteExact: protectedBlocks,
  newBehaviour,
  retiredWordsSwept: RETIRED_WORDS.map(String),
  deploymentState: 'source regression scope only; not deployed'
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'REGRESSION.json'), JSON.stringify(result, null, 2) + '\n');
console.log = realConsoleLog;
console.log(`Differential: ${tally.requests} requests answered by the October 5 reference and the candidate (statuses ${JSON.stringify(tally.byStatus)}); ${tally.forwardsV3} forwards to the team, ${tally.metaCalls} Meta copies, ${tally.plansSaved} plans saved and ${tally.plansOpened} opened.`);
console.log('Identical except for these approved differences (times seen):');
for (const [name, description] of APPROVED) console.log(`  - ${name}: ${description} (${approvedCounts[name]})`);
console.log(`Frozen: ${pricingCases} price combinations and 6 fixed prices; ${serviceZips.length} ZIP codes; ${Object.keys(protectedBlocks).length} code blocks byte-exact (ledger, saved-plan store, validation and more; the forward builder, request intake, Voice AI answer and router with only their approved lines put back). Saved-plan links identical to the reference.`);
console.log('New behaviour:');
for (const [name, description] of Object.entries(newBehaviour)) console.log(`  - ${name}: ${description}`);
console.log(`Word sweep: none of ${RETIRED_WORDS.length} retired terms in the candidate bundle (kept key names: ${KEPT_KEY_NAMES.join(', ')}; allowed phrases: ${ALLOWED_PHRASES.map(([phrase]) => JSON.stringify(phrase)).join(', ')}).`);
console.log(`PASS: quote Worker regression. Candidate ${sha256(candidateSource).slice(0, 12)} against reference ${REFERENCE_SHA256.slice(0, 12)}. Not deployed.`);
