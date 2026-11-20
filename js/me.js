// Me: who you are (values, strengths, personality, the patterns in your own data)
// and who you're becoming (identities you choose, the daily "votes" for them, letters to your future self).
import { S } from './store.js';
import { today, addDays, avg, sum, round1, parseKey, minutesOf, fmtDate } from './util.js';
import { sleepHours, slipsOn, hygRatio, jokesOn, cur } from './core.js';
import { dayMinutes, timeSummary, fmtHM, levelFor } from './time.js';

/** S.me with every field present (older data may lack some). */
export function me() {
  const m = S.me && typeof S.me === 'object' ? S.me : (S.me = {});
  for (const k of ['values', 'ids', 'letters']) if (!Array.isArray(m[k])) m[k] = [];
  for (const k of ['strengths', 'traits', 'at']) if (!m[k] || typeof m[k] !== 'object') m[k] = {};
  return m;
}

// ---------- Values ----------
// check(): how your recent days show this value → { lvl: 2 strong | 1 some | 0 weak, t: evidence } or null (can't tell yet)
const timeCheck = (cats, strong, some) => () => {
  const w = timeSummary(14);
  if (w.days < 3) return null;
  const v = sum(cats.map((c) => w.avg[c] || 0));
  return { lvl: v >= strong ? 2 : v >= some ? 1 : 0, t: `${fmtHM(v)} a day` };
};
const recentDays = (n = 14) => Array.from({ length: n }, (_, i) => addDays(today(), -i)).filter((k) => S.days[k]);
const evenings = (n = 14) => recentDays(n).filter((k) => S.days[k].evening);
const cleanCheck = () => {
  const e = evenings();
  if (e.length < 3) return null;
  const c = e.filter((k) => slipsOn(k).size === 0).length;
  return { lvl: c / e.length >= 0.8 ? 2 : c / e.length >= 0.5 ? 1 : 0, t: `${c} of ${e.length} days free of bad habits` };
};
export const VALUES = [
  ['family', '👨‍👩‍👧', 'Family', timeCheck(['family'], 60, 20)],
  ['faith', '🙏', 'Faith', timeCheck(['faith'], 20, 5)],
  ['health', '💪', 'Health', () => {
    const ks = recentDays();
    if (ks.length < 3) return null;
    const ex = avg(ks.map((k) => S.days[k].exercise || 0));
    const sl = ks.map((k) => sleepHours(S.days[k].morning)).filter((x) => x != null);
    const okSleep = sl.length ? avg(sl) >= S.settings.sleepTarget - 0.5 : false;
    const lvl = (ex >= 20 ? 1 : 0) + (okSleep ? 1 : 0);
    return { lvl, t: `${Math.round(ex)} min exercise a day${sl.length ? ` · ${round1(avg(sl))}h sleep` : ''}` };
  }],
  ['growth', '🌱', 'Growth', timeCheck(['learn', 'deep', 'build'], 90, 30)],
  ['knowledge', '📚', 'Knowledge', timeCheck(['learn'], 45, 15)],
  ['achievement', '🏆', 'Achievement', timeCheck(['deep', 'build'], 90, 30)],
  ['creativity', '🎨', 'Creativity', timeCheck(['build'], 45, 15)],
  ['security', '🏦', 'Financial security', () => {
    const m = today().slice(0, 7), tx = S.tx.filter((t) => t.date.startsWith(m));
    const inc = sum(tx.filter((t) => t.type === 'in').map((t) => +t.amount));
    const kept = sum(tx.filter((t) => t.type === 'save' || t.type === 'pay').map((t) => +t.amount));
    if (!inc) return null;
    const r = kept / inc;
    return { lvl: r >= 0.15 ? 2 : r > 0 ? 1 : 0, t: `${Math.round(r * 100)}% of income saved or paid to debt this month` };
  }],
  ['freedom', '🕊️', 'Freedom', cleanCheck],
  ['discipline', '🎯', 'Discipline', cleanCheck],
  ['fun', '😄', 'Fun & joy', () => {
    const ms = recentDays().map((k) => S.days[k].evening?.mood).filter(Boolean);
    if (ms.length < 3) return null;
    const a = avg(ms);
    return { lvl: a >= 4 ? 2 : a >= 3 ? 1 : 0, t: `average mood ${round1(a)}/5` };
  }],
  ['peace', '🧘', 'Inner peace', () => {
    const ss = recentDays().map((k) => S.days[k].evening?.stress).filter(Boolean);
    if (ss.length < 3) return null;
    const a = avg(ss);
    return { lvl: a <= 2 ? 2 : a <= 3 ? 1 : 0, t: `average stress ${round1(a)}/5` };
  }],
  ['kindness', '🤝', 'Kindness', null],
  ['honesty', '🧭', 'Honesty', null],
  ['service', '🙌', 'Helping others', null],
  ['adventure', '🧗', 'Adventure', null],
];
export const valueInfo = (id) => VALUES.find((v) => v[0] === id);
/** Your chosen values and how your recent days line up with them. */
export function valuesCheck() {
  return me().values.map((id) => { const v = valueInfo(id); return v && { id, ic: v[1], n: v[2], r: v[3] ? v[3]() : null, measurable: !!v[3] }; }).filter(Boolean);
}

