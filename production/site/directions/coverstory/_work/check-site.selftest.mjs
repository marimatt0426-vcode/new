// check-site.selftest.mjs : proves that check-site.mjs catches what it says it catches.
//
//   node _work/check-site.selftest.mjs          (about a minute; run it after changing check-site.mjs)
//
// It breaks a built page in one way at a time (in the built file only, never in a source), runs check-site.mjs on
// that page, and expects a FAIL that names the problem. Every file is put back exactly as it was.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, WORK } from "./site-lib.mjs";

const HOME = "index.html", SERVICE = "dog-waste-removal.html", CITY = "_example-city.html", PLAIN = "_example-plain-pose.html";
// [what is broken, page, how to break it, words the failure must contain, needs the browser?]
const sub = (from, to) => (html) => { if (!html.includes(from)) throw new Error("selftest: text to replace not found: " + from.slice(0, 60)); return html.replace(from, () => to); };
const CASES = [
  ["a second h1", PLAIN, sub("<main id=\"main\">", "<main id=\"main\"><h1>Second headline</h1>"), "h1 headings"],
  ["a skipped heading level", PLAIN, sub("</h1>", "</h1><h4>Too deep</h4>"), "heading order jumps"],
  ["an empty title", PLAIN, (h) => h.replace(/<title>[^<]*<\/title>/, "<title></title>"), "<title> is missing"],
  ["no description", PLAIN, (h) => h.replace(/<meta name="description" content="[^"]*">\n/, ""), "meta description is missing"],
  ["no canonical", HOME, (h) => h.replace(/<link rel="canonical" href="[^"]*">\n/, ""), "canonical"],
  ["a canonical on a noindex page", PLAIN, sub('<meta name="theme-color"', '<link rel="canonical" href="https://itspurgepros.com/x">\n<meta name="theme-color"'), "noindex and still carries a canonical"],
  ["no shared-link title", PLAIN, (h) => h.replace(/<meta property="og:title" content="[^"]*">\n/, ""), "og:title"],
  ["a share picture the page's JSON does not name", PLAIN, sub('<meta name="twitter:card"', '<meta property="og:image" content="https://example.com/picture.jpg">\n<meta name="twitter:card"'), 'names no "ogImage"'],
  ["a price link on a page for existing customers", PLAIN, (h) => h.replace("<body", '<body data-audience="customer"'), "still offers a price"],
  ["an image without alt", PLAIN, sub('src="../../assets/brand-icons/pp-visit-message.webp" width="30" height="30" alt=""', 'src="../../assets/brand-icons/pp-visit-message.webp" width="30" height="30"'), "no alt attribute"],
  ["an image without a size", PLAIN, sub('src="../../assets/brand-icons/pp-visit-message.webp" width="30" height="30"', 'src="../../assets/brand-icons/pp-visit-message.webp"'), "no width and height"],
  ["a scene with an empty alt", PLAIN, (h) => h.replace(/(scene-fee\.jpg"[^>]*alt=")[^"]*"/, '$1"'), "empty alt"],
  ["an image file that does not exist", PLAIN, sub("scene-fee.jpg", "scene-missing.jpg"), "does not exist"],
  ["a link to a page that is not one of the site's pages", PLAIN, sub('href="about.html"', 'href="our-story.html"'), "does not point at one of the site's pages"],
  ["a link that goes nowhere", PLAIN, sub('href="about.html"', 'href="#"'), "goes nowhere"],
  ["an anchor with no target", PLAIN, sub('href="about.html"', 'href="#no-such-section"'), "has no target on this page"],
  ["a link to a missing id on a built page", PLAIN, sub('href="dog-waste-removal.html#one-time"', 'href="dog-waste-removal.html#no-such-id"'), 'has no id="no-such-id"'],
  ["a phone number that is not a link", PLAIN, sub("</h1>", "</h1><p>Call (317) 961-5865 today.</p>"), "is plain text"],
  ["a wrong phone link", PLAIN, sub('class="foot__way" href="tel:+13179615865"', 'class="foot__way" href="tel:+13175550100"'), "phone link is not"],
  ["a wrong text link", PLAIN, sub('class="foot__txt" href="sms:+13179615865"', 'class="foot__txt" href="sms:+13175550100"'), "text link is not"],
  ["a call link with no text link before it (the footer's text line made an email link)", PLAIN, sub('class="foot__txt" href="sms:+13179615865"', 'class="foot__txt" href="mailto:info@itspurgepros.com"'), "TEXT FIRST: a call link"],
  ["a call button alone in a page's own section", PLAIN, sub("</main>", '<section class="sec" aria-label="x"><p class="actions"><a class="btn btn--outline" href="tel:+13179615865">Call us</a></p></section></main>'), "TEXT FIRST: a call link"],
  ["a call link before its text link", PLAIN, sub("</main>", '<section class="sec" aria-label="x"><p class="actions"><a class="btn" href="tel:+13179615865">Call us</a> <a class="btn" href="sms:+13179615865">Text us</a></p></section></main>'), "TEXT FIRST: a call link"],
  ['the words "call or text"', PLAIN, sub("</h1>", "</h1><p>Call or text us any time.</p>"), 'Say "text or call"'],
  ["a header contact control that does not open the Text link first", PLAIN, sub('<li><a class="nav__text" href="sms:+13179615865">', '<li><a class="nav__text" href="about.html">'), "contact control must open the Text link"],
  ["a review badge that does not link to the reviews page", PLAIN, sub('<a class="gbadge" href="reviews.html"', '<a class="gbadge" href="index.html"'), "review badge links to"],
  ["a visible question that differs from the FAQ data", CITY, sub("<h3>What is the first example question?</h3>", "<h3>What is the changed question?</h3>"), "FAQPage question 1"],
  ["a visible answer that differs from the FAQ data", CITY, sub("<p>The second example answer.", "<p>A changed answer."), "FAQPage answer 2"],
  ["two WebPage nodes", PLAIN, sub('"@graph":[', '"@graph":[{"@type":"WebPage","@id":"https://itspurgepros.com/x#webpage","dateModified":"2026-09-09"},'), "describes this page 2 times"],
  ["two BreadcrumbList nodes", CITY, sub('"@graph":[', '"@graph":[{"@type":"BreadcrumbList","itemListElement":[]},'), "2 BreadcrumbList nodes"],
  ["a rating typed into the page", PLAIN, sub("</h1>", "</h1><p>Rated 4.8 stars from 51 Google reviews.</p>"), "a rating or a review count is typed"],
  ["a stand-in figure changed by hand", PLAIN, (h) => h.replace(/(data-pp-reviews="\{rating\}"[^>]*>)[^<]*</, "$14.7<"), "the one switch"],
  ["a stand-in badge with a figure the switch cannot reach", PLAIN, (h) => h.replace(/(<span class="gbadge__txt">)/, "$1Top 5 "), "figure the rating switch cannot reach"],
  ["rating markup", PLAIN, sub('"@type":"WebPage"', '"@type":"WebPage","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9"}'), "rating or review markup"],
  ['the words "initial scoop"', PLAIN, sub("</h1>", "</h1><p>An initial scoop fee applies.</p>"), '"initial scoop"'],
  ['the word "surcharge"', PLAIN, sub("</h1>", "</h1><p>No first-visit surcharge.</p>"), '"surcharge"'],
  ['the word "waived"', PLAIN, sub("</h1>", "</h1><p>The fee is waived.</p>"), '"waived"'],
  ['the word "promotion"', PLAIN, sub("</h1>", "</h1><p>A spring promotion.</p>"), '"promotion"'],
  ['the word "offer" outside the allowed phrases', PLAIN, sub("</h1>", "</h1><p>A special offer for you.</p>"), '"offer"'],
  ["a number of minutes that is not 30 or 120", PLAIN, sub("</h1>", "</h1><p>Up to 45 minutes are included.</p>"), "45 minutes"],
  ["a promise of a free first cleanup", PLAIN, sub("</h1>", "</h1><p>Your first cleanup is free.</p>"), "free or unlimited"],
  ["a reworded explainer item", PLAIN, sub("Very few do. If yours looks like it will", "Hardly any do. If yours looks like it will"), "explainer item 2 differs"],
  ["the explainer without its small print", PLAIN, (h) => h.replace(/<p class="explain__small">[^<]*<\/p>/, ""), "not followed by its small print"],
  ["a reworded lead in the fee section", PLAIN, sub("New recurring customers pay no start-up fee. Your first cleanup costs", "New customers pay no start-up fee. The first cleanup costs"), "lead of the no-start-up-fee section"],
  ["a dollar figure the engine does not produce", PLAIN, sub("</h1>", "</h1><p>From $21.49 a visit.</p>"), '"$21.49" is on the page'],
  ["a keyed price that differs from the engine", HOME, (h) => h.replace(/(data-price="weekly:1"[^>]*>[\s\S]*?)19(<)/, "$118$2"), "the engine says $19.99"],
  ["a price-list row for a combination the engine does not sell", SERVICE, sub('data-min="1" data-max="1" data-price="twice:1"', 'data-min="9" data-max="9" data-price="twice:9"'), "price list:"],
  ["two receipts with the sanitized-tools caption", SERVICE, (h) => h.replace(/<p class="receipt__text">[^<]*<\/p>/g, '<p class="receipt__text">Tools and footwear are sanitized between yards.</p>'), "say the same thing: tools are sanitized"],
  ["a review build whose footer lost its review-build line", PLAIN, (h) => h.replace(/[ \t]*<p class="foot__review">[^\n]*\n/, ""), "no review-build line"],
  ["a header whose Text button disagrees with the site setting (taken out when it is on, marked in when it is off)", PLAIN, (h) => (/<header class="hdr hdr--text"/.test(h) ? h.replace(/[ \t]*<a class="[^"]*\bhdr__text\b[^"]*"[^>]*>[^\n]*\n/, "") : h.replace('<header class="hdr" data-hdr>', '<header class="hdr hdr--text" data-hdr>')), "Text button of the phone top bar"],
  ["a footer without its id", PLAIN, sub(' id="site-footer"', ""), 'no id="site-footer"'],
  ["a section with no accessible name", PLAIN, sub(' id="yard-guide" aria-labelledby="guide-title"', ' id="yard-guide"'), "neither aria-labelledby nor aria-label"],
  ["a gloved hero without data-mascot on the body", CITY, sub('<body data-mascot="gloved">', "<body>"), 'needs data-mascot="gloved"'],
  ["the same title on two pages", SERVICE, (h) => h.replace(/<title>[^<]*<\/title>/, "<title>Dog Waste Removal Indianapolis | Purge Pros</title>"), "title is the same as on index.html"],
  ["sideways scroll", PLAIN, sub("</body>", '<div style="width:2000px;height:10px"></div></body>'), "scrolls sideways", true],
  ["words cut off at the side of the screen", PLAIN, sub("</main>", '<p style="width:2000px">A line that runs off the side of the screen and is cut.</p></main>'), "cut off at the side", true],
  ["a keyword line that wraps to two lines on a phone", CITY, (h) => h.replace(/<p class="cover__kw">[\s\S]*?<\/p>/, '<p class="cover__kw">Dog waste removal in Westfield and the north side of Hamilton County</p>'), '"kwLines": 2', true],
  ["a spark that runs under the price card", CITY, (h) => h.replace(/(<span class="cover__line cover__line--pop[^"]*">)([^<]*)</, "$1Handled, every single week of the year.<"), "gold spark", true],
  ["a script error", PLAIN, sub("</body>", '<script>throw new Error("selftest")</script></body>'), "console errors", true],
  ["a bare-handed pose at the top of a gloved page", CITY, sub("</h1>", '</h1><img src="../../assets/brand/poses/wave.webp" width="100" height="180" alt="" style="position:absolute;top:120px;left:10px;z-index:9">'), "bare-handed mascot", true],
  // SPEED (DESIGN.md "Speed")
  ["a hero served as one JPEG (no WebP copies in srcset)", CITY, (h) => h.replace(/(<picture class="cover__scene">)\s*(?:<source[^>]*>\s*)+/, "$1"), "the hero has no srcset"],
  ["a hero with no preload in the head", CITY, (h) => h.replace(/<link rel="preload" as="image"[^>]*>\n/g, ""), "has no preload in the head"],
  ["a preload of the hero's JPEG beside its WebP copy", CITY, sub('<link rel="stylesheet" href="css/site.css">', '<link rel="preload" as="image" href="../../assets/heroes/westfield.jpg" fetchpriority="high">\n<link rel="stylesheet" href="css/site.css">'), "would be fetched twice"],
  ["a derived picture that does not exist", CITY, (h) => h.replace(/-768\.webp 768w/g, "-767.webp 768w"), "which does not exist"],
  ["a script loaded without defer", PLAIN, sub('<script src="js/site.js" defer>', '<script src="js/site.js">'), "loaded without defer"],
  ["a full-size picture on the first screen of a phone", CITY, (h) => h.replace(/<source media="\(max-width: 699px\)" type="image\/webp"[^>]*>\s*<source type="image\/webp"[^>]*>/, '<source type="image/webp" srcset="../../assets/heroes/fortville.jpg">'), "at phone width nothing on the first screen may be above about 200 KB", true],
];

const original = new Map();
const restore = () => { for (const [file, html] of original) fs.writeFileSync(path.join(ROOT, file), html); };
process.on("exit", restore);
let wrong = 0;
for (const [what, page, mutate, expect, browser] of CASES) {
  const file = path.join(ROOT, page);
  if (!original.has(page)) original.set(page, fs.readFileSync(file, "utf8"));
  const html = original.get(page);
  let broken;
  try { broken = mutate(html); } catch (e) { console.log("  SELFTEST ERROR  " + what + ": " + e.message); wrong += 1; continue; }
  if (broken === html) { console.log("  SELFTEST ERROR  " + what + ": the page was not changed"); wrong += 1; continue; }
  fs.writeFileSync(file, broken);
  let out = "", code = 0;
  try { out = execFileSync("node", [path.join(WORK, "check-site.mjs"), page.replace(/\.html$/, ""), ...(browser ? [] : ["--static"])], { encoding: "utf8", maxBuffer: 1 << 26 }); } catch (e) { out = String(e.stdout || "") + String(e.stderr || ""); code = e.status; }
  fs.writeFileSync(file, html);
  const line = out.split("\n").find((l) => l.includes("FAIL ") && l.includes(expect));
  const ok = code === 1 && Boolean(line);
  if (!ok) wrong += 1;
  console.log(`  ${ok ? "caught   " : "MISSED   "} ${what}${ok ? "" : "   (expected a failure containing: " + expect + ")"}`);
}
restore();
console.log(wrong ? `\n${wrong} of ${CASES.length} not caught` : `\nAll ${CASES.length} broken pages were caught. Every file is back as it was.`);
process.exitCode = wrong ? 1 : 0;
