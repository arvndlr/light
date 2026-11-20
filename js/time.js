// Time as a resource: your schedule, where your hours go, insights, and who that time is turning you into.
// A day's schedule = repeating blocks that apply that weekday + one-off blocks for that date.
// Things Light already tracks (sleep check-in, focus sessions, exercise, social media) fill in the gaps.
import { S } from './store.js';
import { today, addDays, parseKey, minutesOf, sum, round1, fmtDate } from './util.js';
import { tr } from './i18n.js';
import { screenByCat, screenAvg } from './screen.js';

// kind: invest = grows you · need = keeps you running · drain = leaks time
export const TIME_CATS = [
  ['learn', '📚', 'Learning', 'invest', 'var(--blue)'],
  ['deep', '🎯', 'Deep work', 'invest', 'var(--accent)'],
  ['build', '🛠️', 'Projects & side hustle', 'invest', 'var(--violet)'],
  ['exercise', '🏃', 'Exercise', 'invest', 'var(--good)'],
  ['family', '👨‍👩‍👧', 'Family & friends', 'invest', 'var(--pink)'],
  ['faith', '🙏', 'Faith & reflection', 'invest', 'var(--gold)'],
  ['work', '💼', 'Work', 'need', 'var(--teal)'],
  ['sleep', '😴', 'Sleep', 'need', 'var(--blue)'],
  ['meals', '🍚', 'Meals & self-care', 'need', 'var(--amber)'],
  ['chores', '🧹', 'Chores & errands', 'need', 'var(--muted)'],
  ['commute', '🚌', 'Commute', 'need', 'var(--muted)'],
  ['rest', '🎧', 'Rest & hobbies', 'need', 'var(--teal)'],
  ['chat', '💬', 'Messaging & calls', 'need', 'var(--teal)'],
  ['phone', '🧩', 'Other phone use', 'need', 'var(--muted)'],
  ['social', '📱', 'Social media', 'drain', 'var(--bad)'],
  ['videos', '📺', 'TV & videos', 'drain', 'var(--bad)'],
  ['games', '🎮', 'Games', 'drain', 'var(--bad)'],
];
export const KINDS = { invest: ['Invested', 'var(--good)'], need: ['Essentials', 'var(--blue)'], drain: ['Time leaks', 'var(--bad)'] };
export const timeCat = (id) => TIME_CATS.find((c) => c[0] === id) || ['other', '🕒', 'Other', 'need', 'var(--muted)'];