// ---------- Strengths (20 statements, 2 per strength, 1–5 agree) ----------
export const STRENGTHS = [
  ['discipline', '🎯', 'Discipline', 'disciplined', ['I finish what I start, even when I don’t feel like it.', 'I keep my routines on busy days.']],
  ['curiosity', '🔭', 'Curiosity', 'curious', ['I get lost learning about things that interest me.', 'I ask a lot of questions.']],
  ['kindness', '🤝', 'Kindness', 'kind', ['I go out of my way to help people, even strangers.', 'People come to me when they need someone to listen.']],
  ['humor', '😂', 'Humor', 'funny', ['I can make people laugh, even in hard moments.', 'I see the funny side of most situations.']],
  ['leadership', '🧭', 'Leadership', 'a natural leader', ['In a group, I naturally organize people and plans.', 'People follow my lead when things get messy.']],
  ['creativity', '🎨', 'Creativity', 'creative', ['I often come up with new ways to do things.', 'I love making things — art, code, music or ideas.']],
  ['resilience', '🌊', 'Resilience', 'resilient', ['After a setback, I bounce back quickly.', 'Failure teaches me more than it hurts me.']],
  ['courage', '🦁', 'Courage', 'brave', ['I speak up when something is wrong, even if it’s uncomfortable.', 'I try things that scare me.']],
  ['gratitude', '🙏', 'Gratitude', 'grateful', ['I notice the good things in my life every day.', 'I often tell people what they mean to me.']],
  ['focus', '🔍', 'Focus', 'focused', ['I can work on one thing for an hour without checking my phone.', 'Distractions rarely pull me off track.']],
];
export const strengthInfo = (id) => STRENGTHS.find((s) => s[0] === id);
export const STRENGTH_QS = STRENGTHS.flatMap(([id, , , , qs]) => qs.map((q) => ({ id, q })));
export function scoreStrengths(answers) {
  const out = {};
  STRENGTH_QS.forEach((x, i) => { (out[x.id] = out[x.id] || []).push(answers[i] || 3); });
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, round1(avg(v))]));
}
export function topStrengths(n = 3) {
  const e = Object.entries(me().strengths).sort((a, b) => b[1] - a[1]);
  return { top: e.slice(0, n).map(([id]) => id), edge: e.length ? e[e.length - 1][0] : null };
}

// ---------- Personality snapshot (Big Five, 2 statements each; the second is reversed) ----------
export const TRAITS = [
  ['open', '🌈', 'Openness', ['I love new ideas, places and experiences.', 'I prefer the familiar way of doing things.'],
    'You love new ideas and experiences — learning and trying things energize you.', 'You like what’s proven and familiar — steady, practical and grounded.'],
  ['consc', '📋', 'Conscientiousness', ['I’m organized and plan ahead.', 'I often leave things to the last minute.'],
    'You’re organized and reliable — you plan and follow through.', 'You’re flexible and spontaneous — structure (like Light’s schedule) helps you most.'],
  ['extra', '🎉', 'Extraversion', ['I get energy from being around people.', 'I prefer quiet time alone over parties.'],
    'People recharge you — you think out loud and light up a room.', 'Quiet time recharges you — you think deeply and choose people carefully.'],
  ['agree', '💛', 'Agreeableness', ['I’m patient and warm with people.', 'I can be critical or quick to argue.'],
    'You’re warm and cooperative — people feel safe with you.', 'You’re direct and challenge ideas — honest feedback is your gift.'],
  ['calm', '🧘', 'Emotional calm', ['I stay calm under pressure.', 'I worry a lot or get upset easily.'],
    'You stay steady under pressure — a calm center for others.', 'You feel things strongly — sleep, exercise and the Urge button help you most.'],
];
export const TRAIT_QS = TRAITS.flatMap(([id, , , qs]) => qs.map((q, j) => ({ id, q, rev: j === 1 })));
export function scoreTraits(answers) {
  const out = {};
  TRAIT_QS.forEach((x, i) => { const a = answers[i] || 3; (out[x.id] = out[x.id] || []).push(x.rev ? 6 - a : a); });
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(((avg(v) - 1) / 4) * 100)]));
}

