// Domain logic. No DOM access here — everything is a pure function of the stored
// state (plus "today"), which is what makes it unit-testable.
import C from './content.js';
import { S, version } from './store.js';
import {
  today, addDays, daysBetween, parseKey, lastN, clamp, avg, sum, round1, slope, daily, weekStart,
  minutesOf, hhmm, esc, dkey,
} from './util.js';

// ---------- Static definitions ----------
export const DOMAINS = [
  { id: 'health', name: 'Health & Sleep', ic: '😴', color: 'var(--blue)', hex: 'var(--blue)' },
  { id: 'physical', name: 'Physical', ic: '💪', color: 'var(--good)', hex: 'var(--good)' },
  { id: 'mental', name: 'Mental', ic: '🧠', color: 'var(--violet)', hex: 'var(--violet)' },
  { id: 'career', name: 'Career', ic: '🎯', color: 'var(--gold)', hex: 'var(--accent)' },
  { id: 'money', name: 'Money', ic: '💰', color: 'var(--amber)', hex: 'var(--amber)' },
  { id: 'eq', name: 'EQ & Joy', ic: '❤️', color: 'var(--pink)', hex: 'var(--pink)' },
];
export const HABITS = [
  { id: 'social', name: 'Social media', ic: '📵', cat: null },
  { id: 'gambling', name: 'Gambling', ic: '🎲', cat: 'gambling' },
  { id: 'fastfood', name: 'Fast food', ic: '🍔', cat: 'fastfood' },
  { id: 'soda', name: 'Soft drinks', ic: '🥤', cat: 'soda' },
];
export const CATS_OUT = [
  ['food', '🍚', 'Food'], ['fastfood', '🍔', 'Fast food'], ['soda', '🥤', 'Soda/sweet drinks'], ['transport', '🚌', 'Transport'],
  ['bills', '💡', 'Bills'], ['shopping', '🛍️', 'Shopping'], ['fun', '🎮', 'Fun'], ['health', '💊', 'Health'],
  ['family', '👨‍👩‍👧', 'Family'], ['learning', '📚', 'Learning'], ['gambling', '🎲', 'Gambling'], ['other', '📦', 'Other'],
];
export const CATS_IN = [['salary', '💼', 'Salary'], ['side', '💰', 'Side income'], ['gift', '🎁', 'Gift'], ['otherin', '➕', 'Other']];
export const CATS_SAVE = [['savings', '🏦', 'Savings'], ['invest', '📈', 'Investment']];
export const BAD_CATS = ['fastfood', 'soda', 'gambling'];
export const catInfo = (id) => [...CATS_OUT, ...CATS_IN, ...CATS_SAVE].find((c) => c[0] === id) || ['other', '📦', 'Other'];

// ---------- Memoization (invalidated automatically on every save) ----------
let memoVer = -1;
const memo = new Map();
function cached(key, fn) {
  if (memoVer !== version) { memo.clear(); memoVer = version; }
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key);
}

// ---------- Basic metrics ----------
export const cur = (n) => S.settings.currency + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
export const goals = () => (S.profile?.goals || []).filter((g) => g.t && g.t.trim());

export function sleepHours(m) {
  if (!m || !m.bed || !m.wake) return null;
  return round1((((minutesOf(m.wake) - minutesOf(m.bed)) + 1440) % 1440) / 60);
}
export function hygRatio(d, which) {
  const lists = which ? [which] : ['hygAM', 'hygPM'];
  let n = 0, done = 0;
  for (const l of lists) for (const it of S.settings[l]) { n++; if (d?.[l]?.[it]) done++; }
  return n ? done / n : 0;
}
const txByDay = () => cached('txByDay', () => {
  const m = new Map();
  for (const t of S.tx) { if (!m.has(t.date)) m.set(t.date, []); m.get(t.date).push(t); }
  return m;
});
export const txOn = (k) => txByDay().get(k) || [];
export const spentOn = (k) => sum(txOn(k).filter((t) => t.type === 'out').map((t) => +t.amount));
export const jokesOn = (k) => S.jokes.filter((j) => j.date === k).length;
export const savedTotal = () => sum(S.tx.filter((t) => t.type === 'save').map((t) => +t.amount));

export function monthTotals(k = today()) {
  const mk = k.slice(0, 7);
  const month = S.tx.filter((t) => t.date.startsWith(mk));
  const by = (type) => sum(month.filter((t) => t.type === type).map((t) => +t.amount));
  return { month, out: by('out'), inc: by('in'), saved: by('save') };
}

