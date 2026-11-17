import test from 'node:test';
import assert from 'node:assert/strict';
import TL from '../js/i18n-tl.js';

// Minimal DOM stub so setLang can run under Node.
globalThis.document = { documentElement: {}, body: null };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const { setLang, tr, locale } = await import('../js/i18n.js');

test('English is a pass-through', () => {
  setLang('en');
  assert.equal(tr('Today'), 'Today');
  assert.equal(locale(), undefined);
});

test('Taglish: exact phrases, emoji edges and whitespace are kept', () => {
  setLang('tl');
  assert.equal(locale(), 'fil-PH');
  assert.equal(tr('Money'), 'Pera');
  assert.equal(tr('  Save  '), '  I-save  ');
  assert.equal(tr('Begin my journey ✨'), 'Simulan ang journey ko ✨');
  assert.equal(tr('🎨 Appearance'), '🎨 Itsura');
});

test('Taglish: patterns with names and numbers', () => {
  setLang('tl');
  assert.equal(tr('Good morning, Arvin'), 'Magandang umaga, Arvin');
  assert.equal(tr('3 of 8 glasses'), '3 sa 8 baso');
  assert.equal(tr('Level 4'), 'Level 4');
  assert.equal(tr('Squat demonstration'), 'Demo ng Squat');
  assert.equal(tr('Workout: Morning'), 'Workout: Umaga');
});

test('Taglish: dot-separated parts translate separately', () => {
  setLang('tl');
  assert.equal(tr('Water · 20 min'), 'Tubig · 20 min');
});

test('Unknown text and user data stay unchanged', () => {
  setLang('tl');
  assert.equal(tr('My secret plan for 2027'), 'My secret plan for 2027');
  assert.equal(tr('123'), '123');
  setLang('en');
});

test('dictionary and patterns are well-formed', () => {
  for (const [k, v] of Object.entries(TL.dict)) { assert.equal(typeof v, 'string', k); assert.ok(v.length, k); }
  for (const [re, rep] of TL.patterns) {
    assert.ok(re instanceof RegExp && !re.global, String(re));
    assert.ok(typeof rep === 'string' || typeof rep === 'function');
  }
});

test('Taglish output is never translated twice', () => {
  setLang('tl');
  const once = tr('e.g. 30-min workout');
  assert.equal(tr(once), once);
  setLang('en');
});

test('Taglish: generated insights keep their HTML', () => {
  setLang('tl');
  assert.equal(tr('📅 Your hardest day is <strong>Monday</strong> — most slips happen then. Plan something healthy for that day in advance.'),
    '📅 Pinakamahirap na araw mo ang <strong>Lunes</strong> — dito madalas ang slips. Magplano ng healthy na gawain para sa araw na iyon.');
  assert.equal(tr('13 min · Legs · glutes'), '13 min · Binti · pwet');
  setLang('en');
});
