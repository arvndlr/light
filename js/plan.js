// Time-of-day plan: splits YOUR day (from your wake & bed times) into blocks and
// suggests what to do in each. Items tick themselves off from real data where
// possible (water, check-ins, focus, workouts…); the rest are tap-to-tick.
import { S } from './store.js';
import { today, minutesOf } from './util.js';
import { hygRatio, jokesOn, txOn } from './core.js';
import { workout, workoutMinutes, WEEK_PLAN } from './fitness.js';

const doneWorkouts = (k) => (S.workouts || []).filter((w) => w.date === k && !w.partial).map((w) => w.id);

/**
 * @param {Date} now
 * @returns {{ blocks: Array, current: number, minutesIntoDay: number }}
 */
export function dayPlan(now = new Date()) {
  const st = S.settings;
  const k = today(now.getTime());
  const d = S.days[k] || {};
  const water = d.water || 0, focus = d.deepWork || 0, target = st.waterTarget || 8;
  const ticks = d.plan || {};
  const level = st.fitLevel || 'beginner';
  const wDone = doneWorkouts(k);
  const W = minutesOf(st.wakeTime || '06:30');
  let B = minutesOf(st.bedTime || '22:30');
  if (B <= W) B += 1440;
  const dayLen = B - W;
  const rel = ((now.getHours() * 60 + now.getMinutes()) - W + 1440) % 1440; // minutes since wake

  const pr = d.morning?.priorities?.find((p) => p.t?.trim() && !p.done);
  const mainW = workout(WEEK_PLAN[now.getDay()]);
  const wItem = (w, prefix = '') => ({ id: 'w-' + w.id, ic: w.ic, t: `${prefix}${w.n} · ${workoutMinutes(w, level)} min`, s: w.focus, act: 'start-workout', w: w.id, done: wDone.includes(w.id) });
  const manual = (id, ic, t, s) => ({ id, ic, t, s, act: 'plan-tick', done: !!ticks[id] });

  // Block boundaries (minutes since wake), kept in order even for short days.
  const b = [0, 90, 300, 420, Math.max(420, dayLen - 300), Math.max(420, dayLen - 120), dayLen, 1440];
  const defs = [
    { id: 'wake', ic: '🌅', title: 'Wake up strong', items: [
      { id: 'water1', ic: '💧', t: 'Drink a glass of water', s: 'Rehydrate after sleep', act: 'water+', done: water >= 1 },
      { id: 'hygam', ic: '🪥', t: 'Morning hygiene routine', act: 'hyg-am', done: hygRatio(d, 'hygAM') === 1 },
      ...(st.asthma ? [manual('inhaler', '🫁', 'Preventer inhaler, as prescribed', 'Even on days you feel fine · rinse your mouth after')] : []),
      manual('sun', '☀️', 'Get 5–10 min of sunlight', 'Sets your body clock for better sleep'),
      { id: 'morning', ic: '🌅', t: 'Morning check-in', s: '10 minutes to plan your day', act: 'open-morning', done: !!d.morning },
      wItem(workout('wake')),
    ] },
    { id: 'focus', ic: '🎯', title: 'Deep work', items: [
      { id: 'focus1', ic: '⏱️', t: pr ? `Focus 50 min on: ${pr.t}` : 'Focus 50 min on your #1 priority', s: 'Your brain is sharpest now', act: 'focus', done: focus >= 50 },
      manual('phoneaway', '📵', 'Put your phone in another room', 'Out of sight, out of mind'),
      { id: 'water3', ic: '💧', t: 'Reach 3 glasses of water', act: 'water+', done: water >= 3 },
    ] },
    { id: 'midday', ic: '🍚', title: 'Midday reset', items: [
      manual('lunch', '🍚', 'Healthy lunch — skip fast food', 'Protein + vegetables keeps energy steady'),
      manual('walk', '🏃', 'Walk 10 minutes after eating', 'Lowers the after-lunch slump'),
      { id: 'water5', ic: '💧', t: 'Reach 5 glasses of water', act: 'water+', done: water >= 5 },
    ] },
    { id: 'afternoon', ic: '⚡', title: 'Afternoon push', items: [
      { id: 'focus2', ic: '⏱️', t: 'Second focus session', s: 'Finish what you started this morning', act: 'focus', done: focus >= 100 },
      wItem(workout('desk')),
      { id: 'joke', ic: '😂', t: 'Write one joke', s: 'Comedy is a muscle too', act: 'go-comedy', done: jokesOn(k) > 0 },
      { id: 'water7', ic: '💧', t: `Reach ${Math.max(target - 2, 1)} glasses of water`, act: 'water+', done: water >= Math.max(target - 2, 1) },
    ] },
    { id: 'evening', ic: '💪', title: 'Evening energy', items: [
      { ...wItem(mainW, 'Workout: '), done: wDone.some((id) => !['wake', 'desk', 'night'].includes(id)) || (d.exercise || 0) >= 20 },
      manual('connect', '💬', 'Text or call someone you care about', 'Real connection beats scrolling'),
      manual('dinner', '🥗', 'Healthy dinner at home', 'Cheaper and better than fast food'),
      { id: 'money', ic: '💰', t: 'Log today’s spending', act: 'tab', tab: 'money', done: txOn(k).length > 0 || !!d.evening },
    ] },
    { id: 'winddown', ic: '🌙', title: 'Wind down', items: [
      { id: 'evening', ic: '📝', t: 'Evening check-in', s: 'Close the day honestly', act: 'open-evening', done: !!d.evening },
      { id: 'hygpm', ic: '🪥', t: 'Night routine', act: 'hyg-pm', done: hygRatio(d, 'hygPM') === 1 },
      ...(st.asthma ? [{ id: 'asthmalog', ic: '🫁', t: 'Log today’s asthma check', s: 'Reliever puffs, symptoms, night waking', act: 'go-health', done: !!d.asthma?.logged }] : []),
      wItem(workout('night')),
      manual('screens', '📵', 'Screens off 30 min before bed', 'Charge your phone outside the bedroom'),
      manual('read', '📓', 'Read or journal for 10 minutes'),
    ] },
    { id: 'sleep', ic: '😴', title: 'Sleep', items: [
      manual('sleep', '😴', `Lights out by ${st.bedTime || '22:30'}`, 'Sleep is your superpower'),
      { id: 'urge', ic: '🌊', t: 'Can’t sleep? Breathe — don’t scroll', s: 'Use the 90-second urge surfer', act: 'sos', done: false },
    ] },
  ];
  const blocks = defs.map((def, i) => {
    const from = b[i], to = b[i + 1];
    return { ...def, from: (W + from) % 1440, to: (W + to) % 1440, empty: to <= from,
      current: rel >= from && rel < to, past: rel >= to, doneCount: def.items.filter((x) => x.done).length };
  }).filter((x) => !x.empty);
  return { blocks, current: blocks.findIndex((x) => x.current), minutesIntoDay: rel };
}
