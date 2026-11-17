// Pure, dependency-free helpers shared by every module.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape any user-provided text before it goes into HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const pad = (n) => String(n).padStart(2, '0');
export const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);

/** The app's "day" rolls over at 3 AM, so a late-night evening check-in still counts for that day. */
export const DAY_ROLLOVER_HOURS = 3;
export const today = (now = Date.now()) => dkey(new Date(now - DAY_ROLLOVER_HOURS * 3600e3));
/** Monday of the week containing day key k. */
export const weekStart = (k) => { const dow = (parseKey(k).getDay() + 6) % 7; return addDays(k, -dow); };

export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const avg = (a) => (a.length ? sum(a) / a.length : 0);
export const round1 = (n) => Math.round(n * 10) / 10;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const hour = () => new Date().getHours();
export const lastN = (n, end = today()) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
let LOCALE; // set by the language switch (e.g. 'fil-PH')
export const setLocale = (l) => { LOCALE = l; };
export const getLocale = () => LOCALE;
export const fmtDate = (k, o = { weekday: 'short', month: 'short', day: 'numeric' }) => parseKey(k).toLocaleDateString(LOCALE, o);

/** Deterministic pick that changes once per day (same card all day, new card tomorrow). */
export const dayNum = (k = today()) => Math.floor(parseKey(k).getTime() / 864e5);
export const daily = (arr, off = 0, k = today()) => arr[(((dayNum(k) + off) % arr.length) + arr.length) % arr.length];

/** Least-squares slope of y over index; nulls are skipped. */
export function slope(ys) {
  const pts = ys.map((y, x) => [x, y]).filter((p) => p[1] != null);
  if (pts.length < 2) return 0;
  const mx = avg(pts.map((p) => p[0])), my = avg(pts.map((p) => p[1]));
  const num = sum(pts.map(([x, y]) => (x - mx) * (y - my)));
  const den = sum(pts.map(([x]) => (x - mx) ** 2));
  return den ? num / den : 0;
}

export const minutesOf = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const hhmm = (mins) => { const m = ((mins % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