// ---------- Habits & streaks ----------
/** Which bad habits slipped on day k: from the evening check-in, money log and urge log. */
export function slipsOn(k) {
  return cached('slips:' + k, () => {
    const out = new Set();
    const e = S.days[k]?.evening;
    if (e) {
      if ((e.socialMin || 0) > S.settings.socialLimit) out.add('social');
      if (e.gambled) out.add('gambling');
      if (e.fastFood) out.add('fastfood');
      if (e.soda) out.add('soda');
    }
    for (const t of txOn(k)) for (const h of HABITS) if (h.cat && t.cat === h.cat && t.type === 'out') out.add(h.id);
    for (const s of S.sos) if (s.date === k && s.result === 'slip') out.add(s.type);
    return out;
  });
}
function slipDays(hid) {
  const set = new Set();
  const keys = new Set([...Object.keys(S.days), ...S.tx.map((t) => t.date), ...S.sos.map((s) => s.date)]);
  for (const k of keys) if (slipsOn(k).has(hid)) set.add(k);
  return [...set].sort();
}
/** Clean-day streak = days since the last slip (or since you started). Includes today. */
export function habitStreak(hid) {
  return cached('streak:' + hid, () => {
    const start = S.profile?.created || today();
    const slips = slipDays(hid).filter((k) => k <= today());
    const last = slips[slips.length - 1];
    const current = Math.max(0, daysBetween(last || addDays(start, -1), today()));
    let best = current, prev = addDays(start, -1);
    for (const s of slips) { best = Math.max(best, daysBetween(prev, s) - 1); prev = s; }
    return { current, best: Math.max(0, best), slipsTotal: slips.length };
  });
}
export function checkinStreak() {
  return cached('checkinStreak', () => {
    let k = today(), n = 0;
    const has = (x) => S.days[x]?.morning || S.days[x]?.evening;
    if (!has(k)) k = addDays(k, -1);
    while (has(k)) { n++; k = addDays(k, -1); }
    return n;
  });
}

// ---------- Scores (0–100 per area per day) ----------
export function scores(k) {
  return cached('scores:' + k, () => {
    const d = S.days[k];
    if (!d || (!d.morning && !d.evening)) return null;
    const m = d.morning, e = d.evening, st = S.settings;
    const slips = slipsOn(k);
    const water = Math.min(1, (d.water || 0) / st.waterTarget);
    const ex = Math.min(1, (d.exercise || 0) / 30);
    const physical = ex * 40 + water * 30 + (e ? (slips.has('fastfood') ? 0 : 15) + (slips.has('soda') ? 0 : 15) : 0);
    const sh = sleepHours(m);
    const sleepPart = sh == null ? 0 : Math.max(0, 1 - Math.abs(sh - st.sleepTarget) / 4);
    const health = sleepPart * 35 + ((m?.sleepQ || 0) / 5) * 20 + hygRatio(d) * 45;
    const moods = [m?.mood, e?.mood].filter(Boolean);
    const mood = moods.length ? (avg(moods) - 1) / 4 : 0.5;
    const stress = e?.stress ? (5 - e.stress) / 4 : 0.5;
    const social = e ? ((e.socialMin || 0) <= st.socialLimit ? 1 : Math.max(0, 1 - ((e.socialMin || 0) - st.socialLimit) / 120)) : 0.5;
    const mental = mood * 35 + stress * 25 + social * 20 + (e ? (slips.has('gambling') ? 0 : 20) : 10);
    const pr = (m?.priorities || []).filter((p) => p.t && p.t.trim());
    const prR = pr.length ? pr.filter((p) => p.done).length / pr.length : 0;
    const career = prR * 50 + Math.min(1, (d.deepWork || 0) / 120) * 35 + (m?.goalAction?.trim() ? 15 : 0);
    const spent = spentOn(k), dailyBudget = st.budget / 30;
    const money = (spent <= dailyBudget ? 60 : (60 * dailyBudget) / spent) + (e ? 20 : 0) + (slips.has('gambling') ? 0 : 20);
    const eq = (e?.emotion ? 20 : 0) + (e?.eq?.trim() ? 30 : 0) + (m?.gratitude?.trim() ? 25 : 0) + ((e?.funny?.trim() || jokesOn(k)) ? 25 : 0);
    const r = { health, physical, mental, career, money, eq };
    for (const key in r) r[key] = Math.round(clamp(r[key]));
    r.overall = Math.round(avg(Object.values(r)));
    return r;
  });
}
export const rangeScores = (keys) => keys.map(scores).filter(Boolean);

