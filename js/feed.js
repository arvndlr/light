// "For You" feed algorithm — pure functions, no DOM, unit-tested.
// Each card kind has a base weight; your behavior (likes, saves, shares, how long
// you stay on a card, quick skips) nudges a per-kind preference score that scales it.
import { clamp } from './util.js';

export const FEED_BASE = {
  wisdom: 3, challenge: 3, eq: 2, joke: 3, comedy: 2, glow: 2, avoid: 1.5, money: 1.5,
  prompt: 1, quiz: 2.5, poll: 1.5, breathe: 0.8, you: 1, fact: 2.5, word: 1.5, story: 2.5,
  tech: 2.5, techquiz: 1.5,
};
export const PREF_MIN = -10, PREF_MAX = 15;
/** Share of picks that ignore preferences, so the feed keeps surprising you instead of collapsing into one kind. */
export const EXPLORE = 0.15;

export const weightFor = (kind, prefs = {}) => FEED_BASE[kind] * Math.exp(clamp(prefs[kind] || 0, PREF_MIN, PREF_MAX) / 6);

/** Topic filters shown above the feed: [id, label, kinds (null = everything), icon]. */
export const TOPICS = [
  ['all', 'All', null, 'sparkles'],
  ['stories', 'Stories', ['story'], 'bookOpen'],
  ['laugh', 'Laugh', ['joke', 'comedy'], 'smile'],
  ['wisdom', 'Wisdom', ['wisdom'], 'sparkle'],
  ['learn', 'Learn', ['fact', 'word', 'quiz'], 'bulb'],
  ['tech', 'Tech', ['tech', 'techquiz'], 'cpu'],
  ['mind', 'Mind', ['eq', 'prompt', 'breathe', 'poll'], 'heart'],
  ['body', 'Glow-up', ['glow', 'avoid', 'challenge'], 'flame'],
  ['money', 'Money', ['money'], 'coin'],
];
export const topicKinds = (id) => TOPICS.find((t) => t[0] === id)?.[2] || null;

/** Weighted random pick of the next card kind, optionally limited to `allowed`; never repeats `last` back-to-back (unless it's the only option). */
export function pickKind(prefs = {}, rand = Math.random, last = null, allowed = null) {
  const pool = (allowed || Object.keys(FEED_BASE)).filter((k) => k in FEED_BASE);
  const kinds = pool.length > 1 ? pool.filter((k) => k !== last) : pool;
  if (rand() < EXPLORE) return kinds[Math.floor(rand() * kinds.length)];
  const ws = kinds.map((k) => weightFor(k, prefs));
  let r = rand() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kinds.length; i++) { r -= ws[i]; if (r <= 0) return kinds[i]; }
  return kinds[kinds.length - 1];
}

/** Engagement signals → preference deltas. */
export const SIGNAL = { like: 3, unlike: -3, save: 4, share: 3, reflect: 4, claim: 3, answer: 1, read: 4 };
export function nudge(prefs, kind, delta) {
  if (!(kind in FEED_BASE) || !delta) return prefs;
  prefs[kind] = clamp((prefs[kind] || 0) + delta, PREF_MIN, PREF_MAX);
  return prefs;
}
/** Time spent on a card is the strongest implicit signal (like watch-time on video apps). */
export const dwellSignal = (ms) => (ms < 1200 ? -0.5 : ms < 4000 ? 0 : ms < 10000 ? 0.7 : 1.2);

/** Split a joke into setup + punchline at its last sentence break, or null if it's a one-liner. */
export function splitJoke(text) {
  const breaks = [...String(text).matchAll(/[.?!]\s+/g)];
  if (!breaks.length) return null;
  const last = breaks[breaks.length - 1];
  const cut = last.index + last[0].length;
  const a = text.slice(0, cut).trim(), b = text.slice(cut).trim();
  return a.length >= 6 && b.length >= 6 ? [a, b] : null;
}

/**
 * Choose which item of a pool to show. `seen` maps "kind:index" -> last-shown timestamp and is
 * saved across sessions, so you only see a repeat after every item of that kind has been shown —
 * and then the one you saw longest ago comes back first.
 */
export function pickIndex(n, kind, seen = {}, rand = Math.random) {
  const unseen = [];
  let oldest = 0, oldestT = Infinity;
  for (let i = 0; i < n; i++) {
    const t = seen[`${kind}:${i}`];
    if (t == null) unseen.push(i);
    else if (t < oldestT) { oldestT = t; oldest = i; }
  }
  return unseen.length ? unseen[Math.floor(rand() * unseen.length)] : oldest;
}
/** Keep the seen-map bounded (newest entries win). */
export function pruneSeen(seen, max = 2000) {
  const e = Object.entries(seen);
  if (e.length <= max) return seen;
  return Object.fromEntries(e.sort((a, b) => b[1] - a[1]).slice(0, max));
}

/** Top kinds by preference, for showing "what Light thinks you like". */
export const topKinds = (prefs = {}, n = 3) => Object.entries(prefs).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
