// Unit tests for Light's domain logic. Run: npm test  (or: node --test tests/)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { replaceState, migrate, DEFAULTS, SCHEMA, S, day } from '../js/store.js';
import {
  scores, slipsOn, habitStreak, checkinStreak, computeXP, levelOf, xpFor, quests, awardBadges, projection,
  insights, weekSummary, buildICS, rollChest, chestReady, sleepHours, heatmapKeys, reviewDue, savedTotal,
} from '../js/core.js';
import { today, addDays, weekStart, slope, esc, daysBetween, parseKey, lastN } from '../js/util.js';

const T = today();
const fresh = (extra = {}) => {
  const s = DEFAULTS();
  s.profile = { name: 'Test', goals: [{ t: 'Goal A', p: 0 }, { t: '', p: 0 }, { t: '', p: 0 }], why: 'why', created: addDays(T, -9) };
  replaceState({ ...s, ...extra });
};
const perfectDay = () => ({
  water: 8, exercise: 30, deepWork: 120,
  hygAM: Object.fromEntries(DEFAULTS().settings.hygAM.map((x) => [x, true])),
  hygPM: Object.fromEntries(DEFAULTS().settings.hygPM.map((x) => [x, true])),
  morning: { bed: '22:30', wake: '06:30', sleepQ: 5, mood: 5, energy: 5, gratitude: 'x', goalAction: 'y', priorities: [{ t: 'a', done: true }] },
  evening: { socialMin: 0, fastFood: false, soda: false, gambled: false, mood: 5, stress: 1, emotion: 'Joy', eq: 'z', funny: 'lol' },
});

beforeEach(() => fresh());