/** Length of a block in minutes (a block that ends after midnight, like sleep, wraps). */
export const blockMins = (b) => { const m = (minutesOf(b.end) - minutesOf(b.start) + 1440) % 1440; return m || 1440; };
export const fmtHM = (mins) => { const h = Math.floor(mins / 60), m = Math.round(mins % 60); return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`; };

/** Blocks scheduled on a date, sorted by start time. */
export function blocksOn(k) {
  const wd = parseKey(k).getDay();
  return (S.schedule || []).filter((b) => (b.rep?.length
    ? b.rep.includes(wd) && (!b.from || b.from <= k) && !b.skip?.includes(k)
    : b.date === k)).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
}

/** Minutes per category for one day: scheduled blocks, topped up with what Light tracked. */
export function dayMinutes(k) {
  const out = {};
  for (const b of blocksOn(k)) out[b.cat] = (out[b.cat] || 0) + blockMins(b);
  const d = S.days[k] || {};
  const m = d.morning;
  const tracked = {
    sleep: m?.bed && m?.wake ? ((minutesOf(m.wake) - minutesOf(m.bed) + 1440) % 1440) : 0,
    deep: d.deepWork || 0,
    exercise: d.exercise || 0,
    social: d.evening?.socialMin || 0,
  };
  // Screen time (Android app) is the most exact source for time leaks.
  const sc = screenByCat(k);
  for (const c of ['social', 'videos', 'games']) if (sc[c] > (tracked[c] || 0)) tracked[c] = sc[c];
  for (const [c, v] of Object.entries(tracked)) if (v > (out[c] || 0)) out[c] = v;
  return out;
}

/** Average minutes per day per category over the last n days (only days with anything logged count). */
export function timeSummary(n = 7, k = today()) {
  const keys = Array.from({ length: n }, (_, i) => addDays(k, -i));
  const per = keys.map((x) => ({ k: x, m: dayMinutes(x) })).filter((x) => sum(Object.values(x.m)) > 0);
  const days = per.length;
  const cats = {};
  for (const p of per) for (const [c, v] of Object.entries(p.m)) cats[c] = (cats[c] || 0) + v;
  const avg = Object.fromEntries(Object.entries(cats).map(([c, v]) => [c, days ? v / days : 0]));
  const kinds = { invest: 0, need: 0, drain: 0 };
  for (const [c, v] of Object.entries(avg)) kinds[timeCat(c)[3]] += v;
  const logged = sum(Object.values(avg));
  return { days, per, avg, kinds, logged: Math.min(1440, logged), free: Math.max(0, 1440 - logged) };
}

/** Plain-language insights about how you use your day: [{ ic, t, sev }] (sev 3 = act now, 1 = good news). */
export function timeInsights(k = today()) {
  const w = timeSummary(7, k), prev = timeSummary(7, addDays(k, -7)), out = [];
  if (w.days < 2) return out;
  const h = (m) => round1(m / 60);
  const st = S.settings;
  const sleep = w.avg.sleep || 0;
  const drains = TIME_CATS.filter((c) => c[3] === 'drain' && w.avg[c[0]] >= 20);
  for (const c of drains) out.push({ ic: c[1], sev: w.avg[c[0]] >= 120 ? 3 : 2, t: tr(`${c[2]}: ${fmtHM(w.avg[c[0]])} a day — that's ${Math.round((w.avg[c[0]] * 365) / 1440)} full days a year.`) });
  const sa = screenAvg(7, k);
  if (sa.days >= 2) {
    if (sa.total >= 180) out.push({ ic: '📱', sev: sa.total >= 300 ? 3 : 2, t: tr(`Your phone takes ${fmtHM(sa.total)} a day — ${Math.round((sa.total * 365) / 1440)} full days a year.`) });
    const top = sa.apps.find((a) => timeCat(a.cat)[3] === 'drain' && a.m >= 30);
    if (top) out.push({ ic: timeCat(top.cat)[1], sev: top.m >= 90 ? 3 : 2, t: tr(`${top.n} is your biggest time leak: ${fmtHM(top.m)} a day.`) });
  }
  if (sleep && sleep < (st.sleepTarget || 8) * 60 - 30) out.push({ ic: '😴', sev: 2, t: tr(`You sleep about ${h(sleep)}h a night — below your ${st.sleepTarget}h goal. Tired hours are weaker hours.`) });
  if (!w.avg.exercise) out.push({ ic: '🏃', sev: 2, t: tr('No exercise logged this week. Even 20 minutes a day adds up to 120 hours a year.') });
  const share = w.logged ? w.kinds.invest / (w.logged - (w.avg.sleep || 0) || 1) : 0;
  if (share >= 0.35) out.push({ ic: '🌱', sev: 1, t: tr(`${Math.round(share * 100)}% of your waking hours go into growing yourself. That's rare — keep it.`) });
  else if (w.kinds.invest < 60) out.push({ ic: '🌱', sev: 2, t: tr(`Only ${fmtHM(w.kinds.invest)} a day goes into growing yourself. Block one hour for learning or a project.`) });
  if (prev.days >= 2) {
    const diff = w.kinds.invest - prev.kinds.invest;
    if (Math.abs(diff) >= 20) out.push({ ic: diff > 0 ? '📈' : '📉', sev: diff > 0 ? 1 : 2, t: tr(diff > 0 ? `You invested ${fmtHM(diff)} more a day than last week.` : `You invested ${fmtHM(-diff)} less a day than last week.`) });
    const dr = w.kinds.drain - prev.kinds.drain;
    if (dr >= 20) out.push({ ic: '⚠️', sev: 2, t: tr(`Time leaks grew by ${fmtHM(dr)} a day since last week.`) });
  }
  const best = w.per.map((p) => ({ k: p.k, v: sum(Object.entries(p.m).filter(([c]) => timeCat(c)[3] === 'invest').map(([, v]) => v)) })).sort((a, b) => b.v - a.v)[0];
  if (best && best.v >= 60) out.push({ ic: '⭐', sev: 1, t: tr(`Your best day was ${fmtDate(best.k, { weekday: 'long' })}: ${fmtHM(best.v)} invested. Copy what you did.`) });
  const morn = [], eve = [];
  for (const p of w.per) for (const b of blocksOn(p.k)) if (timeCat(b.cat)[3] === 'invest') (minutesOf(b.start) < 720 ? morn : eve).push(blockMins(b));
  if (sum(morn) + sum(eve) >= 120) out.push({ ic: sum(morn) >= sum(eve) ? '🌅' : '🌙', sev: 1, t: tr(sum(morn) >= sum(eve) ? 'You do most of your growing before noon — protect your mornings.' : 'You do most of your growing after noon — guard your evenings from your phone.') });
  if (w.free >= 240) out.push({ ic: '🕳️', sev: 1, t: tr(`About ${fmtHM(w.free)} a day isn't in your schedule. Unplanned time tends to leak — give it a job.`) });
  return out.sort((a, b) => b.sev - a.sev);
}

