// Light — interface translation (English → Taglish).
// Screens are written in English; when Tagalog is on, this layer translates the
// rendered DOM: exact phrases (DICT) and phrases with numbers/names (PATTERNS).
// A MutationObserver catches anything rendered later (toasts, modals, feed cards).
// Untranslated text simply stays English, so content can be translated in batches.
import TL from './i18n-tl.js';

export const LANGS = [['en', 'English'], ['tl', 'Tagalog (Taglish)']];
let lang = 'en';
let observer = null;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'svg', 'SVG']); // text inside is left alone (labels/placeholders still translate)
const ATTRS = ['placeholder', 'aria-label', 'title'];

export const getLang = () => lang;
/** BCP-47 locale for dates/times. */
export const locale = () => (lang === 'tl' ? 'fil-PH' : undefined);

// Leading/trailing emoji, bullets and arrows are kept as-is and the words between them translated.
const EDGE = /^([\s\p{Extended_Pictographic}️‍•→↩️]*)([\s\S]*?)([\s\p{Extended_Pictographic}️‍✓]*)$/u;
function trCore(core) {
  const hit = TL.dict[core];
  if (hit != null) return hit;
  for (const [re, rep] of TL.patterns) {
    const m = re.exec(core);
    if (m) return typeof rep === 'function' ? rep(tr, ...m.slice(1)) : core.replace(re, rep);
  }
  if (core.includes(' · ')) { // translate each part of "A · B · C" separately
    const parts = core.split(' · ');
    const out = parts.map((p) => tr(p));
    if (out.some((p, i) => p !== parts[i])) return out.join(' · ');
  }
  return null;
}
/** Translate one string (keeps surrounding whitespace and emoji). Returns it unchanged if unknown. */
const DONE = new Set(); // strings we produced — never translate them twice (e.g. "… na workout")
export function tr(s) {
  if (lang === 'en' || s == null || DONE.has(s)) return s;
  const m = EDGE.exec(s);
  const core = m[2];
  if (!core || !/[A-Za-z]/.test(core) || DONE.has(core)) return s;
  const t = trCore(core);
  if (t == null) return s;
  const out = m[1] + t + m[3];
  if (DONE.size > 5000) DONE.clear();
  DONE.add(out); DONE.add(t);
  return out;
}

function attrs(el) {
  for (const a of ATTRS) { const o = el.getAttribute?.(a); if (o) { const v = tr(o); if (v !== o) el.setAttribute(a, v); } }
}

/** Translate every text node and UI attribute under `root`. */
export function translateTree(root) {
  if (lang === 'en' || !root) return;
  if (root.nodeType === 3) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; return; }
  if (root.nodeType !== 1 || root.closest?.('[data-i18n-skip]')) return;
  attrs(root);
  if (SKIP.has(root.nodeName)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
      if (n.hasAttribute('data-i18n-skip')) return NodeFilter.FILTER_REJECT;
      if (SKIP.has(n.nodeName)) { attrs(n); return NodeFilter.FILTER_REJECT; }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 3) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    else attrs(n);
  }
}

/** Set the language and (for Tagalog) start translating the page live. */
export function setLang(l) {
  lang = l === 'tl' ? 'tl' : 'en';
  document.documentElement.lang = lang === 'tl' ? 'fil' : 'en';
  observer?.disconnect();
  if (lang === 'en') return;
  translateTree(document.body);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateTree(m.target);
      else if (m.type === 'attributes') translateTree(m.target);
      else for (const n of m.addedNodes) translateTree(n);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
