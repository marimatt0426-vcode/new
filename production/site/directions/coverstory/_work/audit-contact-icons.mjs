// audit-contact-icons.mjs : TEXT FIRST, for icons. The owner's rule (October 8): wherever the site offers contact, text comes
// first and call second. A ringing-phone icon belongs on a Call button and nowhere else: a block whose words and buttons lead
// with text must not open on a phone.
//
//   node _work/audit-contact-icons.mjs                 every built page of the thirty (exit code 1 if anything is wrong)
//   node _work/audit-contact-icons.mjs additional faq  only these pages
//   node _work/audit-contact-icons.mjs --all           also lists every phone icon that is right (the Call buttons)
//
// It reads each BUILT page in a browser with scripts off (the page as it is delivered) and looks at every phone or call icon:
// an <img> from an icon folder whose file name says phone, call, handset, dial or ring (pp-phone.webp, step-icons/call.webp).
//   right  the icon is inside a call link (tel:): a Call button, the header's Call row, the footer's Call line.
//   WRONG  the icon is inside a text link (sms:).
//   WRONG  the icon is decoration (outside any link) and the nearest block that offers contact starts with a text link (sms:):
//          the block leads with text, so its icon is the message icon. Use the one that component family already uses:
//          brand-icons/pp-visit-message.webp, or the 3D step-icons/chat.webp.
//   LOOK   the icon is decoration and no contact link is near it: read the words beside it and decide.
// It also lists a text link that carries no message icon of its own while a phone icon sits in it, a call link that shows the
// message icon, and any phone icon named in a stylesheet. A mascot pose that holds a phone (brand/poses/phone.webp) is a
// picture of a smartphone, not a call icon: it is listed for the record and never counted.
// Fix a finding in the page's source (_work/pages/<slug>.html), or in _work/partials/ when a shared piece is the cause, then
// build and run this again. The price builder's own states are drawn by js/builder.js and are covered by its notes (BUILDER-NOTES.md).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ROOT, builtFiles } from "./site-lib.mjs";

const puppeteer = createRequire((process.env.PP_PPTR_DIR || "tools/pptr") + "/package.json")("puppeteer-core");
const CHROME = (process.env.PP_CHROME || "chrome");
const args = process.argv.slice(2);
const showAll = args.includes("--all");
const named = args.filter((a) => !a.startsWith("--")).map((a) => a.replace(/[.]html$/, "") + ".html");
const PAGES = named.length ? named : builtFiles().pages;
for (const page of PAGES) if (!fs.existsSync(path.join(ROOT, page))) { console.error(page + ": no built page of that name. Build it first: node _work/build-site.mjs"); process.exit(1); }

