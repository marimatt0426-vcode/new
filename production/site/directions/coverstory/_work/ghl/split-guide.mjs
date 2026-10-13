// Packaging helper installed beside build-fragments.mjs. No page or hosted asset changes.
import { tokens, attrsOf, hasClass, topLevel } from './lib.mjs';
export const GUIDE_BASE = 'blog/home-1-header-and-index';

// Ranges include each card's trailing whitespace, preserving the exact DOM text nodes.
export function guideCards(html) {
  const ts = tokens(html), cards = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (t.type !== 'open' || !hasClass({ attrs: attrsOf(t.attrs) }, 'guide-card')) continue;
    if (t.tag !== 'a') throw new Error('Yard Guide card markup changed: inspect the split before pasting.');
    let j = i + 1;
    while (j < ts.length && !(ts[j].type === 'close' && ts[j].tag === 'a')) j++;
    if (j === ts.length) throw new Error('Yard Guide has an unclosed card; repair the source before building.');
    let end = ts[j].end;
    if (ts[j + 1]?.type === 'text' && /^\s*$/.test(ts[j + 1].raw)) end = ts[j + 1].end;
    cards.push({ start: t.start, end, html: html.slice(t.start, end) });
    i = j;
  }
  return cards;
}

// A classic synchronous script: no fetching, timer, observer or URL-dependent path.
// Mark GHL wrappers before removing our own holder, so an empty native element has no box.
export const GUIDE_JOINER = '<script>(function(w,d){var s=d.currentScript,h=s&&s.previousElementSibling,g=d.querySelector("#library .guide-lib .guide-grid"),c=g&&g.querySelector(".guide-close"),q=h&&h.querySelector(".guide-grid");if(!s||!h||h.getAttribute("data-pp5")!=="guide-older"||!g||!c||c.parentNode!==g||!q)return;w.pp5w&&w.pp5w(s);while(q.firstChild)g.insertBefore(q.firstChild,c);h.remove();s.remove()})(window,document)</script>';

export function guidePlan(n, chunk, keep) {
  const k = Math.max(0, Math.floor((n - keep) / chunk));
  const older = Array.from({ length: k }, (_, i) => `${GUIDE_BASE}.older-${k - i}.html`);
  const next = `${GUIDE_BASE}.older-${k + 1}.html`;
  const after = `${GUIDE_BASE}.2.html`, before = older[0] || `${GUIDE_BASE}.schema.html`;
  const inPosts = (k + 1) * chunk + keep - n;
  return { cards: n, chunkSize: chunk, minimumNewest: keep, newestCards: n - k * chunk,
    templateOrder: [`${GUIDE_BASE}.1.html`, after, ...older, `${GUIDE_BASE}.schema.html`],
    nextElement: { inPosts, file: next, after, before },
    warning: `In ${inPosts} posts a new Custom Code element is needed between ${after} and ${before}: add ${next} to the unpublished template draft before publishing all changed blocks together.` };
}

export function splitGuide(second, chunk, keep) {
  const cards = guideCards(second), plan = guidePlan(cards.length, chunk, keep), k = plan.templateOrder.length - 3;
  const close = second.indexOf('<div class="guide-close">');
  if (!cards.length || close < cards.at(-1).end || second.slice(cards.at(-1).end, close).trim()) throw new Error('Yard Guide closing card changed; inspect the split before pasting.');
  for (let i = 1; i < cards.length; i++) if (cards[i - 1].end !== cards[i].start) throw new Error('Yard Guide cards are not contiguous; inspect the split before pasting.');
  const older = [];
  for (let j = k; j >= 1; j--) {
    const group = cards.slice(cards.length - j * chunk, cards.length - (j - 1) * chunk);
    const holder = '<div data-pp5="guide-older" class="wrap"><div class="guide-lib"><div class="guide-grid">' + group.map(c => c.html).join('') + '</div></div></div>';
    older.push([`${GUIDE_BASE}.older-${j}.html`, holder + GUIDE_JOINER]);
  }
  const newest = k ? second.slice(0, cards[plan.newestCards].start) + second.slice(cards.at(-1).end) : second;
  return { newest, older, plan };
}

// Static reassembly for the existing checker (the separate proof EXECUTES the joiners).
export function rejoinGuide(second, olderTexts) {
  const at = second.indexOf('<div class="guide-close">');
  if (at < 0) throw new Error('Yard Guide closing card missing; rebuild before pasting.');
  return second.slice(0, at) + olderTexts.flatMap(t => guideCards(t).map(c => c.html)).join('') + second.slice(at);
}