// Practice milestones (hours) and what each one means.
const LEVELS = [[20, 'Past the awkward beginner stage'], [100, 'Better than most people who try'], [500, 'Genuinely skilled'], [1000, 'Advanced — people ask you for help'], [3000, 'Expert level'], [10000, 'Mastery']];
const IDENT = {
  learn: 'an expert in what you study', deep: 'someone known for finishing great work', build: 'a builder with real projects — maybe a business',
  exercise: 'strong, fit and full of energy', family: 'the person your family and friends count on', faith: 'calm, grounded and wise',
  work: 'a respected professional', rest: 'a skilled hobbyist',
};
export const levelFor = (hrs) => { let l = null; for (const x of LEVELS) if (hrs >= x[0]) l = x; return l; };

/** What your current time habits make you in 1 and 5 years. */
export function timeFuture(k = today()) {
  const w = timeSummary(14, k);
  if (w.days < 3) return { need: 3, have: w.days };
  const paths = Object.entries(w.avg).filter(([c, v]) => IDENT[c] && v >= 10 && (timeCat(c)[3] === 'invest' || c === 'rest'))
    .map(([c, v]) => {
      const yr = (v * 365) / 60, five = yr * 5;
      return { c, perDay: v, yr: Math.round(yr), five: Math.round(five), lvl1: levelFor(yr), lvl5: levelFor(five), ident: IDENT[c], mastery: ['family', 'faith'].includes(c) ? null : Math.ceil(10000 / yr) };
    }).sort((a, b) => b.perDay - a.perDay);
  const drainMin = w.kinds.drain, drainDays = Math.round((drainMin * 365) / 1440);
  const top = paths[0];
  const persona = !top ? ['🌫️', 'Drifting', 'Your days are mostly essentials and leaks. Nothing is compounding yet — one daily hour of learning or a project changes that.']
    : drainMin >= top.perDay ? ['⚖️', 'At a crossroads', `You spend ${drainMin > top.perDay ? 'more time on time leaks' : 'as much time on time leaks'} (${fmtHM(drainMin)}) ${drainMin > top.perDay ? 'than' : 'as'} on ${timeCat(top.c)[2].toLowerCase()} (${fmtHM(top.perDay)}). Flip that and you become ${top.ident}.`]
      : ['🚀', `Becoming ${top.ident}`, `${fmtHM(top.perDay)} a day on ${timeCat(top.c)[2].toLowerCase()} is ${top.yr} hours a year. In 5 years: ${top.lvl5 ? top.lvl5[1].toLowerCase() : 'a strong foundation'}.`];
  const swap = drainMin >= 30 ? Math.round((drainMin / 2 * 365) / 60) : 0;
  return { paths, drainMin, drainDays, persona: persona.map((x) => tr(x)), swap, days: w.days };
}

/** A sensible starting week from your wake & bed times (all editable). */
export function starterSchedule() {
  const st = S.settings, wk = [1, 2, 3, 4, 5], all = [0, 1, 2, 3, 4, 5, 6];
  const W = minutesOf(st.wakeTime || '06:30');
  const hm = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
  const from = today();
  return [
    { cat: 'sleep', title: 'Sleep', start: st.bedTime || '22:30', end: st.wakeTime || '06:30', rep: all },
    { cat: 'meals', title: 'Morning routine & breakfast', start: hm(W), end: hm(W + 45), rep: all },
    { cat: 'work', title: 'Work', start: '09:00', end: '12:00', rep: wk },
    { cat: 'meals', title: 'Lunch', start: '12:00', end: '13:00', rep: all },
    { cat: 'work', title: 'Work', start: '13:00', end: '17:00', rep: wk },
    { cat: 'exercise', title: 'Workout', start: '17:30', end: '18:00', rep: wk },
    { cat: 'meals', title: 'Dinner', start: '18:30', end: '19:30', rep: all },
    { cat: 'learn', title: 'Learn something', start: '19:30', end: '20:30', rep: all },
    { cat: 'family', title: 'Family time', start: '20:30', end: '21:30', rep: all },
  ].map((b, i) => ({ id: 'sch' + Date.now().toString(36) + i, from, ...b }));
}
