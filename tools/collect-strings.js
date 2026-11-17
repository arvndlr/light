// Dev tool: walks every screen/modal of the running app and collects the visible
// interface text (minus content), to build the translation dictionary.
// Usage (browser console on the app): const r = await import('/tools/collect-strings.js?x').then(m => m.collect());
import C from '../js/content.js';
import { EXERCISES, WORKOUTS } from '../js/fitness.js';
import * as H from '../js/health.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const click = async (s, ms = 120) => { const e = typeof s === 'string' ? $(s) : s; if (e) { e.click(); await wait(ms); } return !!e; };

function contentSet() {
  const out = new Set();
  const add = (v) => { if (typeof v === 'string') out.add(v.trim()); else if (Array.isArray(v)) v.forEach(add); else if (v && typeof v === 'object') Object.values(v).forEach(add); };
  add(C); add(EXERCISES); add(WORKOUTS.map((w) => [w.desc, w.focus])); add(Object.values(H));
  return out;
}

export async function collect() {
  const content = contentSet();
  const found = new Map(); // normalized -> example
  const grab = () => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      const vals = [];
      if (n.nodeType === 3) { if (!n.parentElement.closest('script,style,svg,textarea,[data-i18n-skip]')) vals.push(n.nodeValue); }
      else for (const a of ['placeholder', 'aria-label', 'title']) if (n.getAttribute?.(a)) vals.push(n.getAttribute(a));
      for (let v of vals) {
        v = v.trim();
        if (!v || !/[A-Za-z]{2}/.test(v) || content.has(v) || v.length > 140) continue;
        if ([...content].some((c) => c.length > 30 && (c.includes(v) && v.length > 30))) continue;
        const key = v.replace(/\d+([.,]\d+)?/g, '#');
        if (!found.has(key)) found.set(key, v);
      }
    }
  };
  const tabs = ['today', 'money', 'stats', 'feed'];
  for (const t of tabs) { await click(`[data-tab="${t}"]`, 600); grab(); }
  await click('[data-tab="grow"]', 300);
  for (const g of ['fitness', 'health', 'comedy', 'eq', 'glow', 'freedom', 'journal', 'badges']) { await click(`.gt[data-v="${g}"]`, 250); grab(); }
  await click('[data-act="fit-group"][data-v="Core"]', 200); grab();
  // Today modals
  await click('[data-tab="today"]', 400);
  const modal = async (sel, steps = []) => { if (!(await click(sel, 300))) return; grab(); for (const s of steps) { await click(s, 200); grab(); } await click('.sheet [data-act="modal-close"], .sheet [data-act="wiz-close"]', 200); };
  await modal('[data-act="settings"]');
  for (const w of ['open-morning', 'open-evening', 'open-weekly']) {
    if (!(await click(`[data-act="${w}"]`, 300))) continue;
    for (let i = 0; i < 14; i++) { grab(); if (!(await click('[data-act="wiz-next"]', 150))) break; }
    grab(); await click('[data-act="wiz-done"]', 300);
  }
  await modal('[data-act="focus"]');
  await modal('[data-act="log-exercise"]');
  await modal('[data-act="sos"]', ['[data-act="sos-type"][data-v="social"]']);
  await click('[data-act="sos-won"]', 300);
  // Workout player + breathing
  await click('[data-tab="grow"]', 300); await click('.gt[data-v="fitness"]', 300);
  if (await click('.routine[data-w="full"]', 400)) { grab(); await click('[data-act="wp-skip"]', 200); grab(); await click('[data-act="wp-skip"]', 200); grab(); await click('[data-act="wp-pause"]', 200); grab(); await click('[data-act="wp-end"]', 300); }
  await click('.gt[data-v="health"]', 300);
  if (await click('[data-act="breathe-start"]', 500)) { grab(); await click('.sheet [data-act="modal-close"]', 200); }
  // Feed modals
  await click('[data-tab="feed"]', 600);
  await modal('.reel [data-act="feed-more"]');
  await modal('.reel [data-act="reflect"]');
  await click('[data-act="feed-mode"][data-v="saved"]', 500); grab();
  if (await click('.reel [data-act="read-story"]', 400)) { grab(); await click('.sheet [data-act="modal-close"]', 200); }
  await click('[data-act="feed-topic"][data-v="all"]', 200);
  await click('[data-act="feed-mode"][data-v="foryou"]', 400);
  await click('[data-tab="today"]', 300);
  return [...found.values()].sort();
}
