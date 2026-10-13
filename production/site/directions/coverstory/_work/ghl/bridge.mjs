// bridge.mjs : the two "bridge" site-code files of the switch evening, made by rule (SWITCH-RUNBOOK 1.2 step 8).
// Part of the packaging tool: build-fragments.mjs writes the files through this module, check-fragments.mjs checks them.
//
// Between step 3 and step 11 of the switch the live website holds old pages and new pages at once. The bridge is the
// website's site code for that time:
//   shared/bridge-site-head.html = shared/site-head.html, whole and first
//                                + the old site's own lines, CUT from a copy of the live head tracking code: its first
//                                  comment, the preconnect and font line, each stylesheet line, exactly as they are there
//                                + ONE guard script that adds the old head scripts, each once and with no order set
//                                  on them, only on an old page
//   shared/bridge-site-body.html = shared/site-body.html, whole
//                                + the same guard for the old body script
//   BRIDGE.json                    what was cut, from which file, and the two files' sizes and SHA-256
// Left out of the old lines because the profile's own site-head.html carries them: the Google tag and the Meta Pixel
// (the same block byte for byte: proven here, or the run stops), the shared organization data, every later comment.
// Nothing is typed: every old line and every old address comes out of the source file. A line of the source that this
// file does not know stops the run with that line printed; it is never passed over.
// The bridge loads nothing new: no window.PPSite, no loader, no file of the new build.
//
// THE SOURCE is a copy of the live head code; the body code is the file beside it with "head" in its name replaced by
// "body". Looked for in this order:
//   --bridge-source=<file or folder> [--bridge-body=<file>]   this run only (a folder: its site-head-live.html, else
//                                                             its site-head-live.served.html). In a run for every
//                                                             profile it is NOT used for a profile that has a source of
//                                                             its own; name that profile on the command line to do so
//   profiles.<name>.bridgeSource in fragments.config.json     that profile only. The staging twin has one: the SEPTEMBER
//                                                             STAGING website's own site code (STAGING-RUNBOOK H1), which
//                                                             is one line of metas and preconnects and two body scripts
//   "bridge".source in fragments.config.json                  a path under the release folder, or a list (first on disk)
//   the source of the last cut, named in BRIDGE.json          when none of the above is on disk (read again if it is
//                                                             still there; else the lines as BRIDGE.json recorded them)
// So a plain run of build-fragments.mjs never drops the bridge files and never guesses a source.
//
// WHAT CAN DIFFER between a served copy (cut from the page data) and a copy out of the settings box, and what this file
// does with each:  a byte order mark at the start      dropped on reading
//                  a carriage return before a line feed dropped on reading (one alone, not before a line feed: refused)
//                  line feeds at the very end           not part of any line that is cut
//                  blanks at the start or end of a line KEPT as they are, so the cut line differs; --bridge-compare prints it
//                  "&" written "&amp;"                  only in a copy taken from printed HTML; KEPT, so the cut line differs
// Other modes of build-fragments.mjs that end here:
//   --bridge-only      write only the two bridge files and BRIDGE.json of each profile; no block is read or rewritten
//   --bridge-compare   write nothing: cut the source again and say, line by line, whether the files on disk would change
//   --no-bridge        a full run without the bridge files
import fs from "node:fs";
import path from "node:path";
import { RELEASE, OUT, posix, sha256, tokens, attrsOf, balance } from "./lib.mjs";

export const BRIDGE = { head: "shared/bridge-site-head.html", body: "shared/bridge-site-body.html", record: "BRIDGE.json" };
const SITE = { head: "shared/site-head.html", body: "shared/site-body.html" };
const nameOf = (file) => { const r = posix(path.relative(RELEASE, file)); return path.isAbsolute(r) ? posix(file) : r; };
const baseOf = (address) => path.posix.basename(new URL(address).pathname);
const num = (n) => n.toLocaleString("en-US");

// ---- the guard: one form, used twice ---------------------------------------------------------------------------------
// It waits until the page has been read, so a new page's footer block has always set window.PP5Loaded first, whenever
// GoHighLevel chooses to add the site code. On an old page nothing sets it, and each old script is added once.
// The guard sets NO order on the scripts it adds: a script element made by a script is async by default, so each one
// runs when its own file arrives, which is how GoHighLevel adds today's plain lines. Until October 10 the guard held the
// order word (s.async=false). A browser keeps one queue for every script added that way, across both guards, and the
// old bootstrap adds its own two files in order too: the old menu scripts then waited for the 151 KB quote widget file
// and an old page's menu was dead until that file had come. Do not put the word back; check 20 fails a guard that has it.
const PLAIN_ADDRESS = /^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~-]+)+$/;
export function guard(addresses) {
  for (const u of addresses) if (!PLAIN_ADDRESS.test(u)) throw new Error(`bridge: "${u}" is not a plain https file address (letters, digits, dots, dashes, slashes); the guard takes no other`);
  return `<script>/* v5 bridge: the old site's scripts, only on a page that is still old */
(function(w,d){function go(){if(w.PP5Loaded)return;${JSON.stringify(addresses)}.forEach(function(u){var s=d.createElement("script");s.src=u;d.head.appendChild(s)})}
if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",go);else go()})(window,document)</script>`;
}

// ---- reading a copy of the live site code exactly ----------------------------------------------------------------------
export function readExact(file) {
  const raw = fs.readFileSync(file), name = nameOf(file);
  if (raw.includes(0)) throw new Error(`bridge: ${name} holds zero bytes, so it is not a UTF-8 text file (Windows PowerShell's ">" writes UTF-16). Save it as UTF-8 and run again.`);
  let text = raw.toString("utf8");
  if (text.includes("�")) throw new Error(`bridge: ${name} is not valid UTF-8`);
  const byteOrderMark = text.charCodeAt(0) === 0xfeff;
  if (byteOrderMark) text = text.slice(1);
  if (/\r(?!\n)/.test(text)) throw new Error(`bridge: ${name} holds a carriage return that is not part of a line end`);
  const carriageReturns = (text.match(/\r/g) || []).length;
  text = text.replace(/\r\n/g, "\n");
  const lines = text.replace(/\n+$/, "").split("\n");
  // "plain text": no mark, line feeds only, exactly one at the end. Two copies that differ only in those three have the same hash here.
  return { file: name, bytes: raw.length, sha256AsOnDisk: sha256(raw), sha256PlainText: sha256(lines.join("\n") + "\n"), byteOrderMark, carriageReturns, lineFeedsAtEnd: /\n*$/.exec(text)[0].length,
    otherThanAscii: (text.match(/[^\x00-\x7f]/g) || []).length, lineCount: lines.length, lines };
}
const shapeOf = (s) => ({ file: s.file, bytes: s.bytes, lines: s.lineCount, sha256AsOnDisk: s.sha256AsOnDisk, sha256PlainText: s.sha256PlainText, byteOrderMark: s.byteOrderMark, carriageReturns: s.carriageReturns, lineFeedsAtEnd: s.lineFeedsAtEnd, charactersOutsideAscii: s.otherThanAscii });

