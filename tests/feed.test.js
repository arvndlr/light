import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEED_BASE, pickKind, nudge, dwellSignal, splitJoke, weightFor, topKinds, PREF_MAX, pickIndex, pruneSeen } from '../js/feed.js';

// Deterministic PRNG for distribution tests.
const prng = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const histogram = (prefs, n = 20000) => {
  const r = prng(7), h = {};
  for (let i = 0; i < n; i++) { const k = pickKind(prefs, r); h[k] = (h[k] || 0) + 1; }
  return h;
};

test('every kind can appear with neutral preferences', () => {
  const h = histogram({});
  for (const k of Object.keys(FEED_BASE)) assert.ok(h[k] > 0, k);
});
test('liked kinds show up much more often', () => {
  const base = histogram({}).quiz;
  const boosted = histogram({ quiz: 12 }).quiz;
  assert.ok(boosted > base * 3, `${boosted} vs ${base}`);
});
test('disliked kinds still appear thanks to exploration', () => {
  const h = histogram({ breathe: -10 });
  assert.ok(h.breathe > 0);
});
test('never repeats the same kind back-to-back', () => {
  const r = prng(3);
  for (let i = 0; i < 2000; i++) assert.notEqual(pickKind({ joke: 15 }, r, 'joke'), 'joke');
});
test('nudge clamps and ignores unknown kinds', () => {
  const p = {};
  for (let i = 0; i < 20; i++) nudge(p, 'joke', 3);
  assert.equal(p.joke, PREF_MAX);
  nudge(p, 'nope', 5);
  assert.equal(p.nope, undefined);
  assert.ok(weightFor('joke', p) > weightFor('joke', {}));
});
test('dwell time maps to signals', () => {
  assert.ok(dwellSignal(500) < 0);
  assert.equal(dwellSignal(2000), 0);
  assert.ok(dwellSignal(15000) > dwellSignal(6000));
});
test('jokes split into setup and punchline', () => {
  assert.deepEqual(splitJoke("I'm reading a book on anti-gravity. Impossible to put down."), ["I'm reading a book on anti-gravity.", 'Impossible to put down.']);
  assert.equal(splitJoke('I have a joke about procrastination, but I\'ll tell it later.'), null);
});
test('pickIndex never repeats until the whole pool has been seen', () => {
  const seen = {}, r = prng(11), n = 25;
  const got = new Set();
  for (let t = 1; t <= n; t++) { const i = pickIndex(n, 'joke', seen, r); assert.ok(!got.has(i), `repeat at ${t}`); got.add(i); seen[`joke:${i}`] = t; }
  assert.equal(got.size, n);
  // Pool exhausted: the least-recently-seen item comes back first.
  const first = [...got][0];
  assert.equal(pickIndex(n, 'joke', seen, r), first);
});
test('pruneSeen keeps the newest entries', () => {
  const seen = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`a:${i}`, i]));
  const p = pruneSeen(seen, 3);
  assert.deepEqual(Object.keys(p).sort(), ['a:7', 'a:8', 'a:9']);
});
test('topKinds lists positive preferences in order', () => {
  assert.deepEqual(topKinds({ joke: 5, quiz: 9, eq: -2 }), ['quiz', 'joke']);
});
