import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, "$1:"));
const inventoryPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(here, "published-cards.json");
const prepared = path.join(here, "prepared");
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const posts = inventory.posts;

if (!Array.isArray(posts) || posts.length === 0) throw new Error("Inventory must contain a non-empty posts array.");

const required = ["title", "slug", "publicUrl", "description", "category", "alt", "coverUrl"];
for (const [index, post] of posts.entries()) {
  for (const key of required) if (!post[key]) throw new Error(`Post ${index + 1} lacks ${key}.`);
}
const uniqueSlugs = new Set(posts.map((post) => post.slug));
if (uniqueSlugs.size !== posts.length) throw new Error("Inventory contains duplicate slugs.");

const arrow = "https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a216c73b042e1413e0f1.webp";
const search = "https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa9a21598106dcc4e208c05.webp";
const hero = "https://images.leadconnectorhq.com/image/f_webp/q_82/r_1200/u_https://assets.cdn.filesafe.space/YzqccfNpAoMTt4EZO92d/media/6aa8de2e49f830e49b319881.jpg";
const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const presentCategories = [...new Set(posts.map((post) => post.category))];
const categories = [...new Set([...(inventory.categoryOrder || []).filter(category => presentCategories.includes(category)), ...presentCategories])];
const filters = `<div class="pbr2-filters" role="group" aria-label="Filter Yard Guide articles"><button class="pbr2-filter" type="button" aria-pressed="true" data-pbr2-filter="all">All articles</button>${categories.map((category) => `<button class="pbr2-filter" type="button" aria-pressed="false" data-pbr2-filter="${escapeHtml(slugify(category))}">${escapeHtml(category)}</button>`).join("")}</div>`;
const card = (post) => `<article class="pbr2-card" data-pbr2-card data-category="${escapeHtml(slugify(post.category))}" data-search="${escapeHtml(`${post.title} ${post.description} ${post.category}`.toLowerCase())}"><a class="pbr2-card-media" href="${escapeHtml(post.publicUrl)}"><img src="${escapeHtml(post.optimizedCoverUrl || post.coverUrl)}" width="720" height="480" alt="${escapeHtml(post.alt)}" loading="lazy" decoding="async"></a><div class="pbr2-card-body"><span class="pbr2-kicker">${escapeHtml(post.category)}</span><h3><a href="${escapeHtml(post.publicUrl)}">${escapeHtml(post.title)}</a></h3><p>${escapeHtml(post.description)}</p><a class="pbr2-card-link" href="${escapeHtml(post.publicUrl)}">Read the guide <img src="${arrow}" alt="" aria-hidden="true"></a></div></article>`;

const index = `<main class="pp-next pp-r2 pbr2-index" id="pp-main"><section class="pbr2-hero" aria-labelledby="pbr2-index-title"><div class="pbr2-shell pbr2-hero-grid"><div class="pbr2-hero-copy"><span class="pbr2-kicker">The Purge Pros Yard Guide</span><h1 id="pbr2-index-title">Good yards.<span>Good reads.</span></h1><p>Straightforward guidance for cleaner yards, smoother service visits, and life with dogs across Central Indiana.</p><div class="pbr2-search"><label for="pbr2-search">Search the Yard Guide</label><img src="${search}" alt="" aria-hidden="true"><input id="pbr2-search" type="search" placeholder="Search the Yard Guide" autocomplete="off" data-pbr2-search></div></div><figure class="pbr2-hero-art"><img src="${hero}" width="1200" height="800" alt="Purge Pros mascot with two happy dogs in an illustrated fenced yard" fetchpriority="high"><figcaption>Helpful answers for real yards.</figcaption></figure></div></section><section class="pbr2-library" aria-labelledby="pbr2-library-title" data-pbr2-library><div class="pbr2-shell"><div class="pbr2-library-head"><div><span class="pbr2-kicker">Explore the Yard Guide</span><h2 id="pbr2-library-title">Make the next visit easier.</h2></div><p>Browse practical guidance on pricing, first visits, yard care, service details, and local conditions.</p></div>${filters}<div class="pbr2-grid">${posts.map(card).join("\n")}</div><p class="pbr2-empty" hidden data-pbr2-empty>No guides match that search yet. Try a shorter phrase or choose all articles.</p></div></section></main>\n`;

fs.writeFileSync(path.join(prepared, "home-index.html"), index);
const header = fs.readFileSync(path.join(prepared, "home-header.html"), "utf8").replace(/\n*$/, "\n");
fs.writeFileSync(path.join(prepared, "home-header-and-index.html"), `${header}${index}`);
console.log(`Refreshed production Yard Guide index with ${posts.length} posts from ${inventoryPath}.`);