// ---- the cut -----------------------------------------------------------------------------------------------------------
const COMMENT = /^<!--(?:(?!-->)[\s\S])*-->$/, HEAD_TAGS = /^(?:<(?:link|meta)\b[^<>]*>)+$/, SCRIPT = /^<script\b([^<>]*)><\/script>$/;
const ORGANIZATION = /^<script type="application\/ld\+json" id="pp-shared-organization">.*<\/script>$/;
const TRACK_FIRST = "<!-- Google tag (gtag.js) -->", TRACK_LAST = "<!-- End Meta Pixel Code -->";   // the same two marks build-fragments.mjs cuts the tags by
const scriptOf = (line) => {
  const m = SCRIPT.exec(line); if (!m) return null;
  const a = attrsOf(m[1]), others = Object.keys(a).filter((k) => k !== "src");
  // only what a script added by the guard still does the same way: defer and async mean nothing on a script added by a script
  if (typeof a.src !== "string" || others.some((k) => !(k === "defer" || k === "async" || (k === "type" && a[k] === "text/javascript")))) return null;
  return { address: a.src, attributes: others.map((k) => (a[k] === true ? k : `${k}="${a[k]}"`)) };
};
// A line made only of <link> and <meta> tags is one of the old site's own head lines and is kept WHOLE, as it is.
// The live head code has link lines only (preconnects, the font line, two stylesheets). The September staging site has
// one line of its own metas (robots, googlebot, pp-environment) and preconnects: kept whole for a staging profile,
// refused for production (makeBridge), where no meta may come in with the old lines.
const tagsOf = (line) => {
  const links = [], metas = [];
  for (const t of tokens(line)) {
    if (t.type !== "open") return null;
    const a = attrsOf(t.attrs);
    if (t.tag === "link" && typeof a.href === "string" && /^https:\/\//.test(a.href) && ["preconnect", "dns-prefetch", "stylesheet"].includes(a.rel)) links.push({ rel: a.rel, href: a.href });
    else if (t.tag === "meta" && typeof a.name === "string" && typeof a.content === "string") metas.push({ name: a.name, content: a.content });
    else return null;
  }
  return links.length + metas.length ? { links, metas } : null;
};
const isFont = (l) => l.rel === "stylesheet" && /^https:\/\/fonts\.googleapis\.com\//.test(l.href);
const tagWords = (tags) => [...tags.metas.map((m) => `meta ${m.name}`), ...tags.links.map((l) => (l.rel === "stylesheet" ? (isFont(l) ? "the font line" : "stylesheet " + baseOf(l.href)) : `${l.rel} ${new URL(l.href).host}`))].join(", ");
const refuse = (src, unknown) => { throw new Error(`bridge: ${src.file} holds ${unknown.length} line(s) the rule of SWITCH-RUNBOOK 1.2 step 8 does not know. Nothing was written for the bridge. Decide what each is, then bring cutHead or cutBody in _work/ghl/bridge.mjs up to date:\n` + unknown.map(([i, line, why]) => `  line ${i + 1}${why ? " (" + why + ")" : ""}: ${JSON.stringify(line.length > 160 ? line.slice(0, 160) + "..." : line)}`).join("\n")); };

export function cutHead(src) {
  const L = src.lines, kept = [], scripts = [], leftOut = [], unknown = [], blank = [];
  let tracking = "", organization = "", i = 0;
  const out = (from, to, what) => leftOut.push({ lines: from === to ? String(from + 1) : `${from + 1} to ${to + 1}`, what });
  const firstText = L.findIndex((l) => l.trim() !== "");
  while (i < L.length) {
    const line = L[i], t = line.trim();
    if (t !== "" && t !== line) blank.push(i + 1);
    if (t === "") { out(i, i, "a blank line"); i += 1; continue; }
    if (t === TRACK_FIRST) {
      const j = L.findIndex((l, n) => n > i && l.trim() === TRACK_LAST);
      if (j < 0 || tracking) { unknown.push([i, line, tracking ? "a second Google tag block" : `"${TRACK_LAST}" does not follow`]); i += 1; continue; }
      tracking = L.slice(i, j + 1).join("\n"); out(i, j, "the Google tag and the Meta Pixel"); i = j + 1; continue;
    }
    if (COMMENT.test(t)) {
      const next = (L.slice(i + 1).find((l) => l.trim() !== "") || "").trim();
      if (ORGANIZATION.test(next)) out(i, i, "the comment above the shared organization data");
      else if (i === firstText) kept.push({ line: i + 1, what: "the old comment", text: line });
      else out(i, i, "a comment (the rule keeps the first comment only): " + t);
      i += 1; continue;
    }
    if (ORGANIZATION.test(t)) { if (organization) unknown.push([i, line, "a second shared organization block"]); else { organization = line; out(i, i, "the shared organization data (pp-shared-organization)"); } i += 1; continue; }
    const tags = HEAD_TAGS.test(t) ? tagsOf(t) : null;
    if (tags) { kept.push({ line: i + 1, what: tagWords(tags), text: line, links: tags.links, metas: tags.metas }); i += 1; continue; }
    const s = scriptOf(t);
    if (s) { scripts.push({ line: i + 1, address: s.address, file: baseOf(s.address), attributesInSource: s.attributes, text: line }); i += 1; continue; }
    unknown.push([i, line, ""]); i += 1;
  }
  if (unknown.length) refuse(src, unknown);
  return { kept, scripts, leftOut, tracking, organization, linesWithBlanksAtAnEnd: blank };
}
export function cutBody(src) {
  const L = src.lines, scripts = [], leftOut = [], unknown = [], blank = [];
  L.forEach((line, i) => {
    const t = line.trim(), s = scriptOf(t);
    if (t !== "" && t !== line) blank.push(i + 1);
    if (t === "") leftOut.push({ lines: String(i + 1), what: "a blank line" });
    else if (COMMENT.test(t)) leftOut.push({ lines: String(i + 1), what: "a comment: " + t });
    else if (s) scripts.push({ line: i + 1, address: s.address, file: baseOf(s.address), attributesInSource: s.attributes, text: line });
    else unknown.push([i, line, ""]);
  });
  if (unknown.length) refuse(src, unknown);
  return { scripts, leftOut, linesWithBlanksAtAnEnd: blank };
}

// ---- the two files of one profile ----------------------------------------------------------------------------------------
const oneFeed = (t) => (t.endsWith("\n") ? t : t + "\n");
const oldSheets = (cut) => cut.head.kept.flatMap((k) => (k.links || []).filter((l) => l.rel === "stylesheet" && !isFont(l)).map((l) => ({ line: k.line, address: l.href, file: baseOf(l.href), text: k.text })));
export function makeBridge(cfg, profile, siteHead, siteBody, cut, source) {
  const stop = (why) => { throw new Error(`bridge, profile "${profile.name}": ${why}`); };
  const h = cut.head, b = cut.body, leftOut = [];
  // what is left out must really stand in the profile's own head code
  for (const o of h.leftOut) {
    if (o.what === "the Google tag and the Meta Pixel") {
      if (profile.tracking && !siteHead.includes(h.tracking)) {
        const mine = siteHead.slice(siteHead.indexOf(TRACK_FIRST)).split("\n"), theirs = h.tracking.split("\n"), at = theirs.findIndex((l, n) => l !== mine[n]);
        stop(`the old Google tag and Meta Pixel may be left out only because ${SITE.head} carries the same block byte for byte, and it does not. First difference at line ${at + 1} of the block: the source has ${JSON.stringify(theirs[at])}, ${SITE.head} has ${JSON.stringify(mine[at] ?? "(nothing)")}.`);
      }
      leftOut.push({ lines: o.lines, what: profile.tracking ? `${o.what} (${SITE.head} carries the same block byte for byte)` : `${o.what} (this profile carries no tracking tag)` });
    } else if (/shared organization data \(/.test(o.what)) {
      if (!siteHead.includes('<script type="application/ld+json" id="pp-shared-organization">')) stop(`the old shared organization data is left out, but ${SITE.head} holds none of its own`);
      leftOut.push({ lines: o.lines, what: `${o.what}: ${SITE.head} carries its own${siteHead.split("\n").includes(h.organization) ? ", the same line byte for byte" : ""}` });
    } else leftOut.push(o);
  }
  // an old line with a <meta> in it (a staging site's own robots and environment tags) never enters the production site code
  const withMeta = h.kept.find((k) => (k.metas || []).length);
  if (withMeta && profile.mode === "live") stop(`line ${withMeta.line} of ${source.head.file} holds <meta name="${withMeta.metas.map((m) => m.name).join('">, <meta name="')}">. The rule keeps no meta tag among the old lines of the production bridge, and the live head code is on record without one. Nothing was written.`);
  // the five old files the rule names: a production bridge is made from exactly those, in that order
  const sheets = oldSheets(cut), pin = (cfg.bridge || {}).liveFiles;
  if (profile.mode === "live") {
    if (!pin) stop('fragments.config.json has no "bridge".liveFiles (the five old files SWITCH-RUNBOOK 1.2 step 8 names)');
    const got = { stylesheets: sheets.map((s) => s.file), headScripts: h.scripts.map((s) => s.file), bodyScripts: b.scripts.map((s) => s.file) };
    for (const [k, words] of [["stylesheets", "old stylesheets"], ["headScripts", "old head scripts"], ["bodyScripts", "old body scripts"]]) {
      if (got[k].join("|") !== (pin[k] || []).join("|")) stop(`${source.head.file} and the file beside it name these ${words}, in this order: ${got[k].join(", ") || "none"}. The rule names ${(pin[k] || []).join(", ") || "none"} ("bridge".liveFiles in fragments.config.json; SWITCH-RUNBOOK 1.2 step 8). The live site code is not what the rule was written for: read the rule again before a bridge is made. Nothing was written.`);
    }
  }
  const all = [...h.scripts, ...b.scripts].map((s) => s.address);
  if (new Set(all).size !== all.length) stop(`an old script address is named twice in the source: ${all.join(", ")}`);
  const guards = { head: h.scripts.length ? guard(h.scripts.map((s) => s.address)) : "", body: b.scripts.length ? guard(b.scripts.map((s) => s.address)) : "" };
  const head = oneFeed(siteHead) + h.kept.map((k) => k.text + "\n").join("") + (guards.head ? guards.head + "\n" : "");
  const body = oneFeed(siteBody) + (guards.body ? guards.body + "\n" : "");
  const file = (rel, text, from, fromText) => ({ file: rel, characters: text.length, bytes: Buffer.byteLength(text), sha256: sha256(text), startsWith: { file: from, characters: fromText.length, sha256: sha256(fromText) } });
  const record = {
    state: "Prepared; not in GoHighLevel. The website's site code for the time between step 3 and step 11 of the switch (SWITCH-RUNBOOK 1.2 step 8). Written by _work/ghl/build-fragments.mjs through _work/ghl/bridge.mjs; do not edit here.",
    profile: profile.name, generated: new Date().toISOString(),
    rule: `${BRIDGE.head} = ${SITE.head}, whole and first + the old lines cut from the source + one guard. ${BRIDGE.body} = ${SITE.body}, whole + the same guard.`,
    source,
    cut: {
      head: { kept: h.kept.map((k) => ({ line: k.line, what: k.what, text: k.text, sha256: sha256(k.text) })), scripts: h.scripts, linesWithBlanksAtAnEnd: h.linesWithBlanksAtAnEnd, leftOut },
      body: { scripts: b.scripts, linesWithBlanksAtAnEnd: b.linesWithBlanksAtAnEnd, leftOut: b.leftOut },
      oldStylesheets: sheets.map((s) => ({ line: s.line, file: s.file, address: s.address })),
    },
    guard: guards,
    files: [file(BRIDGE.head, head, SITE.head, oneFeed(siteHead)), file(BRIDGE.body, body, SITE.body, oneFeed(siteBody))],
  };
  const line = `bridge site code: ${BRIDGE.head} ${num(head.length)} characters, ${BRIDGE.body} ${num(body.length)} · ${h.kept.length} old line(s) and ${all.length} old script address(es) cut from ${source.head.file} and ${source.body.file} (${source.readNow ? source.how : "NOT read in this run: " + source.how}) · in the guards: ${h.scripts.map((s) => s.file).join(", ") || "none"} | ${b.scripts.map((s) => s.file).join(", ") || "none"}`;
  return { head, body, record, line };
}

// ---- which source ------------------------------------------------------------------------------------------------------------
const flagOf = (flags, name) => { const f = flags.find((a) => a.startsWith(`--${name}=`)); return f ? f.slice(name.length + 3) : null; };
function pair(given, bodyGiven) {
  let head = given;
  if (fs.statSync(given).isDirectory()) {
    head = ["site-head-live.html", "site-head-live.served.html"].map((n) => path.join(given, n)).find((f) => fs.existsSync(f));
    if (!head) throw new Error(`bridge: the folder ${nameOf(given)} holds neither site-head-live.html nor site-head-live.served.html`);
  }
  const body = bodyGiven || path.join(path.dirname(head), path.basename(head).replace("head", "body"));
  if (path.resolve(body) === path.resolve(head) || !fs.existsSync(body)) throw new Error(`bridge: the body code was looked for beside the head code, as ${nameOf(body)}, and is not there. Name it with --bridge-body=<file>.`);
  return { head, body };
}
// "named": the profile was named on the command line. A profile with a source of its own (the staging twin, cut from the
// September staging site's own site code) keeps it in a run for every profile, whatever --bridge-source says: that
// option is then meant for the production bridge. To give such a profile another source, name the profile.
export function findSource(cfg, profile, flags = [], named = false) {
  const find = (p) => [process.cwd(), RELEASE].map((b) => path.resolve(b, p)).find((f) => fs.existsSync(f));
  const given = flagOf(flags, "bridge-source"), bodyGiven = flagOf(flags, "bridge-body");
  if (bodyGiven && !given) throw new Error("bridge: --bridge-body is used together with --bridge-source");
  if (given && (named || !profile.bridgeSource)) {
    const f = find(given), fb = bodyGiven ? find(bodyGiven) : null;
    if (!f || (bodyGiven && !fb)) throw new Error(`bridge: ${!f ? "--bridge-source=" + given : "--bridge-body=" + bodyGiven} was not found (looked from the folder the command was run in, then from the release folder)`);
    return { ...pair(f, fb), how: "named on the command line (--bridge-source)" };
  }
  if (profile.bridgeSource) {
    const f = path.resolve(RELEASE, profile.bridgeSource);
    if (!fs.existsSync(f)) return { missing: [String(profile.bridgeSource)] };   // not fatal: the last cut is used, as for the shared source (a full run must not stop over a rehearsal file)
    return { ...pair(f), how:`profiles.${profile.name}.bridgeSource in fragments.config.json${given ? " (--bridge-source was NOT used for this profile: it has a source of its own and was not named on the command line)" : ""}` };
  }
  const list = [].concat((cfg.bridge || {}).source || []).map(String), hit = list.map((p) => path.resolve(RELEASE, p)).find((f) => fs.existsSync(f));
  return hit ? { ...pair(hit), how: '"bridge".source in fragments.config.json' } : { missing: list };
}
const previousRecord = (dir) => { try { const r = JSON.parse(fs.readFileSync(path.join(dir, BRIDGE.record), "utf8")); return r && r.cut && r.source ? r : null; } catch (e) { return null; } };

// The bridge of one profile from its site head and body code. Returns { head, body, record, line }, or { line } alone
// when there is no source at all (then nothing is written and the line says why).
export function bridgeFor(cfg, profile, siteHead, siteBody, flags = [], dir = path.join(OUT, profile.name), named = false) {
  const cutOf = (headFile, bodyFile) => { const sh = readExact(headFile), sb = readExact(bodyFile); return { cut: { head: cutHead(sh), body: cutBody(sb) }, head: shapeOf(sh), body: shapeOf(sb) }; };
  const found = findSource(cfg, profile, flags, named);
  if (found.head) { const c = cutOf(found.head, found.body); return makeBridge(cfg, profile, siteHead, siteBody, c.cut, { how: found.how, readNow: true, head: c.head, body: c.body }); }
  const prev = previousRecord(dir), why = `the settings file's source (${found.missing.join(" or ") || "none named"}) is not on disk`;
  if (!prev) return { line: `bridge site code: NOT WRITTEN. ${why[0].toUpperCase() + why.slice(1)} and ${nameOf(dir)} holds no record of an earlier cut. Run again with --bridge-source=<the backup's site-head-live.html>.` };
  const again = [prev.source.head.file, prev.source.body.file].map((f) => path.resolve(RELEASE, f));
  if (again.every((f) => fs.existsSync(f))) { const c = cutOf(again[0], again[1]); return makeBridge(cfg, profile, siteHead, siteBody, c.cut, { how: `the source of the last cut, read again, because ${why}`, readNow: true, head: c.head, body: c.body }); }
  // neither the default nor the earlier source is on disk: the lines as the last cut recorded them (its check compares them with nothing but themselves)
  const cut = { head: { ...prev.cut.head, kept: prev.cut.head.kept.map((k) => ({ ...k, ...(HEAD_TAGS.test(k.text.trim()) ? tagsOf(k.text.trim()) || {} : {}) })), leftOut: [], tracking: "", organization: "" }, body: prev.cut.body };
  const made = makeBridge(cfg, profile, siteHead, siteBody, cut, { ...prev.source, how: `the lines as BRIDGE.json recorded them at the last cut, because ${why} and ${prev.source.head.file} is not on disk either`, readNow: false });
  made.record.cut.head.leftOut = prev.cut.head.leftOut;
  return made;
}
// a full run of build-fragments.mjs: the bridge files join the profile's files (writeProfile writes them and BRIDGE.json)
export function addBridge(result, flags = [], dir = path.join(OUT, result.profile.name), named = false) {
  if (flags.includes("--no-bridge")) { result.bridgeLine = "bridge site code: not asked for (--no-bridge)"; return result; }
  const made = bridgeFor(result.cfg, result.profile, result.files.get(SITE.head), result.files.get(SITE.body), flags, dir, named);
  result.bridgeLine = made.line;
  if (made.record) { result.files.set(BRIDGE.head, made.head); result.files.set(BRIDGE.body, made.body); result.bridge = made.record; }
  return result;
}

// ---- --bridge-only and --bridge-compare: no block is read or rewritten ---------------------------------------------------------
const show = (s) => JSON.stringify(s);
const firstDifference = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i += 1; const code = (s) => (i < s.length ? "U+" + s.codePointAt(i).toString(16).toUpperCase().padStart(4, "0") : "the end of the line"); return `first difference at character ${i + 1}: ${code(a)} now, ${code(b)} before`; };
export function bridgeRun(cfg, names, flags, named = false) {
  const compare = flags.includes("--bridge-compare"); let bad = 0;
  for (const name of names) {
    const profile = cfg.profiles[name];
    if (!profile) throw new Error(`no profile "${name}" in fragments.config.json (there: ${Object.keys(cfg.profiles).join(", ")})`);
    const dir = path.join(OUT, name), at = (rel) => path.join(dir, rel);
    for (const f of [SITE.head, SITE.body]) if (!fs.existsSync(at(f))) throw new Error(`bridge: ${nameOf(at(f))} is not on disk: run node _work/ghl/build-fragments.mjs first`);
    const made = bridgeFor(cfg, profile, fs.readFileSync(at(SITE.head), "utf8"), fs.readFileSync(at(SITE.body), "utf8"), flags, dir, named);
    console.log(`\n${name}: ${compare ? "compared with" : "bridge files only, written to"} ${nameOf(dir)}/${compare ? "  (nothing is written)" : ""}`);
    if (!made.record) { console.log("  " + made.line); bad += 1; continue; }
    const src = made.record.source;
    for (const part of ["head", "body"]) console.log(`  source, ${part} code: ${src[part].file} · ${num(src[part].bytes)} bytes, ${src[part].lines} lines · SHA-256 as on disk ${src[part].sha256AsOnDisk} · as plain text ${src[part].sha256PlainText} · byte order mark: ${src[part].byteOrderMark ? "YES (dropped)" : "none"} · carriage returns: ${src[part].carriageReturns}${src[part].carriageReturns ? " (dropped)" : ""} · line feeds at the end: ${src[part].lineFeedsAtEnd} · characters outside ASCII: ${src[part].charactersOutsideAscii}`);
    console.log(`  source taken as: ${src.how}`);
    for (const part of ["head", "body"]) if (made.record.cut[part].linesWithBlanksAtAnEnd.length) console.log(`  NOTE: line(s) ${made.record.cut[part].linesWithBlanksAtAnEnd.join(", ")} of the ${part} code start or end with a blank; kept as they are`);
    if (!compare) {
      fs.writeFileSync(at(BRIDGE.head), made.head, "utf8"); fs.writeFileSync(at(BRIDGE.body), made.body, "utf8");
      fs.writeFileSync(at(BRIDGE.record), JSON.stringify(made.record, null, 2) + "\n", "utf8");
      for (const f of made.record.files) console.log(`  ${f.file}: ${num(f.characters)} characters, ${num(f.bytes)} bytes, SHA-256 ${f.sha256}`);
      console.log("  " + made.line);
      continue;
    }
    const prev = previousRecord(dir); let same = true;
    if (!prev) { console.log(`  ${BRIDGE.record}: none in this folder, so there is no earlier cut to compare the lines with`); same = false; }
    else {
      console.log(`  earlier cut: ${prev.source.head.file} (plain text ${prev.source.head.sha256PlainText}) and ${prev.source.body.file} (plain text ${prev.source.body.sha256PlainText}), made ${prev.generated}`);
      for (const part of ["head", "body"]) console.log(`  source ${part} code against the earlier one, as plain text: ${src[part].sha256PlainText === prev.source[part].sha256PlainText ? "EQUAL" : "DIFFERENT (the lines the bridge uses follow)"}`);
      // like with like: the old lines of the head code, then its script addresses, then the body code's, each list in its own order
      const lists = (r) => [r.cut.head.kept.map((k) => [`old line, head code line ${k.line} (${k.what})`, k.text]), r.cut.head.scripts.map((s) => [`old script address, head code line ${s.line}`, s.address]), r.cut.body.scripts.map((s) => [`old script address, body code line ${s.line}`, s.address])];
      const now = lists(made.record), was = lists(prev);
      for (let n = 0; n < 3; n += 1) for (let i = 0; i < Math.max(now[n].length, was[n].length); i += 1) {
        const a = now[n][i], b = was[n][i];
        if (a && b && a[1] === b[1]) console.log(`  ${a[0]}: EQUAL`);
        else { same = false; console.log(`  ${a ? a[0] : b[0] + " of the earlier cut"}: DIFFERENT\n    now:    ${a ? show(a[1]) : "(nothing in its place)"}\n    before: ${b ? show(b[1]) : "(nothing in its place)"}${a && b ? "\n    " + firstDifference(a[1], b[1]) : ""}`); }
      }
    }
    for (const [rel, text] of [[BRIDGE.head, made.head], [BRIDGE.body, made.body]]) {
      const onDisk = fs.existsSync(at(rel)) ? fs.readFileSync(at(rel)) : null, equal = onDisk !== null && onDisk.equals(Buffer.from(text, "utf8"));
      if (!equal) same = false;
      console.log(`  ${rel}: ${onDisk === null ? "NOT ON DISK" : equal ? "a new run would write the file on disk again, byte for byte (SHA-256 " + sha256(onDisk) + ")" : "A NEW RUN WOULD CHANGE IT: now " + sha256(text) + ", on disk " + sha256(onDisk)}`);
    }
    console.log(`  ${name}: ${same ? "EQUAL" : "DIFFERENT"}`);
    if (!same) bad += 1;
  }
  console.log(compare ? (bad ? `\nBRIDGE COMPARE: DIFFERENT (${bad} profile(s))` : `\nBRIDGE COMPARE: EQUAL (${names.length} profile(s)); nothing was written`) : (bad ? `\nBRIDGE: NOT WRITTEN for ${bad} profile(s)` : `\nBRIDGE: written for ${names.length} profile(s); no block was read or rewritten. Now: node _work/ghl/check-fragments.mjs --require-bridge`));
  return bad ? 1 : 0;
}

// ---- the step's own check (check 20 of check-fragments.mjs) ----------------------------------------------------------------------
// Returns the report line; every problem goes to fail(). "required": a folder without bridge files is a failure.
export function checkBridge({ cfg, profile, dir, fail, trackingPattern, required = false }) {
  const at = (rel) => path.join(dir, rel), here = [BRIDGE.head, BRIDGE.body, BRIDGE.record].filter((f) => fs.existsSync(at(f)));
  const label = "bridge site code (SWITCH 1.2 step 8)";
  if (!here.length) { if (required) fail(`bridge: ${BRIDGE.head} and ${BRIDGE.body} are not in this folder (--require-bridge): run node _work/ghl/build-fragments.mjs --bridge-only --bridge-source=<the backup's site-head-live.html>`); return `${label}: none in this folder${required ? " (see FAIL)" : " (not a failure without --require-bridge)"}`; }
  if (here.length !== 3) { fail(`bridge: ${BRIDGE.head}, ${BRIDGE.body} and ${BRIDGE.record} belong together; this folder holds only ${here.join(", ")}`); return `${label}: incomplete (see FAIL)`; }
  let record; try { record = JSON.parse(fs.readFileSync(at(BRIDGE.record), "utf8")); } catch (e) { fail(`${BRIDGE.record}: not valid JSON`); return `${label}: unreadable record (see FAIL)`; }
  const before = { n: 0 }, bad = (m) => { before.n += 1; fail(m); };
  if (record.profile !== profile.name) bad(`${BRIDGE.record}: written for profile "${record.profile}", found in the folder of "${profile.name}"`);
  const text = {}, own = {}, rest = {}, live = profile.mode === "live";
  for (const part of ["head", "body"]) {
    const rel = BRIDGE[part], raw = fs.readFileSync(at(rel)), t = raw.toString("utf8"), listed = (record.files || []).find((f) => f.file === rel);
    text[part] = t;
    // a the file itself: plain ASCII text with line feeds, as every block; the record's size and hash
    if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) bad(`${rel}: starts with a byte order mark`);
    if (t.includes("\r")) bad(`${rel}: holds a carriage return`);
    if (/[^\x00-\x7f]/.test(t)) bad(`${rel}: holds a character outside ASCII (${show(/[^\x00-\x7f]/.exec(t)[0])})`);
    if (!/[^\n]\n$/.test(t)) bad(`${rel}: must end with exactly one line feed`);
    if (!t.startsWith("<!--")) bad(`${rel}: must start with the comment marker <!-- (the paste rule for plain text boxes checks the box against it)`);
    if (!listed || listed.sha256 !== sha256(raw) || listed.characters !== t.length) bad(`${rel}: its size or SHA-256 is not the one in ${BRIDGE.record} (edited by hand?)`);
    for (const p of balance(t)) bad(`${rel}: ${p}`);
    for (const k of tokens(t)) if (k.type === "doctype" || ((k.type === "open" || k.type === "close") && /^(html|head|body)$/.test(k.tag))) bad(`${rel}: holds ${k.raw.slice(0, 30)}`);
    // b every line of the profile's own site code, present and unchanged, whole and first
    if (!fs.existsSync(at(SITE[part]))) { bad(`${SITE[part]} is missing, so ${rel} cannot be compared with it`); own[part] = ""; rest[part] = t; continue; }
    own[part] = fs.readFileSync(at(SITE[part]), "utf8");
    if (!t.startsWith(own[part])) {
      const a = own[part].split("\n"), b = t.split("\n"), n = a.findIndex((l, i) => l !== b[i]);
      bad(`${rel}: does not start with ${SITE[part]} as that file is now. First line that differs: line ${n + 1}, ${show((a[n] || "").slice(0, 90))} in ${SITE[part]}, ${show((b[n] || "").slice(0, 90))} here. Run node _work/ghl/build-fragments.mjs --bridge-only again.`);
      rest[part] = t;
    } else rest[part] = t.slice(own[part].length);
  }
  const cut = record.cut || { head: { kept: [], scripts: [] }, body: { scripts: [] } };
  const addresses = { head: (cut.head.scripts || []).map((s) => s.address), body: (cut.body.scripts || []).map((s) => s.address) }, all = [...addresses.head, ...addresses.body];
  const guards = { head: addresses.head.length ? guard(addresses.head) : "", body: addresses.body.length ? guard(addresses.body) : "" };
  // c after the profile's own code: the recorded old lines, each a whole line byte for byte and in order, then the guard, and nothing else
  if (rest.head !== cut.head.kept.map((k) => k.text + "\n").join("") + (guards.head ? guards.head + "\n" : "")) bad(`${BRIDGE.head}: what follows ${SITE.head} is not exactly the ${cut.head.kept.length} old lines of ${BRIDGE.record} followed by the guard as _work/ghl/bridge.mjs builds it`);
  if (rest.body !== (guards.body ? guards.body + "\n" : "")) bad(`${BRIDGE.body}: what follows ${SITE.body} is not exactly the guard as _work/ghl/bridge.mjs builds it`);
  const headLines = text.head.split("\n");
  for (const k of cut.head.kept) { if (headLines.filter((l) => l === k.text).length !== 1) bad(`${BRIDGE.head}: the old line ${k.line} (${k.what}) is not in the file exactly once as a whole line`); if (sha256(k.text) !== k.sha256) bad(`${BRIDGE.record}: the text of old line ${k.line} is not the text its SHA-256 was taken from`); }
  // d the old lines against the source they were cut from, read again now
  const srcFiles = [record.source.head.file, record.source.body.file].map((f) => path.resolve(RELEASE, f));
  let sourceWords = `the source ${record.source.head.file} is not on disk now, so the old lines were compared with ${BRIDGE.record} only`;
  if (srcFiles.every((f) => fs.existsSync(f))) {
    try {
      const sh = readExact(srcFiles[0]), sb = readExact(srcFiles[1]), now = { head: cutHead(sh), body: cutBody(sb) };
      const flat = (c) => JSON.stringify([c.head.kept.map((k) => [k.line, k.text]), c.head.scripts.map((s) => [s.line, s.address]), c.body.scripts.map((s) => [s.line, s.address])]);
      if (flat(now) !== flat(cut)) bad(`bridge: ${record.source.head.file} and ${record.source.body.file}, cut again now, do not give the old lines and addresses of ${BRIDGE.record}. The source changed after the bridge was made, or the record was edited: run node _work/ghl/build-fragments.mjs --bridge-compare`);
      if (sh.sha256PlainText !== record.source.head.sha256PlainText || sb.sha256PlainText !== record.source.body.sha256PlainText) bad(`bridge: the source files are not the ones ${BRIDGE.record} names by SHA-256`);
      for (const k of cut.head.kept) if (sh.lines[k.line - 1] !== k.text) bad(`${BRIDGE.head}: old line ${k.line} is not line ${k.line} of ${record.source.head.file} byte for byte`);
      sourceWords = `byte for byte line(s) ${cut.head.kept.map((k) => k.line).join(", ")} of ${record.source.head.file} (cut again now: the same lines and addresses)`;
    } catch (e) { bad(e.message.split("\n")[0]); }
  } else if (required) bad(`bridge: ${record.source.head.file} or ${record.source.body.file}, which ${BRIDGE.record} names as the source of the old lines, is not on disk (--require-bridge)`);
  // e each old stylesheet line byte for byte, once; each old script address exactly once, inside a guard, nowhere as a plain script tag
  const sheets = cut.oldStylesheets || [], pin = (cfg.bridge || {}).liveFiles || null, both = text.head + text.body;
  for (const s of sheets) { const k = cut.head.kept.find((x) => x.line === s.line); if (!k || !k.text.includes(`href="${s.address}"`) || both.split(s.file).length !== 2) bad(`${BRIDGE.head}: the old stylesheet ${s.file} must be named exactly once, in its own old line`); }
  for (const part of ["head", "body"]) {
    const t = text[part], g = guards[part];
    if (g) {
      if (t.split(g).length !== 2 || !t.endsWith(g + "\n")) bad(`${BRIDGE[part]}: the guard must stand exactly once and be the last thing in the file`);
      if (t.split("PP5Loaded").length !== 2 || /PP5Loaded\s*=[^=]/.test(t)) bad(`${BRIDGE[part]}: window.PP5Loaded must be read exactly once, by the guard, and never set`);
    } else if (/PP5Loaded/.test(t)) bad(`${BRIDGE[part]}: names window.PP5Loaded but has no old script to guard`);
    for (const u of addresses[part]) { const i = t.indexOf(u), gi = g ? t.indexOf(g) : -1; if (both.split(u).length !== 2 || i < gi || gi < 0 || i > gi + g.length) bad(`${BRIDGE[part]}: the old script address ${u} must appear exactly once in the two files, inside this file's guard`); if (both.split(baseOf(u)).length !== 2) bad(`bridge: the old script file ${baseOf(u)} is named more than once in the two files`); }
    for (const k of tokens(rest[part])) if (k.type === "raw" && k.tag === "script" && k.raw !== g) bad(`${BRIDGE[part]}: a script other than the guard follows ${SITE[part]}: ${k.raw.slice(0, 80)}`);
    for (const k of tokens(t)) { const src = k.type === "raw" || k.type === "open" ? attrsOf((/^<[a-zA-Z]+\b([^>]*)>/.exec(k.raw) || ["", ""])[1]).src : undefined; if (typeof src === "string" && k.raw.startsWith("<script") && (all.includes(src) || all.some((u) => src.includes(baseOf(u))))) bad(`${BRIDGE[part]}: the old script ${src} stands as a plain script tag; it may only be added by the guard`); }
    if (/<script\b[^>]*\ssrc\s*=/i.test(rest[part])) bad(`${BRIDGE[part]}: a script tag with an address follows ${SITE[part]}; the bridge adds old scripts through the guard only`);
    // nothing new is loaded by the bridge
    if (/PPSite/.test(rest[part]) || (profile.assetsBase && rest[part].includes(profile.assetsBase)) || rest[part].includes(cfg.assetsVersion)) bad(`${BRIDGE[part]}: what follows ${SITE[part]} names window.PPSite or a file of the new build; the bridge loads nothing new`);
  }
  if (live) {
    for (const k of cut.head.kept) if (/<meta\b/i.test(k.text)) bad(`${BRIDGE.head}: old line ${k.line} holds a <meta> tag; none may come into the production site code with the old lines`);
    if (!pin) bad('fragments.config.json has no "bridge".liveFiles (the five old files the rule names)');
    else {
      if (sheets.map((s) => s.file).join("|") !== pin.stylesheets.join("|")) bad(`${BRIDGE.head}: its old stylesheets are ${sheets.map((s) => s.file).join(", ") || "none"}; the rule names ${pin.stylesheets.join(", ")}`);
      if (addresses.head.map(baseOf).join("|") !== pin.headScripts.join("|")) bad(`${BRIDGE.head}: its guard adds ${addresses.head.map(baseOf).join(", ") || "nothing"}; the rule names ${pin.headScripts.join(", then ")}`);
      if (addresses.body.map(baseOf).join("|") !== pin.bodyScripts.join("|")) bad(`${BRIDGE.body}: its guard adds ${addresses.body.map(baseOf).join(", ") || "nothing"}; the rule names ${pin.bodyScripts.join(", ")}`);
    }
  }
  // f the guard itself, run against a made-up page (nothing is loaded and nothing is contacted). The made-up script element
  //   starts with async true, as a script element made by a script does in a browser, and the guard must leave it so: each
  //   old script then runs when its own file arrives, which is how GoHighLevel adds today's lines. A guard that sets
  //   s.async=false fails here: every script added that way waits for the one added before it, across both guards.
  let guardWords = "no old script, so no guard";
  for (const part of ["head", "body"]) {
    if (!guards[part]) continue;
    if (/\.async\s*=/.test(rest[part])) bad(`${BRIDGE[part]}: the guard sets async on the scripts it adds (the order word "s.async=false"). With it each old script waits for the one added before it, and an old page's menu waits for the quote widget file. The guard must set no order: run node _work/ghl/build-fragments.mjs --bridge-only again, with the guard of _work/ghl/bridge.mjs as it is now`);
    const code = guards[part].replace(/^<script>/, "").replace(/<\/script>$/, "");
    const tryIt = (state, loadedAtStart, loadedBeforeReady) => {
      const added = [], waiting = [], d = { readyState: state, head: { appendChild: (s) => added.push(s) }, createElement: (tag) => ({ tag, async: true }), addEventListener: (type, fn) => waiting.push([type, fn]) }, w = loadedAtStart ? { PP5Loaded: 1 } : {};
      new Function("window", "document", code)(w, d);
      const atOnce = added.length; if (loadedBeforeReady) w.PP5Loaded = 1;
      for (const [type, fn] of waiting) if (type === "DOMContentLoaded") fn();
      return { atOnce, waited: waiting.map((x) => x[0]).join(), added: added.map((s) => `${s.tag}|${s.src}|${s.async}`).join(" ") };
    };
    const wantAdded = addresses[part].map((u) => `script|${u}|true`).join(" ");
    const oldRead = tryIt("complete", false, false), newRead = tryIt("complete", true, false), oldEarly = tryIt("loading", false, false), newEarly = tryIt("loading", false, true), newInteractive = tryIt("interactive", true, false);
    if (oldRead.added !== wantAdded || oldRead.atOnce !== addresses[part].length) bad(`${BRIDGE[part]}: on an old page that has been read the guard must add ${addresses[part].length} script(s) to the head, each once, and leave each one async as the browser makes it (no "s.async=false": no old script may wait for another); it gave ${show(oldRead)}`);
    if (newRead.added !== "" || newInteractive.added !== "") bad(`${BRIDGE[part]}: with window.PP5Loaded set the guard must add nothing; it gave ${show(newRead)}`);
    if (oldEarly.atOnce !== 0 || oldEarly.waited !== "DOMContentLoaded" || oldEarly.added !== wantAdded) bad(`${BRIDGE[part]}: while the page is still being read the guard must wait for DOMContentLoaded and then add the old scripts; it gave ${show(oldEarly)}`);
    if (newEarly.atOnce !== 0 || newEarly.added !== "") bad(`${BRIDGE[part]}: when the footer block sets window.PP5Loaded before the page has been read, the guard must add nothing; it gave ${show(newEarly)}`);
    guardWords = "guard run on a made-up page: an old page gets its old scripts each once (into the head, async left true as the browser sets it, so none waits for another), a page whose footer block has set window.PP5Loaded gets none, and a page still being read is decided at DOMContentLoaded";
  }
  // g the tags: production carries each exactly as its own site-head.html does and no second copy; staging none
  let tagWords;
  if (profile.tracking) {
    const loaders = [...text.head.matchAll(/gtag\/js\?id=([A-Z0-9-]+)/g)].map((m) => m[1]), inits = [...text.head.matchAll(/fbq\('init',\s*'(\d+)'\)/g)].map((m) => m[1]);
    const [google, pixel] = cfg.tracking.expected;
    if (loaders.join() !== google || inits.join() !== pixel) bad(`${BRIDGE.head}: expected the Google tag ${google} and the Meta Pixel ${pixel} once each; found Google ${loaders.join(",") || "none"}, Meta ${inits.join(",") || "none"}`);
    for (const id of cfg.tracking.expected) { const n = text.head.split(id).length - 1, mine = own.head.split(id).length - 1; if (n !== mine || n < 1) bad(`${BRIDGE.head}: names ${id} ${n} time(s); ${SITE.head} names it ${mine} time(s), and the old lines may add none`); if (text.body.includes(id)) bad(`${BRIDGE.body}: names the tracking id ${id}`); }
    if (trackingPattern && (trackingPattern.test(rest.head) || trackingPattern.test(text.body))) bad(`bridge: a tracking tag stands in the old lines, in a guard or in the body code; the tags belong to ${SITE.head} alone`);
    if (text.head.split('id="pp-shared-organization"').length !== 2) bad(`${BRIDGE.head}: the shared organization data must stand exactly once`);
    tagWords = `Google tag ${google} and Meta Pixel ${pixel}: one tag each (each id named ${text.head.split(google).length - 1} and ${text.head.split(pixel).length - 1} times, as in ${SITE.head}); shared organization data once`;
  } else {
    if (trackingPattern) for (const part of ["head", "body"]) { const m = trackingPattern.exec(text[part]); if (m) bad(`${BRIDGE[part]}: this profile must hold no tracking tag, found "${m[0]}"`); }
    tagWords = "no tracking tag (this profile carries none)";
  }
  // h words that must not reach the live site code
  let wordWords = "";
  if (live) {
    const WORDS = ["noindex", "staging", "v5s", "leadconnectorhq"];
    for (const part of ["head", "body"]) text[part].split("\n").forEach((l, i) => { for (const w of WORDS) if (l.toLowerCase().includes(w)) bad(`${BRIDGE[part]}: line ${i + 1} holds "${w}", which must not be in the production site code`); });
    wordWords = ` · none of ${WORDS.join(", ")} in either file`;
  }
  const lines = (t) => t.replace(/\n$/, "").split("\n").length;
  return `${label}: ${before.n ? "NOT in order (see FAIL)" : "in order"} · ${BRIDGE.head} ${num(text.head.length)} characters, ${BRIDGE.body} ${num(text.body.length)} · all ${lines(own.head)} lines of ${SITE.head} and all ${lines(own.body)} of ${SITE.body} present and unchanged, whole and first · ${cut.head.kept.length} old line(s), ${sourceWords} · old stylesheets once each, in their own lines: ${sheets.map((s) => s.file).join(", ") || "none"} · old scripts once each, only inside a guard, none as a plain script tag: ${addresses.head.map(baseOf).join(", ") || "none"} (head) and ${addresses.body.map(baseOf).join(", ") || "none"} (body) · ${tagWords}${wordWords} · nothing of the new build is loaded · ${guardWords}`;
}