// ---------- XP & levels ----------
export const XP = { checkin: 50, glass: 5, waterBonus: 10, hygItem: 3, priority: 10, exercise: 20, deepWork: 15, clean: 15, eq: 15, funny: 10, claim: 10, joke: 10, journal: 10, urge: 20, badge: 50, review: 100, focus: 5, quiz: 5 };
export function computeXP() {
  return cached('xp', () => {
    let xp = 0;
    const st = S.settings;
    for (const [k, d] of Object.entries(S.days)) {
      if (d.morning) xp += XP.checkin;
      if (d.evening) xp += XP.checkin;
      xp += Math.min(d.water || 0, st.waterTarget) * XP.glass + ((d.water || 0) >= st.waterTarget ? XP.waterBonus : 0);
      for (const l of ['hygAM', 'hygPM']) for (const it of st[l]) if (d[l]?.[it]) xp += XP.hygItem;
      xp += (d.morning?.priorities || []).filter((p) => p.done && p.t).length * XP.priority;
      if ((d.exercise || 0) >= 20) xp += XP.exercise;
      if ((d.deepWork || 0) >= 60) xp += XP.deepWork;
      if (d.evening) {
        const s = slipsOn(k);
        xp += HABITS.filter((h) => !s.has(h.id)).length * XP.clean;
        if (d.evening.eq?.trim()) xp += XP.eq;
        if (d.evening.funny?.trim()) xp += XP.funny;
      }
    }
    xp += sum(Object.values(S.claims)) * XP.claim;
    xp += S.jokes.length * XP.joke + S.journal.length * XP.journal;
    xp += S.sos.filter((s) => s.result === 'won').length * XP.urge;
    xp += Object.keys(S.badges).length * XP.badge;
    xp += Object.keys(S.reviews).length * XP.review;
    xp += S.focusLog.length * XP.focus;
    xp += sum(Object.values(S.chests).map((c) => c.xp || 0));
    xp += Object.values(S.quiz).filter(Boolean).length * XP.quiz;
    return xp;
  });
}
/** Level n needs 50·n·(n−1) XP: 0, 100, 300, 600, 1000, … */
export const levelOf = (xp) => Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
export const xpFor = (n) => 50 * n * (n - 1);
const TITLES = ['Spark', 'Ember', 'Flame', 'Torch', 'Lantern', 'Beacon', 'Lighthouse', 'Comet', 'Star', 'Sun'];
export const titleOf = (lvl) => TITLES[Math.min(TITLES.length - 1, Math.floor((lvl - 1) / 3))];

// ---------- Daily quests ----------
export function quests(k = today()) {
  const d = S.days[k] || {}, st = S.settings;
  const pr = (d.morning?.priorities || []).filter((p) => p.t?.trim());
  const prDone = pr.filter((p) => p.done).length;
  const slips = slipsOn(k);
  return [
    { id: 'morning', ic: '🌅', t: 'Morning check-in', done: !!d.morning, xp: 50, act: 'open-morning' },
    { id: 'water', ic: '💧', t: `Drink ${st.waterTarget} glasses of water (${d.water || 0}/${st.waterTarget})`, done: (d.water || 0) >= st.waterTarget, xp: st.waterTarget * 5 + 10 },
    { id: 'hygAM', ic: '🪥', t: 'Morning hygiene routine', done: hygRatio(d, 'hygAM') === 1, xp: st.hygAM.length * 3 },
    { id: 'prio', ic: '✅', t: pr.length ? `Finish your top priorities (${prDone}/${pr.length})` : 'Set & finish your top 3 priorities', done: pr.length > 0 && prDone === pr.length, xp: 30 },
    { id: 'move', ic: '🏃', t: `Move 20+ minutes (${d.exercise || 0} min)`, done: (d.exercise || 0) >= 20, xp: 20, act: 'log-exercise' },
    { id: 'focus', ic: '🧠', t: `Focused work 60+ min (${d.deepWork || 0} min)`, done: (d.deepWork || 0) >= 60, xp: 15, act: 'focus' },
    { id: 'joke', ic: '😂', t: 'Comedy rep: write one joke', done: jokesOn(k) > 0 || !!d.evening?.funny?.trim(), xp: 10, act: 'go-comedy' },
    { id: 'hygPM', ic: '🌙', t: 'Night hygiene routine', done: hygRatio(d, 'hygPM') === 1, xp: st.hygPM.length * 3 },
    { id: 'evening', ic: '📝', t: 'Evening check-in', done: !!d.evening, xp: 50, act: 'open-evening' },
    { id: 'clean', ic: '🛡️', t: 'Stay clean: no social binge, fast food, soda, gambling', done: !!d.evening && slips.size === 0, xp: 60 },
  ];
}

