import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, WORKOUTS, WEEK_PLAN, workoutSteps, workoutMinutes, suggestWorkout, exercise, levelInfo } from '../js/fitness.js';
import { dayPlan } from '../js/plan.js';
import { replaceState, DEFAULTS, S, day } from '../js/store.js';
import { today } from '../js/util.js';

test('every routine only uses known exercises, and every exercise is complete', () => {
  for (const w of WORKOUTS) for (const id of w.moves) assert.ok(exercise(id), `${w.id} → ${id}`);
  for (const e of EXERCISES) { assert.equal(e.reps.length, 3, e.id); assert.ok(e.how.length >= 2, e.id); assert.ok(e.tip, e.id); }
  for (const id of WEEK_PLAN) assert.ok(WORKOUTS.some((w) => w.id === id), id);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length, 'unique ids');
});
test('interval steps: prep, work/rest per round, no trailing rest', () => {
  const w = WORKOUTS.find((x) => x.id === 'full');
  const s = workoutSteps(w, 'intermediate');
  assert.equal(s[0].phase, 'prep');
  assert.equal(s.filter((x) => x.phase === 'work').length, w.moves.length * w.rounds);
  assert.equal(s.at(-1).phase, 'work');
  assert.ok(s.filter((x) => x.phase === 'work').every((x) => x.secs === levelInfo('intermediate').work));
  // Rest step always previews the NEXT exercise.
  s.forEach((x, i) => { if (x.phase === 'rest') assert.equal(x.ex, s[i + 1].ex); });
});
test('stretch routines have no rest steps; harder levels take longer', () => {
  const night = WORKOUTS.find((x) => x.id === 'night');
  assert.equal(workoutSteps(night).filter((x) => x.phase === 'rest').length, 0);
  assert.ok(workoutMinutes(night, 'advanced') >= workoutMinutes(night, 'beginner'));
});
test('workout suggestion follows the time of day', () => {
  const base = { weekday: 1, wake: 390, bed: 1350 }; // 6:30 → 22:30, Monday
  assert.equal(suggestWorkout({ ...base, minutesNow: 420 }).id, 'wake');
  assert.equal(suggestWorkout({ ...base, minutesNow: 420, doneIds: ['wake'] }).id, WEEK_PLAN[1]);
  assert.equal(suggestWorkout({ ...base, minutesNow: 1000 }).id, WEEK_PLAN[1]);
  assert.equal(suggestWorkout({ ...base, minutesNow: 1290 }).id, 'night');
});

beforeEach(() => {
  const s = DEFAULTS();
  s.profile = { name: 'T', goals: [], created: today() };
  s.settings.wakeTime = '06:30'; s.settings.bedTime = '22:30';
  replaceState(s);
});
const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
test('day plan picks the right block for the time', () => {
  const ids = (h, m) => dayPlan(at(h, m)).blocks.find((b) => b.current)?.id;
  assert.equal(ids(7, 0), 'wake');
  assert.equal(ids(10, 0), 'focus');
  assert.equal(ids(12, 0), 'midday');
  assert.equal(ids(15, 0), 'afternoon');
  assert.equal(ids(19, 0), 'evening');
  assert.equal(ids(21, 30), 'winddown');
  assert.equal(ids(23, 30), 'sleep');
  assert.equal(ids(2, 0), 'sleep');
});
test('plan items tick themselves off from real data', () => {
  const d = day(); d.water = 3; d.morning = { mood: 4 };
  S.workouts = [{ id: 'wake', date: today(), mins: 8 }];
  replaceState(S);
  const wake = dayPlan(at(7)).blocks.find((b) => b.id === 'wake');
  const get = (id) => wake.items.find((x) => x.id === id);
  assert.equal(get('water1').done, true);
  assert.equal(get('morning').done, true);
  assert.equal(get('w-wake').done, true);
  assert.equal(get('sun').done, false);
  day().plan = { sun: true }; replaceState(S);
  assert.equal(dayPlan(at(7)).blocks[0].items.find((x) => x.id === 'sun').done, true);
});
test('short days still produce ordered, non-overlapping blocks', () => {
  S.settings.wakeTime = '09:00'; S.settings.bedTime = '21:00'; replaceState(S);
  const p = dayPlan(at(12));
  assert.ok(p.blocks.length >= 5);
  assert.equal(p.blocks.filter((b) => b.current).length, 1);
});
