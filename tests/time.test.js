// Time: schedule blocks, where time goes, insights and "what you could become".
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { replaceState, migrate, DEFAULTS, S } from '../js/store.js';
import { blocksOn, blockMins, dayMinutes, timeSummary, timeInsights, timeFuture, starterSchedule, fmtHM, levelFor } from '../js/time.js';
import { today, addDays, parseKey } from '../js/util.js';

const T = today();
const state = (extra = {}) => { const s = DEFAULTS(); s.profile = { name: 'T', goals: [], created: T }; replaceState({ ...s, ...extra }); };
beforeEach(() => state());

test('block length wraps past midnight; labels read well', () => {
  assert.equal(blockMins({ start: '22:30', end: '06:30' }), 480);
  assert.equal(blockMins({ start: '09:00', end: '10:15' }), 75);
  assert.equal(fmtHM(75), '1h 15m');
  assert.equal(fmtHM(120), '2h');
  assert.equal(fmtHM(20), '20m');
});

test('repeating blocks follow weekdays, start date and skips; one-offs stay on their day', () => {
  const wd = parseKey(T).getDay();
  state({ schedule: [
    { id: 'a', cat: 'learn', start: '19:00', end: '20:00', rep: [wd], from: T },
    { id: 'b', cat: 'work', start: '09:00', end: '17:00', rep: [(wd + 1) % 7], from: T },
    { id: 'c', cat: 'family', start: '20:00', end: '21:00', date: T },
    { id: 'd', cat: 'games', start: '21:00', end: '22:00', rep: [wd], from: T, skip: [T] },
  ] });
  assert.deepEqual(blocksOn(T).map((b) => b.id), ['a', 'c']);
  assert.deepEqual(blocksOn(addDays(T, -7)).map((b) => b.id), [], 'not before it started');
  assert.deepEqual(blocksOn(addDays(T, 7)).map((b) => b.id), ['a', 'd']);
});

test('tracked data tops up the schedule without double counting', () => {
  state({ schedule: [{ id: 'x', cat: 'deep', start: '09:00', end: '10:00', date: T }],
    days: { [T]: { deepWork: 30, exercise: 25, evening: { socialMin: 90 }, morning: { bed: '23:00', wake: '06:00' } } } });
  const m = dayMinutes(T);
  assert.equal(m.deep, 60);
  assert.equal(m.exercise, 25);
  assert.equal(m.social, 90);
  assert.equal(m.sleep, 420);
});

test('summary, insights and future from a week of time', () => {
  const sched = [
    { id: 's', cat: 'sleep', start: '23:00', end: '06:00', rep: [0, 1, 2, 3, 4, 5, 6], from: addDays(T, -20) },
    { id: 'l', cat: 'learn', start: '19:00', end: '21:00', rep: [0, 1, 2, 3, 4, 5, 6], from: addDays(T, -20) },
    { id: 'g', cat: 'social', start: '21:00', end: '23:00', rep: [0, 1, 2, 3, 4, 5, 6], from: addDays(T, -20) },
  ];
  state({ schedule: sched });
  const w = timeSummary(7);
  assert.equal(w.days, 7);
  assert.equal(w.avg.learn, 120);
  assert.equal(w.kinds.drain, 120);
  const ins = timeInsights();
  assert.ok(ins.some((x) => x.t.startsWith('Social media: 2h a day')), JSON.stringify(ins));
  assert.ok(ins.some((x) => /sleep about 7h/.test(x.t)));
  assert.ok(ins.some((x) => /No exercise/.test(x.t)));
  const f = timeFuture();
  assert.equal(f.paths[0].c, 'learn');
  assert.equal(f.paths[0].yr, 730);
  assert.equal(f.paths[0].lvl1[0], 500);
  assert.equal(f.drainDays, 30);
  assert.equal(f.swap, 365);
  assert.equal(f.persona[1], 'At a crossroads'); // as much time leaking as growing
});

test('future needs a few days; levels; starter week; migration', () => {
  assert.deepEqual(timeFuture(), { need: 3, have: 0 });
  assert.equal(levelFor(10), null);
  assert.equal(levelFor(120)[0], 100);
  const st = starterSchedule();
  assert.ok(st.length >= 6 && st.every((b) => b.rep?.length && b.from === T && b.id));
  assert.equal(st[0].start, S.settings.bedTime);
  assert.deepEqual(migrate({}).schedule, []);
});
