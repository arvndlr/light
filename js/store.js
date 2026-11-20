// Persistence layer: one versioned JSON document in localStorage, with schema
// migrations and a once-a-day automatic snapshot for recovery.
import { today } from './util.js';

export const KEY = 'light.v1';
export const BACKUP_KEY = 'light.autobackup';
export const SCHEMA = 2;

export const DEFAULTS = () => ({
  v: SCHEMA,
  profile: null, // { name, goals: [{ t, p }], why, created }
  settings: {
    currency: '₱', waterTarget: 8, sleepTarget: 8, bedTime: '22:30', wakeTime: '06:30', budget: 15000,
    socialLimit: 15, weightUnit: 'kg', savingsGoal: 0, savingsName: 'Emergency fund', haptics: true,
    theme: 'dark', accent: 'sunrise', // theme: 'auto' | 'dark' | 'light'
    feedHint: true, // show "swipe up" hint until the first swipe
    fitLevel: 'beginner', fitVoice: true, // home workouts
    moneyStart: null, // cash you had before your first record (set via "Update balance"); null = not set yet
    lang: 'en', // interface language: 'en' | 'tl' (Taglish)
    asthma: false, // asthma tracking & reminders (Grow → Health)
    hygAM: ['Brush teeth', 'Wash face', 'Shower', 'Sunscreen', 'Deodorant', 'Groom hair'],
    hygPM: ['Wash face', 'Brush teeth', 'Floss', 'Moisturize', 'Lay out tomorrow\'s clothes', 'Screens off 30 min before bed'],
  },
  days: {},     // 'YYYY-MM-DD' -> { water, exercise, deepWork, hygAM, hygPM, morning, evening }
  tx: [],       // { id, date, type: 'out'|'in'|'save'|'pay'|'collect'|'borrow'|'lend', amount, cat, note, loanId? }
  loans: [],    // { id, dir: 'owe'|'owed', who, total?, due?, note, created }: amounts come from its tx records
  jokes: [], journal: [], saved: [], sos: [], focusLog: [],
  workouts: [], // { id, date, mins, level, partial? }
  schedule: [], // time blocks { id, cat, title, start, end, note, date (one-off) | rep: [weekdays], from, skip: [dates] }
  badges: {}, claims: {}, reviews: {}, chests: {},
  feedPrefs: {}, // card kind -> learned preference score (see feed.js)
  feedLikes: {}, // card id -> date liked
  quiz: {},      // quiz card id -> answered correctly (first try)
  feedSeen: {},  // card id -> last shown (ms); prevents repeats across sessions
  storiesRead: {}, // story card id -> date finished
  timer: null,  // running focus session { start, dur, label }
});

const OBJECT_KEYS = ['days', 'badges', 'claims', 'reviews', 'chests', 'feedPrefs', 'feedLikes', 'quiz', 'feedSeen', 'storiesRead'];
const ARRAY_KEYS = ['tx', 'loans', 'jokes', 'journal', 'saved', 'sos', 'focusLog', 'workouts', 'schedule'];
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/** Upgrade any older (or partially corrupt) document to the current schema. Never throws. */
export function migrate(raw) {
  const d = DEFAULTS();
  if (!isObj(raw)) return d;
  const s = { ...d, ...raw, settings: { ...d.settings, ...(isObj(raw.settings) ? raw.settings : {}) } };
  for (const k of OBJECT_KEYS) if (!isObj(s[k])) s[k] = {};
  for (const k of ARRAY_KEYS) if (!Array.isArray(s[k])) s[k] = [];
  // v1 -> v2: goals were plain strings; now { t: text, p: progress 0-100 }.
  if (s.profile) {
    s.profile.goals = (Array.isArray(s.profile.goals) ? s.profile.goals : [])
      .map((g) => (typeof g === 'string' ? { t: g, p: 0 } : isObj(g) ? { t: String(g.t || ''), p: Number(g.p) || 0 } : null))
      .filter(Boolean);
    while (s.profile.goals.length < 3) s.profile.goals.push({ t: '', p: 0 });
  }
  for (const l of ['hygAM', 'hygPM']) if (!Array.isArray(s.settings[l]) || !s.settings[l].length) s.settings[l] = d.settings[l];
  s.tx = s.tx.filter((t) => isObj(t) && t.date && Number(t.amount) > 0);
  s.v = SCHEMA;
  return s;
}

const storage = (() => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } })();
const readJSON = (key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };

function load() {
  if (!storage) return DEFAULTS();
  const raw = readJSON(KEY);
  if (raw) return migrate(raw);
  // Main document missing or unreadable: fall back to the last daily snapshot.
  const b = readJSON(BACKUP_KEY);
  return b?.data ? migrate(b.data) : DEFAULTS();
}

/** Current state. `let` export = live binding, so importers always see replacements. */
export let S = load();
/** Bumped on every write; lets other modules cache derived data safely. */
export let version = 0;

export function save() {
  version++;
  if (!storage) return true;
  try { storage.setItem(KEY, JSON.stringify(S)); return true; } catch { return false; }
}

/** Keep one snapshot per day of the state as it was when the app was first opened that day. */
export function snapshotDaily() {
  if (!storage || !S.profile) return;
  const b = readJSON(BACKUP_KEY);
  if (b?.date === today()) return;
  try { storage.setItem(BACKUP_KEY, JSON.stringify({ date: today(), data: S })); } catch { /* storage full: skip */ }
}
export const backupInfo = () => (storage ? readJSON(BACKUP_KEY) : null);

export function replaceState(next) { S = migrate(next); return save(); }
export function resetState() { S = DEFAULTS(); if (storage) { storage.removeItem(KEY); } version++; }

export function day(k = today()) {
  if (!S.days[k]) S.days[k] = { water: 0, exercise: 0, deepWork: 0, hygAM: {}, hygPM: {}, morning: null, evening: null };
  const d = S.days[k];
  d.hygAM ||= {}; d.hygPM ||= {};
  return d;
}