// ---------- Badges ----------
const daysTracked = () => Object.keys(S.days).length;
export const BADGES = [
  { id: 'first', ic: '🌅', n: 'First Light', d: 'Complete your first check-in', test: () => Object.values(S.days).some((d) => d.morning || d.evening) },
  { id: 'fullday', ic: '🌗', n: 'Full Circle', d: 'Morning + evening check-in in one day', test: () => Object.values(S.days).some((d) => d.morning && d.evening) },
  { id: 'streak3', ic: '🔥', n: 'On Fire', d: '3-day check-in streak', test: () => checkinStreak() >= 3 },
  { id: 'streak7', ic: '⚡', n: 'Unstoppable', d: '7-day check-in streak', test: () => checkinStreak() >= 7 },
  { id: 'streak30', ic: '🏆', n: 'Discipline', d: '30-day check-in streak', test: () => checkinStreak() >= 30 },
  { id: 'hydro7', ic: '💧', n: 'Hydrated', d: 'Hit your water goal on 7 days', test: () => Object.values(S.days).filter((d) => d.water >= S.settings.waterTarget).length >= 7 },
  { id: 'social7', ic: '📵', n: 'Free Mind', d: '7 days without a social media binge', test: () => daysTracked() >= 7 && habitStreak('social').current >= 7 },
  { id: 'social30', ic: '🕊️', n: 'Unhooked', d: '30 days social-media free', test: () => daysTracked() >= 30 && habitStreak('social').current >= 30 },
  { id: 'gamble30', ic: '🛡️', n: 'House Never Wins', d: '30 days gambling-free', test: () => daysTracked() >= 30 && habitStreak('gambling').current >= 30 },
  { id: 'clean14', ic: '🥗', n: 'Clean Fuel', d: '14 days without fast food or soda', test: () => daysTracked() >= 14 && Math.min(habitStreak('fastfood').current, habitStreak('soda').current) >= 14 },
  { id: 'focus10', ic: '⏱️', n: 'Deep Worker', d: 'Complete 10 focus sessions', test: () => S.focusLog.length >= 10 },
  { id: 'review4', ic: '🗓️', n: 'Self-Aware', d: 'Do 4 weekly reviews', test: () => Object.keys(S.reviews).length >= 4 },
  { id: 'joke10', ic: '🎤', n: 'Open Mic', d: 'Write 10 jokes', test: () => S.jokes.length >= 10 },
  { id: 'joke50', ic: '🎭', n: 'Headliner', d: 'Write 50 jokes', test: () => S.jokes.length >= 50 },
  { id: 'sos5', ic: '🌊', n: 'Urge Surfer', d: 'Beat 5 urges with the Urge button', test: () => S.sos.filter((s) => s.result === 'won').length >= 5 },
  { id: 'glow7', ic: '✨', n: 'Glow Up', d: 'Full hygiene (AM + PM) on 7 days', test: () => Object.values(S.days).filter((d) => hygRatio(d) === 1).length >= 7 },
  { id: 'money30', ic: '📒', n: 'Money Aware', d: 'Log 30 transactions', test: () => S.tx.length >= 30 },
  { id: 'saver', ic: '🏦', n: 'Goal Getter', d: 'Reach your savings goal', test: () => S.settings.savingsGoal > 0 && savedTotal() >= S.settings.savingsGoal },
  { id: 'journal5', ic: '📓', n: 'Deep Thinker', d: 'Write 5 journal entries', test: () => S.journal.length >= 5 },
  { id: 'lvl5', ic: '🔦', n: 'Torchbearer', d: 'Reach level 5', test: () => levelOf(computeXP()) >= 5 },
  { id: 'lvl10', ic: '🗼', n: 'Lighthouse', d: 'Reach level 10', test: () => levelOf(computeXP()) >= 10 },
];
/** Award any newly earned badges. Returns the newly earned ones (caller saves & celebrates). */
export function awardBadges() {
  const fresh = [];
  for (const b of BADGES) if (!S.badges[b.id] && b.test()) { S.badges[b.id] = today(); fresh.push(b); }
  return fresh;
}

