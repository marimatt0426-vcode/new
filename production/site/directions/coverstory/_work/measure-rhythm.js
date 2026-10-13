(() => {
  // For every section: gap from the previous section's last block to this section's first block (T),
  // where the curve crosses at the page centre, and the section's computed paddings.
  const secs = [...document.querySelectorAll('main > section.sec, main > section.cover, footer .foot__scene')];
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const blocks = (sec) => {
    const out = [];
    const walk = (el) => { for (const c of el.children) { if (!vis(c)) continue; const cs = getComputedStyle(c); if (cs.position === 'absolute' || cs.position === 'fixed') continue; if (c.matches('.wrap, .stack, .split, .split__text, .split__art, .wrap > div:not([class]), .stack > div:not([class])')) walk(c); else out.push(c); } };
    walk(sec); return out;
  };
  const y = (v) => Math.round(v + scrollY);
  let prevBottom = null, prevName = '';
  const rows = [];
  for (const s of secs) {
    const b = blocks(s); if (!b.length) continue;
    const tops = b.map((e) => e.getBoundingClientRect().top), bots = b.map((e) => e.getBoundingClientRect().bottom);
    const first = y(Math.min(...tops)), last = y(Math.max(...bots));
    const cs = getComputedStyle(s);
    const r = s.getBoundingClientRect();
    rows.push({ sec: s.id || s.className.split(' ').slice(0, 2).join('.'), edge: s.dataset.edge || '', top: y(r.top), firstBlock: first, lastBlock: last, bottom: y(r.bottom), padTop: cs.paddingTop, padBottom: cs.paddingBottom, gapFromPrev: prevBottom === null ? null : first - prevBottom, topToFirst: first - y(r.top), lastToBottom: y(r.bottom) - last });
    prevBottom = last; prevName = s.id;
  }
  return JSON.stringify(rows);
})()
