/* Page probe used by _work/check-layout.mjs. Runs in the page and returns a JSON string:
   small text, small tap targets, stretched images, heading alignment, grid last rows, the section rhythm, and the hero
   (a pose standing on the drawn lawn, the compact drawn band, the spark beside the cyan line, stacked hero buttons). */
(async () => {
  await document.fonts.ready;
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0; };
  const hiddenUp = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return true; if (e.classList.contains("vh")) return true; if (e.matches(".mnav:not(.is-open), dialog:not([open]), [hidden]")) return true; } return false; };
  const name = (el) => { const c = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join("."); return el.tagName.toLowerCase() + (c ? "." + c : ""); };
  const where = (el) => { const s = el.closest("section[id], footer, header, .mnav, dialog"); return s ? (s.id || s.tagName.toLowerCase()) : "?"; };

  // 1. small text (under 12.5px), by the element that holds the text
  const small = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement; if (!el || el.closest("script, style, svg title, svg desc, noscript")) continue;
    if (hiddenUp(el) || !vis(el)) continue;
    let px = parseFloat(getComputedStyle(el).fontSize);
    const svg = el.closest("svg"); if (svg && svg.viewBox && svg.viewBox.baseVal.width) px = px * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const floor = el.closest(".logo__tag") ? (innerWidth < 700 ? 8.95 : 9.95) : svg ? 10.95 : 12.45;   // the lockup tagline (9px phone, 10px up) and map labels (11px) have their own floors
    if (el.closest(".ppb, .ppb-bar, dialog")) continue;                                             // the builder is checked by its own runner
    if (px < floor) { const k = name(el) + " @" + where(el) + " " + px.toFixed(1) + "px"; if (!small.has(k)) small.set(k, n.nodeValue.trim().slice(0, 28)); }
  }

  // 2. tap targets under 44px (links and buttons that are not inline in running text)
  const taps = [];
  for (const el of document.querySelectorAll("a[href], button, summary, [role=button], input, select, textarea")) {
    if (hiddenUp(el) || !vis(el)) continue;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const inline = cs.display === "inline" && el.parentElement && /^(P|SPAN|DD|LI|DIV|B|STRONG)$/.test(el.parentElement.tagName) && el.parentElement.textContent.trim().length > el.textContent.trim().length + 12;
    if (inline) continue;
    if (el.closest(".ppb, .ppb-bar, dialog")) continue;   // the builder checks its own targets
    if (r.height < 43.5 || r.width < 43.5) taps.push(name(el) + " @" + where(el) + " " + Math.round(r.width) + "x" + Math.round(r.height) + " '" + el.textContent.trim().slice(0, 20) + "'");
  }

  // 3. images drawn at the wrong proportions
  const stretched = [];
  for (const im of document.images) {
    if (hiddenUp(im) || !vis(im) || !im.naturalWidth) continue;
    const r = im.getBoundingClientRect(), fit = getComputedStyle(im).objectFit;
    if (fit !== "fill") continue;
    const a = r.width / r.height, b = im.naturalWidth / im.naturalHeight;
    if (Math.abs(a - b) / b > 0.03) stretched.push(im.getAttribute("src").split("/").pop() + " " + im.naturalWidth + "x" + im.naturalHeight + " drawn " + Math.round(r.width) + "x" + Math.round(r.height) + " @" + where(im));
  }

  // 4. section headings: alignment and left edge of the title
  const heads = [];
  for (const sh of document.querySelectorAll("main .sh, .foot__closer")) {
    if (!vis(sh)) continue;
    const t = sh.querySelector("h2"); if (!t) continue;
    const range = document.createRange(); range.selectNodeContents(t); const tr = range.getBoundingClientRect();
    const mid = (tr.left + tr.right) / 2, c = innerWidth / 2;
    heads.push({ id: (sh.closest("section[id]") || {}).id || "closing", align: getComputedStyle(t).textAlign, left: Math.round(tr.left), centred: Math.abs(mid - c) < 3 });
  }

  // 5. grids: items per row; a last row that is not full is listed
  const grids = [];
  const sels = [".grid", ".receipts", ".chips", ".facts__list", ".steps", ".adders", ".foot__links--areas", ".ilist--3up", ".rfeed__themes .ilist", ".foot__cols", ".ppick-list", ".pboard__rail", ".adder__pics", ".center-row", ".foot__top"];
  for (const g of document.querySelectorAll(sels.join(","))) {
    if (hiddenUp(g) || !vis(g)) continue;
    const kids = [...g.children].filter((k) => vis(k) && getComputedStyle(k).position !== "absolute" && !k.matches(".pboard__rail-head"));
    if (kids.length < 2) continue;
    // items whose boxes overlap vertically by more than half are one row (a raised card is still in its row)
    const rects = kids.map((k) => k.getBoundingClientRect()).sort((a, b) => a.top - b.top), rowsList = [];
    for (const r of rects) { const row = rowsList[rowsList.length - 1]; if (row && r.top < row.top + (row.bottom - row.top) * 0.5) { row.n += 1; row.bottom = Math.max(row.bottom, r.bottom); row.w += r.width; } else rowsList.push({ top: r.top, bottom: r.bottom, n: 1, w: r.width }); }
    const counts = rowsList.map((r) => r.n), max = Math.max(...counts), lastRow = rowsList[rowsList.length - 1];
    const gw = g.getBoundingClientRect().width, spans = lastRow.n === 1 && lastRow.w > gw * 0.9;   // one item that spans the full row is a designed span
    const stacked = max === 1;
    grids.push({ g: name(g) + " @" + where(g), rows: counts.join("+"), orphan: !stacked && counts.length > 1 && lastRow.n < max && !spans && !(g.matches(".grid--5, .grid--7, .center-row")) });
  }

  // 6. the gap between sections (one rhythm)
  const secs = [...document.querySelectorAll("main > section.sec")];
  const blocks = (sec) => { const out = []; const walk = (el) => { for (const c of el.children) { if (!vis(c)) continue; const cs = getComputedStyle(c); if (cs.position === "absolute" || cs.position === "fixed") continue; if (c.matches(".wrap, .stack, .split, .split__text, .split__art, .wrap > div:not([class]), .stack > div:not([class])")) walk(c); else out.push(c); } }; walk(sec); return out; };
  const gaps = []; let prev = null;
  for (const s of secs) { const b = blocks(s); if (!b.length) continue; const top = Math.min(...b.map((e) => e.getBoundingClientRect().top)), bot = Math.max(...b.map((e) => e.getBoundingClientRect().bottom)); if (prev !== null) gaps.push(Math.round(top - prev)); prev = bot; }
  const scene = document.querySelector(".foot__scene"); if (scene && prev !== null) gaps.push(Math.round(scene.getBoundingClientRect().top - prev));

  // 7. the hero: a pose stands ON the drawn lawn (never above it, never behind the lead card), the drawn band is compact
  //    on a desktop, and the spark beside the cyan line is fully visible
  const hero = [];
  const cover = document.querySelector(".cover");
  if (cover) {
    const pose = cover.querySelector(".drawn__pose img, .drawn__cover img"), lawn = cover.querySelector(".drawn__lawn"), note = cover.querySelector(".cover__note");
    if (pose && lawn) {
      const pr = pose.getBoundingClientRect(), lr = lawn.getBoundingClientRect(), crest = lr.top + lr.height * (8 / 120);
      const sink = Math.round(pr.bottom - crest);
      if (sink < 2) hero.push("the pose floats " + (-sink) + "px above the drawn lawn");
      if (sink > 26) hero.push("the pose is sunk " + sink + "px into the drawn lawn");
      if (pr.top < cover.getBoundingClientRect().top - 1) hero.push("the pose is cut by the top of the hero");
      if (note) { const nr = note.getBoundingClientRect(); if (nr.left < pr.right - 4 && nr.right > pr.left + 4 && nr.top < pr.bottom - 4 && nr.bottom > pr.top + 4) hero.push("the lead card covers the pose"); }
      const sr = cover.querySelector(".cover__scene--drawn").getBoundingClientRect();
      if (pr.right > sr.right + 1 || pr.left < sr.left - 1) hero.push("the pose runs out of the drawn field at the side");
    }
    if (cover.classList.contains("cover--drawn") && innerWidth >= 1240 && cover.getBoundingClientRect().height > innerHeight * 0.62) hero.push("the drawn hero is " + Math.round(cover.getBoundingClientRect().height) + "px tall, more than 62% of a " + innerWidth + " by " + innerHeight + " window (shorten the title or the lead)");
    const spark = cover.querySelector(".spark"), card = cover.querySelector(".cover__builder");
    if (spark && getComputedStyle(spark, "::after").content !== "none") {
      const rects = spark.getClientRects(), last = rects[rects.length - 1], after = getComputedStyle(spark, "::after");
      const left = (getComputedStyle(spark).display === "block" ? spark.getBoundingClientRect().right : last.right) + parseFloat(after.marginLeft), right = left + parseFloat(after.width);
      const c = card ? card.getBoundingClientRect() : null;
      if (c && right > c.left + 2 && left < c.right && last.bottom > c.top && last.top < c.bottom) hero.push("the spark beside the cyan line is under the price card by " + Math.round(right - c.left) + 'px (shorten the line, or "spark": false in "hero")');
      else if (right > document.documentElement.clientWidth) hero.push("the spark beside the cyan line runs off the screen by " + Math.round(right - document.documentElement.clientWidth) + "px");
    }
    // a pair of hero buttons stacked on a phone are the same width
    const btns = note ? [...note.querySelectorAll(".actions > .btn, .actions > .reach, .cover__act > .btn")].filter(vis) : [];
    if (innerWidth < 620 && btns.length > 1) { const ws = btns.map((b) => Math.round(b.getBoundingClientRect().width)); if (Math.max(...ws) - Math.min(...ws) > 2) hero.push("the hero's stacked buttons differ in width: " + ws.join(", ")); }
  }

  return JSON.stringify({ small: [...small.entries()].map((e) => e[0] + " '" + e[1] + "'"), taps, stretched, heads, grids, gaps, hero, h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim().replace(/\s+/g, " ")), overflowX: document.documentElement.scrollWidth > innerWidth });
})()