// ---------- Rewards ----------
export const chestReady = (k = today()) => !!(S.days[k]?.morning && S.days[k]?.evening && !S.chests[k]);
/** Variable reward for completing both check-ins. `rand` is injectable for tests. */
export function rollChest(rand = Math.random) {
  const r = rand();
  const tier = r > 0.95 ? 'legendary' : r > 0.75 ? 'rare' : 'common';
  const xp = { common: 15, rare: 35, legendary: 100 }[tier] + Math.floor(rand() * 15);
  const pool = tier === 'common' ? C.jokes : C.wisdom;
  const it = pool[Math.floor(rand() * pool.length)];
  return { tier, xp, item: typeof it === 'string' ? it : `“${it.q}” — ${it.a}` };
}

// ---------- Weekly review ----------
export const reviewDue = (k = today()) => !S.reviews[weekStart(k)] && [0, 5, 6].includes(parseKey(k).getDay());
export function latestReview() {
  const ks = Object.keys(S.reviews).sort();
  return ks.length ? { week: ks[ks.length - 1], ...S.reviews[ks[ks.length - 1]] } : null;
}
export function weekSummary(end = today()) {
  const keys = lastN(7, end), prev = lastN(7, addDays(end, -7));
  const sc = keys.map((k) => ({ k, s: scores(k) })).filter((x) => x.s);
  const ps = rangeScores(prev);
  const best = sc.reduce((a, b) => (!a || b.s.overall > a.s.overall ? b : a), null);
  const wins = keys.map((k) => S.days[k]?.evening?.win).filter((w) => w && w.trim());
  const slips = Object.fromEntries(HABITS.map((h) => [h.id, keys.filter((k) => slipsOn(k).has(h.id)).length]));
  const sleeps = keys.map((k) => sleepHours(S.days[k]?.morning)).filter((x) => x != null);
  return {
    keys, tracked: sc.length,
    avg: sc.length ? Math.round(avg(sc.map((x) => x.s.overall))) : null,
    prevAvg: ps.length ? Math.round(avg(ps.map((s) => s.overall))) : null,
    best, wins, slips,
    sleep: sleeps.length ? round1(avg(sleeps)) : null,
    water: round1(avg(keys.map((k) => S.days[k]?.water || 0))),
    exercise: sum(keys.map((k) => S.days[k]?.exercise || 0)),
    focus: sum(keys.map((k) => S.days[k]?.deepWork || 0)),
    spent: sum(keys.map(spentOn)),
    jokes: S.jokes.filter((j) => keys.includes(j.date)).length,
  };
}