// ---------- Your formula for a good day (from your own check-ins) ----------
const moodOf = (d) => { const ms = [d?.morning?.mood, d?.evening?.mood].filter(Boolean); return ms.length ? avg(ms) : null; };
const DRIVERS = [
  ['exercise', '🏃', 'You move 20+ minutes', (k, d) => (d.exercise || 0) >= 20],
  ['sleep', '😴', 'You sleep enough', (k, d) => { const h = sleepHours(d.morning); return h == null ? null : h >= S.settings.sleepTarget - 0.5; }],
  ['focus', '🎯', 'You do an hour of focused work', (k, d) => (d.deepWork || 0) >= 60],
  ['clean', '🛡️', 'You avoid all your bad habits', (k, d) => (d.evening ? slipsOn(k).size === 0 : null)],
  ['social', '📵', 'Social media stays under your limit', (k, d) => (d.evening ? (d.evening.socialMin || 0) <= S.settings.socialLimit : null)],
  ['water', '💧', 'You drink enough water', (k, d) => (d.water || 0) >= S.settings.waterTarget],
  ['routine', '🪥', 'You finish your morning routine', (k, d) => hygRatio(d, 'hygAM') === 1],
  ['early', '🌅', 'You wake up on time', (k, d) => (d.morning?.wake ? minutesOf(d.morning.wake) <= minutesOf(S.settings.wakeTime) + 15 : null)],
  ['family', '👨‍👩‍👧', 'You spend an hour with family or friends', (k) => (dayMinutes(k).family || 0) >= 60],
  ['learn', '📚', 'You learn for 30+ minutes', (k) => (dayMinutes(k).learn || 0) >= 30],
  ['laugh', '😂', 'You write a joke', (k) => jokesOn(k) > 0],
];
/** Mood lift per habit: what your good days have in common. Needs ~a week of check-ins. */
export function goodDayFormula(n = 60) {
  const ks = Array.from({ length: n }, (_, i) => addDays(today(), -i)).filter((k) => moodOf(S.days[k]) != null);
  if (ks.length < 5) return { need: 5, have: ks.length };
  const rows = [];
  for (const [id, ic, t, test] of DRIVERS) {
    const yes = [], no = [];
    for (const k of ks) { const r = test(k, S.days[k]); if (r === true) yes.push(moodOf(S.days[k])); else if (r === false) no.push(moodOf(S.days[k])); }
    if (yes.length >= 2 && no.length >= 2) rows.push({ id, ic, t, lift: round1(avg(yes) - avg(no)), yes: yes.length, no: no.length });
  }
  const wd = Array.from({ length: 7 }, () => []);
  for (const k of ks) wd[parseKey(k).getDay()].push(moodOf(S.days[k]));
  const days = wd.map((v, i) => ({ i, a: v.length >= 2 ? avg(v) : null })).filter((x) => x.a != null).sort((a, b) => b.a - a.a);
  const dayName = (i) => fmtDate(addDays('2023-01-01', i), { weekday: 'long' });
  return {
    days: ks.length,
    lifts: rows.filter((r) => r.lift >= 0.3).sort((a, b) => b.lift - a.lift).slice(0, 4),
    drags: rows.filter((r) => r.lift <= -0.3).sort((a, b) => a.lift - b.lift).slice(0, 2),
    best: days.length >= 3 ? dayName(days[0].i) : null,
    worst: days.length >= 3 ? dayName(days[days.length - 1].i) : null,
  };
}