// runs in the page
const PROBE = () => {
  const ICON_FOLDER = /\/(brand-icons|step-icons|quote-icons)\//, PHONE_NAME = /(phone|call|handset|dial|ring)/i, MESSAGE_NAME = /(message|chat|sms|text)/i;
  const file = (img) => (img.getAttribute("src") || "").split("?")[0];
  const name = (img) => file(img).split("/").pop();
  const isPhone = (img) => ICON_FOLDER.test(file(img)) && PHONE_NAME.test(name(img));
  const isMessage = (img) => ICON_FOLDER.test(file(img)) && MESSAGE_NAME.test(name(img));
  const words = (node) => (node.textContent || "").replace(/\s+/g, " ").trim();
  const letters = (node) => words(node).replace(/[^a-z]/gi, "").length;
  const tag = (node) => node.tagName.toLowerCase() + (node.id ? "#" + node.id : "") + (node.classList.length ? "." + [...node.classList].slice(0, 2).join(".") : "");
  const EDGE = "section, header, footer, nav, main, dialog";
  const CONTACT = 'a[href^="sms:"], a[href^="tel:"]';
  const out = { right: [], wrong: [], look: [], poses: [], icons: 0 };
  for (const img of document.querySelectorAll("img")) {
    if (/\/poses\/phone\./.test(file(img))) { out.poses.push({ where: tag(img.closest(EDGE) || document.body), alt: img.getAttribute("alt") || "" }); continue; }
    if (!isPhone(img)) continue;
    out.icons += 1;
    const size = img.getAttribute("width") + "px";
    const call = img.closest('a[href^="tel:"]'), text = img.closest('a[href^="sms:"]');
    if (call) { out.right.push({ icon: name(img), size, in: tag(call), label: words(call).slice(0, 60) }); continue; }
    if (text) { out.wrong.push({ why: "a phone icon on a TEXT link", icon: name(img), size, block: tag(text), words: words(text).slice(0, 90), first: text.getAttribute("href") }); continue; }
    // decoration: the unit it labels (the icon and its words), then the nearest block that offers contact
    let unit = img.parentElement;
    while (unit && unit !== document.body && letters(unit) < 8 && !unit.matches(EDGE)) unit = unit.parentElement;
    const leading = unit.querySelector("img") === img;
    let block = unit, first = null;
    for (;;) {
      first = block.matches(CONTACT) ? block : block.querySelector(CONTACT);
      if (first || block.matches(EDGE) || !block.parentElement || block.parentElement === document.body) break;
      block = block.parentElement;
    }
    const base = { icon: name(img), size, unit: tag(unit), words: words(unit).slice(0, 110), leadingIconOfItsUnit: leading, block: tag(block), section: tag(img.closest(EDGE) || document.body) };
    if (!first) out.look.push({ why: "a phone icon as decoration, with no contact link in its block", ...base });
    else if (first.getAttribute("href").startsWith("sms:")) out.wrong.push({ why: "a phone icon leads a block whose first contact action is a text link", ...base, first: first.getAttribute("href") + " “" + words(first).slice(0, 40) + "”" });
    else out.wrong.push({ why: "a phone icon as decoration of a block whose first contact action is a CALL link (text must come first)", ...base, first: first.getAttribute("href") + " “" + words(first).slice(0, 40) + "”" });
  }
  // the links themselves: a text link must not show a phone, a call link must not show the message icon
  for (const a of document.querySelectorAll('a[href^="tel:"]')) for (const img of a.querySelectorAll("img")) if (isMessage(img)) out.wrong.push({ why: "a CALL link shows the message icon", icon: name(img), block: tag(a), words: words(a).slice(0, 90), first: a.getAttribute("href") });
  out.links = { text: document.querySelectorAll('a[href^="sms:"]').length, call: document.querySelectorAll('a[href^="tel:"]').length,
    textWithMessageIcon: [...document.querySelectorAll('a[href^="sms:"]')].filter((a) => [...a.querySelectorAll("img")].some(isMessage)).length };
  return out;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--hide-scrollbars", "--disable-gpu", "--no-first-run", "--allow-file-access-from-files"] });
let wrong = 0, look = 0, right = 0, icons = 0;
const poses = [];
try {
  const page = await browser.newPage();
  await page.setJavaScriptEnabled(false);
  for (const name of PAGES) {
    await page.goto(pathToFileURL(path.join(ROOT, name)).href, { waitUntil: "domcontentloaded", timeout: 45000 });
    const r = await page.evaluate(PROBE);
    icons += r.icons; right += r.right.length; wrong += r.wrong.length; look += r.look.length;
    for (const p of r.poses) poses.push(name + " (" + p.where + ")");
    const status = r.wrong.length ? "WRONG" : r.look.length ? "LOOK " : "ok   ";
    console.log(`${status} ${name.padEnd(34)} ${String(r.icons).padStart(2)} phone icons: ${r.right.length} on call links, ${r.wrong.length} wrong, ${r.look.length} to look at · links: ${r.links.text} text (${r.links.textWithMessageIcon} with the message icon), ${r.links.call} call`);
    for (const f of r.wrong) console.log(`      WRONG ${f.why}\n            icon ${f.icon}${f.size ? " " + f.size : ""} · unit ${f.unit || f.block}${f.leadingIconOfItsUnit === undefined ? "" : f.leadingIconOfItsUnit ? " (its leading icon)" : " (not its first icon)"} · block ${f.block}${f.section ? " in " + f.section : ""}\n            words: ${f.words}\n            first contact action: ${f.first}`);
    for (const f of r.look) console.log(`      LOOK  ${f.why}\n            icon ${f.icon} ${f.size} · unit ${f.unit}${f.leadingIconOfItsUnit ? " (its leading icon)" : ""} · block ${f.block} in ${f.section}\n            words: ${f.words}`);
    if (showAll) for (const f of r.right) console.log(`      right ${f.icon} ${f.size} in ${f.in} “${f.label}”`);
  }
} finally { await browser.close().catch(() => {}); }

// stylesheets and scripts: a phone icon drawn from CSS, or named in a script, is outside what the pages show to this audit
const named2 = [];
for (const dir of ["css", "js"]) for (const f of fs.readdirSync(path.join(ROOT, dir))) {
  const text = fs.readFileSync(path.join(ROOT, dir, f), "utf8");
  const hits = [...text.matchAll(/[\w./-]*(?:pp-phone|step-icons\/call|icons\/[\w-]*(?:phone|handset|dial))[\w.-]*/g)].map((m) => m[0]);
  if (hits.length) named2.push(`${dir}/${f}: ${[...new Set(hits)].join(", ")} (${hits.length})`);
}
console.log(`\n${PAGES.length} pages · ${icons} phone or call icons · ${right} on call links (right) · ${wrong} wrong · ${look} to look at`);
console.log("Named outside the pages (read these by hand): " + (named2.length ? named2.join(" · ") : "none"));
if (poses.length) console.log("For the record, the mascot pose that holds up a smartphone (a picture, not a call icon): " + poses.join(", "));
console.log(wrong ? "TEXT-FIRST ICONS: FIX THE ONES MARKED WRONG" : look ? "TEXT-FIRST ICONS: NOTHING WRONG, " + look + " TO LOOK AT" : "TEXT-FIRST ICONS: ALL RIGHT");
process.exit(wrong ? 1 : 0);