// ---------- Recommendations ----------
export function recommendations(h = new Date().getHours()) {
  const st = S.settings, k = today(), td = S.days[k] || {};
  const keys = lastN(7).filter((x) => S.days[x]);
  const ev = keys.map((x) => S.days[x].evening).filter(Boolean);
  const mo = keys.map((x) => S.days[x].morning).filter(Boolean);
  const out = [];
  const p1 = td.morning?.priorities?.find((p) => p.t?.trim() && !p.done);
  if (p1) out.push(['🎯', `Do “${esc(p1.t)}” first — start a 25-minute focus session and protect it.`]);
  if (!td.morning && h < 12) out.push(['🌅', 'Start with your 10-minute morning check-in. It sets the tone for the whole day.']);
  const expectedWater = Math.round((st.waterTarget * (Math.min(22, Math.max(7, h)) - 7)) / 15);
  if ((td.water || 0) < expectedWater) out.push(['💧', `You're behind on water (${td.water || 0}/${st.waterTarget}). Drink a glass right now.`]);
  if (h >= 9 && h < 18 && (td.deepWork || 0) < 30) out.push(['⏱️', 'No focused work logged yet today. One 25-minute session is enough to build momentum.']);
  if (ev.length) {
    const soc = avg(ev.map((e) => e.socialMin || 0));
    if (soc > st.socialLimit) out.push(['📵', `You averaged ${Math.round(soc)} min/day on social media. Move those apps off your home screen and log out — use the Light Feed when bored.`]);
    const ff = keys.filter((x) => slipsOn(x).has('fastfood')).length;
    if (ff >= 2) out.push(['🍔', `Fast food ${ff}× this week. Pack a snack (eggs, banana, nuts) before you leave so hunger can't decide for you.`]);
    const so = keys.filter((x) => slipsOn(x).has('soda')).length;
    if (so >= 2) out.push(['🥤', `Soda ${so}× this week. Swap to cold water with lemon or sparkling water — same fizz, none of the sugar crash.`]);
    if (keys.some((x) => slipsOn(x).has('gambling'))) out.push(['🎲', 'Gambling showed up this week. Block gambling sites/apps, ask your bank to block gambling transactions, and tell one person you trust. You don\'t have to do this alone.']);
    if (avg(keys.map((x) => S.days[x].exercise || 0)) < 15) out.push(['🏃', 'Movement is low this week. A 10-minute walk after lunch lifts mood, focus and skin glow.']);
    const moodAvg = avg(ev.map((e) => e.mood).filter(Boolean));
    if (moodAvg && moodAvg < 3) out.push(['🌤️', 'Your mood has been low. Get 10 minutes of sunlight and message one friend today. If it stays heavy, talk to someone you trust or a professional.']);
    if (avg(ev.map((e) => e.stress).filter(Boolean)) >= 3.8) out.push(['🫁', 'Stress is high. Try 4-6 breathing (in 4s, out 6s) for 2 minutes before your hardest task.']);
    if (ev.filter((e) => e.eq?.trim()).length < ev.length / 2) out.push(['❤️', 'Name your emotions 3 times today with exact words. It\'s the fastest way to grow emotional intelligence.']);
  }
  if (mo.length) {
    const sl = avg(mo.map(sleepHours).filter((x) => x != null));
    if (sl && sl < st.sleepTarget - 0.5) out.push(['😴', `You're averaging ${round1(sl)}h of sleep (goal ${st.sleepTarget}h). Charge your phone outside the bedroom from ${st.bedTime}.`]);
  }
  const missed = {};
  for (const x of keys) for (const l of ['hygAM', 'hygPM']) for (const it of st[l]) if (!S.days[x][l]?.[it]) missed[it] = (missed[it] || 0) + 1;
  const worst = Object.entries(missed).sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 3) out.push(['🪞', `You often skip “${esc(worst[0])}”. Pair it with something you never skip (like brushing teeth) so it sticks.`]);
  const dt = parseKey(k), dim = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  const { out: monthSpent } = monthTotals(k);
  if (st.budget && monthSpent > ((st.budget * dt.getDate()) / dim) * 1.1) out.push(['💰', `You've spent ${cur(monthSpent)} this month — ahead of your budget pace. Try a no-spend day tomorrow.`]);
  if (h >= 21) out.push(['🌙', 'It\'s wind-down time. Dim the lights, put the phone away and do your night routine. Tomorrow-you says thanks.']);
  const lr = latestReview();
  if (lr?.nextWeek && weekStart(k) > lr.week) out.push(['🗓️', `Your commitment this week: “${esc(lr.nextWeek)}”.`]);
  if (out.length < 3) {
    out.push(['✨', esc(daily(C.challenges, 3))]);
    out.push(['😂', `Comedy practice: ${esc(daily(C.comedy).p)}`]);
  }
  return out.slice(0, 5);
}