/** One honest paragraph: who you are, from your answers and your data. */
export function identitySentence(name) {
  const m = me(), { top } = topStrengths(3);
  const adj = top.map((id) => strengthInfo(id)?.[3]).filter(Boolean);
  const vals = m.values.slice(0, 3).map((id) => valueInfo(id)?.[2].toLowerCase()).filter(Boolean);
  const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  if (!adj.length && !vals.length) return null;
  return `${name} — ${adj.length ? list(adj) : 'still discovering yourself'}${vals.length ? `. You live for ${list(vals)}.` : '.'}`;
}

// ---------- Future me: identities and their daily votes ----------
export const ID_TEMPLATES = [
  { k: 'dev', ic: '💻', t: 'Software engineer', kind: 'time', cats: ['learn', 'deep', 'build'] },
  { k: 'fit', ic: '💪', t: 'Fit and strong', kind: 'time', cats: ['exercise'] },
  { k: 'learner', ic: '📚', t: 'Lifelong learner', kind: 'time', cats: ['learn'] },
  { k: 'family', ic: '👨‍👩‍👧', t: 'A great family person', kind: 'time', cats: ['family'] },
  { k: 'faith', ic: '🙏', t: 'Strong in faith', kind: 'time', cats: ['faith'] },
  { k: 'creator', ic: '🎨', t: 'Creator', kind: 'time', cats: ['build'] },
  { k: 'business', ic: '🚀', t: 'Business owner', kind: 'time', cats: ['build', 'deep'] },
  { k: 'funny', ic: '🎤', t: 'Funny and confident', kind: 'time', cats: [], jokes: true },
  { k: 'rich', ic: '💰', t: 'Debt-free and wealthy', kind: 'money' },
  { k: 'free', ic: '🕊️', t: 'Free from bad habits', kind: 'clean' },
];
/** Minutes (time), money kept (money) or 1/0 (clean) for an identity on a day. */
export function voteOn(idn, k) {
  if (idn.kind === 'money') return sum(S.tx.filter((t) => t.date === k && (t.type === 'save' || t.type === 'pay')).map((t) => +t.amount));
  if (idn.kind === 'clean') return S.days[k]?.evening ? (slipsOn(k).size === 0 ? 1 : 0) : 0;
  const m = dayMinutes(k);
  return sum((idn.cats || []).map((c) => m[c] || 0)) + (idn.jokes ? jokesOn(k) * 15 : 0);
}
const fmtVote = (idn, v) => (idn.kind === 'money' ? cur(Math.round(v)) : idn.kind === 'clean' ? `${v} clean ${v === 1 ? 'day' : 'days'}` : fmtHM(v));
/** Progress and projection for one identity. */
export function identityProgress(idn, k = today()) {
  const d14 = Array.from({ length: 14 }, (_, i) => addDays(k, -13 + i)).map((x) => ({ k: x, v: voteOn(idn, x) }));
  const d30 = Array.from({ length: 30 }, (_, i) => voteOn(idn, addDays(k, -i)));
  const total30 = sum(d30), perDay = total30 / 30;
  const since = idn.created && idn.created > addDays(k, -29) ? Math.max(1, Math.round((parseKey(k) - parseKey(idn.created)) / 864e5) + 1) : 30;
  // Per-day pace: money over a full month (income is monthly); time over the days since you chose it, but never fewer than 7.
  const pace = idn.kind === 'money' ? total30 / 30 : total30 / Math.max(7, since);
  let streak = 0;
  for (let i = 0; i < 365; i++) { const x = addDays(k, -i); if (voteOn(idn, x) > 0) streak++; else if (i > 0) break; }
  const out = { early: idn.kind !== 'money' && since < 14, dots: d14.map((x) => x.v > 0), week: sum(d14.slice(7).map((x) => x.v)), month: total30, perDay, pace, streak, fmt: (v) => fmtVote(idn, v) };
  if (idn.kind === 'time') {
    const yr = (pace * 365) / 60, five = yr * 5;
    Object.assign(out, { yr: Math.round(yr), five: Math.round(five), lvl1: levelFor(yr), lvl5: levelFor(five) });
  } else if (idn.kind === 'money') Object.assign(out, { yr: Math.round(pace * 365), five: Math.round(pace * 365 * 5) });
  else Object.assign(out, { yr: Math.round(Math.min(1, pace) * 365) });
  return out;
}
