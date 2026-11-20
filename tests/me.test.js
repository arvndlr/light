// Me: values vs your days, strengths and personality scoring, your good-day formula, identities.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { replaceState, DEFAULTS, S, migrate } from '../js/store.js';
import {
  me, valuesCheck, STRENGTH_QS, scoreStrengths, topStrengths, TRAIT_QS, scoreTraits, goodDayFormula,
  identitySentence, ID_TEMPLATES, identityProgress, voteOn,
} from '../js/me.js';
import { today, addDays } from '../js/util.js';

const T = today();
beforeEach(() => { const s = DEFAULTS(); s.profile = { name: 'Arvin', goals: [], created: T }; replaceState(s); });

test('strengths: 20 statements score 10 strengths; top 3 and a growth edge', () => {
  assert.equal(STRENGTH_QS.length, 20);
  const ans = STRENGTH_QS.map((q) => (q.id === 'humor' ? 5 : q.id === 'curiosity' ? 4 : q.id === 'focus' ? 1 : 3));
  me().strengths = scoreStrengths(ans);
  assert.equal(me().strengths.humor, 5);
  const t = topStrengths(3);
  assert.deepEqual(t.top.slice(0, 2), ['humor', 'curiosity']);
  assert.equal(t.edge, 'focus');
});

test('personality: reversed statements count the other way', () => {
  assert.equal(TRAIT_QS.length, 10);
  const ans = TRAIT_QS.map((q) => (q.id === 'extra' ? (q.rev ? 1 : 5) : 3));
  const tr = scoreTraits(ans);
  assert.equal(tr.extra, 100);
  assert.equal(tr.open, 50);
});

test('values are checked against your real days', () => {
  me().values = ['family', 'freedom', 'kindness'];
  // 5 evenings, 4 clean; family time 10 min/day
  for (let i = 0; i < 5; i++) S.days[addDays(T, -i)] = { evening: { mood: 3, soda: i === 0 } };
  S.schedule = [{ id: 'f', cat: 'family', start: '20:00', end: '20:10', rep: [0, 1, 2, 3, 4, 5, 6], from: addDays(T, -10) }];
  replaceState(S);
  const v = valuesCheck();
  assert.deepEqual(v.map((x) => x.id), ['family', 'freedom', 'kindness']);
  assert.equal(v[0].r.lvl, 0); // says family matters, 10 min a day
  assert.equal(v[2].r, null);  // kindness can't be measured
  assert.equal(v[2].measurable, false);
  assert.equal(v[1].r.t, '4 of 5 days free of bad habits');
});

test('good-day formula finds what lifts your mood', () => {
  assert.equal(goodDayFormula().need, 5);
  for (let i = 0; i < 10; i++) {
    const ex = i % 2 === 0;
    S.days[addDays(T, -i)] = { exercise: ex ? 30 : 0, morning: { mood: ex ? 5 : 3 }, evening: { mood: ex ? 5 : 3 } };
  }
  replaceState(S);
  const f = goodDayFormula();
  assert.equal(f.days, 10);
  assert.equal(f.lifts[0].id, 'exercise');
  assert.equal(f.lifts[0].lift, 2);
});

test('identity sentence and votes for who you are becoming', () => {
  assert.equal(identitySentence('Arvin'), null);
  me().values = ['family', 'growth'];
  me().strengths = { humor: 5, curiosity: 4, kindness: 4, focus: 1 };
  assert.equal(identitySentence('Arvin'), 'Arvin — funny, curious and kind. You live for family and growth.');
  const dev = { ...ID_TEMPLATES.find((x) => x.k === 'dev'), created: addDays(T, -40) };
  S.schedule = [{ id: 'l', cat: 'learn', start: '19:00', end: '20:00', rep: [0, 1, 2, 3, 4, 5, 6], from: addDays(T, -40) }];
  replaceState(S);
  assert.equal(voteOn(dev, T), 60);
  const p = identityProgress(dev);
  assert.equal(p.streak, 41);
  assert.equal(p.yr, 365);
  assert.equal(p.lvl1[0], 100);
  assert.equal(p.dots.filter(Boolean).length, 14);
  const rich = ID_TEMPLATES.find((x) => x.k === 'rich');
  S.tx = [{ id: 'a', date: T, type: 'save', amount: 300, cat: 'savings' }, { id: 'b', date: T, type: 'pay', amount: 200, cat: 'pay' }];
  replaceState(S);
  assert.equal(voteOn(rich, T), 500);
});

test('older data gets an empty Me section', () => {
  assert.deepEqual(migrate({}).me, {});
  replaceState(migrate({}));
  assert.deepEqual(me().values, []);
  assert.deepEqual(me().letters, []);
});