// ---------- Projection ("Future You") ----------
export function projection() {
  const keys = lastN(30);
  const tracked = keys.filter((k) => scores(k));
  if (tracked.length < 3) return { need: 3, have: tracked.length };
  const st = S.settings;
  const rows = DOMAINS.map((d) => {
    const ys = keys.map((k) => scores(k)?.[d.id] ?? null);
    const now = Math.round(avg(ys.filter((y) => y != null).slice(-7)));
    // Habits compound but plateau: follow the trend for ~60 days of change, capped, then hold.
    const proj = Math.round(clamp(now + clamp(slope(ys) * 60, -30, 30)));
    return { d, now, proj };
  });
  const projOverall = Math.round(avg(rows.map((r) => r.proj)));
  const nowOverall = Math.round(avg(rows.map((r) => r.now)));
  const persona = projOverall >= 80 ? ['🗼', 'The Lighthouse', 'Disciplined, healthy, financially steady, funny and emotionally strong. People come to you for calm and laughs.']
    : projOverall >= 65 ? ['🌟', 'The Rising Star', 'Clearly better than today: more energy, more savings, stronger habits. A few areas still need your attention.']
    : projOverall >= 50 ? ['🔦', 'The Torchbearer', 'Holding steady. You\'ll keep what you have — but the life you want needs a little more consistency.']
    : ['🕯️', 'The Flickering Flame', 'If nothing changes, next year looks like this year. The good news: one week of check-ins can change this projection.'];

  const dayObjs = keys.map((k) => S.days[k]).filter(Boolean);
  const n = Math.max(1, tracked.length);
  const exMin = sum(dayObjs.map((d) => d.exercise || 0)) / n;
  const water = sum(dayObjs.map((d) => d.water || 0)) / n;
  const focus = sum(dayObjs.map((d) => d.deepWork || 0)) / n;
  const socialArr = dayObjs.map((d) => d.evening?.socialMin).filter((x) => x != null);
  const spentPerDay = sum(keys.map(spentOn)) / 30;
  const keySet = new Set(keys);
  const badSpend = sum(S.tx.filter((t) => keySet.has(t.date) && t.type === 'out' && BAD_CATS.includes(t.cat)).map((t) => +t.amount));
  const savedPerDay = sum(S.tx.filter((t) => keySet.has(t.date) && t.type === 'save').map((t) => +t.amount)) / 30;
  const jokeRate = S.jokes.filter((j) => keySet.has(j.date)).length / n;
  const weights = keys.map((k) => S.days[k]?.morning?.weight || null);
  const wNow = weights.filter(Boolean).slice(-1)[0];

  const facts = [
    ['🧠', `${Math.round((focus * 365) / 60)} hours of focused work on your goals`],
    ['💪', `${Math.round((exMin * 365) / 60)} hours of exercise`],
    ['💧', `${Math.round(water * 0.25 * 365)} liters of water`],
    ['😂', `${Math.round(jokeRate * 365)} jokes written`],
    ['💸', `${cur(Math.round(spentPerDay * 365))} spent at your current pace`],
  ];
  if (savedPerDay > 0) facts.push(['🏦', `${cur(Math.round(savedPerDay * 365))} saved`]);
  if (badSpend > 0) facts.push(['🚫', `${cur(Math.round((badSpend / 30) * 365))} saved per year by quitting fast food, soda & gambling`]);
  if (socialArr.length) { const s = avg(socialArr); facts.push(['📵', `${Math.round((s * 365) / 60)} hours on social media (${Math.round((s * 365) / 60 / 24)} full days)`]); }
  if (weights.filter(Boolean).length >= 3 && wNow) {
    const ws = slope(weights);
    const delta = clamp(ws * 180, -10, 10); // trend for ~6 months, then plateau
    facts.push(['⚖️', `Weight trend: ${ws > 0 ? '+' : ''}${round1(ws * 30)} ${st.weightUnit}/month → about ${round1(wNow + delta)} ${st.weightUnit} in a year`]);
  }
  return { rows, projOverall, nowOverall, persona, facts };
}

