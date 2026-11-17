/* Light — all-in-one daily life app. Vanilla JS, offline, data stored on this device. */
(() => {
  'use strict';
  const C = window.LIGHT_CONTENT;
  const KEY = 'light.v1';

  // ---------- Utilities ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
  const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
  // The "day" rolls over at 3 AM so a late evening check-in still counts for that day.
  const today = () => dkey(new Date(Date.now() - 3 * 3600e3));
  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const dayNum = () => Math.floor(parseKey(today()).getTime() / 864e5);
  const daily = (arr, off = 0) => arr[(((dayNum() + off) % arr.length) + arr.length) % arr.length];
  const hour = () => new Date().getHours();
  const lastN = (n, end = today()) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
  const fmtDate = (k, o = { weekday: 'short', month: 'short', day: 'numeric' }) => parseKey(k).toLocaleDateString(undefined, o);
  const round1 = (n) => Math.round(n * 10) / 10;

  // ---------- State ----------
  const DEFAULTS = () => ({
    v: 1,
    profile: null,
    settings: {
      currency: '₱', waterTarget: 8, sleepTarget: 8, bedTime: '22:30', wakeTime: '06:30', budget: 15000,
      socialLimit: 15, weightUnit: 'kg',
      hygAM: ['Brush teeth', 'Wash face', 'Shower', 'Sunscreen', 'Deodorant', 'Groom hair'],
      hygPM: ['Wash face', 'Brush teeth', 'Floss', 'Moisturize', 'Lay out tomorrow\'s clothes', 'Screens off 30 min before bed'],
    },
    days: {}, tx: [], jokes: [], journal: [], saved: [], badges: {}, claims: {}, sos: [],
  });
  let S = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && typeof raw === 'object') {
        const d = DEFAULTS();
        return { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } };
      }
    } catch (e) { /* fall through */ }
    return DEFAULTS();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('⚠️ Could not save — storage may be full or blocked.'); }
  }
  function day(k = today()) {
    if (!S.days[k]) S.days[k] = { water: 0, exercise: 0, deepWork: 0, hygAM: {}, hygPM: {}, morning: null, evening: null };
    return S.days[k];
  }
  const cur = (n) => S.settings.currency + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const firstName = () => (S.profile?.name || 'friend').split(' ')[0];

  // ---------- Domain helpers ----------
  const DOMAINS = [
    { id: 'health', name: 'Health & Sleep', ic: '😴', color: 'var(--blue)', hex: '#6ea8ff' },
    { id: 'physical', name: 'Physical', ic: '💪', color: 'var(--good)', hex: '#3ddc97' },
    { id: 'mental', name: 'Mental', ic: '🧠', color: 'var(--violet)', hex: '#b48cff' },
    { id: 'career', name: 'Career', ic: '🎯', color: 'var(--gold)', hex: '#ffd166' },
    { id: 'money', name: 'Money', ic: '💰', color: 'var(--amber)', hex: '#ff9f43' },
    { id: 'eq', name: 'EQ & Joy', ic: '❤️', color: 'var(--pink)', hex: '#ff7eb6' },
  ];
  const HABITS = [
    { id: 'social', name: 'Social media', ic: '📵', cat: null },
    { id: 'gambling', name: 'Gambling', ic: '🎲', cat: 'gambling' },
    { id: 'fastfood', name: 'Fast food', ic: '🍔', cat: 'fastfood' },
    { id: 'soda', name: 'Soft drinks', ic: '🥤', cat: 'soda' },
  ];
  const CATS_OUT = [
    ['food', '🍚', 'Food'], ['fastfood', '🍔', 'Fast food'], ['soda', '🥤', 'Soda/sweet drinks'], ['transport', '🚌', 'Transport'],
    ['bills', '💡', 'Bills'], ['shopping', '🛍️', 'Shopping'], ['fun', '🎮', 'Fun'], ['health', '💊', 'Health'],
    ['family', '👨‍👩‍👧', 'Family'], ['learning', '📚', 'Learning'], ['gambling', '🎲', 'Gambling'], ['other', '📦', 'Other'],
  ];
  const CATS_IN = [['salary', '💼', 'Salary'], ['side', '💰', 'Side income'], ['gift', '🎁', 'Gift'], ['otherin', '➕', 'Other']];
  const catInfo = (id) => [...CATS_OUT, ...CATS_IN].find((c) => c[0] === id) || ['other', '📦', 'Other'];

  const sleepHours = (m) => {
    if (!m || !m.bed || !m.wake) return null;
    const [bh, bm] = m.bed.split(':').map(Number), [wh, wm] = m.wake.split(':').map(Number);
    return round1((((wh * 60 + wm) - (bh * 60 + bm) + 1440) % 1440) / 60);
  };
  const hygRatio = (d, which) => {
    const lists = which ? [which] : ['hygAM', 'hygPM'];
    let n = 0, done = 0;
    for (const l of lists) for (const it of S.settings[l]) { n++; if (d?.[l]?.[it]) done++; }
    return n ? done / n : 0;
  };
  const txOn = (k) => S.tx.filter((t) => t.date === k);
  const spentOn = (k) => sum(txOn(k).filter((t) => t.type === 'out').map((t) => +t.amount));
  const jokesOn = (k) => S.jokes.filter((j) => j.date === k).length;

  function slipsOn(k) {
    const out = new Set();
    const e = S.days[k]?.evening;
    if (e) {
      if (e.socialMin > S.settings.socialLimit) out.add('social');
      if (e.gambled) out.add('gambling');
      if (e.fastFood) out.add('fastfood');
      if (e.soda) out.add('soda');
    }
    for (const t of txOn(k)) for (const h of HABITS) if (h.cat && t.cat === h.cat) out.add(h.id);
    for (const s of S.sos) if (s.date === k && s.result === 'slip') out.add(s.type);
    return out;
  }
  function allSlipDays(hid) {
    const set = new Set();
    for (const k of Object.keys(S.days)) if (slipsOn(k).has(hid)) set.add(k);
    for (const t of S.tx) if (HABITS.find((h) => h.id === hid)?.cat === t.cat) set.add(t.date);
    for (const s of S.sos) if (s.type === hid && s.result === 'slip') set.add(s.date);
    return [...set].sort();
  }
  function habitStreak(hid) {
    const start = S.profile?.created || today();
    const slips = allSlipDays(hid).filter((k) => k <= today());
    const last = slips[slips.length - 1];
    const current = daysBetween(last || addDays(start, -1), today());
    let best = current, prev = addDays(start, -1);
    for (const s of slips) { best = Math.max(best, daysBetween(prev, s) - 1); prev = s; }
    return { current: Math.max(0, current), best: Math.max(0, best), slipsTotal: slips.length };
  }
  function checkinStreak() {
    let k = today(), n = 0;
    const has = (x) => S.days[x]?.morning || S.days[x]?.evening;
    if (!has(k)) k = addDays(k, -1);
    while (has(k)) { n++; k = addDays(k, -1); }
    return n;
  }

  // ---------- Scores (0–100 per domain per day) ----------
  function scores(k) {
    const d = S.days[k];
    if (!d || (!d.morning && !d.evening)) return null;
    const m = d.morning, e = d.evening, st = S.settings;
    const water = Math.min(1, (d.water || 0) / st.waterTarget);
    const ex = Math.min(1, (d.exercise || 0) / 30);
    const slips = slipsOn(k);
    const physical = ex * 40 + water * 30 + (e ? (slips.has('fastfood') ? 0 : 15) + (slips.has('soda') ? 0 : 15) : 0);
    const sh = sleepHours(m);
    const sleepPart = sh == null ? 0 : Math.max(0, 1 - Math.abs(sh - st.sleepTarget) / 4);
    const health = sleepPart * 35 + ((m?.sleepQ || 0) / 5) * 20 + hygRatio(d) * 45;
    const moods = [m?.mood, e?.mood].filter(Boolean);
    const mood = moods.length ? (avg(moods) - 1) / 4 : 0.5;
    const stress = e?.stress ? (5 - e.stress) / 4 : 0.5;
    const social = e ? (e.socialMin <= st.socialLimit ? 1 : Math.max(0, 1 - (e.socialMin - st.socialLimit) / 120)) : 0.5;
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
  }
  function rangeScores(keys) {
    return keys.map((k) => scores(k)).filter(Boolean);
  }

  // ---------- XP & Levels ----------
  function computeXP() {
    let xp = 0;
    const st = S.settings;
    for (const [k, d] of Object.entries(S.days)) {
      if (d.morning) xp += 50;
      if (d.evening) xp += 50;
      xp += Math.min(d.water || 0, st.waterTarget) * 5 + ((d.water || 0) >= st.waterTarget ? 10 : 0);
      for (const l of ['hygAM', 'hygPM']) for (const it of st[l]) if (d[l]?.[it]) xp += 3;
      xp += (d.morning?.priorities || []).filter((p) => p.done && p.t).length * 10;
      if ((d.exercise || 0) >= 20) xp += 20;
      if ((d.deepWork || 0) >= 60) xp += 15;
      if (d.evening) {
        const s = slipsOn(k);
        xp += HABITS.filter((h) => !s.has(h.id)).length * 15;
        if (d.evening.eq?.trim()) xp += 15;
        if (d.evening.funny?.trim()) xp += 10;
      }
    }
    xp += sum(Object.values(S.claims)) * 10;
    xp += S.jokes.length * 10 + S.journal.length * 10;
    xp += S.sos.filter((s) => s.result === 'won').length * 20;
    xp += Object.keys(S.badges).length * 50;
    return xp;
  }
  const levelOf = (xp) => Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
  const xpFor = (n) => 50 * n * (n - 1);
  const TITLES = ['Spark', 'Ember', 'Flame', 'Torch', 'Lantern', 'Beacon', 'Lighthouse', 'Comet', 'Star', 'Sun'];
  const titleOf = (lvl) => TITLES[Math.min(TITLES.length - 1, Math.floor((lvl - 1) / 3))];

  // ---------- Quests ----------
  function quests() {
    const k = today(), d = S.days[k] || {}, st = S.settings;
    const pr = (d.morning?.priorities || []).filter((p) => p.t?.trim());
    const prDone = pr.filter((p) => p.done).length;
    const slips = slipsOn(k);
    return [
      { ic: '🌅', t: 'Morning check-in', done: !!d.morning, xp: 50, act: 'open-morning' },
      { ic: '💧', t: `Drink ${st.waterTarget} glasses of water (${d.water || 0}/${st.waterTarget})`, done: (d.water || 0) >= st.waterTarget, xp: st.waterTarget * 5 + 10 },
      { ic: '🪥', t: 'Morning hygiene routine', done: hygRatio(d, 'hygAM') === 1, xp: st.hygAM.length * 3 },
      { ic: '✅', t: pr.length ? `Finish your top priorities (${prDone}/${pr.length})` : 'Set & finish your top 3 priorities', done: pr.length > 0 && prDone === pr.length, xp: 30 },
      { ic: '🏃', t: `Move 20+ minutes (${d.exercise || 0} min)`, done: (d.exercise || 0) >= 20, xp: 20, act: 'log-exercise' },
      { ic: '🧠', t: `Focused work 60+ min (${d.deepWork || 0} min)`, done: (d.deepWork || 0) >= 60, xp: 15, act: 'log-deepwork' },
      { ic: '😂', t: 'Comedy rep: write one joke', done: jokesOn(k) > 0 || !!d.evening?.funny?.trim(), xp: 10, act: 'go-comedy' },
      { ic: '🌙', t: 'Night hygiene routine', done: hygRatio(d, 'hygPM') === 1, xp: st.hygPM.length * 3 },
      { ic: '📝', t: 'Evening check-in', done: !!d.evening, xp: 50, act: 'open-evening' },
      { ic: '🛡️', t: 'Stay clean: no social binge, fast food, soda, gambling', done: !!d.evening && slips.size === 0, xp: 60 },
    ];
  }

  // ---------- Badges ----------
  const BADGES = [
    { id: 'first', ic: '🌅', n: 'First Light', d: 'Complete your first check-in', test: () => Object.values(S.days).some((d) => d.morning || d.evening) },
    { id: 'fullday', ic: '🌗', n: 'Full Circle', d: 'Morning + evening check-in in one day', test: () => Object.values(S.days).some((d) => d.morning && d.evening) },
    { id: 'streak3', ic: '🔥', n: 'On Fire', d: '3-day check-in streak', test: () => checkinStreak() >= 3 },
    { id: 'streak7', ic: '⚡', n: 'Unstoppable', d: '7-day check-in streak', test: () => checkinStreak() >= 7 },
    { id: 'streak30', ic: '🏆', n: 'Discipline', d: '30-day check-in streak', test: () => checkinStreak() >= 30 },
    { id: 'hydro7', ic: '💧', n: 'Hydrated', d: 'Hit your water goal on 7 days', test: () => Object.values(S.days).filter((d) => d.water >= S.settings.waterTarget).length >= 7 },
    { id: 'social7', ic: '📵', n: 'Free Mind', d: '7 days without a social media binge', test: () => habitStreak('social').current >= 7 && Object.keys(S.days).length >= 7 },
    { id: 'social30', ic: '🕊️', n: 'Unhooked', d: '30 days social-media free', test: () => habitStreak('social').current >= 30 && Object.keys(S.days).length >= 30 },
    { id: 'gamble30', ic: '🛡️', n: 'House Never Wins', d: '30 days gambling-free', test: () => habitStreak('gambling').current >= 30 && Object.keys(S.days).length >= 30 },
    { id: 'clean14', ic: '🥗', n: 'Clean Fuel', d: '14 days without fast food or soda', test: () => Math.min(habitStreak('fastfood').current, habitStreak('soda').current) >= 14 && Object.keys(S.days).length >= 14 },
    { id: 'joke10', ic: '🎤', n: 'Open Mic', d: 'Write 10 jokes', test: () => S.jokes.length >= 10 },
    { id: 'joke50', ic: '🎭', n: 'Headliner', d: 'Write 50 jokes', test: () => S.jokes.length >= 50 },
    { id: 'sos5', ic: '🌊', n: 'Urge Surfer', d: 'Beat 5 urges with the Urge button', test: () => S.sos.filter((s) => s.result === 'won').length >= 5 },
    { id: 'glow7', ic: '✨', n: 'Glow Up', d: 'Full hygiene (AM + PM) on 7 days', test: () => Object.values(S.days).filter((d) => hygRatio(d) === 1).length >= 7 },
    { id: 'money30', ic: '📒', n: 'Money Aware', d: 'Log 30 transactions', test: () => S.tx.length >= 30 },
    { id: 'journal5', ic: '📓', n: 'Deep Thinker', d: 'Write 5 journal entries', test: () => S.journal.length >= 5 },
    { id: 'lvl5', ic: '🔦', n: 'Torchbearer', d: 'Reach level 5', test: () => levelOf(computeXP()) >= 5 },
    { id: 'lvl10', ic: '🗼', n: 'Lighthouse', d: 'Reach level 10', test: () => levelOf(computeXP()) >= 10 },
  ];
  function checkBadges() {
    let got = null;
    for (const b of BADGES) if (!S.badges[b.id] && b.test()) { S.badges[b.id] = today(); got = b; }
    if (got) { save(); setTimeout(() => { toast(`🏅 Badge unlocked: ${got.ic} ${got.n}`); burst(); }, 400); }
  }

  // ---------- Recommendations ----------
  function recommendations() {
    const st = S.settings, k = today(), td = S.days[k] || {};
    const keys = lastN(7).filter((x) => S.days[x]);
    const ev = keys.map((x) => S.days[x].evening).filter(Boolean);
    const mo = keys.map((x) => S.days[x].morning).filter(Boolean);
    const out = [];
    const p1 = td.morning?.priorities?.find((p) => p.t?.trim() && !p.done);
    if (p1) out.push(['🎯', `Do “${esc(p1.t)}” before noon — momentum beats motivation.`]);
    if (!td.morning && hour() < 12) out.push(['🌅', 'Start with your 10-minute morning check-in. It sets the tone for the whole day.']);
    const expectedWater = Math.round((st.waterTarget * Math.min(22, Math.max(7, hour())) - 7 * st.waterTarget) / 15);
    if ((td.water || 0) < expectedWater) out.push(['💧', `You're behind on water (${td.water || 0}/${st.waterTarget}). Drink a glass right now.`]);
    if (ev.length) {
      const soc = avg(ev.map((e) => e.socialMin || 0));
      if (soc > st.socialLimit) out.push(['📵', `You averaged ${Math.round(soc)} min/day on social media. Move those apps off your home screen and log out — use the Light Feed when bored.`]);
      const ff = keys.filter((x) => slipsOn(x).has('fastfood')).length;
      if (ff >= 2) out.push(['🍔', `Fast food ${ff}× this week. Pack a snack (eggs, banana, nuts) before you leave so hunger can't decide for you.`]);
      const so = keys.filter((x) => slipsOn(x).has('soda')).length;
      if (so >= 2) out.push(['🥤', `Soda ${so}× this week. Swap to cold water with lemon or sparkling water — same fizz, none of the sugar crash.`]);
      if (keys.some((x) => slipsOn(x).has('gambling'))) out.push(['🎲', 'Gambling showed up this week. Block gambling sites/apps, ask your bank to block gambling transactions, and tell one person you trust. You don\'t have to do this alone.']);
      const exAvg = avg(keys.map((x) => S.days[x].exercise || 0));
      if (exAvg < 15) out.push(['🏃', 'Movement is low this week. A 10-minute walk after lunch lifts mood, focus and skin glow.']);
      const moodAvg = avg(ev.map((e) => e.mood).filter(Boolean));
      if (moodAvg && moodAvg < 3) out.push(['🌤️', 'Your mood has been low. Get 10 minutes of sunlight and message one friend today. If it stays heavy, talk to someone you trust or a professional.']);
      const stressAvg = avg(ev.map((e) => e.stress).filter(Boolean));
      if (stressAvg >= 3.8) out.push(['🫁', 'Stress is high. Try 4-6 breathing (in 4s, out 6s) for 2 minutes before your hardest task.']);
      if (ev.filter((e) => e.eq?.trim()).length < ev.length / 2) out.push(['❤️', 'Name your emotions 3 times today with exact words. It\'s the fastest way to grow emotional intelligence.']);
    }
    if (mo.length) {
      const sl = avg(mo.map(sleepHours).filter((x) => x != null));
      if (sl && sl < st.sleepTarget - 0.5) out.push(['😴', `You're averaging ${round1(sl)}h of sleep (goal ${st.sleepTarget}h). Put your phone to charge outside the bedroom at ${st.bedTime}.`]);
    }
    const missed = {};
    for (const x of keys) for (const l of ['hygAM', 'hygPM']) for (const it of st[l]) if (!S.days[x][l]?.[it]) missed[it] = (missed[it] || 0) + 1;
    const worst = Object.entries(missed).sort((a, b) => b[1] - a[1])[0];
    if (worst && worst[1] >= 3) out.push(['🪞', `You often skip “${esc(worst[0])}”. Pair it with something you never skip (like brushing teeth) so it sticks.`]);
    const monthKey = k.slice(0, 7);
    const monthSpent = sum(S.tx.filter((t) => t.type === 'out' && t.date.startsWith(monthKey)).map((t) => +t.amount));
    const dom = parseKey(k).getDate(), dim = new Date(parseKey(k).getFullYear(), parseKey(k).getMonth() + 1, 0).getDate();
    if (monthSpent > (st.budget * dom) / dim * 1.1) out.push(['💰', `You've spent ${cur(monthSpent)} this month — ahead of your budget pace. Try a no-spend day tomorrow.`]);
    if (hour() >= 21) out.push(['🌙', 'It\'s wind-down time. Dim the lights, put the phone away and do your night routine. Tomorrow-you says thanks.']);
    if (out.length < 3) {
      out.push(['✨', daily(C.challenges, 3)]);
      out.push(['😂', `Comedy practice: ${daily(C.comedy).p}`]);
    }
    return out.slice(0, 5);
  }

  // ---------- Views ----------
  const UI = { tab: 'today', range: 30, domain: 'overall', grow: 'comedy', hyg: null, mType: 'out', mCat: 'food' };
  const TABS = [['today', '☀️', 'Today'], ['money', '💰', 'Money'], ['feed', '✨', 'Feed'], ['stats', '📊', 'Stats'], ['grow', '🌱', 'Grow']];

  function render() {
    const nav = $('#nav'), view = $('#view');
    if (!S.profile) {
      nav.innerHTML = ''; nav.classList.add('hide'); $('#sos').classList.add('hide');
      view.innerHTML = viewOnboard();
      return;
    }
    nav.classList.remove('hide'); $('#sos').classList.remove('hide');
    nav.innerHTML = `<img class="nav-logo" src="icons/icon.svg" alt="">` + TABS.map(([id, ic, n]) =>
      `<button class="nav-btn ${UI.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}"><span class="ic">${ic}</span>${n}</button>`).join('');
    const views = { today: viewToday, money: viewMoney, feed: viewFeed, stats: viewStats, grow: viewGrow };
    view.innerHTML = views[UI.tab]();
    if (UI.tab === 'feed') feedInit();
  }

  function ring(pct, color, size = 64, stroke = 7, inner = '') {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - clamp(pct) / 100);
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .6s"/>
      ${inner ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="var(--text)" font-size="${size / 4.2}" font-weight="700">${inner}</text>` : ''}
    </svg>`;
  }

  // ----- Onboarding -----
  function viewOnboard() {
    return `<div class="onboard stack">
      <div class="orb-wrap"><div class="orb"></div></div>
      <h1 class="center">Welcome to Light</h1>
      <p class="center muted">Your daily guide for focus, health, money, character and joy. 10 minutes in the morning, 10 at night. Everything stays private on this device.</p>
      <div class="card stack">
        <div><label class="lbl">What should I call you?</label><input type="text" id="ob-name" placeholder="Your name" autocomplete="given-name"></div>
        <div><label class="lbl">Your 3 biggest goals for this year</label>
          <input type="text" id="ob-g1" placeholder="e.g. Get promoted / land a better job">
          <input type="text" id="ob-g2" placeholder="e.g. Lose 8 kg and get fit" style="margin-top:8px">
          <input type="text" id="ob-g3" placeholder="e.g. Save 50,000 and stop gambling" style="margin-top:8px"></div>
        <div><label class="lbl">Why do these goals matter to you? (you'll see this when urges hit)</label>
          <textarea id="ob-why" placeholder="e.g. I want my family to be proud. I want to feel free and confident."></textarea></div>
        <div class="grid">
          <div><label class="lbl">Currency symbol</label><input type="text" id="ob-cur" value="${esc(S.settings.currency)}" maxlength="4"></div>
          <div><label class="lbl">Monthly spending budget</label><input type="number" id="ob-budget" value="${S.settings.budget}" min="0" inputmode="decimal"></div>
          <div><label class="lbl">Usual bedtime</label><input type="time" id="ob-bed" value="${S.settings.bedTime}"></div>
          <div><label class="lbl">Usual wake time</label><input type="time" id="ob-wake" value="${S.settings.wakeTime}"></div>
        </div>
        <button class="btn primary block" data-act="onboard">Begin my journey ✨</button>
      </div>
    </div>`;
  }

  // ----- Today -----
  function viewToday() {
    const k = today(), d = S.days[k] || {}, st = S.settings;
    const xp = computeXP(), lvl = levelOf(xp), lo = xpFor(lvl), hi = xpFor(lvl + 1);
    const q = quests(), qd = q.filter((x) => x.done).length, pct = Math.round((qd / q.length) * 100);
    const h = hour();
    const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const w = daily(C.wisdom), lesson = daily(C.eq, 1), glow = daily(C.glow.do, 2), avoid = daily(C.glow.avoid, 5);
    const goals = S.profile.goals.filter(Boolean);
    const pr = (d.morning?.priorities || []).map((p, i) => ({ ...p, i })).filter((p) => p.t?.trim());
    const hygTab = UI.hyg || (h < 15 ? 'hygAM' : 'hygPM');
    const showEveningBanner = h >= 18 && !d.evening;

    return `
    <div class="row between">
      <div><div class="muted small">${fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>${greet}, ${esc(firstName())}</h1></div>
      <button class="icon-btn" data-act="settings" aria-label="Settings">⚙️</button>
    </div>

    <div class="card hero" style="margin-top:14px">
      <div class="orb-wrap"><div class="orb" style="opacity:${0.45 + pct / 180}"></div>
        <div class="orb-ring">${ring(pct, 'var(--gold)', 120, 6)}</div><div class="orb-num">${pct}%</div></div>
      <div class="grow">
        <div class="row between"><strong>Level ${lvl} · ${titleOf(lvl)}</strong><span class="pill gold">🔥 ${checkinStreak()} day${checkinStreak() === 1 ? '' : 's'}</span></div>
        <div class="xpbar" style="margin:8px 0 4px"><i style="width:${((xp - lo) / (hi - lo)) * 100}%"></i></div>
        <div class="tiny muted">${xp - lo} / ${hi - lo} XP to level ${lvl + 1} · ${qd}/${q.length} quests today</div>
      </div>
    </div>

    ${showEveningBanner ? `<div class="banner" style="margin-top:14px"><strong>🌙 Time for your evening check-in.</strong><div class="small muted">Close the day honestly — it takes 10 minutes and earns up to 200 XP.</div></div>` : ''}

    <div class="grid" style="margin-top:14px">
      <button class="card checkin-card ${d.morning ? 'done' : ''}" data-act="open-morning"><span class="big">🌅</span><span><strong>Morning</strong><br><span class="small muted">${d.morning ? 'Done ✓ · tap to edit' : '10-min check-in'}</span></span></button>
      <button class="card checkin-card ${d.evening ? 'done' : ''}" data-act="open-evening"><span class="big">🌙</span><span><strong>Evening</strong><br><span class="small muted">${d.evening ? 'Done ✓ · tap to edit' : '10-min check-in'}</span></span></button>
    </div>

    <div class="sec"><h2>📖 Today's guide</h2></div>
    <div class="card stack">
      <div><div class="quote">“${esc(w.q)}”</div><div class="quote-a">— ${esc(w.a)}</div></div>
      <div><div class="small" style="color:var(--violet);font-weight:700">EQ LESSON · ${esc(lesson.t)}</div><div class="small">${esc(lesson.b)}</div></div>
      <div><div class="small" style="color:var(--teal);font-weight:700">GLOW-UP</div><div class="small">Do: ${esc(glow)}<br>Avoid: ${esc(avoid)}</div></div>
    </div>

    <div class="sec"><h2>🎯 Focus</h2><button class="btn sm ghost" data-act="settings">Edit goals</button></div>
    <div class="card">
      ${d.morning?.goal ? `<div class="small muted">Today's goal</div><div><strong>${esc(d.morning.goal)}</strong>${d.morning.goalAction ? ` → ${esc(d.morning.goalAction)}` : ''}</div>` :
        goals.map((g, i) => `<div class="row" style="padding:4px 0"><span class="pill gold">${i + 1}</span><span>${esc(g)}</span></div>`).join('')}
      ${pr.length ? `<div class="small muted" style="margin:12px 0 6px">Top priorities</div>` + pr.map((p) =>
        `<button class="check ${p.done ? 'on' : ''}" data-act="prio" data-i="${p.i}"><span class="box">${p.done ? '✓' : ''}</span><span>${esc(p.t)}</span></button>`).join('')
        : `<button class="btn sm" style="margin-top:12px" data-act="open-morning">Set today's top 3 priorities</button>`}
    </div>

    <div class="sec"><h2>💡 Recommended for you</h2></div>
    <div class="card">${recommendations().map(([ic, t]) => `<div class="quest"><div class="q-ic">${ic}</div><div class="grow small">${t}</div></div>`).join('')}</div>

    <div class="sec"><h2>💧 Water</h2><span class="muted small">${d.water || 0} of ${st.waterTarget} glasses</span></div>
    <div class="card water">
      <button class="round-btn minus" data-act="water-" aria-label="Remove a glass">−</button>
      <div class="glasses">${Array.from({ length: Math.max(st.waterTarget, d.water || 0) }, (_, i) => `<span class="glass ${i < (d.water || 0) ? 'full' : ''}"></span>`).join('')}</div>
      <button class="round-btn" data-act="water+" aria-label="Add a glass">+</button>
    </div>

    <div class="sec"><h2>🗺️ Daily quests</h2><span class="pill gold">${qd}/${q.length}</span></div>
    <div class="card">${q.map((x) => `<div class="quest ${x.done ? 'done' : ''}" ${x.act && !x.done ? `data-act="${x.act}" role="button" style="cursor:pointer"` : ''}>
        <div class="q-ic">${x.done ? '✅' : x.ic}</div><div class="grow q-t small">${x.t}</div><div class="q-xp">+${x.xp} XP</div></div>`).join('')}</div>

    <div class="sec"><h2>🪥 Hygiene</h2>
      <div class="seg" style="min-width:180px"><button class="${hygTab === 'hygAM' ? 'on' : ''}" data-act="hygtab" data-v="hygAM">☀️ Morning</button><button class="${hygTab === 'hygPM' ? 'on' : ''}" data-act="hygtab" data-v="hygPM">🌙 Night</button></div></div>
    <div class="card">${st[hygTab].map((it) => { const on = d[hygTab]?.[it]; return `<button class="check ${on ? 'on' : ''}" data-act="hyg" data-l="${hygTab}" data-item="${esc(it)}"><span class="box">${on ? '✓' : ''}</span><span>${esc(it)}</span></button>`; }).join('')}</div>

    <div class="sec"><h2>🛡️ Freedom streaks</h2><button class="btn sm ghost" data-act="go-freedom">Details</button></div>
    <div class="grid">${HABITS.map((hb) => { const s = habitStreak(hb.id); return `<div class="card streak"><div class="ic">${hb.ic}</div><div class="n">${s.current}</div><div class="tiny muted">days free of ${hb.name.toLowerCase()}</div></div>`; }).join('')}</div>

    <div class="sec"><h2>😂 Joke of the day</h2></div>
    <div class="card"><div>${esc(daily(C.jokes))}</div><div class="row" style="margin-top:10px"><button class="btn sm" data-act="go-comedy">Write your own (+10 XP)</button></div></div>
    `;
  }

  // ----- Money -----
  function viewMoney() {
    const k = today(), mk = k.slice(0, 7), st = S.settings;
    const month = S.tx.filter((t) => t.date.startsWith(mk));
    const out = sum(month.filter((t) => t.type === 'out').map((t) => +t.amount));
    const inc = sum(month.filter((t) => t.type === 'in').map((t) => +t.amount));
    const dt = parseKey(k), dim = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate(), dleft = dim - dt.getDate() + 1;
    const left = st.budget - out, perDay = Math.max(0, left / dleft);
    const byCat = {};
    for (const t of month.filter((t) => t.type === 'out')) byCat[t.cat] = (byCat[t.cat] || 0) + +t.amount;
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const maxCat = cats[0]?.[1] || 1;
    const days14 = lastN(14).map((x) => ({ label: fmtDate(x, { day: 'numeric' }), v: spentOn(x) }));
    const bad = sum(month.filter((t) => ['fastfood', 'soda', 'gambling'].includes(t.cat)).map((t) => +t.amount));
    const catList = UI.mType === 'out' ? CATS_OUT : CATS_IN;
    if (!catList.find((c) => c[0] === UI.mCat)) UI.mCat = catList[0][0];
    const list = [...month].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));

    return `
    <h1>Money</h1>
    <div class="card" style="margin-top:14px">
      <div class="row between"><div><div class="small muted">Spent in ${dt.toLocaleDateString(undefined, { month: 'long' })}</div><div class="big-num">${cur(out)}</div></div>
        ${ring(st.budget ? (out / st.budget) * 100 : 0, out > st.budget ? 'var(--bad)' : 'var(--amber)', 72, 8, st.budget ? Math.round((out / st.budget) * 100) + '%' : '–')}</div>
      <div class="grid g3" style="margin-top:12px">
        <div><div class="tiny muted">Budget left</div><strong style="color:${left < 0 ? 'var(--bad)' : 'var(--good)'}">${cur(left)}</strong></div>
        <div><div class="tiny muted">Safe per day</div><strong>${cur(Math.round(perDay))}</strong></div>
        <div><div class="tiny muted">Income</div><strong class="amt-in">${cur(inc)}</strong></div>
      </div>
      ${bad > 0 ? `<div class="insight" style="margin-top:12px;border-left-color:var(--bad)">🍔🥤🎲 You spent <strong>${cur(bad)}</strong> on fast food, soda and gambling this month. That's ${cur(bad * 12)} a year at this pace.</div>` : ''}
    </div>

    <div class="sec"><h2>➕ Add</h2></div>
    <div class="card">
      <div class="seg"><button class="${UI.mType === 'out' ? 'on' : ''}" data-act="mtype" data-v="out">Spent</button><button class="${UI.mType === 'in' ? 'on' : ''}" data-act="mtype" data-v="in">Received</button></div>
      <div class="row" style="margin-top:12px"><input type="number" id="m-amt" placeholder="Amount (${esc(st.currency)})" inputmode="decimal" min="0" step="any" class="grow"><input type="date" id="m-date" value="${k}" style="width:auto"></div>
      <div class="chips" style="margin-top:12px">${catList.map(([id, ic, n]) => `<button class="chip ${UI.mCat === id ? 'on' : ''}" data-act="mcat" data-v="${id}">${ic} ${n}</button>`).join('')}</div>
      <input type="text" id="m-note" placeholder="Note (optional)" style="margin-top:12px">
      <button class="btn primary block" style="margin-top:12px" data-act="addtx">Add</button>
    </div>

    <div class="sec"><h2>📊 Where it goes</h2></div>
    <div class="card">${cats.length ? cats.map(([c, v]) => { const ci = catInfo(c); const badc = ['fastfood', 'soda', 'gambling'].includes(c); return `<div class="bar-row"><span style="width:130px" class="small">${ci[1]} ${ci[2]}</span><span class="bar"><i style="width:${(v / maxCat) * 100}%;background:${badc ? 'var(--bad)' : 'var(--amber)'}"></i></span><span class="small" style="width:90px;text-align:right">${cur(v)}</span></div>`; }).join('') : '<div class="empty">No spending logged this month yet.</div>'}</div>

    <div class="card"><div class="small muted" style="margin-bottom:6px">Daily spending — last 14 days (line = daily budget)</div>${barChart(days14, { color: '#ff9f43', target: st.budget / 30, fmt: (v) => cur(Math.round(v)) })}</div>

    <div class="sec"><h2>🧾 This month</h2><span class="muted small">${list.length} entries</span></div>
    <div class="card">${list.length ? list.map((t) => { const ci = catInfo(t.cat); return `<div class="tx"><div class="cat">${ci[1]}</div><div class="grow"><div>${esc(t.note || ci[2])}</div><div class="tiny muted">${fmtDate(t.date)} · ${ci[2]}</div></div>
      <div class="${t.type === 'in' ? 'amt-in' : 'amt-out'}">${t.type === 'in' ? '+' : '−'}${cur(t.amount)}</div><button class="icon-btn" style="width:32px;height:32px;font-size:.85rem" data-act="deltx" data-id="${t.id}" aria-label="Delete">✕</button></div>`; }).join('') : '<div class="empty">Nothing yet. Every entry makes you more aware.</div>'}</div>

    <div class="sec"><h2>💡 Money wisdom</h2></div>
    <div class="card">${esc(daily(C.money))}</div>`;
  }

  // ----- Feed (healthy infinite scroll) -----
  let feedCount = 0, feedSeed = Math.floor(Math.random() * 1000);
  function feedItem(i) {
    const kinds = ['wisdom', 'challenge', 'eq', 'joke', 'glow', 'comedy', 'wisdom', 'challenge', 'money', 'prompt', 'avoid', 'joke'];
    const kind = kinds[(feedSeed + i) % kinds.length];
    // 13 is coprime with every pool size, so items don't repeat until the pool is exhausted.
    const at = (arr) => arr[(feedSeed * 31 + i * 13) % arr.length];
    switch (kind) {
      case 'wisdom': { const w = at(C.wisdom); return { kind, accent: 'var(--gold)', tag: 'Wisdom', body: `“${w.q}”`, sub: '— ' + w.a, big: true }; }
      case 'challenge': return { kind, accent: 'var(--good)', tag: 'Real-life challenge', body: at(C.challenges) };
      case 'eq': { const l = at(C.eq); return { kind, accent: 'var(--violet)', tag: 'EQ lesson', title: l.t, body: l.b }; }
      case 'joke': return { kind, accent: 'var(--pink)', tag: 'Laugh', body: at(C.jokes) };
      case 'comedy': { const c = at(C.comedy); return { kind, accent: 'var(--pink)', tag: 'Comedy school', title: c.t, body: c.b, sub: 'Try it: ' + c.p }; }
      case 'glow': return { kind, accent: 'var(--teal)', tag: 'Glow-up', body: at(C.glow.do) };
      case 'avoid': return { kind, accent: 'var(--bad)', tag: 'Avoid to stay handsome', body: at(C.glow.avoid) };
      case 'money': return { kind, accent: 'var(--amber)', tag: 'Money', body: at(C.money) };
      case 'prompt': return { kind, accent: 'var(--blue)', tag: 'Reflect', body: at(C.prompts) };
    }
  }
  function feedCardHTML(i) {
    if (i > 0 && i % 12 === 0) {
      return `<div class="card interstitial"><div style="font-size:2rem">🌍</div><strong>You've explored ${i} cards.</strong><div class="small muted" style="margin:6px 0 12px">Real life is where the best dopamine is. Pick one challenge above, do it, and come back to claim your XP.</div><button class="btn sm" data-act="tab" data-tab="today">See today's quests</button></div>`;
    }
    const it = feedItem(i);
    const claimed = S.claims[today()] || 0;
    let acts = '';
    if (it.kind === 'challenge') acts = `<button class="btn sm primary" data-act="claim">I did it · +10 XP</button><span class="tiny muted">${claimed}/15 today</span>`;
    else if (it.kind === 'prompt') acts = `<textarea class="feed-journal" placeholder="Write your thoughts… (+10 XP)" rows="3" style="min-height:70px"></textarea><button class="btn sm" data-act="journal-feed" data-p="${esc(it.body)}">Save to journal</button>`;
    else if (it.kind === 'comedy') acts = `<button class="btn sm" data-act="go-comedy">Open joke notebook</button>`;
    if (['wisdom', 'eq', 'glow', 'avoid', 'money', 'joke', 'comedy'].includes(it.kind)) acts += `<button class="btn sm ghost" data-act="savefeed" data-t="${esc(it.tag)}" data-b="${esc((it.title ? it.title + ': ' : '') + it.body + (it.sub && it.kind === 'wisdom' ? ' ' + it.sub : ''))}">🔖 Save</button>`;
    return `<div class="card feed-card ${it.big ? 'big' : ''}" style="--accent:${it.accent}">
      <div class="tag" style="color:${it.accent}">${it.tag}</div>
      ${it.title ? `<h3 style="margin-bottom:6px">${esc(it.title)}</h3>` : ''}
      <div class="body">${esc(it.body)}</div>${it.sub ? `<div class="small muted" style="margin-top:6px">${esc(it.sub)}</div>` : ''}
      ${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
  }
  function viewFeed() {
    feedCount = 0;
    return `<div class="row between"><div><h1>Light Feed</h1><div class="small muted">Scroll as much as you like — every card makes you better.</div></div><button class="icon-btn" data-act="refeed" aria-label="Shuffle">🔀</button></div>
      <div id="feed" class="stack" style="margin-top:14px"></div><div id="feed-end" style="height:40px"></div>`;
  }
  let feedObs = null;
  function feedMore(n = 8) {
    const f = $('#feed'); if (!f) return;
    let html = '';
    for (let i = 0; i < n; i++) html += feedCardHTML(feedCount++);
    f.insertAdjacentHTML('beforeend', html);
  }
  function feedInit() {
    feedMore(10);
    if (feedObs) feedObs.disconnect();
    if ('IntersectionObserver' in window) {
      feedObs = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) feedMore(8); }, { rootMargin: '600px' });
      feedObs.observe($('#feed-end'));
    }
  }

  // ----- Stats -----
  function viewStats() {
    const n = UI.range, keys = lastN(n), prev = lastN(n, addDays(today(), -n));
    const sc = rangeScores(keys), ps = rangeScores(prev);
    const dAvg = (arr, id) => (arr.length ? Math.round(avg(arr.map((s) => s[id]))) : null);
    const overall = dAvg(sc, 'overall');
    const st = S.settings;
    const dom = UI.domain;
    const domInfo = DOMAINS.find((d) => d.id === dom) || { name: 'Overall', hex: '#ffd166' };
    const pts = keys.map((k) => ({ label: fmtDate(k, { day: 'numeric' }), v: scores(k)?.[dom] ?? null }));
    const sleepPts = keys.slice(-14).map((k) => ({ label: fmtDate(k, { day: 'numeric' }), v: sleepHours(S.days[k]?.morning) ?? 0 }));
    const waterPts = keys.slice(-14).map((k) => ({ label: fmtDate(k, { day: 'numeric' }), v: S.days[k]?.water || 0 }));
    const moodPts = keys.map((k) => { const d = S.days[k]; const ms = [d?.morning?.mood, d?.evening?.mood].filter(Boolean); return { label: fmtDate(k, { day: 'numeric' }), v: ms.length ? avg(ms) : null }; });

    return `
    <h1>Stats</h1>
    <div class="seg" style="margin-top:14px">${[7, 30, 90].map((r) => `<button class="${UI.range === r ? 'on' : ''}" data-act="range" data-v="${r}">${r} days</button>`).join('')}</div>

    ${!sc.length ? `<div class="card empty" style="margin-top:14px">📈 Your stats appear after your first check-in. Do your morning check-in to begin!</div>` : `
    <div class="card hero" style="margin-top:14px">
      ${ring(overall, 'var(--gold)', 110, 10, overall)}
      <div class="grow"><strong>Life Score</strong><div class="small muted">Average of all 6 areas over ${sc.length} tracked day${sc.length === 1 ? '' : 's'}.</div>
        ${ps.length ? trendTag(overall - dAvg(ps, 'overall')) + ' <span class="tiny muted">vs previous ' + n + ' days</span>' : ''}</div>
    </div>
    <div class="grid g3" style="margin-top:14px">${DOMAINS.map((d) => { const v = dAvg(sc, d.id), pv = dAvg(ps, d.id); return `<button class="card ring-card" data-act="domain" data-v="${d.id}" style="${UI.domain === d.id ? 'border-color:' + d.hex : ''}">${ring(v, d.color, 64, 7, v)}<div class="small">${d.ic} ${d.name}</div>${pv != null ? `<div class="tiny">${trendTag(v - pv)}</div>` : ''}</button>`; }).join('')}</div>

    <div class="card"><div class="row between"><strong>${domInfo.name} score</strong>${dom !== 'overall' ? '<button class="btn sm ghost" data-act="domain" data-v="overall">Show overall</button>' : '<span class="tiny muted">Tap an area above</span>'}</div>${lineChart(pts, { color: domInfo.hex })}</div>
    `}

    <div class="sec"><h2>🔮 Future You — 1 year projection</h2></div>
    ${viewProjection()}

    <div class="sec"><h2>🧩 Know yourself</h2></div>
    ${viewInsights(keys)}

    <div class="sec"><h2>😴 Sleep</h2><span class="muted small">goal ${st.sleepTarget}h</span></div>
    <div class="card">${barChart(sleepPts, { color: '#6ea8ff', target: st.sleepTarget, max: Math.max(10, st.sleepTarget + 2), fmt: (v) => v + 'h' })}</div>
    <div class="sec"><h2>💧 Water</h2><span class="muted small">goal ${st.waterTarget} glasses</span></div>
    <div class="card">${barChart(waterPts, { color: '#4fd1c5', target: st.waterTarget, max: Math.max(st.waterTarget + 2, ...waterPts.map((p) => p.v)) })}</div>
    <div class="sec"><h2>🙂 Mood</h2></div>
    <div class="card">${lineChart(moodPts, { color: '#b48cff', max: 5, min: 1, ticks: [1, 3, 5] })}</div>
    `;
  }
  const trendTag = (d) => (d == null || isNaN(d) ? '' : d > 0 ? `<span class="trend-up">▲ ${d}</span>` : d < 0 ? `<span class="trend-down">▼ ${Math.abs(d)}</span>` : '<span class="muted">● 0</span>');

  function regression(ys) {
    const pts = ys.map((y, x) => [x, y]).filter((p) => p[1] != null);
    if (pts.length < 2) return 0;
    const mx = avg(pts.map((p) => p[0])), my = avg(pts.map((p) => p[1]));
    const num = sum(pts.map(([x, y]) => (x - mx) * (y - my))), den = sum(pts.map(([x]) => (x - mx) ** 2));
    return den ? num / den : 0;
  }
  function viewProjection() {
    const keys = lastN(30);
    const tracked = keys.filter((k) => scores(k));
    if (tracked.length < 3) {
      return `<div class="card empty">🔮 Check in on at least 3 days and Light will project who you're becoming in one year — health, money, career, mind and character. (${tracked.length}/3 days)</div>`;
    }
    const st = S.settings;
    const rows = DOMAINS.map((d) => {
      const ys = keys.map((k) => scores(k)?.[d.id] ?? null);
      const recent = ys.filter((y) => y != null).slice(-7);
      const now = Math.round(avg(recent));
      const slope = regression(ys);
      // Habits compound but plateau: project the trend for ~60 days of change, then hold.
      const proj = Math.round(clamp(now + clamp(slope * 60, -30, 30)));
      return { d, now, proj };
    });
    const projOverall = Math.round(avg(rows.map((r) => r.proj)));
    const persona = projOverall >= 80 ? ['🗼', 'The Lighthouse', 'Disciplined, healthy, financially steady, funny and emotionally strong. People come to you for calm and laughs.']
      : projOverall >= 65 ? ['🌟', 'The Rising Star', 'Clearly better than today: more energy, more savings, stronger habits. A few areas still need your attention.']
      : projOverall >= 50 ? ['🔦', 'The Torchbearer', 'Holding steady. You\'ll keep what you have — but the life you want needs a little more consistency.']
      : ['🕯️', 'The Flickering Flame', 'If nothing changes, next year looks like this year. The good news: one week of check-ins can change this projection.'];

    const ev = keys.map((k) => S.days[k]).filter(Boolean);
    const trackedDays = Math.max(1, tracked.length);
    const exMin = sum(ev.map((d) => d.exercise || 0)) / trackedDays;
    const water = sum(ev.map((d) => d.water || 0)) / trackedDays;
    const socialArr = ev.map((d) => d.evening?.socialMin).filter((x) => x != null);
    const social = avg(socialArr);
    const spentPerDay = sum(keys.map(spentOn)) / 30;
    const badSpend = sum(S.tx.filter((t) => keys.includes(t.date) && ['fastfood', 'soda', 'gambling'].includes(t.cat)).map((t) => +t.amount));
    const jokeRate = S.jokes.filter((j) => keys.includes(j.date)).length / trackedDays;
    const weights = keys.map((k) => S.days[k]?.morning?.weight || null);
    const wCount = weights.filter(Boolean).length;
    const wSlope = regression(weights);
    const wNow = weights.filter(Boolean).slice(-1)[0];

    const facts = [
      ['💪', `${Math.round((exMin * 365) / 60)} hours of exercise`],
      ['💧', `${Math.round(water * 0.25 * 365)} liters of water`],
      ['😂', `${Math.round(jokeRate * 365)} jokes written`],
      ['💸', `${cur(Math.round(spentPerDay * 365))} spent at your current pace`],
    ];
    if (badSpend > 0) facts.push(['🚫', `${cur(Math.round((badSpend / 30) * 365))} saved per year by quitting fast food, soda & gambling`]);
    if (socialArr.length) facts.push(['📵', `${Math.round((social * 365) / 60)} hours on social media (${Math.round((social * 365) / 60 / 24)} full days)`]);
    if (wCount >= 3 && wNow) {
      const delta = clamp(wSlope * 180, -10, 10); // trend for ~6 months, then plateau
      facts.push(['⚖️', `Weight trend: ${round1(wSlope * 30) > 0 ? '+' : ''}${round1(wSlope * 30)} ${st.weightUnit}/month → about ${round1(wNow + delta)} ${st.weightUnit} in a year`]);
    }

    return `<div class="card">
      <div class="row"><div style="font-size:2.4rem">${persona[0]}</div><div><div class="tiny muted">In one year you're becoming</div><h2>${persona[1]}</h2></div></div>
      <p class="small" style="margin:10px 0 14px">${persona[2]}</p>
      <div class="proj"><span class="h">Area</span><span class="h">Now</span><span class="h">1 year</span>
        ${rows.map((r) => `<span>${r.d.ic} ${r.d.name}</span><strong>${r.now}</strong><span>${r.proj} ${trendTag(r.proj - r.now)}</span>`).join('')}
        <span><strong>Overall</strong></span><strong>${Math.round(avg(rows.map((r) => r.now)))}</strong><strong style="color:var(--gold)">${projOverall}</strong>
      </div>
      <div class="small muted" style="margin:16px 0 8px">Your next 12 months, if you keep today's pace:</div>
      ${facts.map(([ic, t]) => `<div class="row small" style="padding:4px 0"><span>${ic}</span><span>${t}</span></div>`).join('')}
      <div class="tiny muted" style="margin-top:12px">Projection uses your last 30 days of trends. It's a mirror, not a prophecy — change today and the projection changes with you.</div>
    </div>`;
  }

  function viewInsights(keys) {
    const days = keys.map((k) => ({ k, d: S.days[k] })).filter((x) => x.d);
    const out = [];
    // Slips per habit
    const slipCounts = HABITS.map((h) => ({ h, n: keys.filter((k) => slipsOn(k).has(h.id)).length }));
    const bars = slipCounts.map(({ h, n }) => `<div class="bar-row"><span style="width:140px" class="small">${h.ic} ${h.name}</span><span class="bar"><i style="width:${(n / Math.max(1, keys.length)) * 100}%;background:var(--bad)"></i></span><span class="small" style="width:60px;text-align:right">${n} day${n === 1 ? '' : 's'}</span></div>`).join('');
    // Weekday pattern
    const wd = Array(7).fill(0);
    for (const k of keys) wd[parseKey(k).getDay()] += slipsOn(k).size;
    const wdMax = Math.max(...wd);
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (wdMax > 0) out.push(`📅 Your hardest day is <strong>${names[wd.indexOf(wdMax)]}</strong> — most slips happen then. Plan something healthy for that day in advance.`);
    // Correlations
    const withE = days.filter((x) => x.d.evening);
    const split = (pred, metric) => {
      const a = withE.filter(pred).map(metric).filter((v) => v != null), b = withE.filter((x) => !pred(x)).map(metric).filter((v) => v != null);
      return a.length >= 2 && b.length >= 2 ? [avg(a), avg(b)] : null;
    };
    const lowSleep = (x) => { const h = sleepHours(x.d.morning); return h != null && h < S.settings.sleepTarget - 1; };
    let r = split(lowSleep, (x) => x.d.evening.socialMin || 0);
    if (r && r[0] > r[1] * 1.3 && r[0] - r[1] > 10) out.push(`😴→📱 On short-sleep days you spend <strong>${Math.round(r[0])} min</strong> on social media vs ${Math.round(r[1])} min when rested. Sleep protects your discipline.`);
    r = split((x) => (x.d.exercise || 0) >= 20, (x) => x.d.evening.mood);
    if (r && r[0] - r[1] >= 0.4) out.push(`🏃→🙂 Your mood is <strong>${round1(r[0] - r[1])} points higher</strong> on days you exercise. Movement is your natural antidepressant.`);
    r = split(lowSleep, (x) => x.d.evening.mood);
    if (r && r[1] - r[0] >= 0.4) out.push(`😴→😞 Your mood drops ${round1(r[1] - r[0])} points after short nights.`);
    r = split((x) => slipsOn(x.k).has('fastfood'), (x) => spentOn(x.k));
    if (r && r[0] > r[1] * 1.2) out.push(`🍔→💸 You spend <strong>${cur(Math.round(r[0] - r[1]))} more</strong> on fast-food days.`);
    r = split((x) => (x.d.evening.stress || 0) >= 4, (x) => slipsOn(x.k).size);
    if (r && r[0] - r[1] >= 0.5) out.push(`😫→🚨 Stressful days lead to more slips (${round1(r[0])} vs ${round1(r[1])}). When stress is high, use the Urge button early.`);
    // Emotions
    const emo = {};
    for (const x of withE) if (x.d.evening.emotion) emo[x.d.evening.emotion] = (emo[x.d.evening.emotion] || 0) + 1;
    const topE = Object.entries(emo).sort((a, b) => b[1] - a[1])[0];
    if (topE) out.push(`❤️ Your most frequent strong emotion lately: <strong>${esc(topE[0])}</strong> (${topE[1]}×). Ask yourself what it's trying to tell you.`);
    // SOS
    const sos = S.sos.filter((s) => keys.includes(s.date));
    if (sos.length) { const won = sos.filter((s) => s.result === 'won').length; out.push(`🌊 You used the Urge button ${sos.length}× and beat the urge <strong>${won}</strong> time${won === 1 ? '' : 's'} (${Math.round((won / sos.length) * 100)}%).`); }
    if (!out.length) out.push('Keep checking in — after about a week, Light will start spotting patterns in your habits, sleep, mood and spending.');

    return `<div class="card"><div class="small muted" style="margin-bottom:8px">Bad-habit days in the last ${keys.length} days</div>${bars}</div>
      <div class="card">${out.map((t) => `<div class="insight small">${t}</div>`).join('')}</div>`;
  }

  // ----- Charts (inline SVG) -----
  function lineChart(pts, { color = '#ffd166', max = 100, min = 0, h = 150, ticks = [0, 50, 100] } = {}) {
    const W = 600, padL = 26, padB = 20, padT = 8, iw = W - padL - 6, ih = h - padB - padT;
    const x = (i) => padL + (pts.length < 2 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const y = (v) => padT + ih - ((v - min) / (max - min)) * ih;
    let path = '', open = false;
    pts.forEach((p, i) => { if (p.v == null) { open = false; return; } path += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)} `; open = true; });
    const every = Math.ceil(pts.length / 8);
    return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Line chart">
      ${ticks.map((t) => `<line x1="${padL}" x2="${W - 6}" y1="${y(t)}" y2="${y(t)}" stroke="#26305e" stroke-dasharray="3 4"/><text x="0" y="${y(t) + 3}">${t}</text>`).join('')}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p, i) => (p.v == null ? '' : `<circle cx="${x(i)}" cy="${y(p.v)}" r="3.5" fill="${color}"><title>${p.label}: ${round1(p.v)}</title></circle>`)).join('')}
      ${pts.map((p, i) => (i % every === 0 || i === pts.length - 1 ? `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${p.label}</text>` : '')).join('')}
    </svg>`;
  }
  function barChart(pts, { color = '#ffd166', target = null, max = null, h = 150, fmt = (v) => v } = {}) {
    const W = 600, padB = 20, padT = 14, ih = h - padB - padT;
    const mx = max || Math.max(1, target || 0, ...pts.map((p) => p.v)) * 1.1;
    const bw = W / pts.length;
    const y = (v) => padT + ih - (v / mx) * ih;
    return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Bar chart">
      ${pts.map((p, i) => `<rect x="${i * bw + bw * 0.18}" y="${y(p.v)}" width="${bw * 0.64}" height="${Math.max(0, padT + ih - y(p.v))}" rx="4" fill="${color}" opacity="${p.v ? 1 : 0.25}"><title>${p.label}: ${fmt(round1(p.v))}</title></rect>
        <text x="${i * bw + bw / 2}" y="${h - 4}" text-anchor="middle">${p.label}</text>`).join('')}
      ${target ? `<line x1="0" x2="${W}" y1="${y(target)}" y2="${y(target)}" stroke="#ffd166" stroke-dasharray="5 5" stroke-width="1.5"/>` : ''}
    </svg>`;
  }

  // ----- Grow -----
  function viewGrow() {
    const tabs = [['comedy', '😂 Comedy'], ['eq', '❤️ EQ'], ['glow', '✨ Glow-up'], ['freedom', '🛡️ Freedom'], ['journal', '📓 Journal'], ['badges', '🏅 Badges']];
    const body = { comedy: growComedy, eq: growEQ, glow: growGlow, freedom: growFreedom, journal: growJournal, badges: growBadges }[UI.grow]();
    return `<h1>Grow</h1><div class="seg" style="margin-top:14px">${tabs.map(([id, n]) => `<button class="${UI.grow === id ? 'on' : ''}" data-act="growtab" data-v="${id}">${n}</button>`).join('')}</div>${body}`;
  }
  function growComedy() {
    const c = daily(C.comedy), n = S.jokes.length;
    const rank = n >= 100 ? 'Headliner' : n >= 50 ? 'Feature act' : n >= 20 ? 'Open-mic regular' : n >= 5 ? 'Class clown' : 'Rookie';
    return `<div class="card" style="margin-top:14px"><div class="row between"><div><div class="tiny muted">Comedian rank</div><h2>🎤 ${rank}</h2></div><span class="pill gold">${n} jokes</span></div></div>
    <div class="card"><div class="small" style="color:var(--pink);font-weight:700">TODAY'S TECHNIQUE</div><h3 style="margin:4px 0">${esc(c.t)}</h3><div class="small">${esc(c.b)}</div>
      <label class="lbl">✍️ ${esc(c.p)}</label><textarea id="joke-in" placeholder="Write your joke here…"></textarea>
      <button class="btn primary block" style="margin-top:10px" data-act="addjoke">Add to my notebook · +10 XP</button></div>
    <div class="card"><div class="small muted">Joke of the day</div><div style="margin-top:4px">${esc(daily(C.jokes))}</div><div class="tiny muted" style="margin-top:8px">Tip: tell one joke to a real person today. Watching faces is how comedians learn.</div></div>
    <div class="sec"><h2>📒 My joke notebook</h2></div>
    <div class="card">${n ? [...S.jokes].reverse().map((j) => `<div class="tx"><div class="grow"><div>${esc(j.text)}</div><div class="tiny muted">${fmtDate(j.date)}</div></div><button class="icon-btn" style="width:32px;height:32px;font-size:.85rem" data-act="deljoke" data-id="${j.id}" aria-label="Delete">✕</button></div>`).join('') : '<div class="empty">Your first joke is the hardest. It doesn\'t have to be good — it has to be written.</div>'}</div>
    <div class="sec"><h2>🎓 All techniques</h2></div>
    <div class="card">${C.comedy.map((x) => `<details style="padding:6px 0"><summary><strong>${esc(x.t)}</strong></summary><div class="small" style="margin-top:6px">${esc(x.b)}</div><div class="small muted" style="margin-top:4px">Practice: ${esc(x.p)}</div></details>`).join('')}</div>`;
  }
  function growEQ() {
    const l = daily(C.eq, 1);
    const emo = {};
    for (const d of Object.values(S.days)) if (d.evening?.emotion) emo[d.evening.emotion] = (emo[d.evening.emotion] || 0) + 1;
    const total = sum(Object.values(emo)) || 1;
    const refl = Object.entries(S.days).filter(([, d]) => d.evening?.eq?.trim()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
    return `<div class="card" style="margin-top:14px"><div class="small" style="color:var(--violet);font-weight:700">TODAY'S LESSON</div><h2 style="margin:4px 0">${esc(l.t)}</h2><div>${esc(l.b)}</div></div>
    <div class="sec"><h2>🎨 Your emotional palette</h2></div>
    <div class="card">${Object.keys(emo).length ? Object.entries(emo).sort((a, b) => b[1] - a[1]).map(([e, n]) => `<div class="bar-row"><span style="width:120px" class="small">${esc(e)}</span><span class="bar"><i style="width:${(n / total) * 100}%;background:var(--violet)"></i></span><span class="small" style="width:40px;text-align:right">${n}</span></div>`).join('') : '<div class="empty">Name your strongest emotion in each evening check-in to see your palette.</div>'}</div>
    <div class="sec"><h2>🪞 Recent reflections</h2></div>
    <div class="card">${refl.length ? refl.map(([k, d]) => `<div class="insight small"><strong>${fmtDate(k)} · ${esc(d.evening.emotion || '')}</strong><br>${esc(d.evening.eq)}</div>`).join('') : '<div class="empty">Your EQ reflections will appear here.</div>'}</div>
    <div class="sec"><h2>📚 All lessons</h2></div>
    <div class="card">${C.eq.map((x) => `<details style="padding:6px 0"><summary><strong>${esc(x.t)}</strong></summary><div class="small" style="margin-top:6px">${esc(x.b)}</div></details>`).join('')}</div>`;
  }
  function growGlow() {
    const keys = lastN(14);
    const hyg = keys.map((k) => ({ label: fmtDate(k, { day: 'numeric' }), v: Math.round(hygRatio(S.days[k]) * 100) }));
    return `<div class="card" style="margin-top:14px"><div class="small muted" style="margin-bottom:6px">Hygiene completion — last 14 days (%)</div>${barChart(hyg, { color: '#4fd1c5', max: 100, target: 100, fmt: (v) => v + '%' })}</div>
    <div class="grid"><div class="card streak"><div class="ic">🍔</div><div class="n">${habitStreak('fastfood').current}</div><div class="tiny muted">days without fast food</div></div>
      <div class="card streak"><div class="ic">🥤</div><div class="n">${habitStreak('soda').current}</div><div class="tiny muted">days without soda</div></div></div>
    <div class="sec"><h2>✅ Do this to stay handsome</h2></div>
    <div class="card">${C.glow.do.map((t) => `<div class="quest"><div class="q-ic">✨</div><div class="small">${esc(t)}</div></div>`).join('')}</div>
    <div class="sec"><h2>🚫 Avoid this</h2></div>
    <div class="card">${C.glow.avoid.map((t) => `<div class="quest"><div class="q-ic">⛔</div><div class="small">${esc(t)}</div></div>`).join('')}</div>
    <div class="card small muted">Edit your morning & night routines in ⚙️ Settings (on the Today tab).</div>`;
  }
  function growFreedom() {
    const recent = [...S.sos].reverse().slice(0, 12);
    return `<div class="card" style="margin-top:14px"><strong>Why you're doing this</strong><div class="small" style="margin-top:6px">${esc(S.profile.why || 'Add your “why” in Settings — it\'s your anchor when urges hit.')}</div></div>
    <div class="grid">${HABITS.map((h) => { const s = habitStreak(h.id); return `<div class="card streak"><div class="ic">${h.ic}</div><div class="n">${s.current}</div><div class="tiny muted">days free · best ${s.best}</div><div class="tiny" style="margin-top:4px">${h.name}</div></div>`; }).join('')}</div>
    <div class="card"><button class="btn primary block" data-act="sos">🌊 I have an urge right now</button><div class="tiny muted center" style="margin-top:8px">Urges peak and pass within minutes. Surf the wave instead of fighting it.</div></div>
    <div class="sec"><h2>📜 Urge log</h2></div>
    <div class="card">${recent.length ? recent.map((s) => { const h = HABITS.find((x) => x.id === s.type) || { ic: '🌀', name: 'Other' }; return `<div class="tx"><div class="cat">${h.ic}</div><div class="grow"><div>${h.name}</div><div class="tiny muted">${fmtDate(s.date)} ${s.t || ''}</div></div><span class="pill ${s.result === 'won' ? 'good' : 'bad'}">${s.result === 'won' ? 'Beat it 💪' : 'Slipped'}</span></div>`; }).join('') : '<div class="empty">When an urge hits, tap the pink “Urge?” button.</div>'}</div>
    <div class="card small"><strong>🎲 About gambling</strong><div class="muted" style="margin-top:6px">Gambling apps are engineered to keep you playing. If it feels out of control: block gambling sites and apps on all devices, ask your bank to block gambling transactions, use self-exclusion programs, hand money management to someone you trust for a while, and contact a local gambling or mental-health helpline. Asking for help is strength.</div></div>
    <div class="card small"><strong>📵 Make social media harder to reach</strong><div class="muted" style="margin-top:6px">Log out after each use · delete apps from your phone (use browser only) · turn on grayscale · set app limits in Digital Wellbeing / Screen Time · put Light where your social apps used to be on your home screen.</div></div>`;
  }
  function growJournal() {
    const p = daily(C.prompts);
    return `<div class="card" style="margin-top:14px"><div class="small" style="color:var(--blue);font-weight:700">TODAY'S PROMPT</div><h3 style="margin:4px 0 10px">${esc(p)}</h3>
      <textarea id="journal-in" placeholder="Write freely…"></textarea><button class="btn primary block" style="margin-top:10px" data-act="addjournal" data-p="${esc(p)}">Save · +10 XP</button></div>
    ${S.saved.length ? `<div class="sec"><h2>🔖 Saved from the feed</h2></div><div class="card">${[...S.saved].reverse().map((s, i) => `<div class="tx"><div class="grow"><div class="tiny muted">${esc(s.tag)}</div><div class="small">${esc(s.body)}</div></div><button class="icon-btn" style="width:32px;height:32px;font-size:.85rem" data-act="delsaved" data-i="${S.saved.length - 1 - i}" aria-label="Remove">✕</button></div>`).join('')}</div>` : ''}
    <div class="sec"><h2>📓 Entries</h2></div>
    <div class="card">${S.journal.length ? [...S.journal].reverse().map((j) => `<div class="insight small" style="border-left-color:var(--blue)"><div class="tiny muted">${fmtDate(j.date)} · ${esc(j.prompt)}</div><div style="white-space:pre-wrap;margin-top:4px">${esc(j.text)}</div></div>`).join('') : '<div class="empty">No entries yet.</div>'}</div>`;
  }
  function growBadges() {
    return `<div class="grid g3" style="margin-top:14px">${BADGES.map((b) => `<div class="card badge ${S.badges[b.id] ? '' : 'locked'}"><div class="ic">${b.ic}</div><div class="small"><strong>${b.n}</strong></div><div class="tiny muted">${b.d}</div>${S.badges[b.id] ? `<div class="tiny" style="color:var(--gold)">${fmtDate(S.badges[b.id])}</div>` : ''}</div>`).join('')}</div>`;
  }

  // ---------- Modal ----------
  let modalOnClose = null;
  function openModal(html, onClose) {
    const m = $('#modal');
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false; modalOnClose = onClose || null;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    const m = $('#modal');
    m.hidden = true; m.innerHTML = '';
    document.body.style.overflow = '';
    if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); }
  }

  // ---------- Check-in wizard ----------
  const FACES = ['😞', '😕', '😐', '🙂', '😄'];
  const ENERGY = ['🪫', '😪', '😐', '⚡', '🚀'];
  const SLEEPF = ['😵', '🥱', '😐', '😌', '😴'];
  const STRESS = ['😌', '🙂', '😐', '😟', '😫'];
  const URGE = ['🟢', '🟡', '🟠', '🔴', '🌋'];
  const TRAITS = ['Disciplined', 'Patient', 'Funny', 'Kind', 'Brave', 'Focused', 'Calm', 'Grateful', 'Honest', 'Confident'];
  const EMOTIONS = ['Joy', 'Calm', 'Gratitude', 'Pride', 'Love', 'Excitement', 'Stress', 'Anger', 'Fear', 'Sadness', 'Loneliness', 'Shame', 'Envy', 'Boredom', 'Frustration'];

  let wiz = null, wizTimer = null;
  function morningSteps() {
    const w = daily(C.wisdom);
    return [
      { title: `Good morning, ${esc(firstName())} ☀️`, sub: 'Ten minutes to set up a great day. Breathe in. Let\'s go.', fields: [{ type: 'info', html: `<div class="card"><div class="quote">“${esc(w.q)}”</div><div class="quote-a">— ${esc(w.a)}</div></div>` }] },
      { title: 'How did you sleep?', fields: [{ type: 'sleep' }, { type: 'scale', key: 'sleepQ', label: 'Sleep quality', faces: SLEEPF }] },
      { title: 'How are you feeling?', fields: [{ type: 'scale', key: 'mood', label: 'Mood' }, { type: 'scale', key: 'energy', label: 'Energy', faces: ENERGY }] },
      { title: 'Gratitude 🙏', sub: 'Three things you\'re grateful for. This trains your brain to notice the good.', fields: [{ type: 'text', key: 'gratitude', ph: '1. \n2. \n3. ' }] },
      { title: 'Goal focus 🎯', sub: 'Which goal will you move forward today?', fields: [{ type: 'goal' }, { type: 'text', key: 'goalAction', label: 'One concrete action for it today', ph: 'e.g. Apply to 2 jobs · Study 45 minutes · Cook lunch at home', rows: 2 }] },
      { title: 'Top 3 priorities ✅', sub: 'If you only did these three things, today would be a win.', fields: [{ type: 'list3' }] },
      { title: 'Who will you be today?', sub: 'Pick a character trait to practice.', fields: [{ type: 'chips', key: 'intention', opts: TRAITS }, { type: 'text', key: 'intentionText', label: 'How will you show it?', ph: 'e.g. I\'ll pause 6 seconds before reacting when stressed.', rows: 2 }] },
      { title: 'Morning routine 🪥', sub: 'Look sharp, feel sharp.', fields: [{ type: 'check', key: 'hygAM' }] },
      { title: 'Body check 💧', fields: [{ type: 'num', key: 'water', label: 'Glasses of water so far — drink one now!', step: 1, max: 30 }, { type: 'num', key: 'weight', label: `Weight (${S.settings.weightUnit}) — optional`, step: 0.1, max: 400, optional: true }] },
      { title: 'You\'re ready ✨', fields: [{ type: 'summary' }] },
    ];
  }
  function eveningSteps() {
    return [
      { title: `Good evening, ${esc(firstName())} 🌙`, sub: 'Let\'s close the day with honesty. No judgment — just awareness.', fields: [{ type: 'info', html: `<div class="card small muted">Honest data = better recommendations and a truer projection of your future. Slips are information, not failure.</div>` }] },
      { title: 'Your priorities', sub: 'Tick what you got done.', fields: [{ type: 'review' }] },
      { title: 'Work & body', fields: [{ type: 'num', key: 'deepWork', label: 'Focused work / study (minutes)', step: 15, max: 960 }, { type: 'num', key: 'exercise', label: 'Exercise / walking (minutes)', step: 5, max: 600 }] },
      { title: 'Food & drinks', fields: [{ type: 'num', key: 'water', label: 'Glasses of water today', step: 1, max: 30 }, { type: 'yesno', key: 'fastFood', label: 'Did you eat fast food today?' }, { type: 'yesno', key: 'soda', label: 'Did you drink soft drinks / soda?' }] },
      { title: 'Screens & urges', fields: [{ type: 'num', key: 'socialMin', label: 'Minutes on social media (check Screen Time / Digital Wellbeing)', step: 5, max: 1440 }, { type: 'yesno', key: 'gambled', label: 'Did you gamble today?' }, { type: 'scale', key: 'urges', label: 'How strong were your urges today?', faces: URGE }] },
      { title: 'Money today 💰', sub: 'Log what you spent. 30 seconds of awareness.', fields: [{ type: 'money' }] },
      { title: 'How did today feel?', fields: [{ type: 'scale', key: 'mood', label: 'Mood' }, { type: 'scale', key: 'stress', label: 'Stress', faces: STRESS }] },
      { title: 'Emotional intelligence ❤️', sub: 'Name your strongest emotion today.', fields: [{ type: 'chips', key: 'emotion', opts: EMOTIONS }, { type: 'text', key: 'eq', label: 'What triggered it? How did you respond? What would your best self do?', rows: 3 }] },
      { title: 'Comedy rep 😂', sub: 'What was the funniest moment today? Or turn something annoying into a joke.', fields: [{ type: 'text', key: 'funny', ph: 'The funniest thing today was…' }, { type: 'toggle', key: 'saveJoke', label: 'Also save it to my joke notebook' }] },
      { title: 'Win & lesson 🏆', fields: [{ type: 'text', key: 'win', label: 'Biggest win today (big or small)', rows: 2 }, { type: 'text', key: 'lesson', label: 'One thing to do better tomorrow', rows: 2 }] },
      { title: 'Night routine 🌙', fields: [{ type: 'check', key: 'hygPM' }] },
      { title: 'Day complete 🌟', fields: [{ type: 'summary' }] },
    ];
  }
  function openWizard(type) {
    const k = today(), d = day(k), st = S.settings;
    if (!wiz || wiz.type !== type || wiz.k !== k) {
      const base = type === 'morning'
        ? { bed: st.bedTime, wake: st.wakeTime, sleepQ: 0, mood: 0, energy: 0, gratitude: '', goal: '', goalAction: '', priorities: [{ t: '', done: false }, { t: '', done: false }, { t: '', done: false }], intention: '', intentionText: '', weight: '', ...(d.morning || {}) }
        : { socialMin: 0, fastFood: null, soda: null, gambled: null, urges: 0, mood: 0, stress: 0, emotion: '', eq: '', funny: '', saveJoke: true, win: '', lesson: '', ...(d.evening || {}) };
      base.water = d.water || 0;
      base.exercise = d.exercise || 0;
      base.deepWork = d.deepWork || 0;
      base.hygAM = { ...(d.hygAM || {}) };
      base.hygPM = { ...(d.hygPM || {}) };
      base.priorities = JSON.parse(JSON.stringify(type === 'morning' ? base.priorities : d.morning?.priorities || []));
      while (type === 'morning' && base.priorities.length < 3) base.priorities.push({ t: '', done: false });
      wiz = { type, k, step: 0, draft: base, start: Date.now(), xpBefore: computeXP() };
    }
    wiz.steps = type === 'morning' ? morningSteps() : eveningSteps();
    openModal('<div id="wiz"></div>', () => { clearInterval(wizTimer); render(); });
    renderWizard();
    clearInterval(wizTimer);
    wizTimer = setInterval(() => { const t = $('#wiz-timer'); if (t) t.textContent = elapsed(); }, 1000);
  }
  const elapsed = () => { const s = Math.floor((Date.now() - wiz.start) / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

  function renderWizard() {
    const host = $('#wiz'); if (!host || !wiz) return;
    const st = wiz.steps[wiz.step], last = wiz.step === wiz.steps.length - 1;
    if (last) commitWizard();
    host.innerHTML = `
      <div class="wiz-top"><button class="icon-btn" data-act="wiz-close" aria-label="Close">✕</button>
        <div class="prog"><i style="width:${((wiz.step + 1) / wiz.steps.length) * 100}%"></i></div>
        <span class="pill timer" id="wiz-timer">${elapsed()}</span></div>
      <div class="wiz-body">
        <div class="wiz-title">${st.title}</div>${st.sub ? `<div class="muted small" style="margin-bottom:14px">${st.sub}</div>` : '<div style="height:10px"></div>'}
        ${st.fields.map(fieldHTML).join('')}
      </div>
      <div class="wiz-foot">
        ${wiz.step > 0 && !last ? '<button class="btn" data-act="wiz-back">Back</button>' : ''}
        <button class="btn primary" data-act="${last ? 'wiz-done' : 'wiz-next'}">${last ? 'Finish ✨' : wiz.step === wiz.steps.length - 2 ? 'Complete' : 'Next'}</button>
      </div>`;
    host.closest('.sheet').scrollTop = 0;
  }

  function fieldHTML(f) {
    const D = wiz.draft, st = S.settings;
    const lbl = f.label ? `<label class="lbl">${f.label}</label>` : '';
    switch (f.type) {
      case 'info': return f.html;
      case 'scale': { const faces = f.faces || FACES; return `<div style="margin-bottom:14px">${lbl}<div class="scale">${faces.map((e, i) => `<button class="${D[f.key] === i + 1 ? 'on' : ''}" data-act="wset" data-k="${f.key}" data-v="${i + 1}" aria-label="${i + 1} of 5">${e}</button>`).join('')}</div></div>`; }
      case 'sleep': { const h = sleepHours(D); return `<div class="grid"><div><label class="lbl">Went to bed</label><input type="time" data-w="bed" value="${D.bed}"></div><div><label class="lbl">Woke up</label><input type="time" data-w="wake" value="${D.wake}"></div></div>
        <div class="center" style="margin:12px 0"><span class="big-num" id="sleep-h">${h ?? '–'}</span> <span class="muted">hours · goal ${st.sleepTarget}h</span></div>`; }
      case 'text': return `<div style="margin-bottom:12px">${lbl}<textarea data-w="${f.key}" rows="${f.rows || 4}" style="min-height:${(f.rows || 4) * 26}px" placeholder="${esc(f.ph || '')}">${esc(D[f.key] || '')}</textarea></div>`;
      case 'num': return `<div style="margin-bottom:14px">${lbl}<div class="stepper"><button class="round-btn minus" data-act="wstep" data-k="${f.key}" data-s="-${f.step}" data-max="${f.max}">−</button>
        <input type="number" class="v" data-w="${f.key}" data-num="1" value="${D[f.key] === '' || D[f.key] == null ? '' : D[f.key]}" step="${f.step}" min="0" max="${f.max}" inputmode="decimal" style="flex:1;text-align:center;font-size:1.6rem;font-weight:800" ${f.optional ? 'placeholder="—"' : ''}>
        <button class="round-btn" data-act="wstep" data-k="${f.key}" data-s="${f.step}" data-max="${f.max}">+</button></div></div>`;
      case 'yesno': return `<div style="margin-bottom:14px">${lbl}<div class="yesno"><button class="y ${D[f.key] === true ? 'on' : ''}" data-act="wset" data-k="${f.key}" data-v="true">Yes</button><button class="n ${D[f.key] === false ? 'on' : ''}" data-act="wset" data-k="${f.key}" data-v="false">No 💪</button></div></div>`;
      case 'toggle': return `<button class="check ${D[f.key] ? 'on' : ''}" data-act="wtoggle" data-k="${f.key}"><span class="box">${D[f.key] ? '✓' : ''}</span><span>${f.label}</span></button>`;
      case 'chips': return `<div style="margin-bottom:12px">${lbl}<div class="chips">${f.opts.map((o) => `<button class="chip ${D[f.key] === o ? 'on' : ''}" data-act="wset" data-k="${f.key}" data-v="${esc(o)}" data-str="1">${esc(o)}</button>`).join('')}</div></div>`;
      case 'goal': { const goals = S.profile.goals.filter(Boolean); return `<div class="chips" style="margin-bottom:8px">${goals.map((g) => `<button class="chip ${D.goal === g ? 'on' : ''}" data-act="wset" data-k="goal" data-v="${esc(g)}" data-str="1">🎯 ${esc(g)}</button>`).join('')}</div>`; }
      case 'list3': return D.priorities.slice(0, 3).map((p, i) => `<label class="lbl">Priority ${i + 1}${i === 0 ? ' — the most important' : ''}</label><input type="text" data-w="prio" data-i="${i}" value="${esc(p.t)}" placeholder="${['e.g. Finish the report', 'e.g. 30-min workout', 'e.g. Call mom'][i]}">`).join('');
      case 'review': { const pr = D.priorities.map((p, i) => ({ ...p, i })).filter((p) => p.t?.trim()); return pr.length ? pr.map((p) => `<button class="check ${p.done ? 'on' : ''}" data-act="wprio" data-i="${p.i}"><span class="box">${p.done ? '✓' : ''}</span><span>${esc(p.t)}</span></button>`).join('') : '<div class="card small muted">No priorities set this morning — that\'s okay. Tomorrow, set them in the morning check-in.</div>'; }
      case 'check': return st[f.key].map((it) => `<button class="check ${D[f.key][it] ? 'on' : ''}" data-act="wchk" data-k="${f.key}" data-item="${esc(it)}"><span class="box">${D[f.key][it] ? '✓' : ''}</span><span>${esc(it)}</span></button>`).join('');
      case 'money': return moneyStepHTML();
      case 'summary': return summaryHTML();
    }
    return '';
  }
  function moneyStepHTML() {
    const list = txOn(wiz.k);
    return `<div class="row"><input type="number" id="w-amt" placeholder="Amount (${esc(S.settings.currency)})" inputmode="decimal" class="grow"><select id="w-cat" style="width:auto">${CATS_OUT.map(([id, ic, n]) => `<option value="${id}">${ic} ${n}</option>`).join('')}</select></div>
      <input type="text" id="w-note" placeholder="What was it? (optional)" style="margin-top:8px">
      <button class="btn block" style="margin-top:8px" data-act="wtx">+ Add expense</button>
      <div style="margin-top:12px">${list.length ? list.map((t) => { const ci = catInfo(t.cat); return `<div class="tx"><div class="cat">${ci[1]}</div><div class="grow small">${esc(t.note || ci[2])}</div><div class="${t.type === 'in' ? 'amt-in' : 'amt-out'}">${t.type === 'in' ? '+' : '−'}${cur(t.amount)}</div></div>`; }).join('') + `<div class="row between" style="margin-top:8px"><span class="muted small">Spent today</span><strong>${cur(spentOn(wiz.k))}</strong></div>` : '<div class="muted small center">Nothing logged today yet. Spent nothing? Amazing — just tap Next.</div>'}</div>`;
  }
  function summaryHTML() {
    const k = wiz.k, d = S.days[k];
    const gained = computeXP() - wiz.xpBefore;
    if (wiz.type === 'morning') {
      const pr = (d.morning?.priorities || []).filter((p) => p.t?.trim());
      return `<div class="center" style="margin:10px 0"><div style="font-size:3rem">🌅</div><div class="pill gold">+${gained} XP</div><div class="small muted" style="margin-top:6px">Finished in ${elapsed()}</div></div>
        <div class="card stack">${d.morning.goal ? `<div><div class="tiny muted">Goal focus</div><strong>${esc(d.morning.goal)}</strong>${d.morning.goalAction ? `<div class="small">→ ${esc(d.morning.goalAction)}</div>` : ''}</div>` : ''}
          ${pr.length ? `<div><div class="tiny muted">Top priorities</div>${pr.map((p, i) => `<div>${i + 1}. ${esc(p.t)}</div>`).join('')}</div>` : ''}
          ${d.morning.intention ? `<div><div class="tiny muted">Today I practice</div><strong>${esc(d.morning.intention)}</strong></div>` : ''}
          <div><div class="tiny muted">Avoid today</div><div class="small">📵 Mindless scrolling · 🍔 Fast food · 🥤 Soda · 🎲 Gambling</div></div>
          <div><div class="tiny muted">Today's laugh</div><div class="small">${esc(daily(C.jokes))}</div></div></div>`;
    }
    const s = scores(k) || {};
    return `<div class="center" style="margin:10px 0"><div style="font-size:3rem">🌟</div><div class="pill gold">+${gained} XP</div><div class="small muted" style="margin-top:6px">Life score today: <strong style="color:var(--gold)">${s.overall ?? '–'}</strong></div></div>
      <div class="grid g3">${DOMAINS.map((dm) => `<div class="card ring-card">${ring(s[dm.id] || 0, dm.color, 54, 6, s[dm.id] ?? 0)}<div class="tiny">${dm.ic} ${dm.name}</div></div>`).join('')}</div>
      <div class="card small" style="margin-top:12px">${HABITS.map((h) => `${h.ic} ${habitStreak(h.id).current}d`).join(' · ')} <span class="muted">— freedom streaks</span></div>
      <div class="card small muted">Sleep well. Phone away from the bed. See you in the morning ☀️</div>`;
  }
  function commitWizard() {
    const D = wiz.draft, d = day(wiz.k);
    d.water = +D.water || 0; d.exercise = +D.exercise || 0; d.deepWork = +D.deepWork || 0;
    d.hygAM = { ...D.hygAM }; d.hygPM = { ...D.hygPM };
    if (wiz.type === 'morning') {
      d.morning = { done: true, at: Date.now(), bed: D.bed, wake: D.wake, sleepQ: D.sleepQ, mood: D.mood, energy: D.energy, gratitude: D.gratitude,
        goal: D.goal, goalAction: D.goalAction, priorities: D.priorities.map((p) => ({ t: (p.t || '').trim(), done: !!p.done })),
        intention: D.intention, intentionText: D.intentionText, weight: D.weight === '' || D.weight == null ? null : +D.weight || null };
    } else {
      if (d.morning) d.morning.priorities = D.priorities;
      const prev = d.evening || {};
      d.evening = { done: true, at: Date.now(), fastFood: !!D.fastFood, soda: !!D.soda, gambled: !!D.gambled, socialMin: +D.socialMin || 0, urges: D.urges,
        mood: D.mood, stress: D.stress, emotion: D.emotion, eq: D.eq, funny: D.funny, win: D.win, lesson: D.lesson, saveJoke: D.saveJoke, jokeId: prev.jokeId || null };
      const joke = S.jokes.find((j) => j.id === d.evening.jokeId);
      if (D.saveJoke && D.funny?.trim()) {
        if (joke) joke.text = D.funny.trim();
        else { const id = uid(); S.jokes.push({ id, date: wiz.k, text: D.funny.trim() }); d.evening.jokeId = id; }
      }
    }
    save();
    checkBadges();
  }

  // ---------- SOS / urge surfing ----------
  let sosTimer = null, sosType = null;
  function openSOS() {
    sosType = null;
    openModal(`<div id="sos-body"></div>`, () => clearInterval(sosTimer));
    renderSOS(0);
  }
  function renderSOS(stage) {
    const b = $('#sos-body'); if (!b) return;
    clearInterval(sosTimer);
    if (stage === 0) {
      b.innerHTML = `<div class="row between"><h2>🌊 Surf the urge</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">✕</button></div>
        <p class="muted small">You opened this instead of giving in. That already counts. What's pulling at you?</p>
        <div class="grid">${[...HABITS, { id: 'other', name: 'Something else', ic: '🌀' }].map((h) => `<button class="card center" data-act="sos-type" data-v="${h.id}"><div style="font-size:2rem">${h.ic}</div><div class="small">${h.name}</div></button>`).join('')}</div>`;
      return;
    }
    const alts = C.alternatives[sosType] || C.alternatives.other;
    let left = 90;
    b.innerHTML = `<div class="row between"><h2>Breathe with the circle</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">✕</button></div>
      <p class="muted small">Urges rise, peak and fall like a wave — usually within minutes. You don't have to act. Just watch it pass.</p>
      <div class="breath" id="breath">Breathe in</div>
      <div class="center"><span class="big-num" id="sos-left">${left}</span><span class="muted"> sec</span></div>
      <div class="card" style="margin-top:12px"><div class="tiny muted">Remember why</div><div class="small">${esc(S.profile.why || S.profile.goals.filter(Boolean).join(' · '))}</div></div>
      <div class="card"><div class="tiny muted" style="margin-bottom:6px">Do this instead</div>${alts.map((a) => `<div class="small" style="padding:3px 0">• ${esc(a)}</div>`).join('')}</div>
      <div class="grid" style="margin-top:14px"><button class="btn" data-act="sos-slip">I slipped</button><button class="btn primary" data-act="sos-won">I beat it 💪</button></div>`;
    let phase = 0;
    const br = $('#breath');
    const cycle = () => { if (!br) return; phase = (phase + 1) % 2; br.className = 'breath ' + (phase ? 'in' : 'out'); br.textContent = phase ? 'Breathe in' : 'Breathe out'; };
    setTimeout(cycle, 50);
    let tick = 0;
    sosTimer = setInterval(() => {
      left = Math.max(0, left - 1); tick++;
      const el = $('#sos-left'); if (el) el.textContent = left;
      if ((phase === 1 && tick % 10 === 4) || (phase === 0 && tick % 10 === 0)) cycle();
      if (left === 0) { clearInterval(sosTimer); if (el) el.parentElement.innerHTML = '<strong style="color:var(--good)">The wave has passed. You did it.</strong>'; }
    }, 1000);
  }
  function logSOS(result) {
    const t = new Date();
    S.sos.push({ date: today(), t: `${pad(t.getHours())}:${pad(t.getMinutes())}`, type: sosType || 'other', result });
    save(); checkBadges(); closeModal();
    if (result === 'won') { toast('💪 Urge defeated! +20 XP'); burst(); }
    else toast('Logged. One slip doesn\'t erase your progress — the next choice is a fresh start. ❤️');
  }

  // ---------- Small modals ----------
  function quickNum(key, title, step) {
    const d = day();
    openModal(`<div class="row between"><h2>${title}</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">✕</button></div>
      <div class="stepper" style="margin:20px 0"><button class="round-btn minus" data-act="qn" data-s="-${step}">−</button><input type="number" id="qn-v" class="v" value="${d[key] || 0}" min="0" inputmode="numeric" style="flex:1;text-align:center;font-size:2rem;font-weight:800"><button class="round-btn" data-act="qn" data-s="${step}">+</button></div>
      <div class="chips" style="margin-bottom:16px">${[10, 20, 30, 45, 60, 90].map((m) => `<button class="chip" data-act="qn-set" data-v="${m}">${m} min</button>`).join('')}</div>
      <button class="btn primary block" data-act="qn-save" data-k="${key}">Save</button>`, () => render());
  }
  function openSettings() {
    const st = S.settings, p = S.profile;
    openModal(`<div class="row between"><h2>⚙️ Settings</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">✕</button></div>
      <label class="lbl">Name</label><input type="text" id="s-name" value="${esc(p.name)}">
      <label class="lbl">Goals</label>${[0, 1, 2].map((i) => `<input type="text" id="s-g${i}" value="${esc(p.goals[i] || '')}" style="margin-bottom:6px" placeholder="Goal ${i + 1}">`).join('')}
      <label class="lbl">Your why</label><textarea id="s-why">${esc(p.why || '')}</textarea>
      <div class="grid">
        <div><label class="lbl">Currency</label><input type="text" id="s-cur" value="${esc(st.currency)}" maxlength="4"></div>
        <div><label class="lbl">Monthly budget</label><input type="number" id="s-budget" value="${st.budget}" min="0"></div>
        <div><label class="lbl">Water goal (glasses)</label><input type="number" id="s-water" value="${st.waterTarget}" min="1" max="30"></div>
        <div><label class="lbl">Sleep goal (hours)</label><input type="number" id="s-sleep" value="${st.sleepTarget}" min="4" max="12" step="0.5"></div>
        <div><label class="lbl">Target bedtime</label><input type="time" id="s-bed" value="${st.bedTime}"></div>
        <div><label class="lbl">Target wake time</label><input type="time" id="s-wake" value="${st.wakeTime}"></div>
        <div><label class="lbl">Social media limit (min/day)</label><input type="number" id="s-social" value="${st.socialLimit}" min="0"></div>
        <div><label class="lbl">Weight unit</label><select id="s-wu"><option ${st.weightUnit === 'kg' ? 'selected' : ''}>kg</option><option ${st.weightUnit === 'lb' ? 'selected' : ''}>lb</option></select></div>
      </div>
      <label class="lbl">Morning routine (one per line)</label><textarea id="s-am">${esc(st.hygAM.join('\n'))}</textarea>
      <label class="lbl">Night routine (one per line)</label><textarea id="s-pm">${esc(st.hygPM.join('\n'))}</textarea>
      <button class="btn primary block" style="margin-top:14px" data-act="save-settings">Save settings</button>
      <div class="sec"><h2>📱 Install & backup</h2></div>
      <div class="card small stack">
        ${installEvt ? '<button class="btn block" data-act="install">⬇️ Install Light as an app</button>' : '<div class="muted"><strong>Install:</strong> on Android/Chrome use ⋮ → “Install app” / “Add to Home screen”. On iPhone use Safari → Share → “Add to Home Screen”. On laptop, click the install icon in the address bar.</div>'}
        <div class="muted">Your data lives only on this device. Export a backup regularly, and use Import to move it to another device.</div>
        <div class="grid"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Import backup</button></div>
        <input type="file" id="import-file" accept="application/json,.json" class="hide">
        <button class="btn danger ghost" data-act="reset">Erase all data</button>
      </div>`, () => render());
  }

  // ---------- Actions ----------
  const A = {
    tab: (el) => { UI.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
    onboard: () => {
      const name = $('#ob-name').value.trim();
      if (!name) { toast('Please enter your name'); $('#ob-name').focus(); return; }
      S.profile = { name, goals: [$('#ob-g1').value.trim(), $('#ob-g2').value.trim(), $('#ob-g3').value.trim()], why: $('#ob-why').value.trim(), created: today() };
      S.settings.currency = $('#ob-cur').value.trim() || '₱';
      S.settings.budget = +$('#ob-budget').value || 0;
      S.settings.bedTime = $('#ob-bed').value || '22:30';
      S.settings.wakeTime = $('#ob-wake').value || '06:30';
      save(); render(); burst(); toast(`Welcome, ${esc(firstName())}! Your light starts today ✨`);
    },
    'open-morning': () => openWizard('morning'),
    'open-evening': () => openWizard('evening'),
    'water+': () => { const d = day(); d.water = (d.water || 0) + 1; save(); if (d.water === S.settings.waterTarget) { burst(); toast('💧 Water goal reached! +10 bonus XP'); } else toast(`💧 +5 XP · ${d.water}/${S.settings.waterTarget}`); checkBadges(); render(); },
    'water-': () => { const d = day(); d.water = Math.max(0, (d.water || 0) - 1); save(); render(); },
    hyg: (el) => { const d = day(); const l = el.dataset.l, it = el.dataset.item; d[l][it] = !d[l][it]; save(); if (hygRatio(d, l) === 1) { burst(); toast(l === 'hygAM' ? '🪥 Morning routine complete!' : '🌙 Night routine complete!'); } checkBadges(); render(); },
    hygtab: (el) => { UI.hyg = el.dataset.v; render(); },
    prio: (el) => { const d = day(); const p = d.morning?.priorities?.[+el.dataset.i]; if (!p) return; p.done = !p.done; save(); if (p.done) { toast('✅ +10 XP — nice!'); burst(); } render(); },
    'log-exercise': () => quickNum('exercise', '🏃 Minutes of exercise today', 5),
    'log-deepwork': () => quickNum('deepWork', '🧠 Minutes of focused work today', 15),
    qn: (el) => { const i = $('#qn-v'); i.value = Math.max(0, (+i.value || 0) + +el.dataset.s); },
    'qn-set': (el) => { $('#qn-v').value = el.dataset.v; },
    'qn-save': (el) => { const d = day(); d[el.dataset.k] = Math.max(0, +$('#qn-v').value || 0); save(); checkBadges(); closeModal(); toast('Saved 💪'); },
    'go-comedy': () => { UI.tab = 'grow'; UI.grow = 'comedy'; render(); window.scrollTo(0, 0); },
    'go-freedom': () => { UI.tab = 'grow'; UI.grow = 'freedom'; render(); window.scrollTo(0, 0); },
    settings: () => openSettings(),
    'modal-close': () => closeModal(),
    sos: () => openSOS(),
    'sos-type': (el) => { sosType = el.dataset.v; renderSOS(1); },
    'sos-won': () => logSOS('won'),
    'sos-slip': () => logSOS('slip'),
    // Wizard
    'wiz-close': () => closeModal(),
    'wiz-next': () => { wiz.step = Math.min(wiz.steps.length - 1, wiz.step + 1); renderWizard(); },
    'wiz-back': () => { wiz.step = Math.max(0, wiz.step - 1); renderWizard(); },
    'wiz-done': () => { const t = wiz.type; wiz = null; closeModal(); burst(); toast(t === 'morning' ? '🌅 Morning check-in complete — go win the day!' : '🌙 Evening check-in complete — rest well!'); },
    wset: (el) => { const k = el.dataset.k; let v = el.dataset.v; if (!el.dataset.str) v = v === 'true' ? true : v === 'false' ? false : +v; wiz.draft[k] = wiz.draft[k] === v && el.dataset.str ? '' : v; renderWizard(); },
    wtoggle: (el) => { wiz.draft[el.dataset.k] = !wiz.draft[el.dataset.k]; renderWizard(); },
    wstep: (el) => { const k = el.dataset.k; const v = Math.round(((+wiz.draft[k] || 0) + +el.dataset.s) * 10) / 10; wiz.draft[k] = clamp(v, 0, +el.dataset.max); renderWizard(); },
    wprio: (el) => { const p = wiz.draft.priorities[+el.dataset.i]; p.done = !p.done; renderWizard(); },
    wchk: (el) => { const o = wiz.draft[el.dataset.k]; o[el.dataset.item] = !o[el.dataset.item]; renderWizard(); },
    wtx: () => {
      const amt = +$('#w-amt').value;
      if (!(amt > 0)) { toast('Enter an amount'); return; }
      S.tx.push({ id: uid(), date: wiz.k, type: 'out', amount: amt, cat: $('#w-cat').value, note: $('#w-note').value.trim() });
      save(); renderWizard(); toast('Logged 🧾');
    },
    // Money
    mtype: (el) => { UI.mType = el.dataset.v; render(); },
    mcat: (el) => {
      UI.mCat = el.dataset.v;
      document.querySelectorAll('[data-act="mcat"]').forEach((b) => b.classList.toggle('on', b === el));
    },
    addtx: () => {
      const amt = +$('#m-amt').value;
      if (!(amt > 0)) { toast('Enter an amount'); $('#m-amt').focus(); return; }
      const date = $('#m-date').value || today();
      S.tx.push({ id: uid(), date, type: UI.mType, amount: amt, cat: UI.mCat, note: $('#m-note').value.trim() });
      save(); checkBadges();
      if (['fastfood', 'soda', 'gambling'].includes(UI.mCat)) toast('Logged honestly — that takes courage. This resets that freedom streak; tomorrow is a fresh start.');
      else toast(UI.mType === 'in' ? '💰 Income logged' : '🧾 Expense logged');
      render();
    },
    deltx: (el) => { if (!confirm('Delete this entry?')) return; S.tx = S.tx.filter((t) => t.id !== el.dataset.id); save(); render(); },
    // Feed
    claim: (el) => {
      const k = today(); if ((S.claims[k] || 0) >= 15) { toast('Daily challenge cap reached — go live your life! 🌍'); return; }
      S.claims[k] = (S.claims[k] || 0) + 1; save(); checkBadges(); burst(el); toast('✨ +10 XP — real life wins!');
      el.disabled = true; el.textContent = 'Done ✓'; el.classList.remove('primary');
    },
    'journal-feed': (el) => {
      const ta = el.parentElement.querySelector('textarea'); const text = ta.value.trim();
      if (!text) { toast('Write something first'); ta.focus(); return; }
      S.journal.push({ id: uid(), date: today(), prompt: el.dataset.p, text }); save(); checkBadges(); toast('📓 Saved to journal · +10 XP');
      ta.disabled = true; el.disabled = true; el.textContent = 'Saved ✓';
    },
    savefeed: (el) => { S.saved.push({ tag: el.dataset.t, body: el.dataset.b }); save(); el.textContent = '🔖 Saved'; el.disabled = true; },
    refeed: () => { feedSeed = Math.floor(Math.random() * 1000); render(); window.scrollTo(0, 0); },
    // Stats
    range: (el) => { UI.range = +el.dataset.v; render(); },
    domain: (el) => { UI.domain = el.dataset.v; render(); },
    // Grow
    growtab: (el) => { UI.grow = el.dataset.v; render(); },
    addjoke: () => { const t = $('#joke-in').value.trim(); if (!t) { toast('Write a joke first — even a terrible one!'); return; } S.jokes.push({ id: uid(), date: today(), text: t }); save(); checkBadges(); burst(); toast('🎤 Joke saved · +10 XP'); render(); },
    deljoke: (el) => { if (!confirm('Delete this joke?')) return; S.jokes = S.jokes.filter((j) => j.id !== el.dataset.id); save(); render(); },
    addjournal: (el) => { const t = $('#journal-in').value.trim(); if (!t) { toast('Write something first'); return; } S.journal.push({ id: uid(), date: today(), prompt: el.dataset.p, text: t }); save(); checkBadges(); toast('📓 Saved · +10 XP'); render(); },
    delsaved: (el) => { S.saved.splice(+el.dataset.i, 1); save(); render(); },
    // Settings
    'save-settings': () => {
      const st = S.settings, p = S.profile;
      p.name = $('#s-name').value.trim() || p.name;
      p.goals = [0, 1, 2].map((i) => $('#s-g' + i).value.trim());
      p.why = $('#s-why').value.trim();
      st.currency = $('#s-cur').value.trim() || st.currency;
      st.budget = Math.max(0, +$('#s-budget').value || 0);
      st.waterTarget = clamp(+$('#s-water').value || 8, 1, 30);
      st.sleepTarget = clamp(+$('#s-sleep').value || 8, 4, 12);
      st.bedTime = $('#s-bed').value || st.bedTime;
      st.wakeTime = $('#s-wake').value || st.wakeTime;
      st.socialLimit = Math.max(0, +$('#s-social').value || 0);
      st.weightUnit = $('#s-wu').value;
      const lines = (id) => $(id).value.split('\n').map((x) => x.trim()).filter(Boolean);
      st.hygAM = lines('#s-am').length ? lines('#s-am') : st.hygAM;
      st.hygPM = lines('#s-pm').length ? lines('#s-pm') : st.hygPM;
      save(); closeModal(); toast('Settings saved');
    },
    export: () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `light-backup-${today()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Backup downloaded');
    },
    import: () => $('#import-file').click(),
    reset: () => {
      if (!confirm('Erase ALL Light data on this device? This cannot be undone. (Export a backup first if unsure.)')) return;
      if (!confirm('Really erase everything?')) return;
      localStorage.removeItem(KEY); S = DEFAULTS(); wiz = null; closeModal(); render();
    },
    install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; closeModal(); },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && A[el.dataset.act]) { e.preventDefault(); A[el.dataset.act](el); return; }
    if (e.target.id === 'modal' && !wiz) closeModal();
  });
  // Wizard free-text / time / number inputs (no re-render, keeps focus)
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!wiz || !el.dataset.w) return;
    const k = el.dataset.w;
    if (k === 'prio') { wiz.draft.priorities[+el.dataset.i].t = el.value; return; }
    wiz.draft[k] = el.dataset.num ? (el.value === '' ? '' : +el.value) : el.value;
    if (k === 'bed' || k === 'wake') { const s = $('#sleep-h'); if (s) s.textContent = sleepHours(wiz.draft) ?? '–'; }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'import-file') return;
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || typeof data !== 'object' || !data.days || !data.settings) throw new Error('bad');
        if (!confirm('Replace the data on this device with this backup?')) return;
        S = { ...DEFAULTS(), ...data, settings: { ...DEFAULTS().settings, ...data.settings } };
        save(); closeModal(); render(); toast('Backup restored ✓');
      } catch (err) { toast('That file is not a valid Light backup.'); }
    };
    r.readAsText(f);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  $('#sos').addEventListener('click', openSOS);

  // ---------- Toast & confetti ----------
  let toastT = null;
  function toast(msg) {
    const t = $('#toast'); t.innerHTML = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }
  const fx = $('#fx'), ctx = fx.getContext('2d');
  let parts = [], fxRunning = false;
  function burst(el) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dpr = window.devicePixelRatio || 1;
    fx.width = innerWidth * dpr; fx.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    const ox = r ? r.left + r.width / 2 : innerWidth / 2, oy = r ? r.top + r.height / 2 : innerHeight / 3;
    const colors = ['#ffd166', '#ff9f43', '#3ddc97', '#6ea8ff', '#ff7eb6', '#b48cff'];
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
      parts.push({ x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, life: 60 + Math.random() * 40, c: colors[i % colors.length], sz: 3 + Math.random() * 4, rot: Math.random() * 6 });
    }
    if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); }
  }
  function fxLoop() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.98; p.life--; p.rot += 0.2;
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life / 30); ctx.fillStyle = p.c; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz * 0.6); ctx.restore();
    }
    if (parts.length) requestAnimationFrame(fxLoop); else { fxRunning = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  // ---------- PWA ----------
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Re-render when returning to the app (e.g. new day) — but never while a modal is open.
  let lastDay = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && today() !== lastDay && $('#modal').hidden) { lastDay = today(); render(); }
  });

  // Debug/testing hook
  window.__light = { get state() { return S; }, scores, computeXP, render };

  checkBadges();
  render();
})();