// ---------- util ----------
test('date helpers handle month/year boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // Sunday -> Monday
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  assert.equal(lastN(3, '2026-01-02').join(), '2025-12-31,2026-01-01,2026-01-02');
});
test('day rolls over at 3 AM', () => {
  assert.equal(today(new Date(2026, 10, 17, 2, 59).getTime()), '2026-11-16');
  assert.equal(today(new Date(2026, 10, 17, 3, 0).getTime()), '2026-11-17');
});
test('esc neutralizes HTML', () => {
  assert.equal(esc('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(esc(null), '');
});
test('slope fits a line and ignores nulls', () => {
  assert.equal(slope([1, 2, 3, 4]), 1);
  assert.equal(slope([5, null, 5, 5]), 0);
  assert.equal(slope([7]), 0);
});

// ---------- store ----------
test('migrate upgrades v1 string goals and repairs corrupt fields', () => {
  const m = migrate({ v: 1, profile: { name: 'A', goals: ['One', 'Two'] }, days: null, tx: [{ date: T, amount: 0 }, { date: T, amount: 5 }], settings: { hygAM: [] } });
  assert.equal(m.v, SCHEMA);
  assert.deepEqual(m.profile.goals, [{ t: 'One', p: 0 }, { t: 'Two', p: 0 }, { t: '', p: 0 }]);
  assert.deepEqual(m.days, {});
  assert.equal(m.tx.length, 1, 'zero-amount transactions are dropped');
  assert.ok(m.settings.hygAM.length > 0, 'empty routine falls back to defaults');
  assert.deepEqual(m.reviews, {});
});
test('migrate never throws on garbage', () => {
  for (const g of [null, 42, 'x', [], { settings: 'nope' }]) assert.equal(migrate(g).v, SCHEMA);
});

// ---------- scoring ----------
test('no check-in means no score', () => {
  day(T).water = 5;
  assert.equal(scores(T), null);
});
test('a perfect day scores 100 everywhere', () => {
  S.days[T] = perfectDay();
  const s = scores(T);
  for (const k of ['health', 'physical', 'mental', 'career', 'money', 'eq', 'overall']) assert.equal(s[k], 100, k);
});
test('scores stay within 0..100 on extreme input', () => {
  S.days[T] = perfectDay();
  Object.assign(S.days[T].evening, { socialMin: 9999, fastFood: true, soda: true, gambled: true, mood: 1, stress: 5 });
  S.days[T].water = 999; S.days[T].deepWork = 99999;
  S.tx.push({ id: '1', date: T, type: 'out', amount: 1e9, cat: 'food' });
  const s = scores(T);
  for (const v of Object.values(s)) assert.ok(v >= 0 && v <= 100);
  assert.equal(s.money, 20);
});
test('memoized scores refresh after a save', () => {
  S.days[T] = perfectDay();
  assert.equal(scores(T).physical, 100);
  S.days[T].exercise = 0;
  replaceState(S); // save() bumps the version
  assert.equal(scores(T).physical, 60);
});
test('sleep hours wrap past midnight', () => {
  assert.equal(sleepHours({ bed: '23:30', wake: '07:00' }), 7.5);
  assert.equal(sleepHours({ bed: '01:00', wake: '06:30' }), 5.5);
  assert.equal(sleepHours(null), null);
});

// ---------- habits ----------
test('slips come from evening answers, money log and urge log', () => {
  day(T).evening = { socialMin: 60, fastFood: false, soda: false, gambled: false };
  S.tx.push({ id: 'a', date: T, type: 'out', amount: 10, cat: 'soda' });
  S.sos.push({ date: T, type: 'gambling', result: 'slip' });
  S.sos.push({ date: T, type: 'fastfood', result: 'won' });
  assert.deepEqual([...slipsOn(T)].sort(), ['gambling', 'social', 'soda']);
});
test('income in a "bad" category is not a slip', () => {
  S.tx.push({ id: 'a', date: T, type: 'in', amount: 10, cat: 'gambling' });
  assert.equal(slipsOn(T).size, 0);
});
test('habit streak counts clean days since the last slip, and the best run', () => {
  // created T-9. Slip at T-6 → clean T-9..T-7 (3 days), then T-5..T (6 days incl. today).
  day(addDays(T, -6)).evening = { soda: true };
  replaceState(S);
  const s = habitStreak('soda');
  assert.equal(s.current, 6);
  assert.equal(s.best, 6);
  assert.equal(habitStreak('gambling').current, 10);
});
test('slipping today resets the streak to 0', () => {
  day(T).evening = { gambled: true };
  replaceState(S);
  assert.equal(habitStreak('gambling').current, 0);
});
test('check-in streak tolerates today not done yet', () => {
  for (let i = 1; i <= 4; i++) day(addDays(T, -i)).morning = { mood: 3 };
  replaceState(S);
  assert.equal(checkinStreak(), 4);
  day(T).evening = { mood: 3 };
  replaceState(S);
  assert.equal(checkinStreak(), 5);
});

// ---------- XP, levels, quests, badges ----------
test('level curve: 0→1, 100→2, 300→3, 1000→5', () => {
  assert.equal(levelOf(0), 1); assert.equal(levelOf(99), 1); assert.equal(levelOf(100), 2);
  assert.equal(levelOf(300), 3); assert.equal(levelOf(1000), 5);
  for (let n = 1; n < 30; n++) assert.equal(levelOf(xpFor(n)), n);
});
test('XP is deterministic and counts every source', () => {
  assert.equal(computeXP(), 0);
  day(T).morning = { priorities: [{ t: 'x', done: true }] };
  S.jokes.push({ id: 'j', date: T, text: 'ha' });
  S.chests[T] = { xp: 33 };
  replaceState(S);
  assert.equal(computeXP(), 50 + 10 + 10 + 33);
  assert.equal(computeXP(), computeXP());
});
test('quests reflect the day', () => {
  S.days[T] = perfectDay();
  replaceState(S);
  assert.ok(quests().filter((q) => q.id !== 'joke').every((q) => q.done));
});
test('badges are awarded once', () => {
  day(T).morning = { mood: 3 };
  const first = awardBadges().map((b) => b.id);
  assert.ok(first.includes('first'));
  assert.equal(awardBadges().length, 0);
});

// ---------- rewards, reviews, projection ----------
test('chest only after both check-ins, once per day', () => {
  assert.equal(chestReady(), false);
  S.days[T] = perfectDay();
  assert.equal(chestReady(), true);
  const seq = [0.99, 0.5, 0.1]; let i = 0;
  const r = rollChest(() => seq[i++ % seq.length]);
  assert.equal(r.tier, 'legendary');
  assert.ok(r.xp >= 100 && typeof r.item === 'string');
  S.chests[T] = r;
  assert.equal(chestReady(), false);
});
test('weekly review is due on Fri–Sun until done', () => {
  const sun = '2026-11-22', wed = '2026-11-18';
  assert.equal(reviewDue(sun), true);
  assert.equal(reviewDue(wed), false);
  S.reviews[weekStart(sun)] = { at: 1 };
  assert.equal(reviewDue(sun), false);
});
test('week summary aggregates the last 7 days', () => {
  S.days[T] = perfectDay(); S.days[T].evening.win = 'Big win';
  S.tx.push({ id: 'x', date: T, type: 'out', amount: 100, cat: 'food' });
  replaceState(S);
  const w = weekSummary();
  assert.equal(w.tracked, 1); assert.equal(w.avg, 100); assert.deepEqual(w.wins, ['Big win']); assert.equal(w.spent, 100);
});
test('projection needs 3 days, then stays within bounds', () => {
  assert.deepEqual(projection(), { need: 3, have: 0 });
  for (let i = 0; i < 10; i++) {
    const d = perfectDay(); d.exercise = i * 3; d.morning.weight = 80 - i; S.days[addDays(T, -i)] = d;
  }
  replaceState(S);
  const p = projection();
  assert.equal(p.rows.length, 6);
  for (const r of p.rows) assert.ok(r.proj >= 0 && r.proj <= 100);
  assert.ok(p.facts.some(([, t]) => t.includes('Weight trend')));
});
test('insights produce at least one line', () => {
  assert.ok(insights(lastN(30)).lines.length >= 1);
});
test('savings total sums only save transactions', () => {
  S.tx.push({ id: 'a', date: T, type: 'save', amount: 500, cat: 'savings' }, { id: 'b', date: T, type: 'out', amount: 50, cat: 'food' });
  assert.equal(savedTotal(), 500);
});

// ---------- reminders & heatmap ----------
test('ICS calendar has two daily and one weekly reminder', () => {
  const ics = buildICS({ wakeTime: '06:30', bedTime: '22:30' }, '2026-11-17', 'https://example.test/light/');
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(ics, /DTSTART:20261117T064500/);
  assert.match(ics, /DTSTART:20261117T213000/);
  assert.match(ics, /DTSTART:20261122T180000/); // following Sunday
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=SU/);
  assert.ok(ics.includes('\r\n'), 'uses CRLF line endings per RFC 5545');
});
test('heatmap grid is Monday-first and ends this week', () => {
  const g = heatmapKeys(4, '2026-11-19');
  assert.equal(g.length, 4);
  assert.equal(g[3][0], '2026-11-16');
  assert.equal(parseKey(g[0][0]).getDay(), 1);
  assert.ok(g[3].includes('2026-11-19'));
});