// ---------- Insights ("Know yourself") ----------
export function insights(keys) {
  const days = keys.map((k) => ({ k, d: S.days[k] })).filter((x) => x.d);
  const lines = [];
  const slipCounts = HABITS.map((h) => ({ h, n: keys.filter((k) => slipsOn(k).has(h.id)).length }));
  const wd = Array(7).fill(0);
  for (const k of keys) wd[parseKey(k).getDay()] += slipsOn(k).size;
  const wdMax = Math.max(...wd);
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (wdMax > 0) lines.push(`📅 Your hardest day is <strong>${names[wd.indexOf(wdMax)]}</strong> — most slips happen then. Plan something healthy for that day in advance.`);
  const withE = days.filter((x) => x.d.evening);
  const split = (pred, metric) => {
    const a = withE.filter(pred).map(metric).filter((v) => v != null), b = withE.filter((x) => !pred(x)).map(metric).filter((v) => v != null);
    return a.length >= 2 && b.length >= 2 ? [avg(a), avg(b)] : null;
  };
  const lowSleep = (x) => { const h = sleepHours(x.d.morning); return h != null && h < S.settings.sleepTarget - 1; };
  let r = split(lowSleep, (x) => x.d.evening.socialMin || 0);
  if (r && r[0] > r[1] * 1.3 && r[0] - r[1] > 10) lines.push(`😴→📱 On short-sleep days you spend <strong>${Math.round(r[0])} min</strong> on social media vs ${Math.round(r[1])} min when rested. Sleep protects your discipline.`);
  r = split((x) => (x.d.exercise || 0) >= 20, (x) => x.d.evening.mood);
  if (r && r[0] - r[1] >= 0.4) lines.push(`🏃→🙂 Your mood is <strong>${round1(r[0] - r[1])} points higher</strong> on days you exercise. Movement is your natural antidepressant.`);
  r = split(lowSleep, (x) => x.d.evening.mood);
  if (r && r[1] - r[0] >= 0.4) lines.push(`😴→😞 Your mood drops ${round1(r[1] - r[0])} points after short nights.`);
  r = split((x) => (x.d.deepWork || 0) >= 60, (x) => x.d.evening.mood);
  if (r && r[0] - r[1] >= 0.4) lines.push(`🧠→🙂 Productive days make you happier: mood is ${round1(r[0] - r[1])} points higher after 60+ focused minutes.`);
  r = split((x) => slipsOn(x.k).has('fastfood'), (x) => spentOn(x.k));
  if (r && r[0] > r[1] * 1.2) lines.push(`🍔→💸 You spend <strong>${cur(Math.round(r[0] - r[1]))} more</strong> on fast-food days.`);
  r = split((x) => (x.d.evening.stress || 0) >= 4, (x) => slipsOn(x.k).size);
  if (r && r[0] - r[1] >= 0.5) lines.push(`😫→🚨 Stressful days lead to more slips (${round1(r[0])} vs ${round1(r[1])}). When stress is high, use the Urge button early.`);
  const emo = {};
  for (const x of withE) if (x.d.evening.emotion) emo[x.d.evening.emotion] = (emo[x.d.evening.emotion] || 0) + 1;
  const topE = Object.entries(emo).sort((a, b) => b[1] - a[1])[0];
  if (topE) lines.push(`❤️ Your most frequent strong emotion lately: <strong>${esc(topE[0])}</strong> (${topE[1]}×). Ask yourself what it's trying to tell you.`);
  const sos = S.sos.filter((s) => keys.includes(s.date));
  if (sos.length) {
    const won = sos.filter((s) => s.result === 'won').length;
    const hours = sos.map((s) => +String(s.t || '').split(':')[0]).filter((x) => !isNaN(x));
    const lateShare = hours.length ? hours.filter((x) => x >= 21 || x < 3).length / hours.length : 0;
    lines.push(`🌊 You used the Urge button ${sos.length}× and beat the urge <strong>${won}</strong> time${won === 1 ? '' : 's'} (${Math.round((won / sos.length) * 100)}%).`);
    if (hours.length >= 3 && lateShare >= 0.6) lines.push(`🌃 ${Math.round(lateShare * 100)}% of your urges hit after 9 PM. Make nights the time your phone charges outside the bedroom.`);
  }
  if (!lines.length) lines.push('Keep checking in — after about a week, Light will start spotting patterns in your habits, sleep, mood and spending.');
  return { slipCounts, lines };
}

// ---------- Calendar reminders (.ics) ----------
/** Build an iCalendar file with daily check-in reminders + a weekly review. Works with Google, Apple and Outlook calendars. */
export function buildICS({ wakeTime, bedTime }, startKey = today(), url = '') {
  const date = startKey.replace(/-/g, '');
  const at = (mins) => `${date}T${hhmm(mins).replace(':', '')}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const morning = minutesOf(wakeTime) + 15, evening = minutesOf(bedTime) - 60;
  // First Sunday on/after start for the weekly review.
  let sun = startKey; while (parseKey(sun).getDay() !== 0) sun = addDays(sun, 1);
  const ev = (id, start, title, desc, rule) => [
    'BEGIN:VEVENT', `UID:light-${id}@light.app`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, 'DURATION:PT10M',
    `RRULE:${rule}`, `SUMMARY:${title}`, `DESCRIPTION:${desc}${url ? '\\n' + url : ''}`, url ? `URL:${url}` : null,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT',
  ].filter(Boolean);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Light//Daily Guide//EN', 'CALSCALE:GREGORIAN',
    ...ev('morning', at(morning), '🌅 Light: morning check-in', '10 minutes to set up a great day.', 'FREQ=DAILY'),
    ...ev('evening', at(evening), '🌙 Light: evening check-in', 'Close the day honestly. 10 minutes.', 'FREQ=DAILY'),
    ...ev('weekly', `${sun.replace(/-/g, '')}T180000`, '🗓️ Light: weekly review', 'See your week, update goals, pick one thing to improve.', 'FREQ=WEEKLY;BYDAY=SU'),
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Keys for a GitHub-style heatmap: `weeks` columns ending this week, Monday-first. */
export function heatmapKeys(weeks = 26, end = today()) {
  const start = addDays(weekStart(end), -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}
export { dkey };
