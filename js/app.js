// Light — UI layer: rendering, navigation, modals, check-in wizards, focus timer.
// Domain logic lives in core.js; persistence in store.js.
import C from './content.js';
import { S, save, day, snapshotDaily, backupInfo, replaceState, resetState, DEFAULTS } from './store.js';
import {
  minutesOf, $, $$, esc, pad, parseKey, addDays, today, clamp, avg, sum, uid, hour, lastN, fmtDate, round1, daily, weekStart,
} from './util.js';
import {
  DOMAINS, HABITS, CATS_OUT, CATS_IN, CATS_SAVE, BAD_CATS, catInfo, cur, goals, sleepHours, hygRatio, txOn, spentOn,
  jokesOn, savedTotal, monthTotals, slipsOn, habitStreak, checkinStreak, scores, rangeScores, computeXP, levelOf, xpFor,
  titleOf, quests, BADGES, awardBadges, chestReady, rollChest, reviewDue, latestReview, weekSummary, recommendations,
  projection, insights, buildICS, heatmapKeys,
} from './core.js';
import { ring, lineChart, barChart, heatmap } from './charts.js';
import { icon, ico, iconize } from './icons.js';
import { LEVELS, GROUPS, EXERCISES, WORKOUTS, WEEK_PLAN, exercise, workout, workoutSteps, workoutMinutes, suggestWorkout, levelInfo } from './fitness.js';
import { dayPlan } from './plan.js';
import { pickKind, nudge, dwellSignal, splitJoke, SIGNAL, pickIndex, pruneSeen, TOPICS, topicKinds } from './feed.js';

const APP_VERSION = '2.6.0';

// ---------- Feedback: toast, haptics, confetti, notifications ----------
let toastT = null;
function toast(msg, { undo, action, ms } = {}) {
  const t = $('#toast');
  const act = undo ? { label: 'Undo', fn: undo } : action;
  t.innerHTML = `<span>${msg}</span>${act ? `<button class="toast-btn" type="button">${esc(act.label)}</button>` : ''}`;
  if (act) t.querySelector('button').onclick = () => { t.classList.remove('show'); act.fn(); };
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms || (act ? 6000 : 2800));
}
const buzz = (p = 12) => { if (S.settings.haptics && navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) try { navigator.vibrate(p); } catch { /* unsupported */ } };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const fx = $('#fx'), ctx = fx.getContext('2d');
let parts = [], fxRunning = false;
function burst(el) {
  if (reducedMotion()) return;
  const dpr = window.devicePixelRatio || 1;
  fx.width = innerWidth * dpr; fx.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = el?.getBoundingClientRect ? el.getBoundingClientRect() : null;
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
function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
  navigator.serviceWorker?.getRegistration().then((r) => (r ? r.showNotification(title, opts) : new Notification(title, opts))).catch(() => {});
}

/** Save + award badges. Every mutation goes through here. */
function persist() {
  if (!save()) toast('⚠️ Could not save — storage may be full. Export a backup in Settings.', { ms: 6000 });
  const fresh = awardBadges();
  if (fresh.length) {
    save();
    const b = fresh[fresh.length - 1];
    setTimeout(() => { toast(`🏅 Badge unlocked: ${b.ic} ${b.n} · +50 XP`); burst(); buzz([30, 40, 30]); }, 450);
  }
}

// ---------- Rendering ----------
const UI = { tab: 'today', range: 30, domain: 'overall', grow: 'fitness', hyg: null, fitGroup: 'All', mType: 'out', mCat: 'food' };
const TABS = [['today', 'sun', 'Today'], ['money', 'wallet', 'Money'], ['feed', 'sparkles', 'Feed'], ['stats', 'chart', 'Stats'], ['grow', 'sprout', 'Grow']];
const firstName = () => (S.profile?.name || 'friend').split(' ')[0];

/**
 * Re-render the current screen. The feed is stateful (scroll position, loaded cards),
 * so a plain render() while it's mounted only refreshes the nav; pass { full: true } to rebuild it.
 */
function render({ full = false } = {}) {
  const nav = $('#nav'), view = $('#view');
  try {
    if (!S.profile) {
      nav.innerHTML = ''; nav.classList.add('hide'); $('#sos').classList.add('hide');
      document.body.classList.remove('feed-mode');
      view.innerHTML = viewOnboard();
      return;
    }
    nav.classList.remove('hide'); $('#sos').classList.remove('hide');
    nav.innerHTML = `<img class="nav-logo" src="icons/icon.svg" alt="Light">` + TABS.map(([id, ic, n]) =>
      `<button class="nav-btn ${UI.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}" ${UI.tab === id ? 'aria-current="page"' : ''}><span class="ic">${icon(ic, 22)}</span>${n}</button>`).join('');
    document.body.classList.toggle('feed-mode', UI.tab === 'feed');
    if (UI.tab === 'feed' && !full && $('#feed-stage')) return;
    view.innerHTML = iconize(({ today: viewToday, money: viewMoney, feed: viewFeed, stats: viewStats, grow: viewGrow })[UI.tab]());
    if (UI.tab === 'feed') feedInit();
  } catch (err) {
    // Error boundary: never leave the user with a blank screen, and never touch their data.
    console.error(err);
    view.innerHTML = `<div class="card stack" style="margin-top:20px"><h2>😵 Something went wrong on this screen</h2>
      <p class="small muted">Your data is safe. Try another tab or reload. If it keeps happening, export a backup from Settings.</p>
      <div class="row wrap"><button class="btn primary" onclick="location.reload()">Reload</button><button class="btn" data-act="tab" data-tab="today">Go to Today</button><button class="btn" data-act="export">Export backup</button></div>
      <details class="tiny muted"><summary>Technical details</summary><pre style="white-space:pre-wrap">${esc(err && err.stack || err)}</pre></details></div>`;
  }
}
// ---------- Routing: the URL remembers where you are (refresh, back button) ----------
const GROW_TABS = ['fitness', 'comedy', 'eq', 'glow', 'freedom', 'journal', 'badges'];
function routeFromHash() {
  const [tab, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const r = { tab: TABS.some((t) => t[0] === tab) ? tab : 'today' };
  if (GROW_TABS.includes(sub)) r.grow = sub;
  return r;
}
const hashFor = () => `#/${UI.tab}${UI.tab === 'grow' ? '/' + UI.grow : ''}`;
function syncHash(replace = false) {
  const h = hashFor();
  if (location.hash === h) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', h);
}

const go = (tab, extra = {}, { push = true } = {}) => {
  if (UI.tab === 'feed' && tab !== 'feed') { const prev = feed.items[feed.active]; if (prev && prev.kind !== 'pause') nudge(S.feedPrefs, prev.kind, dwellSignal(Date.now() - feed.activeAt)); save(); }
  Object.assign(UI, extra, { tab }); if (S.profile) syncHash(!push); render({ full: true }); window.scrollTo(0, 0);
  const v = $('#view');
  v.classList.remove('view-enter'); void v.offsetWidth; v.classList.add('view-enter'); // page-enter animation on tab change only
  // Safety net: if the browser skips/pauses animations (background tab, power saver), never leave content invisible.
  clearTimeout(go.t); go.t = setTimeout(() => v.classList.remove('view-enter'), 900);
  if (tab !== 'feed') v.focus({ preventScroll: true });
};

// ---------- Theme ----------
const ACCENTS = [['sunrise', 'Sunrise'], ['ocean', 'Ocean'], ['aurora', 'Aurora'], ['forest', 'Forest']];
const prefersLight = window.matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const t = S.settings.theme || 'dark';
  const resolved = t === 'auto' ? (prefersLight.matches ? 'light' : 'dark') : t;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.accent = S.settings.accent || 'sunrise';
  $('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f5f4f0' : '#080b16');
}
prefersLight.addEventListener?.('change', () => { if (S.settings.theme === 'auto') applyTheme(); });

// ----- Onboarding -----
function viewOnboard() {
  return `<div class="onboard stack">
    <div class="orb-wrap"><div class="orb"></div></div>
    <h1 class="center">Welcome to Light</h1>
    <p class="center muted">Your daily guide for focus, health, money, character and joy. 10 minutes in the morning, 10 at night. Everything stays private on this device.</p>
    <form class="card stack" data-form="onboard" novalidate>
      <div><label class="lbl" for="ob-name">What should I call you?</label><input type="text" id="ob-name" placeholder="Your name" autocomplete="given-name" required></div>
      <div><label class="lbl" for="ob-g1">Your 3 biggest goals for this year</label>
        <input type="text" id="ob-g1" placeholder="e.g. Get promoted / land a better job">
        <input type="text" id="ob-g2" placeholder="e.g. Lose 8 kg and get fit" style="margin-top:8px" aria-label="Goal 2">
        <input type="text" id="ob-g3" placeholder="e.g. Save 50,000 and stop gambling" style="margin-top:8px" aria-label="Goal 3"></div>
      <div><label class="lbl" for="ob-why">Why do these goals matter to you? (you'll see this when urges hit)</label>
        <textarea id="ob-why" placeholder="e.g. I want my family to be proud. I want to feel free and confident."></textarea></div>
      <div class="grid">
        <div><label class="lbl" for="ob-cur">Currency symbol</label><input type="text" id="ob-cur" value="${esc(S.settings.currency)}" maxlength="4"></div>
        <div><label class="lbl" for="ob-budget">Monthly spending budget</label><input type="number" id="ob-budget" value="${S.settings.budget}" min="0" inputmode="decimal"></div>
        <div><label class="lbl" for="ob-bed">Usual bedtime</label><input type="time" id="ob-bed" value="${S.settings.bedTime}"></div>
        <div><label class="lbl" for="ob-wake">Usual wake time</label><input type="time" id="ob-wake" value="${S.settings.wakeTime}"></div>
      </div>
      <button class="btn primary block" type="submit">Begin my journey ✨</button>
      <button class="btn ghost block small" type="button" data-act="import">I have a backup — restore it</button>
      <input type="file" id="import-file" accept="application/json,.json" class="hide">
    </form>
  </div>`;
}

// ----- Today -----
/** The single most useful thing to do right now — one decision instead of a wall of options. */
function nextUp() {
  const k = today(), d = S.days[k] || {}, st = S.settings, h = hour();
  if (S.timer) return null;
  if (!d.morning && h < 14) return { ic: '🌅', kick: 'Next up', t: 'Morning check-in', s: '10 minutes to set up a great day', act: 'open-morning', cta: 'Start' };
  if (h >= 18 && !d.evening) return { ic: '🌙', kick: 'Next up', t: 'Evening check-in', s: 'Close the day honestly · up to 200 XP', act: 'open-evening', cta: 'Start' };
  const p = d.morning?.priorities?.find((x) => x.t?.trim() && !x.done);
  if (p && h < 20) return { ic: '🎯', kick: 'Focus on', t: p.t, s: 'Start a focus session and protect it', act: 'focus', cta: 'Focus' };
  if ((d.water || 0) < st.waterTarget) return { ic: '💧', kick: 'Quick win', t: `Drink a glass of water (${d.water || 0}/${st.waterTarget})`, s: '+5 XP · takes 30 seconds', act: 'water+', cta: '+1' };
  if (h >= 20 && hygRatio(d, 'hygPM') < 1) return { ic: '🪥', kick: 'Wind down', t: 'Night routine', s: 'Look after future-you', act: 'hyg-pm', cta: 'Open' };
  if (!jokesOn(k) && !d.evening?.funny) return { ic: '😂', kick: 'Comedy rep', t: 'Write one joke today', s: daily(C.comedy).p, act: 'go-comedy', cta: 'Write' };
  return { ic: '✨', kick: 'All caught up', t: 'You’re winning today', s: 'Explore the feed or go live your life', act: 'tab', tab: 'feed', cta: 'Feed' };
}
function nextUpHTML() {
  const n = nextUp();
  if (!n) return '';
  return `<button class="card next-up" data-act="${n.act}" ${n.tab ? `data-tab="${n.tab}"` : ''}>
    <span class="nu-ic" aria-hidden="true">${n.ic}</span>
    <span class="grow"><span class="nu-kick">${n.kick}</span><strong class="nu-t">${esc(n.t)}</strong><span class="nu-s">${esc(n.s)}</span></span>
    <span class="nu-cta">${n.cta} ${icon('arrowRight', 15)}</span></button>`;
}
function focusCardHTML() {
  if (S.timer) {
    return `<button class="card focus-live" data-act="focus"><span class="big" aria-hidden="true">⏱️</span><span class="grow" style="text-align:left"><strong>Focusing: ${esc(S.timer.label || 'Deep work')}</strong><br><span class="small muted"><span data-timer-text>${timerLeftText()}</span> left · tap to open</span></span></button>`;
  }
  const d = S.days[today()] || {};
  return `<button class="card focus-start" data-act="focus"><span class="big" aria-hidden="true">⏱️</span><span class="grow" style="text-align:left"><strong>Start a focus session</strong><br><span class="small muted">${d.deepWork || 0} of 60 min focused today</span></span><span class="pill gold">Start</span></button>`;
}
/** Section header: emoji token (turned into a line icon), title, optional right-side action. */
const secH = (ic, title, right = '', id = '') => `<div class="sec"${id ? ` id="${id}"` : ''}><h2>${ic} ${title}</h2>${right}</div>`;
/** Next streak milestone, for the little progress rings on streak cards. */
const MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365];
const nextMilestone = (n) => MILESTONES.find((m) => m > n) || n + 100;

const fmtClock = (m) => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** Time-of-day plan built from your wake/bed times (see plan.js). */
function planHTML() {
  const p = dayPlan();
  const cur = p.blocks[p.current];
  if (!cur) return '';
  const nxt = p.blocks[p.current + 1] || p.blocks[0];
  const item = (x) => `<button class="plan-item ${x.done ? 'done' : ''}" data-act="${x.act}" data-k="${x.id}"${x.w ? ` data-w="${x.w}"` : ''}${x.tab ? ` data-tab="${x.tab}"` : ''}>
      <span class="q-ic" aria-hidden="true">${x.done ? '✅' : x.ic}</span>
      <span class="grow"><span class="pi-t">${esc(x.t)}</span>${x.s && !x.done ? `<span class="pi-s">${esc(x.s)}</span>` : ''}</span>
      <span class="pi-go" aria-hidden="true">${x.done ? '' : icon(x.act === 'plan-tick' ? 'check' : 'arrowRight', 16)}</span></button>`;
  const pct = Math.round((cur.doneCount / cur.items.length) * 100);
  return `${secH('🧭', 'Right now', `<span class="tiny muted">${fmtClock(cur.from)} – ${fmtClock(cur.to)}</span>`)}
  <section class="card plan-card">
    <div class="plan-head"><span class="nu-ic plan-ic">${ico(cur.ic, 24)}</span><div class="grow"><strong>${cur.title}</strong><div class="tiny muted">${cur.doneCount} of ${cur.items.length} done</div></div><span class="pill gold">${pct}%</span></div>
    <div class="xpbar thin" style="margin:10px 0 6px"><i style="width:${pct}%"></i></div>
    ${cur.items.map(item).join('')}
    <details class="plan-day"><summary>${icon('calendar', 15)} Coming up: <strong>${nxt.title}</strong> at ${fmtClock(nxt.from)}<span class="pd-more">Full day</span></summary>
      <ol class="plan-tl">${p.blocks.map((b) => `<li class="${b.current ? 'now' : b.past ? 'past' : ''}"><span class="pt-time">${fmtClock(b.from)}</span><span class="grow"><strong>${b.title}</strong><span class="tiny muted"> · ${b.doneCount}/${b.items.length}</span><span class="pt-items tiny muted">${b.items.map((x) => esc(x.t)).join(' · ')}</span></span></li>`).join('')}</ol>
    </details>
  </section>`;
}
function viewToday() {
  const k = today(), d = S.days[k] || {}, st = S.settings, y = addDays(k, -1);
  const xp = computeXP(), lvl = levelOf(xp), lo = xpFor(lvl), hi = xpFor(lvl + 1);
  const q = quests(), qd = q.filter((x) => x.done).length, pct = Math.round((qd / q.length) * 100);
  const h = hour();
  const greet = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const w = daily(C.wisdom), lesson = daily(C.eq, 1), glow = daily(C.glow.do, 2), avoid = daily(C.glow.avoid, 5);
  const gs = goals();
  const pr = (d.morning?.priorities || []).map((p, i) => ({ ...p, i })).filter((p) => p.t?.trim());
  const hygTab = UI.hyg || (h < 15 ? 'hygAM' : 'hygPM');
  const streak = checkinStreak();
  const missedYesterday = S.profile.created <= y && !S.days[y]?.evening && h < 15;
  const lr = latestReview();
  const water = d.water || 0;
  const todo = q.filter((x) => !x.done), done = q.filter((x) => x.done);
  const questRow = (x) => {
    const tag = x.act && !x.done ? 'button' : 'div';
    return `<${tag} class="quest ${x.done ? 'done' : ''} ${tag === 'button' ? 'quest-btn' : ''}" ${tag === 'button' ? `data-act="${x.act}"` : ''}>
      <div class="q-ic" aria-hidden="true">${x.done ? '✅' : x.ic}</div><div class="grow q-t small">${x.t}${x.done ? '<span class="sr-only"> (done)</span>' : ''}</div><div class="q-xp">+${x.xp}</div></${tag}>`;
  };
  const stat = (ic, v, l) => `<div class="hstat"><span class="hstat-ic">${icon(ic, 16)}</span><strong>${v}</strong><span>${l}</span></div>`;

  return `
  <header class="today-head">
    <button class="avatar" data-act="settings" aria-label="Profile and settings">${esc((firstName()[0] || '✨').toUpperCase())}</button>
    <div class="grow"><div class="muted small">${fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>${greet}, ${esc(firstName())}</h1></div>
    <button class="icon-btn" data-act="settings" aria-label="Settings">${icon('settings', 20)}</button>
  </header>

  <section class="card hero today-hero" aria-label="Your progress today">
    <div class="hero-top">
      <div class="orb-wrap"><div class="orb" style="opacity:${0.72 + pct / 360}"></div>
        <div class="orb-ring">${ring(pct, 'var(--gold)', 112, 6, '', `${pct}% of today's quests done`)}</div><div class="orb-num" aria-hidden="true">${pct}<small>%</small></div></div>
      <div class="grow">
        <div class="tiny muted hero-kick">Level ${lvl}</div>
        <div class="hero-title">${titleOf(lvl)}</div>
        <div class="xpbar" style="margin:10px 0 6px" role="progressbar" aria-label="XP to next level" aria-valuemin="0" aria-valuemax="${hi - lo}" aria-valuenow="${xp - lo}"><i style="width:${((xp - lo) / (hi - lo)) * 100}%"></i></div>
        <div class="tiny muted">${hi - xp} XP to level ${lvl + 1}</div>
      </div>
    </div>
    <div class="hero-stats">
      ${stat('flame', streak, streak === 1 ? 'day streak' : 'day streak')}
      ${stat('checkCircle', `${qd}/${q.length}`, 'quests')}
      ${stat('droplet', `${water}/${st.waterTarget}`, 'water')}
      ${stat('timer', `${d.deepWork || 0}m`, 'focus')}
    </div>
  </section>

  ${nextUpHTML()}
  ${chestReady() ? `<button class="card chest-card" data-act="chest"><span class="chest-ic" aria-hidden="true">🎁</span><span class="grow" style="text-align:left"><strong>Daily reward unlocked!</strong><br><span class="small muted">You completed both check-ins. Open your chest.</span></span><span class="pill gold">Open</span></button>` : ''}
  ${missedYesterday ? `<button class="card banner-btn" data-act="open-evening-y"><span class="ico" aria-hidden="true">🕰️</span> <span><strong>Yesterday's evening check-in is missing.</strong> <span class="small muted">Log it now so your stats stay true.</span></span></button>` : ''}
  ${reviewDue() ? `<button class="card banner-btn" data-act="open-weekly"><span class="ico" aria-hidden="true">🗓️</span> <span><strong>Your weekly review is ready.</strong> <span class="small muted">See your week, update goals, pick one thing to improve · +100 XP</span></span></button>` : ''}

  ${planHTML()}

  <nav class="quick" aria-label="Quick actions">
    <button class="qa" data-act="water+"><span class="qa-ic" style="--qa:var(--blue)">${icon('droplet', 20)}</span>Water</button>
    <button class="qa" data-act="focus"><span class="qa-ic" style="--qa:var(--accent)">${icon('timer', 20)}</span>Focus</button>
    <button class="qa" data-act="log-exercise"><span class="qa-ic" style="--qa:var(--good)">${icon('activity', 20)}</span>Move</button>
    <button class="qa" data-act="tab" data-tab="money"><span class="qa-ic" style="--qa:var(--amber)">${icon('wallet', 20)}</span>Spend</button>
    <button class="qa" data-act="go-comedy"><span class="qa-ic" style="--qa:var(--pink)">${icon('mic', 20)}</span>Joke</button>
    <button class="qa" data-act="sos"><span class="qa-ic" style="--qa:var(--bad)">${icon('wind', 20)}</span>Urge</button>
  </nav>

  <div class="grid checkins">
    <button class="card checkin-card ${d.morning ? 'done' : ''}" data-act="open-morning"><span class="big" aria-hidden="true">🌅</span><span><strong>Morning</strong><br><span class="small muted">${d.morning ? 'Done · tap to edit' : '10-min check-in'}</span></span></button>
    <button class="card checkin-card ${d.evening ? 'done' : ''}" data-act="open-evening"><span class="big" aria-hidden="true">🌙</span><span><strong>Evening</strong><br><span class="small muted">${d.evening ? 'Done · tap to edit' : '10-min check-in'}</span></span></button>
  </div>

  ${secH('📖', 'Today’s guide', '<span class="tiny muted swipe-hint">swipe →</span>')}
  <div class="guide" role="list">
    <article class="guide-card" role="listitem" style="--tint:var(--accent)"><div class="g-kick">${icon('sparkle', 14)} Wisdom</div><div class="quote">“${esc(w.q)}”</div><div class="quote-a">— ${esc(w.a)}</div></article>
    <article class="guide-card" role="listitem" style="--tint:var(--violet)"><div class="g-kick">${icon('heart', 14)} EQ lesson</div><h3>${esc(lesson.t)}</h3><p class="small">${esc(lesson.b)}</p></article>
    <article class="guide-card" role="listitem" style="--tint:var(--teal)"><div class="g-kick">${icon('sparkles', 14)} Glow-up</div><p class="small"><strong>Do:</strong> ${esc(glow)}</p><p class="small" style="margin-top:8px"><strong>Avoid:</strong> ${esc(avoid)}</p></article>
  </div>

  ${secH('🎯', 'Focus', '<button class="btn sm ghost" data-act="settings">Edit goals</button>')}
  <div class="card">
    ${d.morning?.goal ? `<div class="today-goal"><span class="tiny muted">Today’s goal</span><strong>${esc(d.morning.goal)}</strong>${d.morning.goalAction ? `<span class="small">${icon('arrowRight', 14)} ${esc(d.morning.goalAction)}</span>` : ''}</div>` : ''}
    ${gs.length ? `<div class="goal-list">${gs.map((g) => `<div><div class="row between small"><span>${esc(g.t)}</span><span class="muted">${g.p}%</span></div><div class="xpbar thin"><i style="width:${g.p}%"></i></div></div>`).join('')}</div>` : '<div class="small muted">Add your goals in Settings.</div>'}
    ${lr?.nextWeek && weekStart(today()) > lr.week ? `<div class="insight small" style="margin-top:12px">This week’s commitment: <strong>${esc(lr.nextWeek)}</strong></div>` : ''}
    ${pr.length ? `<div class="small muted" style="margin:16px 0 8px">Top priorities</div>` + pr.map((p) =>
      `<button class="check ${p.done ? 'on' : ''}" data-act="prio" data-i="${p.i}" aria-pressed="${!!p.done}"><span class="box" aria-hidden="true">${p.done ? '✓' : ''}</span><span>${esc(p.t)}</span></button>`).join('')
      : `<button class="btn sm" style="margin-top:14px" data-act="open-morning">Set today's top 3 priorities</button>`}
  </div>
  ${focusCardHTML()}

  ${secH('🗺️', 'Daily quests', `<span class="pill gold">${qd}/${q.length}</span>`)}
  <div class="card">
    <div class="xpbar thin" style="margin:0 0 6px" aria-hidden="true"><i style="width:${pct}%"></i></div>
    ${todo.map(questRow).join('') || '<div class="empty" style="padding:14px">Every quest done. Legendary.</div>'}
    ${done.length ? `<details class="done-list"><summary>${icon('checkCircle', 16)} Completed (${done.length})</summary>${done.map(questRow).join('')}</details>` : ''}
  </div>

  <div class="grid duo">
    <section>
      ${secH('💧', 'Water', `<span class="muted small">${(water * 0.25).toFixed(2).replace(/\.?0+$/, '')} L</span>`)}
      <div class="card water-card">
        <div class="water-num"><strong>${water}</strong><span>/ ${st.waterTarget} glasses</span></div>
        <div class="glasses" role="img" aria-label="${water} of ${st.waterTarget} glasses">${Array.from({ length: Math.max(st.waterTarget, water) }, (_, i) => `<span class="glass ${i < water ? 'full' : ''}"></span>`).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="round-btn minus" data-act="water-" aria-label="Remove a glass">−</button><button class="btn primary grow" data-act="water+">${icon('plus', 18)} Add a glass</button></div>
      </div>
    </section>
    <section>
      ${secH('🪥', 'Hygiene', `<div class="seg mini" role="tablist"><button role="tab" aria-selected="${hygTab === 'hygAM'}" class="${hygTab === 'hygAM' ? 'on' : ''}" data-act="hygtab" data-v="hygAM">${icon('sun', 14)}AM</button><button role="tab" aria-selected="${hygTab === 'hygPM'}" class="${hygTab === 'hygPM' ? 'on' : ''}" data-act="hygtab" data-v="hygPM">${icon('moon', 14)}PM</button></div>`, 'hyg-sec')}
      <div class="card"><div class="hyg-grid">${st[hygTab].map((it) => { const on = d[hygTab]?.[it]; return `<button class="hchip ${on ? 'on' : ''}" data-act="hyg" data-l="${hygTab}" data-item="${esc(it)}" aria-pressed="${!!on}"><span class="hbox" aria-hidden="true">${on ? icon('check', 14) : ''}</span><span>${esc(it)}</span></button>`; }).join('')}</div>
        <div class="tiny muted" style="margin-top:10px">${Math.round(hygRatio(d, hygTab) * 100)}% done</div></div>
    </section>
  </div>

  ${secH('🛡️', 'Freedom streaks', '<button class="btn sm ghost" data-act="go-freedom">Details</button>')}
  <div class="grid g4 streaks">${HABITS.map((hb) => {
    const s = habitStreak(hb.id), m = nextMilestone(s.current);
    return `<div class="card streak"><div class="streak-ring">${ring((s.current / m) * 100, 'var(--accent)', 58, 5)}<span class="ic" aria-hidden="true">${hb.ic}</span></div><div class="n">${s.current}</div><div class="tiny muted">days · ${hb.name.toLowerCase()}</div><div class="tiny streak-next">next: ${m}</div></div>`;
  }).join('')}</div>

  ${secH('💡', 'Recommended for you')}
  <div class="card tips">${recommendations().map(([ic, t]) => `<div class="quest"><div class="q-ic" aria-hidden="true">${ic}</div><div class="grow small">${t}</div></div>`).join('')}</div>

  <div class="card joke-card">
    <div class="g-kick" style="--tint:var(--pink)">${icon('smile', 14)} Joke of the day</div>
    <p>${esc(daily(C.jokes))}</p>
    <button class="btn sm" data-act="go-comedy">${icon('pen', 15)} Write your own · +10 XP</button>
  </div>`;
}

// ----- Money -----
function viewMoney() {
  const k = today(), st = S.settings;
  const { month, out, inc, saved } = monthTotals(k);
  const dt = parseKey(k), dim = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate(), dleft = dim - dt.getDate() + 1;
  const left = st.budget - out, perDay = Math.max(0, left / dleft);
  const byCat = {};
  for (const t of month.filter((t) => t.type === 'out')) byCat[t.cat] = (byCat[t.cat] || 0) + +t.amount;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;
  const days14 = lastN(14).map((x) => ({ label: fmtDate(x, { day: 'numeric' }), v: spentOn(x) }));
  const bad = sum(month.filter((t) => t.type === 'out' && BAD_CATS.includes(t.cat)).map((t) => +t.amount));
  const catList = { out: CATS_OUT, in: CATS_IN, save: CATS_SAVE }[UI.mType];
  if (!catList.find((c) => c[0] === UI.mCat)) UI.mCat = catList[0][0];
  const list = [...month].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const sv = savedTotal(), sg = st.savingsGoal;
  const sign = { out: '−', in: '+', save: '→' }, cls = { out: 'amt-out', in: 'amt-in', save: 'amt-save' };

  return `
  <h1>Money</h1>
  <div class="card" style="margin-top:14px">
    <div class="row between"><div><div class="small muted">Spent in ${dt.toLocaleDateString(undefined, { month: 'long' })}</div><div class="big-num">${cur(out)}</div></div>
      ${ring(st.budget ? (out / st.budget) * 100 : 0, out > st.budget ? 'var(--bad)' : 'var(--amber)', 72, 8, st.budget ? Math.round((out / st.budget) * 100) + '%' : '–', 'Share of monthly budget used')}</div>
    <div class="grid g3" style="margin-top:12px">
      <div><div class="tiny muted">Budget left</div><strong style="color:${left < 0 ? 'var(--bad)' : 'var(--good)'}">${cur(left)}</strong></div>
      <div><div class="tiny muted">Safe per day</div><strong>${cur(Math.round(perDay))}</strong></div>
      <div><div class="tiny muted">Income</div><strong class="amt-in">${cur(inc)}</strong></div>
    </div>
    ${bad > 0 ? `<div class="insight" style="margin-top:12px;border-left-color:var(--bad)">🍔🥤🎲 You spent <strong>${cur(bad)}</strong> on fast food, soda and gambling this month. That's ${cur(bad * 12)} a year at this pace.</div>` : ''}
  </div>

  <div class="card">
    <div class="row between"><div><div class="small muted">🏦 ${esc(st.savingsName || 'Savings')}</div><div class="big-num" style="font-size:1.4rem">${cur(sv)}${sg ? ` <span class="small muted">of ${cur(sg)}</span>` : ''}</div></div>
      ${sg ? ring((sv / sg) * 100, 'var(--teal)', 60, 7, Math.min(100, Math.round((sv / sg) * 100)) + '%', 'Savings goal progress') : `<button class="btn sm" data-act="settings">Set a goal</button>`}</div>
    ${saved ? `<div class="tiny muted" style="margin-top:6px">${cur(saved)} saved this month</div>` : ''}
  </div>

  <div class="sec"><h2>➕ Add</h2></div>
  <form class="card" data-form="addtx" novalidate>
    <div class="seg" role="tablist">${[['out', 'Spent'], ['in', 'Received'], ['save', 'Saved']].map(([v, n]) => `<button type="button" role="tab" aria-selected="${UI.mType === v}" class="${UI.mType === v ? 'on' : ''}" data-act="mtype" data-v="${v}">${n}</button>`).join('')}</div>
    <div class="row" style="margin-top:12px"><input type="number" id="m-amt" aria-label="Amount" placeholder="Amount (${esc(st.currency)})" inputmode="decimal" min="0" step="any" class="grow" required><input type="date" id="m-date" aria-label="Date" value="${k}" max="${k}" style="width:auto"></div>
    <div class="chips" style="margin-top:12px" role="radiogroup" aria-label="Category">${catList.map(([id, ic, n]) => `<button type="button" role="radio" aria-checked="${UI.mCat === id}" class="chip ${UI.mCat === id ? 'on' : ''}" data-act="mcat" data-v="${id}">${ico(ic, 16)}${n}</button>`).join('')}</div>
    <input type="text" id="m-note" aria-label="Note" placeholder="Note (optional)" style="margin-top:12px" maxlength="120">
    <button class="btn primary block" style="margin-top:12px" type="submit">Add</button>
  </form>

  <div class="sec"><h2>📊 Where it goes</h2></div>
  <div class="card">${cats.length ? cats.map(([c, v]) => { const ci = catInfo(c); return `<div class="bar-row"><span class="small bar-lbl">${ico(ci[1], 16)} ${ci[2]}</span><span class="bar"><i style="width:${(v / maxCat) * 100}%;background:${BAD_CATS.includes(c) ? 'var(--bad)' : 'var(--amber)'}"></i></span><span class="small bar-val">${cur(v)}</span></div>`; }).join('') : '<div class="empty">No spending logged this month yet.</div>'}</div>

  <div class="card"><div class="small muted" style="margin-bottom:6px">Daily spending — last 14 days (line = daily budget)</div>${barChart(days14, { color: 'var(--amber)', target: st.budget / 30, fmt: (v) => cur(Math.round(v)), label: 'Daily spending, last 14 days' })}</div>

  <div class="sec"><h2>🧾 This month</h2><span class="muted small">${list.length} entries</span></div>
  <div class="card">${list.length ? list.map((t) => { const ci = catInfo(t.cat); return `<div class="tx"><div class="cat" aria-hidden="true">${ico(ci[1], 20)}</div><div class="grow"><div>${esc(t.note || ci[2])}</div><div class="tiny muted">${fmtDate(t.date)} · ${ci[2]}</div></div>
    <div class="${cls[t.type]}">${sign[t.type]}${cur(t.amount)}</div><button class="icon-btn xs" data-act="deltx" data-id="${t.id}" aria-label="Delete ${esc(t.note || ci[2])}">${icon('x', 14)}</button></div>`; }).join('') : '<div class="empty">Nothing yet. Every entry makes you more aware.</div>'}</div>

  <div class="sec"><h2>💡 Money wisdom</h2></div>
  <div class="card">${esc(daily(C.money))}</div>`;
}

// ----- Feed: immersive, personalized "For You" reels (algorithm in feed.js) -----
const FEED_BATCH = 6, CLAIM_CAP = 15, TIME_CHECK_EVERY = 25;
const feed = { items: [], active: -1, activeAt: 0, lastKind: null, views: 0, startedAt: 0, obs: null, tap: { t: 0, i: -1 }, mode: 'foryou', topic: 'all', menu: null };
// bg = color palette class (see "Reels feed" in styles.css); ic = line icon for the topic chip and avatar.
const KIND_META = {
  wisdom: { tag: 'Wisdom', handle: 'light.wisdom', tags: '#mindset #stoic', bg: 'g-gold', ic: 'sparkle', fx: ['✨', '🌟', '💫'] },
  challenge: { tag: 'Real-life challenge', handle: 'light.challenge', tags: '#discipline #irl', bg: 'g-green', ic: 'flame', fx: ['💪', '🔥', '⚡'] },
  eq: { tag: 'EQ lesson', handle: 'light.eq', tags: '#emotionalintelligence', bg: 'g-violet', ic: 'heart', fx: ['❤️', '🧠', '🫶'] },
  joke: { tag: 'Laugh', handle: 'light.comedy', tags: '#joke #lol', bg: 'g-pink', ic: 'smile', fx: ['😂', '🤣', '😆'] },
  comedy: { tag: 'Comedy school', handle: 'light.comedy', tags: '#standup #funny', bg: 'g-pink', ic: 'mic', fx: ['🎤', '😂', '🎭'] },
  glow: { tag: 'Glow-up', handle: 'light.glowup', tags: '#selfcare #grooming', bg: 'g-teal', ic: 'sparkles', fx: ['✨', '🪞', '💧'] },
  avoid: { tag: 'Avoid this', handle: 'light.glowup', tags: '#stayhandsome', bg: 'g-red', ic: 'ban', fx: ['⛔', '🚫', '⚠️'] },
  money: { tag: 'Money', handle: 'light.money', tags: '#savings #finance', bg: 'g-amber', ic: 'coin', fx: ['💰', '🏦', '📈'] },
  prompt: { tag: 'Reflect', handle: 'light.journal', tags: '#journal #selfawareness', bg: 'g-blue', ic: 'pen', fx: ['📓', '💭', '🌙'] },
  quiz: { tag: 'Quick quiz', handle: 'light.quiz', tags: '#brain #learn', bg: 'g-indigo', ic: 'target', fx: ['❓', '🧩', '💡'] },
  poll: { tag: 'This or that', handle: 'light.you', tags: '#knowyourself', bg: 'g-violet', ic: 'compass', fx: ['🤔', '⚖️', '👀'] },
  breathe: { tag: 'Reset', handle: 'light.calm', tags: '#breathe #calm', bg: 'g-blue', ic: 'wind', fx: ['🫧', '🌊', '☁️'] },
  you: { tag: 'Your progress', handle: 'you', tags: '#yourjourney', bg: 'g-gold', ic: 'trophy', fx: ['🔥', '🏆', '⭐'] },
  fact: { tag: 'Did you know?', handle: 'light.science', tags: '#science #health', bg: 'g-cyan', ic: 'bulb', fx: ['🔬', '🧬', '💡'] },
  word: { tag: 'Word of the day', handle: 'light.words', tags: '#vocabulary #communication', bg: 'g-rose', ic: 'book', fx: ['📖', '✍️', '🗣️'] },
};
const poolFor = (k) => ({ wisdom: C.wisdom, challenge: C.challenges, eq: C.eq, joke: C.jokes, comedy: C.comedy, glow: C.glow.do, avoid: C.glow.avoid, money: C.money, prompt: C.prompts, quiz: C.quiz, poll: C.polls, breathe: [1], fact: C.facts, word: C.words })[k];

/** Personal cards built from your own data — the feed talks about YOU, not strangers. */
function youCard() {
  const k = today(), d = S.days[k] || {}, st = S.settings, out = [];
  if ((d.water || 0) < st.waterTarget) out.push({ id: 'you:water', big: '💧', title: `${d.water || 0} of ${st.waterTarget} glasses today`, body: 'One glass right now = sharper focus in 10 minutes.', action: { act: 'feed-water', label: '+1 glass' } });
  const sk = checkinStreak();
  if (sk >= 2) out.push({ id: 'you:streak', big: '🔥', title: `${sk}-day streak`, body: d.evening ? 'You showed up again today. That’s who you are now.' : 'Don’t break the chain — tonight’s evening check-in keeps it alive.' });
  const xp = computeXP(), lvl = levelOf(xp);
  out.push({ id: 'you:level', big: '🏆', title: `Level ${lvl} · ${titleOf(lvl)}`, body: `${xpFor(lvl + 1) - xp} XP to level ${lvl + 1}. Every real-life action counts.`, progress: (xp - xpFor(lvl)) / (xpFor(lvl + 1) - xpFor(lvl)) });
  const best = HABITS.map((h) => ({ h, s: habitStreak(h.id).current })).sort((a, b) => b.s - a.s)[0];
  if (best?.s > 0) out.push({ id: 'you:free', big: best.h.ic, title: `${best.s} days free`, body: `of ${best.h.name.toLowerCase()}. Your brain is rewiring. Keep going.` });
  const p = d.morning?.priorities?.find((x) => x.t?.trim() && !x.done);
  if (p) out.push({ id: 'you:prio', big: '🎯', title: 'Your #1 right now', body: p.t, action: { act: 'focus', label: 'Start a focus session' } });
  const pj = projection();
  if (!pj.need) out.push({ id: 'you:future', big: pj.persona[0], title: `Future you: ${pj.persona[1]}`, body: pj.persona[2] });
  return out.length ? { kind: 'you', id: 'you', data: out[Math.floor(Math.random() * out.length)] } : null;
}
function nextItem() {
  const allowed = topicKinds(feed.topic);
  for (let guard = 0; guard < 5; guard++) {
    const kind = pickKind(S.feedPrefs, Math.random, feed.lastKind, allowed);
    feed.lastKind = kind;
    if (kind === 'you') { const y = youCard(); if (y) return y; continue; }
    const pool = poolFor(kind);
    const idx = pickIndex(pool.length, kind, S.feedSeen);
    const id = `${kind}:${idx}`;
    S.feedSeen[id] = Date.now(); // remembered across sessions — no repeats until a kind's whole pool is seen
    return { kind, id, data: pool[idx] };
  }
  return { kind: 'wisdom', id: 'wisdom:0', data: C.wisdom[0] };
}
/** Saved cards, newest first, rebuilt from their ids. */
function savedItems() {
  return [...S.saved].reverse().map((s) => {
    const [kind, idx] = String(s.id || '').split(':');
    const pool = poolFor(kind);
    return pool && pool[+idx] != null ? { kind, id: s.id, data: pool[+idx] } : null;
  }).filter(Boolean);
}
/** Plain-text version of a card, for share/save/reflect. */
function itemText(it) {
  const d = it.data;
  switch (it.kind) {
    case 'wisdom': return `“${d.q}” — ${d.a}`;
    case 'eq': case 'comedy': return `${d.t}: ${d.b}`;
    case 'quiz': case 'poll': return d.q;
    case 'you': return `${d.title}. ${d.body}`;
    case 'breathe': return 'A 30-second breathing reset.';
    case 'word': return `${d.w}: ${d.d} — “${d.ex}”`;
    default: return String(d);
  }
}
/** Word-by-word reveal: each word animates in when the card becomes active. */
const words = (text) => esc(text).split(/\s+/).map((w, i) => `<span class="w" style="--i:${Math.min(i, 40)}">${w}</span>`).join(' ');
/** Estimated read time, drives the thin progress line at the top of each card. */
const readMs = (it) => clamp(itemText(it).split(/\s+/).length * 290 + 1200, 3500, 16000);

function specialReel(i, bg, art, title, text, actions) {
  return `<section class="reel ${bg}" data-i="${i}" aria-label="${esc(title)}">
    <div class="r-inner center"><div class="r-art">${art}</div><div class="r-title">${esc(title)}</div>
      <div class="r-text sm">${words(text)}</div><div class="r-opts two">${actions}</div></div></section>`;
}
function reelHTML(it, i) {
  if (it.kind === 'pause') {
    const mins = Math.max(1, Math.round((Date.now() - feed.startedAt) / 60000));
    return specialReel(i, 'g-green', icon('compass', 56), `${i} cards · ${mins} min`, 'Nice session. The best dopamine is in real life — do one quest, then come back for more.',
      `<button class="r-cta" data-act="tab" data-tab="today">Do a quest</button><button class="r-cta ghost" data-act="feed-next">Keep exploring</button>`);
  }
  if (it.kind === 'empty') {
    return specialReel(i, 'g-violet', icon('bookmark', 56), 'Nothing saved yet', 'Tap Save on the cards you love. They’ll live here so you can come back to them anytime.',
      `<button class="r-cta" data-act="feed-mode" data-v="foryou">Back to For You</button>`);
  }
  const m = KIND_META[it.kind], d = it.data, liked = !!S.feedLikes[it.id];
  const saved = S.saved.some((s) => s.id === it.id);
  let body = '';
  switch (it.kind) {
    case 'wisdom': body = `<div class="r-quote">${words(`“${d.q}”`)}</div><div class="r-author">— ${esc(d.a)}</div>`; break;
    case 'challenge': body = `<div class="r-text">${words(d)}</div><button class="r-cta" data-act="claim">${icon('check', 18)} I did it · +10 XP</button><div class="r-sub" data-claims>${S.claims[today()] || 0}/${CLAIM_CAP} today</div>`; break;
    case 'eq': case 'comedy': body = `<div class="r-label">${esc(d.t)}</div><div class="r-text">${words(d.b)}</div>${it.kind === 'comedy' ? `<button class="r-cta ghost" data-act="go-comedy">${icon('pen', 16)} Try it: ${esc(d.p)}</button>` : ''}`; break;
    case 'joke': {
      const sp = splitJoke(d);
      body = sp ? `<div class="r-text">${words(sp[0])}</div><button class="r-cta ghost r-punch-btn" data-act="punch">Tap for the punchline</button><div class="r-text r-punch" hidden>${esc(sp[1])}</div>` : `<div class="r-text">${words(d)}</div>`;
      break;
    }
    case 'prompt': body = `<div class="r-label">Think about it</div><div class="r-text">${words(d)}</div><button class="r-cta" data-act="reflect">${icon('pen', 16)} Write your answer · +10 XP</button>`; break;
    case 'quiz': {
      const done = it.id in S.quiz;
      body = `<div class="r-label">${done ? 'Answered before' : '+5 XP if you get it right'}</div><div class="r-text">${words(d.q)}</div>
        <div class="r-opts">${d.o.map((o, j) => `<button class="r-opt" data-act="quiz" data-j="${j}"><span class="r-opt-k">${'ABC'[j]}</span>${esc(o)}</button>`).join('')}</div><div class="r-why" hidden>${esc(d.why)}</div>`;
      break;
    }
    case 'poll': body = `<div class="r-label">Pick one</div><div class="r-text">${words(d.q)}</div><div class="r-opts two">${d.o.map((o, j) => `<button class="r-opt" data-act="poll" data-j="${j}">${esc(o.t)}</button>`).join('')}</div><div class="r-why" hidden></div>`; break;
    case 'fact': body = `<div class="r-text">${words(d)}</div>`; break;
    case 'word': body = `<div class="r-word">${esc(d.w)}</div><div class="r-text sm">${words(d.d)}</div><div class="r-example">“${esc(d.ex)}”</div><div class="r-sub">Use it once today — new words stick when you say them.</div>`; break;
    case 'breathe': body = `<div class="r-breath" aria-hidden="true"><span>Breathe</span></div><div class="r-sub">In for 4 · out for 6. Let your shoulders drop.</div>`; break;
    case 'you': body = `<div class="r-big">${d.big}</div><div class="r-title">${esc(d.title)}</div><div class="r-text sm">${words(d.body)}</div>${d.progress != null ? `<div class="xpbar" style="margin-top:16px"><i style="width:${d.progress * 100}%"></i></div>` : ''}${d.action ? `<button class="r-cta" data-act="${d.action.act}">${esc(d.action.label)}</button>` : ''}`; break;
    default: body = `<div class="r-text">${words(d)}</div>`;
  }
  const floaters = [...m.fx, ...m.fx].map((e, j) => `<span style="--x:${((j * 17 + i * 23) % 86) + 4}%;--d:${8 + (j % 3) * 2}s;--s:${(j * 1.4).toFixed(1)}s">${e}</span>`).join('');
  const hint = i === 0 && feed.mode === 'foryou' && S.settings.feedHint !== false
    ? `<div class="r-hint" aria-hidden="true">${icon('chevronUp', 22)}<span>Swipe up for more</span></div>` : '';
  return `<section class="reel ${m.bg}" data-i="${i}" style="--read:${readMs(it)}ms" aria-label="${esc(m.tag)}, card ${i + 1}">
    <div class="r-progress" aria-hidden="true"><i></i></div>
    <div class="r-float" aria-hidden="true">${floaters}</div>
    <div class="r-inner"><div class="r-topic">${icon(m.ic, 14)}<span>${m.tag}</span></div>${body}</div>
    <div class="rail">
      <button class="r-btn ${liked ? 'on' : ''}" data-act="like" aria-pressed="${liked}"><span class="r-ic">${icon('heart', 26, liked ? 'filled' : '')}</span><span>Like</span></button>
      <button class="r-btn" data-act="reflect"><span class="r-ic">${icon('message', 24)}</span><span>Reflect</span></button>
      <button class="r-btn ${saved ? 'on' : ''}" data-act="feed-save" aria-pressed="${saved}"><span class="r-ic">${icon('bookmark', 24, saved ? 'filled' : '')}</span><span>${saved ? 'Saved' : 'Save'}</span></button>
      <button class="r-btn" data-act="share" data-b="${esc(itemText(it))}"><span class="r-ic">${icon('share', 24)}</span><span>Share</span></button>
      <button class="r-btn r-more" data-act="feed-more" aria-label="More options"><span class="r-ic">${icon('more', 22)}</span></button>
    </div>
    <div class="caption"><span class="cap-av">${icon(m.ic, 18)}</span><div class="grow"><strong>@${m.handle}</strong><div class="tiny">${m.tags}</div></div></div>
    ${hint}
  </section>`;
}
function viewFeed() {
  const tab = (v, label, extra = '') => `<button role="tab" aria-selected="${feed.mode === v}" class="${feed.mode === v ? 'on' : ''}" data-act="feed-mode" data-v="${v}">${label}${extra}</button>`;
  return `<div class="feed-top">
      <div class="feed-tabs" role="tablist" aria-label="Feed">${tab('foryou', 'For You')}${tab('saved', 'Saved', S.saved.length ? ` <span class="ft-count">${S.saved.length}</span>` : '')}</div>
      <div class="row"><button class="icon-btn glass-btn" data-act="refeed" aria-label="Refresh feed">${icon('refresh', 19)}</button><button class="sos-mini" data-act="sos">Urge?</button></div>
    </div>
    ${feed.mode === 'foryou' ? `<div class="feed-topics" role="radiogroup" aria-label="Topics">${TOPICS.map(([id, n, , ic]) => `<button role="radio" aria-checked="${feed.topic === id}" class="ft-chip ${feed.topic === id ? 'on' : ''}" data-act="feed-topic" data-v="${id}">${icon(ic, 14)}${n}</button>`).join('')}</div>` : ''}
    <div id="feed-stage" class="feed-stage" tabindex="0" aria-label="Feed. Swipe up, or use the arrow keys, to see the next card. Double-tap to like."></div>
    <div id="heart-layer" aria-hidden="true"></div>`;
}
function appendReels(n) {
  const stage = $('#feed-stage'); if (!stage || feed.mode !== 'foryou') return;
  let html = '';
  for (let k = 0; k < n; k++) {
    const i = feed.items.length;
    const it = i > 0 && i % TIME_CHECK_EVERY === 0 ? { kind: 'pause', id: 'pause' } : nextItem();
    feed.items.push(it);
    html += reelHTML(it, i);
  }
  stage.insertAdjacentHTML('beforeend', html);
  if (feed.obs) $$('.reel', stage).slice(-n).forEach((r) => feed.obs.observe(r));
}
function feedInit() {
  Object.assign(feed, { items: [], active: -1, views: 0, startedAt: Date.now(), lastKind: null });
  S.feedSeen = pruneSeen(S.feedSeen);
  feed.obs?.disconnect();
  const stage = $('#feed-stage');
  feed.obs = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) activateReel(+e.target.dataset.i); }, { root: stage, threshold: 0.6 })
    : null;
  if (feed.mode === 'saved') {
    const items = savedItems();
    feed.items = items.length ? items : [{ kind: 'empty', id: 'empty' }];
    stage.innerHTML = feed.items.map(reelHTML).join('');
    if (feed.obs) $$('.reel', stage).forEach((r) => feed.obs.observe(r));
  } else appendReels(FEED_BATCH);
  stage.focus({ preventScroll: true });
}
const isSpecial = (it) => !it || it.kind === 'pause' || it.kind === 'empty';
/** Called when a card becomes the one on screen: animate it, learn from time spent on the previous one, preload more. */
function activateReel(i) {
  if (i === feed.active) return;
  const now = Date.now(), prev = feed.items[feed.active];
  if (!isSpecial(prev)) nudge(S.feedPrefs, prev.kind, dwellSignal(now - feed.activeAt));
  feed.active = i; feed.activeAt = now; feed.views++;
  $$('.reel.active').forEach((r) => r.classList.remove('active'));
  $(`.reel[data-i="${i}"]`)?.classList.add('active');
  if (i >= 1 && S.settings.feedHint !== false) { S.settings.feedHint = false; $$('.r-hint').forEach((h) => h.remove()); } // first swipe learned
  if (feed.views % 5 === 0) save();
  if (i >= feed.items.length - 3) appendReels(FEED_BATCH);
}
const reelOf = (el) => { const r = el.closest('.reel'); return r ? { r, it: feed.items[+r.dataset.i] } : {}; };
function scrollReel(dir) {
  const st = $('#feed-stage'); if (!st) return;
  st.scrollTo({ top: Math.max(0, feed.active + dir) * st.clientHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
}
function heartPop(x, y) {
  const h = document.createElement('div');
  h.className = 'heart-pop'; h.innerHTML = icon('heart', 96, 'filled');
  h.style.left = x + 'px'; h.style.top = y + 'px';
  $('#heart-layer')?.appendChild(h);
  setTimeout(() => h.remove(), 900);
}
function setLike(r, it, on) {
  const btn = $('[data-act="like"]', r);
  if (!!S.feedLikes[it.id] === on) return;
  if (on) S.feedLikes[it.id] = today(); else delete S.feedLikes[it.id];
  nudge(S.feedPrefs, it.kind, on ? SIGNAL.like : SIGNAL.unlike);
  persist();
  btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on);
  $('.r-ic', btn).innerHTML = icon('heart', 26, on ? 'filled' : '');
  if (on) { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); buzz(10); }
}
function openFeedMenu(it) {
  feed.menu = it;
  const m = KIND_META[it.kind];
  const row = (act, ic, t, s) => `<button class="menu-row" data-act="${act}">${icon(ic, 22)}<span class="grow"><strong>${t}</strong><span class="tiny muted">${s}</span></span></button>`;
  openModal(`<div class="row between"><h2>${icon(m.ic, 18, 'h-ic')}${esc(m.tag)}</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">${icon('x', 18)}</button></div>
    <div class="menu-list">
      ${row('more-like', 'heart', 'More like this', `Show more ${m.tag.toLowerCase()} cards`)}
      ${row('less-like', 'thumbDown', 'Not interested', `Show fewer ${m.tag.toLowerCase()} cards`)}
      ${row('copy-card', 'copy', 'Copy text', 'Paste it in a note or message')}
    </div>`, { label: 'Card options', onClose: render });
}
// Double-tap anywhere on a card to like it (like video apps).
document.addEventListener('pointerup', (e) => {
  const r = e.target.closest('.reel');
  if (!r || e.target.closest('button, textarea, input, a')) return;
  const now = Date.now(), i = +r.dataset.i;
  if (now - feed.tap.t < 320 && feed.tap.i === i) {
    const it = feed.items[i];
    if (!isSpecial(it)) { setLike(r, it, true); heartPop(e.clientX, e.clientY); }
    feed.tap.t = 0;
  } else feed.tap = { t: now, i };
});

// ----- Stats -----
const trendTag = (d) => (d == null || isNaN(d) ? '' : d > 0 ? `<span class="trend-up">▲ ${d}</span>` : d < 0 ? `<span class="trend-down">▼ ${Math.abs(d)}</span>` : '<span class="muted">● 0</span>');
function viewStats() {
  const n = UI.range, keys = lastN(n), prev = lastN(n, addDays(today(), -n));
  const sc = rangeScores(keys), ps = rangeScores(prev);
  const dAvg = (arr, id) => (arr.length ? Math.round(avg(arr.map((s) => s[id]))) : null);
  const overall = dAvg(sc, 'overall');
  const st = S.settings, dom = UI.domain;
  const domInfo = DOMAINS.find((d) => d.id === dom) || { name: 'Overall', hex: 'var(--accent)' };
  const lbl = (k) => fmtDate(k, { day: 'numeric' });
  const pts = keys.map((k) => ({ label: lbl(k), v: scores(k)?.[dom] ?? null }));
  const k14 = keys.slice(-14);
  const sleepPts = k14.map((k) => ({ label: lbl(k), v: sleepHours(S.days[k]?.morning) ?? 0 }));
  const waterPts = k14.map((k) => ({ label: lbl(k), v: S.days[k]?.water || 0 }));
  const focusPts = k14.map((k) => ({ label: lbl(k), v: S.days[k]?.deepWork || 0 }));
  const moodPts = keys.map((k) => { const d = S.days[k]; const ms = [d?.morning?.mood, d?.evening?.mood].filter(Boolean); return { label: lbl(k), v: ms.length ? avg(ms) : null }; });
  const reviews = Object.entries(S.reviews).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  const ins = insights(keys);

  return `
  <h1>Stats</h1>
  <div class="seg" role="tablist" style="margin-top:14px">${[7, 30, 90].map((r) => `<button role="tab" aria-selected="${UI.range === r}" class="${UI.range === r ? 'on' : ''}" data-act="range" data-v="${r}">${r} days</button>`).join('')}</div>

  ${!sc.length ? `<div class="card empty" style="margin-top:14px">📈 Your stats appear after your first check-in. Do your morning check-in to begin!</div>` : `
  <div class="card hero" style="margin-top:14px">
    ${ring(overall, 'var(--gold)', 110, 10, overall, `Life score ${overall}`)}
    <div class="grow"><strong>Life Score</strong><div class="small muted">Average of all 6 areas over ${sc.length} tracked day${sc.length === 1 ? '' : 's'}.</div>
      ${ps.length ? trendTag(overall - dAvg(ps, 'overall')) + ' <span class="tiny muted">vs previous ' + n + ' days</span>' : ''}</div>
  </div>
  <div class="grid g3" style="margin-top:14px">${DOMAINS.map((d) => { const v = dAvg(sc, d.id), pv = dAvg(ps, d.id); return `<button class="card ring-card ${UI.domain === d.id ? 'sel' : ''}" style="--sel:${d.hex}" data-act="domain" data-v="${d.id}" aria-pressed="${UI.domain === d.id}">${ring(v, d.color, 64, 7, v)}<div class="small">${d.ic} ${d.name}</div>${pv != null ? `<div class="tiny">${trendTag(v - pv)}</div>` : ''}</button>`; }).join('')}</div>
  <div class="card"><div class="row between"><strong>${domInfo.name} score</strong>${dom !== 'overall' ? '<button class="btn sm ghost" data-act="domain" data-v="overall">Show overall</button>' : '<span class="tiny muted">Tap an area above</span>'}</div>${lineChart(pts, { color: domInfo.hex, label: `${domInfo.name} score over ${n} days` })}</div>`}

  <div class="sec"><h2>🗓️ Your year in light</h2><span class="tiny muted">daily Life Score</span></div>
  <div class="card">${heatmap(heatmapKeys(26), (k) => scores(k)?.overall ?? null)}
    <div class="legend" style="margin-top:8px"><span>Less</span>${[0, 1, 2, 3, 4, 5].map((n) => `var(--heat-${n})`).map((c) => `<i style="background:${c}"></i>`).join('')}<span>More</span></div></div>

  <div class="sec"><h2>🔮 Future You — 1 year projection</h2></div>
  ${viewProjection()}

  <div class="sec"><h2>🧩 Know yourself</h2></div>
  <div class="card"><div class="small muted" style="margin-bottom:8px">Bad-habit days in the last ${keys.length} days</div>${ins.slipCounts.map(({ h, n: c }) => `<div class="bar-row"><span class="small bar-lbl">${ico(h.ic, 16)} ${h.name}</span><span class="bar"><i style="width:${(c / Math.max(1, keys.length)) * 100}%;background:var(--bad)"></i></span><span class="small bar-val">${c} day${c === 1 ? '' : 's'}</span></div>`).join('')}</div>
  <div class="card">${ins.lines.map((t) => `<div class="insight small">${t}</div>`).join('')}</div>

  <div class="sec"><h2>🗓️ Weekly reviews</h2><button class="btn sm" data-act="open-weekly">${S.reviews[weekStart(today())] ? 'Edit this week' : 'Do review'}</button></div>
  <div class="card">${reviews.length ? reviews.map(([wk, r]) => `<div class="insight small" style="border-left-color:var(--gold)"><strong>Week of ${fmtDate(wk, { month: 'short', day: 'numeric' })}</strong>${r.avg != null ? ` · score ${r.avg}` : ''}${r.focusHabit ? ` · focus: ${esc(r.focusHabit)}` : ''}${r.proud ? `<br>🏆 ${esc(r.proud)}` : ''}${r.nextWeek ? `<br>➡️ ${esc(r.nextWeek)}` : ''}</div>`).join('') : '<div class="empty">Weekly reviews turn data into direction. Do your first one this weekend.</div>'}</div>

  <div class="sec"><h2>⏱️ Focused work</h2><span class="muted small">goal 60 min/day</span></div>
  <div class="card">${barChart(focusPts, { color: 'var(--accent)', target: 60, fmt: (v) => v + ' min', label: 'Focused minutes, last 14 days' })}</div>
  <div class="sec"><h2>😴 Sleep</h2><span class="muted small">goal ${st.sleepTarget}h</span></div>
  <div class="card">${barChart(sleepPts, { color: 'var(--blue)', target: st.sleepTarget, max: Math.max(10, st.sleepTarget + 2), fmt: (v) => v + 'h', label: 'Sleep hours, last 14 days' })}</div>
  <div class="sec"><h2>💧 Water</h2><span class="muted small">goal ${st.waterTarget} glasses</span></div>
  <div class="card">${barChart(waterPts, { color: 'var(--teal)', target: st.waterTarget, max: Math.max(st.waterTarget + 2, ...waterPts.map((p) => p.v)), label: 'Glasses of water, last 14 days' })}</div>
  <div class="sec"><h2>🙂 Mood</h2></div>
  <div class="card">${lineChart(moodPts, { color: 'var(--violet)', max: 5, min: 1, ticks: [1, 3, 5], label: 'Mood over time' })}</div>`;
}
function viewProjection() {
  const p = projection();
  if (p.need) return `<div class="card empty">🔮 Check in on at least ${p.need} days and Light will project who you're becoming in one year — health, money, career, mind and character. (${p.have}/${p.need} days)</div>`;
  return `<div class="card">
    <div class="row"><div style="font-size:2.4rem" aria-hidden="true">${p.persona[0]}</div><div><div class="tiny muted">In one year you're becoming</div><h2>${p.persona[1]}</h2></div></div>
    <p class="small" style="margin:10px 0 14px">${p.persona[2]}</p>
    <div class="proj"><span class="h">Area</span><span class="h">Now</span><span class="h">1 year</span>
      ${p.rows.map((r) => `<span><span class="ico">${ico(r.d.ic, 16)}</span> ${r.d.name}</span><strong>${r.now}</strong><span>${r.proj} ${trendTag(r.proj - r.now)}</span>`).join('')}
      <span><strong>Overall</strong></span><strong>${p.nowOverall}</strong><strong style="color:var(--gold)">${p.projOverall}</strong>
    </div>
    <div class="small muted" style="margin:16px 0 8px">Your next 12 months, if you keep today's pace:</div>
    ${p.facts.map(([ic, t]) => `<div class="row small" style="padding:4px 0"><span class="ico fact-ic" aria-hidden="true">${ico(ic, 18)}</span><span>${t}</span></div>`).join('')}
    <div class="tiny muted" style="margin-top:12px">Projection uses your last 30 days of trends. It's a mirror, not a prophecy — change today and the projection changes with you.</div>
  </div>`;
}

// ----- Grow -----
const GROW_META = {
  fitness: { ic: 'dumbbell', n: 'Fitness', tint: 'var(--amber)', sub: 'Build your physique at home — no gym needed' },
  comedy: { ic: 'mic', n: 'Comedy', tint: 'var(--pink)', sub: 'Become the funniest version of you' },
  eq: { ic: 'heart', n: 'EQ', tint: 'var(--violet)', sub: 'Understand feelings — yours and theirs' },
  glow: { ic: 'sparkle', n: 'Glow-up', tint: 'var(--teal)', sub: 'Look sharp, feel sharp' },
  freedom: { ic: 'shield', n: 'Freedom', tint: 'var(--good)', sub: 'Break free from what pulls you down' },
  journal: { ic: 'bookOpen', n: 'Journal', tint: 'var(--blue)', sub: 'Think on paper, grow in life' },
  badges: { ic: 'trophy', n: 'Badges', tint: 'var(--accent)', sub: 'Proof of the person you’re becoming' },
};
const COMEDY_RANKS = [[0, 'Rookie'], [5, 'Class clown'], [20, 'Open-mic regular'], [50, 'Feature act'], [100, 'Headliner']];
/** Tinted hero card used at the top of each Grow section. */
const growHero = (tint, kicker, title, body = '', extra = '') => `<section class="card g-hero" style="--tint:${tint}">
  <div class="g-kick">${kicker}</div><h2 class="g-title">${title}</h2>${body ? `<p class="small g-body">${body}</p>` : ''}${extra}</section>`;
const listItem = (ic, t, cls = '') => `<li class="g-li ${cls}"><span class="g-li-ic">${icon(ic, 16)}</span><span>${t}</span></li>`;

function viewGrow() {
  const meta = GROW_META[UI.grow] || GROW_META.comedy;
  const refl = Object.values(S.days).filter((d) => d.evening?.eq?.trim()).length;
  const got = BADGES.filter((b) => S.badges[b.id]).length;
  const body = { fitness: growFitness, comedy: growComedy, eq: growEQ, glow: growGlow, freedom: growFreedom, journal: growJournal, badges: growBadges }[UI.grow]();
  const stat = (ic, v, l, tab) => `<button class="gstat" data-act="growtab" data-v="${tab}"><span class="hstat-ic">${icon(ic, 16)}</span><strong>${v}</strong><span>${l}</span></button>`;
  return `<header class="page-head"><h1>Grow</h1><p class="muted small">${esc(meta.sub)}</p></header>
  <div class="grow-stats">
    ${stat('mic', S.jokes.length, 'jokes', 'comedy')}
    ${stat('heart', refl, 'reflections', 'eq')}
    ${stat('dumbbell', S.workouts.filter((w) => !w.partial).length, 'workouts', 'fitness')}
    ${stat('trophy', `${got}/${BADGES.length}`, 'badges', 'badges')}
  </div>
  <div class="grow-tabs" role="tablist" aria-label="Grow sections">${GROW_TABS.map((id) => { const m = GROW_META[id]; return `<button role="tab" aria-selected="${UI.grow === id}" class="gt ${UI.grow === id ? 'on' : ''}" style="--tint:${m.tint}" data-act="growtab" data-v="${id}">${icon(m.ic, 16)}${m.n}</button>`; }).join('')}</div>
  <div class="grow-body">${body}</div>`;
}
function growFitness() {
  const st = S.settings, lvl = st.fitLevel || 'beginner', k = today(), li = LEVELS.findIndex((l) => l.id === lvl);
  const week = lastN(7);
  const done7 = S.workouts.filter((x) => week.includes(x.date) && !x.partial);
  const mins7 = sum(week.map((x) => S.days[x]?.exercise || 0));
  const now = new Date();
  const doneToday = S.workouts.filter((x) => x.date === k && !x.partial).map((x) => x.id);
  const sug = suggestWorkout({ weekday: now.getDay(), minutesNow: now.getHours() * 60 + now.getMinutes(), wake: minutesOf(st.wakeTime), bed: minutesOf(st.bedTime), doneIds: doneToday });
  const grp = UI.fitGroup || 'All';
  const dots = week.map((x) => {
    const ok = S.workouts.some((w) => w.date === x && !w.partial) || (S.days[x]?.exercise || 0) >= 20;
    return `<div class="wk-dot ${ok ? 'on' : ''} ${x === k ? 'today' : ''}"><i>${ok ? icon('check', 13) : ''}</i><span>${fmtDate(x, { weekday: 'narrow' })}</span></div>`;
  }).join('');
  const lvlSeg = `<div class="seg" role="radiogroup" aria-label="Fitness level">${LEVELS.map((l) => `<button role="radio" aria-checked="${lvl === l.id}" class="${lvl === l.id ? 'on' : ''}" data-act="fit-level" data-v="${l.id}">${l.n}</button>`).join('')}</div>`;
  const routineCard = (w) => `<button class="card routine" data-act="start-workout" data-w="${w.id}"><span class="r-emoji" aria-hidden="true">${w.ic}</span><strong>${w.n}</strong><span class="tiny muted">${workoutMinutes(w, lvl)} min · ${w.focus}</span>${doneToday.includes(w.id) ? `<span class="routine-done">${icon('check', 12)} done today</span>` : ''}</button>`;
  const exList = EXERCISES.filter((e) => grp === 'All' || e.g === grp);
  return growHero('var(--amber)', `${icon('dumbbell', 14)} This week`, `${done7.length} workout${done7.length === 1 ? '' : 's'} · ${mins7} min`, 'Aim for 3–5 workouts a week. No equipment needed.',
      `<div class="wk-dots">${dots}</div><div class="lbl" style="margin-top:14px">Your level</div>${lvlSeg}`) + `
  ${sug ? `<section class="card today-wo">
      <div class="g-kick" style="--tint:var(--amber)">${icon('timer', 14)} Recommended right now</div>
      <div class="row" style="margin-top:10px"><span class="r-emoji big" aria-hidden="true">${sug.ic}</span><div class="grow"><h2>${sug.n}</h2><div class="small muted">${workoutMinutes(sug, lvl)} min${sug.rounds > 1 ? ` · ${sug.rounds} rounds` : ''} · ${sug.focus}</div></div></div>
      <p class="small" style="margin-top:10px">${esc(sug.desc)}</p>
      <div class="chips" style="margin-top:10px">${sug.moves.map((m) => `<span class="chip sm">${esc(exercise(m).n)}</span>`).join('')}</div>
      <button class="btn primary block" style="margin-top:14px" data-act="start-workout" data-w="${sug.id}">${icon('play', 18)} Start guided workout</button></section>`
    : `<div class="card soft" style="--tint:var(--good)"><strong>${icon('checkCircle', 16)} Training done for today.</strong><p class="small muted" style="margin-top:4px">Recovery is where muscles grow. Sleep well tonight.</p></div>`}
  ${secH('🏋️', 'Routines', `<span class="pill">${WORKOUTS.length}</span>`)}
  <div class="grid routines">${WORKOUTS.map(routineCard).join('')}</div>
  ${secH('📚', 'Exercise library', `<span class="pill">${exList.length}</span>`)}
  <div class="chips fit-groups">${['All', ...GROUPS].map((g) => `<button class="chip ${grp === g ? 'on' : ''}" data-act="fit-group" data-v="${esc(g)}">${esc(g)}</button>`).join('')}</div>
  <div class="card acc" style="margin-top:10px">${exList.map((e) => `<details><summary><span class="grow">${esc(e.n)}<span class="ex-g">${esc(e.g)}</span></span><span class="pill gold">${esc(e.reps[li])}</span></summary><ol class="how">${e.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><p class="small tip">${icon('bulb', 14)} ${esc(e.tip)}</p></details>`).join('')}</div>
  ${secH('📜', 'Recent workouts', S.workouts.length ? `<span class="pill">${S.workouts.length}</span>` : '')}
  <div class="card">${S.workouts.length ? [...S.workouts].reverse().slice(0, 8).map((x) => { const w = workout(x.id); return `<div class="tx"><div class="cat" aria-hidden="true">${w?.ic || '💪'}</div><div class="grow"><div>${esc(w?.n || 'Workout')}${x.partial ? ' <span class="pill">partial</span>' : ''}</div><div class="tiny muted">${fmtDate(x.date)} · ${x.mins} min · ${levelInfo(x.level).n}</div></div></div>`; }).join('')
    : `<div class="empty"><div class="empty-ic">${icon('dumbbell', 30)}</div>Your finished workouts will show up here. Start with the Morning wake-up — it only takes a few minutes.</div>`}</div>
  <div class="card soft small muted" style="--tint:var(--amber)">${icon('heart', 16)} Warm up, move with control and stop if anything hurts sharply. If you have a health condition, check with a doctor before starting a new routine.</div>`;
}
function growComedy() {
  const c = daily(C.comedy), n = S.jokes.length;
  const ri = COMEDY_RANKS.reduce((a, r, i) => (n >= r[0] ? i : a), 0);
  const next = COMEDY_RANKS[ri + 1];
  const prog = next ? ((n - COMEDY_RANKS[ri][0]) / (next[0] - COMEDY_RANKS[ri][0])) * 100 : 100;
  return growHero('var(--pink)', `${icon('mic', 14)} Comedian rank`, COMEDY_RANKS[ri][1],
      next ? `${n} joke${n === 1 ? '' : 's'} written · ${next[0] - n} more to <strong>${next[1]}</strong>` : `${n} jokes — you’re a headliner.`,
      `<div class="xpbar" style="margin-top:12px"><i style="width:${prog}%;background:linear-gradient(90deg,var(--pink),var(--accent))"></i></div>`) + `
  <form class="card" data-form="addjoke" novalidate>
    <div class="g-kick" style="--tint:var(--pink)">${icon('sparkle', 14)} Today’s technique</div>
    <h3 style="margin:6px 0 4px">${esc(c.t)}</h3><p class="small muted">${esc(c.b)}</p>
    <label class="lbl" for="joke-in">${esc(c.p)}</label><textarea id="joke-in" placeholder="Write your joke here…" maxlength="1000"></textarea>
    <button class="btn primary block" style="margin-top:10px" type="submit">${icon('plus', 18)} Add to my notebook · +10 XP</button></form>
  <div class="card soft" style="--tint:var(--pink)"><div class="g-kick">${icon('smile', 14)} Joke of the day</div><p style="margin-top:6px">${esc(daily(C.jokes))}</p><p class="tiny muted" style="margin-top:8px">Tell one joke to a real person today. Watching faces is how comedians learn.</p></div>
  ${secH('📒', 'My joke notebook', n ? `<span class="pill">${n}</span>` : '')}
  <div class="card">${n ? [...S.jokes].reverse().map((j) => `<div class="tx"><div class="grow"><div style="white-space:pre-wrap">${esc(j.text)}</div><div class="tiny muted">${fmtDate(j.date)}</div></div><button class="icon-btn xs" data-act="deljoke" data-id="${j.id}" aria-label="Delete joke">${icon('x', 14)}</button></div>`).join('') : `<div class="empty"><div class="empty-ic">${icon('mic', 30)}</div>Your first joke is the hardest. It doesn’t have to be good — it has to be written.</div>`}</div>
  ${secH('📚', 'All techniques', `<span class="pill">${C.comedy.length}</span>`)}
  <div class="card acc">${C.comedy.map((x) => `<details><summary>${esc(x.t)}</summary><p class="small">${esc(x.b)}</p><p class="small muted">Practice: ${esc(x.p)}</p></details>`).join('')}</div>`;
}
function growEQ() {
  const l = daily(C.eq, 1);
  const emo = {};
  for (const d of Object.values(S.days)) if (d.evening?.emotion) emo[d.evening.emotion] = (emo[d.evening.emotion] || 0) + 1;
  const total = sum(Object.values(emo)) || 1;
  const refl = Object.entries(S.days).filter(([, d]) => d.evening?.eq?.trim()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
  return growHero('var(--violet)', `${icon('heart', 14)} Today’s lesson`, esc(l.t), esc(l.b)) + `
  ${secH('🎨', 'Your emotional palette')}
  <div class="card">${Object.keys(emo).length ? Object.entries(emo).sort((a, b) => b[1] - a[1]).map(([e, n]) => `<div class="bar-row"><span class="small bar-lbl">${esc(e)}</span><span class="bar"><i style="width:${(n / total) * 100}%;background:linear-gradient(90deg,var(--violet),var(--pink))"></i></span><span class="small bar-val">${n}</span></div>`).join('') : `<div class="empty"><div class="empty-ic">${icon('palette', 30)}</div>Name your strongest emotion in each evening check-in to see your palette.</div>`}</div>
  ${secH('🪞', 'Recent reflections')}
  <div class="card">${refl.length ? `<ol class="timeline">${refl.map(([k, d]) => `<li><div class="tiny muted">${fmtDate(k)}${d.evening.emotion ? ` · <span class="pill">${esc(d.evening.emotion)}</span>` : ''}</div><div class="small">${esc(d.evening.eq)}</div></li>`).join('')}</ol>` : `<div class="empty"><div class="empty-ic">${icon('pen', 30)}</div>Your EQ reflections from evening check-ins will appear here.</div>`}</div>
  ${secH('📚', 'All lessons', `<span class="pill">${C.eq.length}</span>`)}
  <div class="card acc">${C.eq.map((x) => `<details><summary>${esc(x.t)}</summary><p class="small">${esc(x.b)}</p></details>`).join('')}</div>`;
}
function growGlow() {
  const hyg = lastN(14).map((k) => ({ label: fmtDate(k, { day: 'numeric' }), v: Math.round(hygRatio(S.days[k]) * 100) }));
  const avg14 = Math.round(avg(hyg.map((x) => x.v)));
  const tile = (hid, label) => { const s = habitStreak(hid), m = nextMilestone(s.current); return `<div class="card streak"><div class="streak-ring">${ring((s.current / m) * 100, 'var(--teal)', 58, 5)}<span class="ic" aria-hidden="true">${HABITS.find((h) => h.id === hid).ic}</span></div><div class="n">${s.current}</div><div class="tiny muted">${label}</div></div>`; };
  return growHero('var(--teal)', `${icon('sparkle', 14)} Your glow score`, `${avg14}%`, 'Average hygiene routine completion over the last 14 days.',
      `<div style="margin-top:10px">${barChart(hyg, { color: 'var(--teal)', max: 100, target: 100, fmt: (v) => v + '%', label: 'Hygiene completion, last 14 days' })}</div>`) + `
  <div class="grid">${tile('fastfood', 'days without fast food')}${tile('soda', 'days without soda')}</div>
  <div class="grid duo">
    <section>${secH('✅', 'Do this')}<div class="card"><ul class="g-list">${C.glow.do.map((t) => listItem('check', esc(t), 'good')).join('')}</ul></div></section>
    <section>${secH('🚫', 'Avoid this')}<div class="card"><ul class="g-list">${C.glow.avoid.map((t) => listItem('ban', esc(t), 'bad')).join('')}</ul></div></section>
  </div>
  <div class="card soft small muted" style="--tint:var(--teal)">${icon('settings', 16)} Edit your morning & night routines in Settings.</div>`;
}
function growFreedom() {
  const recent = [...S.sos].reverse().slice(0, 12);
  const won = S.sos.filter((s) => s.result === 'won').length;
  return growHero('var(--good)', `${icon('shield', 14)} Why you’re doing this`, esc(S.profile.why || 'Add your “why” in Settings'), 'This is your anchor when urges hit. Read it out loud.') + `
  <div class="grid g4 streaks">${HABITS.map((h) => {
    const s = habitStreak(h.id), m = nextMilestone(s.current);
    return `<div class="card streak"><div class="streak-ring">${ring((s.current / m) * 100, 'var(--good)', 58, 5)}<span class="ic" aria-hidden="true">${h.ic}</span></div><div class="n">${s.current}</div><div class="tiny muted">${h.name}</div><div class="tiny streak-next">best ${s.best} · next ${m}</div></div>`;
  }).join('')}</div>
  <button class="card urge-cta" data-act="sos"><span class="nu-ic">${icon('wind', 26)}</span><span class="grow"><strong>I have an urge right now</strong><span class="small">Urges peak and pass within minutes. Surf the wave.</span></span>${icon('arrowRight', 18)}</button>
  ${secH('📜', 'Urge log', S.sos.length ? `<span class="pill good">${won} beaten</span>` : '')}
  <div class="card">${recent.length ? recent.map((s) => { const h = HABITS.find((x) => x.id === s.type) || { ic: '🌀', name: 'Other' }; return `<div class="tx"><div class="cat" aria-hidden="true">${h.ic}</div><div class="grow"><div>${h.name}</div><div class="tiny muted">${fmtDate(s.date)} ${s.t || ''}</div></div><span class="pill ${s.result === 'won' ? 'good' : 'bad'}">${s.result === 'won' ? 'Beat it' : 'Slipped'}</span></div>`; }).join('') : `<div class="empty"><div class="empty-ic">${icon('wind', 30)}</div>When an urge hits, tap “Urge?” — every urge you surf shows up here.</div>`}</div>
  <div class="grid duo">
    <div class="card soft" style="--tint:var(--bad)"><div class="g-kick">${icon('dice', 14)} About gambling</div><p class="small" style="margin-top:6px">Gambling apps are engineered to keep you playing. If it feels out of control: block gambling sites and apps, ask your bank to block gambling transactions, use self-exclusion programs, let someone you trust help with money for a while, and contact a local gambling or mental-health helpline. Asking for help is strength.</p></div>
    <div class="card soft" style="--tint:var(--blue)"><div class="g-kick">${icon('phoneOff', 14)} Make social media harder</div><ul class="g-list" style="margin-top:6px">${['Log out after each use', 'Delete apps — use the browser only', 'Turn on grayscale', 'Set app limits in Digital Wellbeing / Screen Time', 'Put Light where your social apps used to be'].map((t) => listItem('check', t)).join('')}</ul></div>
  </div>`;
}
function growJournal() {
  const p = daily(C.prompts);
  return `<form class="card g-hero" style="--tint:var(--blue)" data-form="addjournal" data-p="${esc(p)}" novalidate>
    <div class="g-kick">${icon('pen', 14)} Today’s prompt</div><h2 class="g-title" style="font-size:1.2rem">${esc(p)}</h2>
    <textarea id="journal-in" aria-label="Journal entry" placeholder="Write freely…" style="margin-top:12px"></textarea>
    <button class="btn primary block" style="margin-top:10px" type="submit">${icon('check', 18)} Save entry · +10 XP</button></form>
  ${S.saved.length ? `${secH('🔖', 'Saved from the feed', `<button class="btn sm ghost" data-act="tab" data-tab="feed">Open in feed</button>`)}<div class="card">${[...S.saved].reverse().map((s, i) => `<div class="tx"><div class="grow"><div class="tiny muted">${esc(s.tag)}</div><div class="small">${esc(s.body)}</div></div><button class="icon-btn xs" data-act="delsaved" data-i="${S.saved.length - 1 - i}" aria-label="Remove saved card">${icon('x', 14)}</button></div>`).join('')}</div>` : ''}
  ${secH('📓', 'Entries', S.journal.length ? `<span class="pill">${S.journal.length}</span>` : '')}
  <div class="card">${S.journal.length ? `<ol class="timeline">${[...S.journal].reverse().map((j) => `<li><div class="tiny muted">${fmtDate(j.date)} · ${esc(j.prompt)}</div><div class="small" style="white-space:pre-wrap">${esc(j.text)}</div></li>`).join('')}</ol>` : `<div class="empty"><div class="empty-ic">${icon('bookOpen', 30)}</div>No entries yet. Five honest minutes is all it takes.</div>`}</div>`;
}
function growBadges() {
  const got = BADGES.filter((b) => S.badges[b.id]).length;
  const sorted = [...BADGES].sort((a, b) => (!!S.badges[b.id]) - (!!S.badges[a.id]));
  return growHero('var(--accent)', `${icon('trophy', 14)} Collection`, `${got} of ${BADGES.length} badges`, 'Each badge is worth +50 XP.',
      `<div class="xpbar" style="margin-top:12px"><i style="width:${(got / BADGES.length) * 100}%"></i></div>`) + `
  <div class="grid g3 badges">${sorted.map((b) => `<div class="card badge ${S.badges[b.id] ? '' : 'locked'}"><div class="bic" aria-hidden="true">${b.ic}</div><div class="small"><strong>${b.n}</strong></div><div class="tiny muted">${b.d}</div>${S.badges[b.id] ? `<div class="tiny badge-date">${icon('check', 12)} ${fmtDate(S.badges[b.id])}</div>` : `<div class="tiny badge-lock">${icon('lock', 12)} Locked</div>`}</div>`).join('')}</div>`;
}

// ---------- Modal (accessible: focus trap, Escape, focus restore) ----------
let modalOnClose = null, lastFocus = null;
function openModal(html, { onClose, label = 'Dialog' } = {}) {
  const m = $('#modal');
  if (m.hidden) lastFocus = document.activeElement;
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${iconize(html)}</div>`;
  m.hidden = false; modalOnClose = onClose || null;
  document.body.classList.add('modal-open');
  $('.sheet', m).focus({ preventScroll: true });
}
function closeModal() {
  const m = $('#modal');
  if (m.hidden) return;
  m.hidden = true; m.innerHTML = '';
  document.body.classList.remove('modal-open');
  const f = modalOnClose; modalOnClose = null;
  if (f) f();
  if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
}
const modalOpen = () => !$('#modal').hidden;

// ---------- Check-in wizards ----------
const FACES = ['😞', '😕', '😐', '🙂', '😄'];
const ENERGY = ['🪫', '😪', '😐', '⚡', '🚀'];
const SLEEPF = ['😵', '🥱', '😐', '😌', '😴'];
const STRESS = ['😌', '🙂', '😐', '😟', '😫'];
const URGE = ['🟢', '🟡', '🟠', '🔴', '🌋'];
const SCALE_WORDS = ['very low', 'low', 'okay', 'good', 'great'];
const TRAITS = ['Disciplined', 'Patient', 'Funny', 'Kind', 'Brave', 'Focused', 'Calm', 'Grateful', 'Honest', 'Confident'];
const EMOTIONS = ['Joy', 'Calm', 'Gratitude', 'Pride', 'Love', 'Excitement', 'Stress', 'Anger', 'Fear', 'Sadness', 'Loneliness', 'Shame', 'Envy', 'Boredom', 'Frustration'];
const IMPROVE = ['Sleep earlier', 'Less social media', 'More water', 'Exercise more', 'No fast food', 'No soda', 'Stay gambling-free', 'Spend less', 'More focused work', 'Tell more jokes', 'Be more patient', 'Better hygiene'];

let wiz = null, wizTimer = null;
const STEPS = {
  morning: () => {
    const w = daily(C.wisdom);
    return [
      { title: `Good morning, ${esc(firstName())} ☀️`, sub: 'Ten minutes to set up a great day. Breathe in. Let\'s go.', fields: [{ type: 'info', html: `<div class="card"><div class="quote">“${esc(w.q)}”</div><div class="quote-a">— ${esc(w.a)}</div></div>` }] },
      { title: 'How did you sleep?', fields: [{ type: 'sleep' }, { type: 'scale', key: 'sleepQ', label: 'Sleep quality', faces: SLEEPF }] },
      { title: 'How are you feeling?', fields: [{ type: 'scale', key: 'mood', label: 'Mood' }, { type: 'scale', key: 'energy', label: 'Energy', faces: ENERGY }] },
      { title: 'Gratitude 🙏', sub: 'Three things you\'re grateful for. This trains your brain to notice the good.', fields: [{ type: 'text', key: 'gratitude', ph: '1. \n2. \n3. ' }] },
      { title: 'Goal focus 🎯', sub: 'Which goal will you move forward today?', fields: [{ type: 'goal' }, { type: 'text', key: 'goalAction', label: 'One concrete action for it today', ph: 'e.g. Apply to 2 jobs · Study 45 minutes · Cook lunch at home', rows: 2 }] },
      { title: 'Top 3 priorities ✅', sub: 'If you only did these three things, today would be a win.', fields: [{ type: 'list3' }] },
      { title: 'Who will you be today?', sub: 'Pick a character trait to practice.', fields: [{ type: 'chips', key: 'intention', opts: TRAITS, label: 'Trait' }, { type: 'text', key: 'intentionText', label: 'How will you show it?', ph: 'e.g. I\'ll pause 6 seconds before reacting when stressed.', rows: 2 }] },
      { title: 'Morning routine 🪥', sub: 'Look sharp, feel sharp.', fields: [{ type: 'check', key: 'hygAM' }] },
      { title: 'Body check 💧', fields: [{ type: 'num', key: 'water', label: 'Glasses of water so far — drink one now!', step: 1, max: 30 }, { type: 'num', key: 'weight', label: `Weight (${S.settings.weightUnit}) — optional`, step: 0.1, max: 400, optional: true }] },
      { title: 'You\'re ready ✨', fields: [{ type: 'summary' }] },
    ];
  },
  evening: () => [
    { title: wiz.k === today() ? `Good evening, ${esc(firstName())} 🌙` : `Catching up: ${fmtDate(wiz.k)} 🕰️`, sub: 'Let\'s close the day with honesty. No judgment — just awareness.', fields: [{ type: 'info', html: `<div class="card small muted">Honest data = better recommendations and a truer projection of your future. Slips are information, not failure.</div>` }] },
    { title: 'Your priorities', sub: 'Tick what you got done.', fields: [{ type: 'review' }] },
    { title: 'Work & body', fields: [{ type: 'num', key: 'deepWork', label: 'Focused work / study (minutes)', step: 15, max: 960 }, { type: 'num', key: 'exercise', label: 'Exercise / walking (minutes)', step: 5, max: 600 }] },
    { title: 'Food & drinks', fields: [{ type: 'num', key: 'water', label: 'Glasses of water today', step: 1, max: 30 }, { type: 'yesno', key: 'fastFood', label: 'Did you eat fast food today?' }, { type: 'yesno', key: 'soda', label: 'Did you drink soft drinks / soda?' }] },
    { title: 'Screens & urges', fields: [{ type: 'num', key: 'socialMin', label: 'Minutes on social media (check Screen Time / Digital Wellbeing)', step: 5, max: 1440 }, { type: 'yesno', key: 'gambled', label: 'Did you gamble today?' }, { type: 'scale', key: 'urges', label: 'How strong were your urges today?', faces: URGE }] },
    { title: 'Money today 💰', sub: 'Log what you spent. 30 seconds of awareness.', fields: [{ type: 'money' }] },
    { title: 'How did today feel?', fields: [{ type: 'scale', key: 'mood', label: 'Mood' }, { type: 'scale', key: 'stress', label: 'Stress', faces: STRESS }] },
    { title: 'Emotional intelligence ❤️', sub: 'Name your strongest emotion today.', fields: [{ type: 'chips', key: 'emotion', opts: EMOTIONS, label: 'Emotion' }, { type: 'text', key: 'eq', label: 'What triggered it? How did you respond? What would your best self do?', rows: 3 }] },
    { title: 'Comedy rep 😂', sub: 'What was the funniest moment today? Or turn something annoying into a joke.', fields: [{ type: 'text', key: 'funny', ph: 'The funniest thing today was…' }, { type: 'toggle', key: 'saveJoke', label: 'Also save it to my joke notebook' }] },
    { title: 'Win & lesson 🏆', fields: [{ type: 'text', key: 'win', label: 'Biggest win today (big or small)', rows: 2 }, { type: 'text', key: 'lesson', label: 'One thing to do better tomorrow', rows: 2 }] },
    { title: 'Night routine 🌙', fields: [{ type: 'check', key: 'hygPM' }] },
    { title: 'Day complete 🌟', fields: [{ type: 'summary' }] },
  ],
  weekly: () => [
    { title: 'Weekly review 🗓️', sub: 'Your week at a glance. Look at it like a coach, not a critic.', fields: [{ type: 'week' }] },
    { title: 'Proudest moment 🏆', fields: [{ type: 'text', key: 'proud', label: 'What are you most proud of this week?', ph: 'Big or small — it counts.' }] },
    { title: 'Goal progress 🎯', sub: 'How far along is each goal? Be honest — this powers your projection.', fields: [{ type: 'goalp' }] },
    { title: 'One thing to improve', sub: 'Pick ONE. Focus beats force.', fields: [{ type: 'chips', key: 'focusHabit', opts: IMPROVE, label: 'Focus for next week' }] },
    { title: 'Your commitment ✍️', fields: [{ type: 'text', key: 'nextWeek', label: 'Next week I will…', ph: 'e.g. Be in bed by 10:30 on weeknights', rows: 2 }] },
    { title: 'Week sealed ✨', fields: [{ type: 'summary' }] },
  ],
};

function openWizard(type, k = today()) {
  const d = day(k), st = S.settings;
  const key = type === 'weekly' ? weekStart(k) : k;
  if (!wiz || wiz.type !== type || wiz.key !== key) {
    let base;
    if (type === 'morning') {
      base = { bed: st.bedTime, wake: st.wakeTime, sleepQ: 0, mood: 0, energy: 0, gratitude: '', goal: '', goalAction: '', priorities: [], intention: '', intentionText: '', weight: '', ...(d.morning || {}) };
      base.priorities = JSON.parse(JSON.stringify(base.priorities || []));
      while (base.priorities.length < 3) base.priorities.push({ t: '', done: false });
    } else if (type === 'evening') {
      base = { socialMin: 0, fastFood: null, soda: null, gambled: null, urges: 0, mood: 0, stress: 0, emotion: '', eq: '', funny: '', saveJoke: true, win: '', lesson: '', ...(d.evening || {}) };
      base.priorities = JSON.parse(JSON.stringify(d.morning?.priorities || []));
    } else {
      base = { proud: '', focusHabit: '', nextWeek: '', ...(S.reviews[key] || {}) };
      base.goals = JSON.parse(JSON.stringify(S.profile.goals));
    }
    Object.assign(base, { water: d.water || 0, exercise: d.exercise || 0, deepWork: d.deepWork || 0, hygAM: { ...d.hygAM }, hygPM: { ...d.hygPM } });
    wiz = { type, k, key, step: 0, draft: base, start: Date.now(), xpBefore: computeXP() };
  }
  wiz.steps = STEPS[type]();
  openModal('<div id="wiz"></div>', { label: `${type} check-in`, onClose: () => { clearInterval(wizTimer); render(); } });
  renderWizard();
  clearInterval(wizTimer);
  wizTimer = setInterval(() => { const t = $('#wiz-timer'); if (t) t.textContent = elapsed(); }, 1000);
}
const elapsed = () => { const s = Math.floor((Date.now() - wiz.start) / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

function renderWizard(keepScroll = false) {
  const host = $('#wiz'); if (!host || !wiz) return;
  const sheet = host.closest('.sheet'), scroll = sheet.scrollTop;
  const st = wiz.steps[wiz.step], last = wiz.step === wiz.steps.length - 1;
  if (last) commitWizard();
  host.innerHTML = `
    <div class="wiz-top"><button class="icon-btn" data-act="wiz-close" aria-label="Close (your answers are kept)">${icon('x', 18)}</button>
      <div class="prog" role="progressbar" aria-label="Step ${wiz.step + 1} of ${wiz.steps.length}" aria-valuemin="1" aria-valuemax="${wiz.steps.length}" aria-valuenow="${wiz.step + 1}"><i style="width:${((wiz.step + 1) / wiz.steps.length) * 100}%"></i></div>
      <span class="pill timer" id="wiz-timer" aria-label="Time spent">${elapsed()}</span></div>
    <div class="wiz-body">
      <h2 class="wiz-title" id="wiz-title">${st.title}</h2>${st.sub ? `<div class="muted small" style="margin-bottom:14px">${st.sub}</div>` : '<div style="height:10px"></div>'}
      ${st.fields.map(fieldHTML).join('')}
    </div>
    <div class="wiz-foot">
      ${wiz.step > 0 && !last ? '<button class="btn" data-act="wiz-back">Back</button>' : ''}
      <button class="btn primary" data-act="${last ? 'wiz-done' : 'wiz-next'}">${last ? 'Finish ✨' : wiz.step === wiz.steps.length - 2 ? 'Complete' : 'Next'}</button>
    </div>`;
  sheet.setAttribute('aria-labelledby', 'wiz-title');
  sheet.scrollTop = keepScroll ? scroll : 0;
}

function fieldHTML(f) {
  const D = wiz.draft, st = S.settings;
  const id = 'f-' + (f.key || f.type);
  const lbl = f.label ? `<label class="lbl" for="${id}" id="${id}-l">${f.label}</label>` : '';
  switch (f.type) {
    case 'info': return f.html;
    case 'scale': { const faces = f.faces || FACES; return `<div style="margin-bottom:14px">${f.label ? `<div class="lbl" id="${id}-l">${f.label}</div>` : ''}<div class="scale" role="radiogroup" aria-labelledby="${id}-l">${faces.map((e, i) => `<button role="radio" aria-checked="${D[f.key] === i + 1}" class="${D[f.key] === i + 1 ? 'on' : ''}" data-act="wset" data-k="${f.key}" data-v="${i + 1}" aria-label="${i + 1} of 5, ${SCALE_WORDS[i]}">${e}</button>`).join('')}</div></div>`; }
    case 'sleep': { const h = sleepHours(D); return `<div class="grid"><div><label class="lbl" for="f-bed">Went to bed</label><input type="time" id="f-bed" data-w="bed" value="${D.bed}"></div><div><label class="lbl" for="f-wake">Woke up</label><input type="time" id="f-wake" data-w="wake" value="${D.wake}"></div></div>
      <div class="center" style="margin:12px 0" aria-live="polite"><span class="big-num" id="sleep-h">${h ?? '–'}</span> <span class="muted">hours · goal ${st.sleepTarget}h</span></div>`; }
    case 'text': return `<div style="margin-bottom:12px">${lbl}<textarea id="${id}" ${f.label ? '' : `aria-labelledby="wiz-title"`} data-w="${f.key}" rows="${f.rows || 4}" style="min-height:${(f.rows || 4) * 26}px" placeholder="${esc(f.ph || '')}" maxlength="2000">${esc(D[f.key] || '')}</textarea></div>`;
    case 'num': return `<div style="margin-bottom:14px">${lbl}<div class="stepper"><button class="round-btn minus" data-act="wstep" data-k="${f.key}" data-s="-${f.step}" data-max="${f.max}" aria-label="Decrease">−</button>
      <input type="number" id="${id}" class="v" data-w="${f.key}" data-num="1" value="${D[f.key] === '' || D[f.key] == null ? '' : D[f.key]}" step="${f.step}" min="0" max="${f.max}" inputmode="decimal" ${f.optional ? 'placeholder="—"' : ''}>
      <button class="round-btn" data-act="wstep" data-k="${f.key}" data-s="${f.step}" data-max="${f.max}" aria-label="Increase">+</button></div></div>`;
    case 'yesno': return `<div style="margin-bottom:14px"><div class="lbl" id="${id}-l">${f.label}</div><div class="yesno" role="radiogroup" aria-labelledby="${id}-l"><button role="radio" aria-checked="${D[f.key] === true}" class="y ${D[f.key] === true ? 'on' : ''}" data-act="wset" data-k="${f.key}" data-v="true">Yes</button><button role="radio" aria-checked="${D[f.key] === false}" class="n ${D[f.key] === false ? 'on' : ''}" data-act="wset" data-k="${f.key}" data-v="false">No 💪</button></div></div>`;
    case 'toggle': return `<button class="check ${D[f.key] ? 'on' : ''}" data-act="wtoggle" data-k="${f.key}" aria-pressed="${!!D[f.key]}"><span class="box" aria-hidden="true">${D[f.key] ? '✓' : ''}</span><span>${f.label}</span></button>`;
    case 'chips': return `<div style="margin-bottom:12px"><div class="chips" role="radiogroup" aria-label="${esc(f.label || 'Options')}">${f.opts.map((o) => `<button role="radio" aria-checked="${D[f.key] === o}" class="chip ${D[f.key] === o ? 'on' : ''}" data-act="wset" data-k="${f.key}" data-v="${esc(o)}" data-str="1">${esc(o)}</button>`).join('')}</div></div>`;
    case 'goal': return `<div class="chips" role="radiogroup" aria-label="Goal" style="margin-bottom:8px">${goals().map((g) => `<button role="radio" aria-checked="${D.goal === g.t}" class="chip ${D.goal === g.t ? 'on' : ''}" data-act="wset" data-k="goal" data-v="${esc(g.t)}" data-str="1">🎯 ${esc(g.t)}</button>`).join('') || '<div class="small muted">Add goals in Settings.</div>'}</div>`;
    case 'list3': return D.priorities.slice(0, 3).map((p, i) => `<label class="lbl" for="f-prio${i}">Priority ${i + 1}${i === 0 ? ' — the most important' : ''}</label><input type="text" id="f-prio${i}" data-w="prio" data-i="${i}" value="${esc(p.t)}" maxlength="140" placeholder="${['e.g. Finish the report', 'e.g. 30-min workout', 'e.g. Call mom'][i]}">`).join('');
    case 'review': { const pr = D.priorities.map((p, i) => ({ ...p, i })).filter((p) => p.t?.trim()); return pr.length ? pr.map((p) => `<button class="check ${p.done ? 'on' : ''}" data-act="wprio" data-i="${p.i}" aria-pressed="${!!p.done}"><span class="box" aria-hidden="true">${p.done ? '✓' : ''}</span><span>${esc(p.t)}</span></button>`).join('') : '<div class="card small muted">No priorities were set that morning — that\'s okay. Set them in tomorrow\'s morning check-in.</div>'; }
    case 'check': return st[f.key].map((it) => `<button class="check ${D[f.key][it] ? 'on' : ''}" data-act="wchk" data-k="${f.key}" data-item="${esc(it)}" aria-pressed="${!!D[f.key][it]}"><span class="box" aria-hidden="true">${D[f.key][it] ? '✓' : ''}</span><span>${esc(it)}</span></button>`).join('');
    case 'money': return moneyStepHTML();
    case 'week': return weekStepHTML();
    case 'goalp': return D.goals.map((g, i) => (g.t?.trim() ? `<div style="margin-bottom:16px"><div class="row between"><label class="small" for="f-gp${i}">${esc(g.t)}</label><strong id="gp-v${i}">${g.p}%</strong></div><input type="range" id="f-gp${i}" min="0" max="100" step="5" value="${g.p}" data-w="goalp" data-i="${i}"></div>` : '')).join('') || '<div class="small muted">Add goals in Settings first.</div>';
    case 'summary': return summaryHTML();
  }
  return '';
}
function moneyStepHTML() {
  const list = txOn(wiz.k);
  return `<div class="row"><input type="number" id="w-amt" aria-label="Amount" placeholder="Amount (${esc(S.settings.currency)})" inputmode="decimal" class="grow"><select id="w-cat" aria-label="Category" style="width:auto">${CATS_OUT.map(([id, ic, n]) => `<option value="${id}">${ic} ${n}</option>`).join('')}</select></div>
    <input type="text" id="w-note" aria-label="Note" placeholder="What was it? (optional)" style="margin-top:8px" maxlength="120">
    <button class="btn block" style="margin-top:8px" data-act="wtx">+ Add expense</button>
    <div style="margin-top:12px" aria-live="polite">${list.length ? list.map((t) => { const ci = catInfo(t.cat); return `<div class="tx"><div class="cat" aria-hidden="true">${ico(ci[1], 20)}</div><div class="grow small">${esc(t.note || ci[2])}</div><div class="${t.type === 'in' ? 'amt-in' : 'amt-out'}">${t.type === 'in' ? '+' : '−'}${cur(t.amount)}</div></div>`; }).join('') + `<div class="row between" style="margin-top:8px"><span class="muted small">Spent today</span><strong>${cur(spentOn(wiz.k))}</strong></div>` : '<div class="muted small center">Nothing logged today yet. Spent nothing? Amazing — just tap Next.</div>'}</div>`;
}
function weekStepHTML() {
  const w = weekSummary(wiz.k);
  if (!w.tracked) return '<div class="card small muted">No check-ins this week yet — that\'s okay. The review still helps you aim next week.</div>';
  const stat = (ic, v, l) => `<div class="card streak"><div class="ic" aria-hidden="true">${ic}</div><div class="n" style="font-size:1.3rem">${v}</div><div class="tiny muted">${l}</div></div>`;
  const slips = HABITS.filter((h) => w.slips[h.id]).map((h) => `${h.ic} ${h.name}: ${w.slips[h.id]} day${w.slips[h.id] === 1 ? '' : 's'}`);
  return `<div class="card hero">${ring(w.avg, 'var(--gold)', 84, 8, w.avg, 'Average life score this week')}<div><strong>Average Life Score</strong><div class="small muted">${w.tracked}/7 days tracked</div>${w.prevAvg != null ? `<div class="small">${trendTag(w.avg - w.prevAvg)} vs last week</div>` : ''}</div></div>
    <div class="grid g3" style="margin-top:12px">${stat('😴', w.sleep != null ? w.sleep + 'h' : '–', 'avg sleep')}${stat('💧', w.water, 'glasses/day')}${stat('🏃', w.exercise, 'min exercise')}${stat('⏱️', w.focus, 'min focused')}${stat('💸', cur(Math.round(w.spent)), 'spent')}${stat('😂', w.jokes, 'jokes')}</div>
    ${w.best ? `<div class="insight small" style="margin-top:12px;border-left-color:var(--gold)">⭐ Best day: <strong>${fmtDate(w.best.k)}</strong> (score ${w.best.s.overall}). What made it great? Do more of that.</div>` : ''}
    ${slips.length ? `<div class="insight small" style="border-left-color:var(--bad)">${slips.join(' · ')}</div>` : '<div class="insight small" style="border-left-color:var(--good)">🛡️ Zero slips this week. That\'s discipline.</div>'}
    ${w.wins.length ? `<div class="card small" style="margin-top:12px"><div class="tiny muted">Your wins this week</div>${w.wins.map((x) => `<div>🏆 ${esc(x)}</div>`).join('')}</div>` : ''}`;
}
function summaryHTML() {
  const k = wiz.k, d = S.days[k];
  const gained = computeXP() - wiz.xpBefore;
  const head = (ic, extra = '') => `<div class="center" style="margin:10px 0"><div style="font-size:3rem" aria-hidden="true">${ic}</div><div class="pill gold">+${gained} XP</div><div class="small muted" style="margin-top:6px">${extra || `Finished in ${elapsed()}`}</div></div>`;
  if (wiz.type === 'morning') {
    const pr = (d.morning?.priorities || []).filter((p) => p.t?.trim());
    return head('🌅') + `<div class="card stack">${d.morning.goal ? `<div><div class="tiny muted">Goal focus</div><strong>${esc(d.morning.goal)}</strong>${d.morning.goalAction ? `<div class="small">→ ${esc(d.morning.goalAction)}</div>` : ''}</div>` : ''}
        ${pr.length ? `<div><div class="tiny muted">Top priorities</div>${pr.map((p, i) => `<div>${i + 1}. ${esc(p.t)}</div>`).join('')}</div>` : ''}
        ${d.morning.intention ? `<div><div class="tiny muted">Today I practice</div><strong>${esc(d.morning.intention)}</strong></div>` : ''}
        <div><div class="tiny muted">Avoid today</div><div class="small">📵 Mindless scrolling · 🍔 Fast food · 🥤 Soda · 🎲 Gambling</div></div>
        <div><div class="tiny muted">Today's laugh</div><div class="small">${esc(daily(C.jokes))}</div></div></div>
      <button class="btn block" style="margin-top:12px" data-act="focus-from-wiz">⏱️ Start a focus session on priority #1</button>`;
  }
  if (wiz.type === 'weekly') {
    const r = S.reviews[wiz.key];
    return head('🗓️', 'Review saved') + `<div class="card stack">${r.focusHabit ? `<div><div class="tiny muted">Next week's focus</div><strong>${esc(r.focusHabit)}</strong></div>` : ''}${r.nextWeek ? `<div><div class="tiny muted">Commitment</div>${esc(r.nextWeek)}</div>` : ''}<div class="small muted">You'll see your commitment on the Today screen all week.</div></div>`;
  }
  const s = scores(k) || {};
  return head('🌟', `Life score ${k === today() ? 'today' : 'that day'}: <strong style="color:var(--gold)">${s.overall ?? '–'}</strong>`) +
    `<div class="grid g3">${DOMAINS.map((dm) => `<div class="card ring-card">${ring(s[dm.id] || 0, dm.color, 54, 6, s[dm.id] ?? 0)}<div class="tiny">${ico(dm.ic, 14)} ${dm.name}</div></div>`).join('')}</div>
    <div class="card small" style="margin-top:12px">${HABITS.map((h) => `${h.ic} ${habitStreak(h.id).current}d`).join(' · ')} <span class="muted">— freedom streaks</span></div>
    ${chestReady(k) && k === today() ? '<div class="card small center">🎁 You unlocked today\'s reward chest — open it on the Today screen!</div>' : ''}
    <div class="card small muted">Sleep well. Phone away from the bed. See you in the morning ☀️</div>`;
}
function commitWizard() {
  const D = wiz.draft;
  if (wiz.type === 'weekly') {
    S.reviews[wiz.key] = { at: Date.now(), proud: D.proud, focusHabit: D.focusHabit, nextWeek: D.nextWeek, avg: weekSummary(wiz.k).avg };
    S.profile.goals = D.goals.map((g) => ({ t: g.t, p: clamp(+g.p || 0) }));
    persist();
    return;
  }
  const d = day(wiz.k);
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
  persist();
}

// ---------- Focus timer (survives reloads: stored as start + duration) ----------
const timerLeftMs = () => (S.timer ? Math.max(0, S.timer.start + S.timer.dur - Date.now()) : 0);
const timerLeftText = () => { const s = Math.ceil(timerLeftMs() / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
function openFocus(label) {
  if (S.timer) { renderFocusRunning(); return; }
  const pr = S.days[today()]?.morning?.priorities?.find((p) => p.t?.trim() && !p.done);
  const def = label || pr?.t || S.days[today()]?.morning?.goalAction || '';
  openModal(`<div class="row between"><h2>⏱️ Focus session</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">${icon('x', 18)}</button></div>
    <p class="small muted">One task. Phone face down. Notifications off. When the timer ends, your minutes are logged automatically.</p>
    <label class="lbl" for="fo-label">What will you focus on?</label><input type="text" id="fo-label" value="${esc(def)}" placeholder="e.g. Finish the report" maxlength="80">
    <div class="lbl">Duration</div>
    <div class="grid g4">${[15, 25, 50, 90].map((m) => `<button class="btn ${m === 25 ? 'primary' : ''}" data-act="focus-start" data-v="${m}">${m} min</button>`).join('')}</div>
    <div class="tiny muted center" style="margin-top:12px">${S.focusLog.length} sessions completed so far</div>`, { label: 'Focus session', onClose: render });
}
function renderFocusRunning() {
  const t = S.timer, total = t.dur;
  openModal(`<div class="row between"><h2>⏱️ ${esc(t.label || 'Deep work')}</h2><button class="icon-btn" data-act="modal-close" aria-label="Minimize timer">–</button></div>
    <div class="focus-ring" id="focus-ring">${ring(100 - (timerLeftMs() / total) * 100, 'var(--gold)', 220, 12)}<div class="focus-time" data-timer-text aria-live="off">${timerLeftText()}</div></div>
    <div class="quote small center" style="margin:6px 0 16px">“${esc(daily(C.wisdom, 7).q)}”</div>
    <div class="grid"><button class="btn" data-act="focus-cancel">Cancel</button><button class="btn primary" data-act="focus-stop">Stop & log</button></div>
    <div class="tiny muted center" style="margin-top:10px">You can close this — the timer keeps running.</div>`, { label: 'Focus timer running', onClose: render });
}
function finishFocus(full) {
  const t = S.timer; if (!t) return;
  const mins = full ? Math.round(t.dur / 60000) : Math.floor((Date.now() - t.start) / 60000);
  S.timer = null;
  const k = today();
  if (mins >= 1) { const d = day(k); d.deepWork = (d.deepWork || 0) + mins; S.focusLog.push({ date: k, mins, label: t.label, full }); }
  persist();
  document.title = 'Light';
  if (modalOpen() && $('#focus-ring')) closeModal(); else render();
  if (full) { burst(); buzz([80, 60, 80]); toast(`⏱️ Focus complete! ${mins} min logged · +5 XP`); notify('Focus session complete ✨', `${mins} minutes on "${t.label || 'deep work'}". Take a 5-minute break.`); }
  else toast(mins >= 1 ? `Logged ${mins} focused minute${mins === 1 ? '' : 's'}.` : 'Session ended (under a minute — not logged).');
}
setInterval(() => {
  if (!S.timer) return;
  const txt = timerLeftText();
  $$('[data-timer-text]').forEach((e) => { e.textContent = txt; });
  const arc = $('#focus-ring .ring-arc');
  if (arc) { const c = +arc.getAttribute('stroke-dasharray'); arc.setAttribute('stroke-dashoffset', c * (timerLeftMs() / S.timer.dur)); }
  document.title = `⏱ ${txt} · Light`;
  if (timerLeftMs() <= 0) finishFocus(true);
}, 1000);

// ---------- Guided home workout (interval timer with voice cues) ----------
let wp = null, wpTimer = null;
function speak(text) {
  if (!wp?.voice || !text || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; speechSynthesis.speak(u); } catch { /* unsupported */ }
}
const wpLeft = () => (wp.paused ? wp.left : Math.max(0, wp.endsAt - Date.now()));
function openWorkout(id) {
  const w = workout(id); if (!w) return;
  const level = S.settings.fitLevel || 'beginner';
  const steps = workoutSteps(w, level);
  wp = { w, level, steps, i: 0, endsAt: Date.now() + steps[0].secs * 1000, paused: false, left: 0, start: Date.now(), voice: S.settings.fitVoice !== false, done: null, cue: false };
  openModal('<div id="wp"></div>', { label: `${w.n} workout`, onClose: () => { clearInterval(wpTimer); try { speechSynthesis.cancel(); } catch { /* */ } wp = null; render(); } });
  renderWP();
  speak(`${w.n}. Get ready: ${exercise(steps[0].ex).n}`);
  clearInterval(wpTimer); wpTimer = setInterval(tickWP, 250);
}
function renderWP() {
  const host = $('#wp'); if (!host || !wp) return;
  if (wp.done) {
    host.innerHTML = `<div class="center wp-done"><div class="empty-ic" style="width:84px;height:84px">${icon('trophy', 44)}</div>
      <h2>${wp.done.full ? 'Workout complete!' : 'Workout saved'}</h2>
      <p class="muted">${esc(wp.w.n)} · ${wp.done.mins} min added to today${wp.done.full ? ' · +25 XP' : ''}</p>
      <p class="small" style="margin:14px 0">${wp.done.full ? 'Drink a glass of water and stretch for a minute. Your future self says thanks.' : 'Every minute counts. Finish the full routine next time for bonus XP.'}</p>
      <button class="btn primary block" data-act="modal-close">Done</button></div>`;
    return;
  }
  const st = wp.steps[wp.i], ex = exercise(st.ex), L = levelInfo(wp.level);
  const works = wp.steps.filter((x) => x.phase === 'work').length;
  const workIdx = wp.steps.slice(0, wp.i + 1).filter((x) => x.phase === 'work').length;
  const next = wp.steps.slice(wp.i + 1).find((x) => x.phase === 'work');
  const phase = { prep: 'Get ready', work: 'Go!', rest: 'Rest' }[st.phase];
  host.innerHTML = `<div class="row between">
      <div><div class="tiny muted">${esc(wp.w.n)} · ${L.n}</div><strong>Round ${st.round}/${wp.w.rounds} · move ${Math.max(workIdx, 1)}/${works}</strong></div>
      <div class="row"><button class="icon-btn" data-act="wp-voice" aria-label="${wp.voice ? 'Mute voice cues' : 'Turn on voice cues'}">${icon(wp.voice ? 'bell' : 'bellOff', 18)}</button><button class="icon-btn" data-act="wp-end" aria-label="End workout">${icon('x', 18)}</button></div></div>
    <div class="prog" style="margin:12px 0 6px"><i style="width:${(wp.i / wp.steps.length) * 100}%"></i></div>
    <div class="wp-phase ${st.phase}">${phase}</div>
    <div class="wp-name">${st.phase === 'rest' ? '<span class="muted">Next:</span> ' : ''}${esc(ex.n)}</div>
    <div class="focus-ring wp-ring ${st.phase}" id="wp-ring">${ring(100, 'var(--wp-c)', 200, 12)}<div class="focus-time" id="wp-time" aria-live="off">${Math.ceil(wpLeft() / 1000)}</div></div>
    <ol class="how small">${ex.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <p class="tiny muted tip">${icon('bulb', 12)} ${esc(ex.tip)}</p>
    ${next && st.phase === 'work' ? `<div class="wp-next tiny">Up next: <strong>${esc(exercise(next.ex).n)}</strong></div>` : ''}
    <div class="grid" style="margin-top:14px"><button class="btn" data-act="wp-pause">${icon(wp.paused ? 'play' : 'pause', 18)} ${wp.paused ? 'Resume' : 'Pause'}</button><button class="btn primary" data-act="wp-skip">${icon('skip', 18)} Skip</button></div>`;
  updateWP();
}
function updateWP() {
  const st = wp.steps[wp.i], left = wpLeft();
  const t = $('#wp-time'); if (t) t.textContent = Math.ceil(left / 1000);
  const arc = $('#wp-ring .ring-arc');
  if (arc) { const c = +arc.getAttribute('stroke-dasharray'); arc.setAttribute('stroke-dashoffset', c * (1 - left / (st.secs * 1000))); }
}
function tickWP() {
  if (!wp || wp.done || wp.paused) return;
  const left = wpLeft();
  updateWP();
  if (left <= 3000 && !wp.cue) { wp.cue = true; buzz(15); }
  if (left <= 0) advanceWP();
}
function advanceWP() {
  wp.i++; wp.cue = false;
  if (wp.i >= wp.steps.length) { finishWP(true); return; }
  const st = wp.steps[wp.i];
  wp.endsAt = Date.now() + st.secs * 1000; wp.paused = false;
  buzz([40, 30, 40]);
  renderWP();
  speak(st.phase === 'rest' ? `Rest. Next up: ${exercise(st.ex).n}` : exercise(st.ex).n);
}
function finishWP(full) {
  const mins = Math.max(1, Math.round((Date.now() - wp.start) / 60000));
  S.workouts.push({ id: wp.w.id, date: today(), mins, level: wp.level, ...(full ? {} : { partial: true }) });
  const d = day(); d.exercise = (d.exercise || 0) + mins;
  persist();
  wp.done = { mins, full };
  clearInterval(wpTimer);
  if (full) { speak('Workout complete. Great job!'); burst(); buzz([60, 40, 60, 40, 120]); }
  renderWP();
}

// ---------- Urge surfing ----------
let sosTimer = null, sosType = null;
function openSOS() { sosType = null; openModal('<div id="sos-body"></div>', { label: 'Urge help', onClose: () => clearInterval(sosTimer) }); renderSOS(0); }
function renderSOS(stage) {
  const b = $('#sos-body'); if (!b) return;
  clearInterval(sosTimer);
  if (stage === 0) {
    b.innerHTML = `<div class="row between"><h2>🌊 Surf the urge</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">${icon('x', 18)}</button></div>
      <p class="muted small">You opened this instead of giving in. That already counts. What's pulling at you?</p>
      <div class="grid">${[...HABITS, { id: 'other', name: 'Something else', ic: '🌀' }].map((h) => `<button class="card center" data-act="sos-type" data-v="${h.id}"><div style="font-size:2rem" aria-hidden="true">${h.ic}</div><div class="small">${h.name}</div></button>`).join('')}</div>`;
    return;
  }
  const alts = C.alternatives[sosType] || C.alternatives.other;
  const s = HABITS.find((h) => h.id === sosType);
  let left = 90;
  b.innerHTML = `<div class="row between"><h2>Breathe with the circle</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">${icon('x', 18)}</button></div>
    <p class="muted small">Urges rise, peak and fall like a wave — usually within minutes. You don't have to act. Just watch it pass.</p>
    <div class="breath" id="breath" aria-live="polite">Breathe in</div>
    <div class="center"><span class="big-num" id="sos-left">${left}</span><span class="muted"> sec</span></div>
    ${s ? `<div class="card center small" style="margin-top:12px">Current streak: <strong>${habitStreak(s.id).current} days</strong> free of ${s.name.toLowerCase()}. Protect it.</div>` : ''}
    <div class="card"><div class="tiny muted">Remember why</div><div class="small">${esc(S.profile.why || goals().map((g) => g.t).join(' · '))}</div></div>
    <div class="card"><div class="tiny muted" style="margin-bottom:6px">Do this instead</div>${alts.map((a) => `<div class="small" style="padding:3px 0">• ${esc(a)}</div>`).join('')}</div>
    <div class="grid" style="margin-top:14px"><button class="btn" data-act="sos-slip">I slipped</button><button class="btn primary" data-act="sos-won">I beat it 💪</button></div>`;
  let phase = 0, tick = 0;
  const br = $('#breath');
  const cycle = () => { phase = (phase + 1) % 2; br.className = 'breath ' + (phase ? 'in' : 'out'); br.textContent = phase ? 'Breathe in' : 'Breathe out'; };
  setTimeout(cycle, 50);
  sosTimer = setInterval(() => {
    left = Math.max(0, left - 1); tick++;
    const el = $('#sos-left'); if (el) el.textContent = left;
    if ((phase === 1 && tick % 10 === 4) || (phase === 0 && tick % 10 === 0)) cycle();
    if (left === 0) { clearInterval(sosTimer); if (el) el.parentElement.innerHTML = '<strong style="color:var(--good)">The wave has passed. You did it.</strong>'; buzz(40); }
  }, 1000);
}
function logSOS(result) {
  const t = new Date();
  S.sos.push({ date: today(), t: `${pad(t.getHours())}:${pad(t.getMinutes())}`, type: sosType || 'other', result });
  persist(); closeModal();
  if (result === 'won') { toast('💪 Urge defeated! +20 XP'); burst(); buzz([30, 40, 30]); }
  else toast('Logged. One slip doesn\'t erase your progress — the next choice is a fresh start. ❤️', { ms: 5000 });
}

// ---------- Other modals ----------
function openChest() {
  if (!chestReady()) return;
  const r = rollChest();
  S.chests[today()] = r;
  persist();
  const tierTxt = { common: 'Common', rare: '✨ Rare', legendary: '🌟 LEGENDARY' }[r.tier];
  openModal(`<div class="center chest-open"><div class="chest-big" aria-hidden="true">🎁</div><div class="pill gold" style="margin:10px 0">${tierTxt} reward</div>
    <h2>+${r.xp} XP</h2><div class="card" style="margin-top:14px;text-align:left">${esc(r.item)}</div>
    <p class="small muted">Come back tomorrow — complete both check-ins to open another chest.</p>
    <button class="btn primary block" data-act="modal-close">Awesome</button></div>`, { label: 'Daily reward', onClose: render });
  burst(); buzz([40, 50, 40, 50, 80]);
  if (r.tier !== 'common') setTimeout(() => burst(), 350);
}
function quickNum(key, title, step) {
  const d = day();
  openModal(`<div class="row between"><h2>${title}</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">${icon('x', 18)}</button></div>
    <div class="stepper" style="margin:20px 0"><button class="round-btn minus" data-act="qn" data-s="-${step}" aria-label="Decrease">−</button><input type="number" id="qn-v" class="v" aria-label="Minutes" value="${d[key] || 0}" min="0" inputmode="numeric"><button class="round-btn" data-act="qn" data-s="${step}" aria-label="Increase">+</button></div>
    <div class="chips" style="margin-bottom:16px">${[10, 20, 30, 45, 60, 90].map((m) => `<button class="chip" data-act="qn-set" data-v="${m}">${m} min</button>`).join('')}</div>
    <button class="btn primary block" data-act="qn-save" data-k="${key}">Save</button>`, { label: title, onClose: render });
}
let installEvt = null;
function openSettings() {
  const st = S.settings, p = S.profile, bk = backupInfo();
  openModal(`<div class="row between"><h2>⚙️ Settings</h2><button class="icon-btn" data-act="modal-close" aria-label="Close">${icon('x', 18)}</button></div>
    <div class="sec" style="margin-top:14px"><h2>🎨 Appearance</h2><span class="tiny muted">changes apply instantly</span></div>
    <div class="card stack">
      <div class="seg" role="radiogroup" aria-label="Theme">${[['auto', 'contrast', 'Auto'], ['dark', 'moon', 'Dark'], ['light', 'sun', 'Light']].map(([v, ic, n]) => `<button type="button" role="radio" aria-checked="${st.theme === v}" class="${st.theme === v ? 'on' : ''}" data-act="set-theme" data-v="${v}">${icon(ic, 16)}${n}</button>`).join('')}</div>
      <div class="swatches" role="radiogroup" aria-label="Accent color">${ACCENTS.map(([v, n]) => `<button type="button" role="radio" aria-checked="${st.accent === v}" class="swatch ${st.accent === v ? 'on' : ''}" data-act="set-accent" data-v="${v}" data-accent-preview="${v}"><i aria-hidden="true"></i><span>${n}</span></button>`).join('')}</div>
    </div>
    <div class="sec"><h2>👤 You & your goals</h2></div>
    <form data-form="settings" novalidate>
    <label class="lbl" for="s-name">Name</label><input type="text" id="s-name" value="${esc(p.name)}" maxlength="40">
    <div class="lbl">Goals</div>${[0, 1, 2].map((i) => `<input type="text" id="s-g${i}" aria-label="Goal ${i + 1}" value="${esc(p.goals[i]?.t || '')}" style="margin-bottom:6px" placeholder="Goal ${i + 1}" maxlength="100">`).join('')}
    <label class="lbl" for="s-why">Your why</label><textarea id="s-why" maxlength="600">${esc(p.why || '')}</textarea>
    <div class="grid">
      <div><label class="lbl" for="s-cur">Currency</label><input type="text" id="s-cur" value="${esc(st.currency)}" maxlength="4"></div>
      <div><label class="lbl" for="s-budget">Monthly budget</label><input type="number" id="s-budget" value="${st.budget}" min="0"></div>
      <div><label class="lbl" for="s-sname">Savings goal name</label><input type="text" id="s-sname" value="${esc(st.savingsName)}" maxlength="40"></div>
      <div><label class="lbl" for="s-sgoal">Savings goal amount</label><input type="number" id="s-sgoal" value="${st.savingsGoal || ''}" min="0" placeholder="e.g. 50000"></div>
      <div><label class="lbl" for="s-water">Water goal (glasses)</label><input type="number" id="s-water" value="${st.waterTarget}" min="1" max="30"></div>
      <div><label class="lbl" for="s-sleep">Sleep goal (hours)</label><input type="number" id="s-sleep" value="${st.sleepTarget}" min="4" max="12" step="0.5"></div>
      <div><label class="lbl" for="s-bed">Target bedtime</label><input type="time" id="s-bed" value="${st.bedTime}"></div>
      <div><label class="lbl" for="s-wake">Target wake time</label><input type="time" id="s-wake" value="${st.wakeTime}"></div>
      <div><label class="lbl" for="s-social">Social media limit (min/day)</label><input type="number" id="s-social" value="${st.socialLimit}" min="0"></div>
      <div><label class="lbl" for="s-wu">Weight unit</label><select id="s-wu"><option ${st.weightUnit === 'kg' ? 'selected' : ''}>kg</option><option ${st.weightUnit === 'lb' ? 'selected' : ''}>lb</option></select></div>
    </div>
    <label class="lbl" for="s-am">Morning routine (one per line)</label><textarea id="s-am">${esc(st.hygAM.join('\n'))}</textarea>
    <label class="lbl" for="s-pm">Night routine (one per line)</label><textarea id="s-pm">${esc(st.hygPM.join('\n'))}</textarea>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="s-haptics" ${st.haptics ? 'checked' : ''} class="sr-only"><span class="box" aria-hidden="true"></span><span>Vibration feedback (Android)</span></label>
    <button class="btn primary block" style="margin-top:14px" type="submit">Save settings</button>
    </form>
    <div class="sec"><h2>🔔 Reminders</h2></div>
    <div class="card small stack">
      <div class="muted">Add daily check-in reminders (${st.wakeTime} + 15 min and ${st.bedTime} − 1 h) and a Sunday weekly review to your phone's calendar. Works with Google Calendar, Apple Calendar and Outlook.</div>
      <button class="btn block" data-act="ics">📅 Add reminders to my calendar</button>
      ${'Notification' in window && Notification.permission !== 'granted' ? '<button class="btn block" data-act="notif">🔔 Allow focus-timer notifications</button>' : ''}
    </div>
    <div class="sec"><h2>📱 Install & backup</h2></div>
    <div class="card small stack">
      ${installEvt ? '<button class="btn block" data-act="install">⬇️ Install Light as an app</button>' : '<div class="muted"><strong>Install:</strong> Android/Chrome: ⋮ → “Install app”. iPhone: Safari → Share → “Add to Home Screen”. Laptop: install icon in the address bar.</div>'}
      <div class="muted">Your data lives only on this device. Export a backup regularly, and use Import to move it to another device.</div>
      <div class="grid"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Import backup</button></div>
      <input type="file" id="import-file" accept="application/json,.json" class="hide">
      ${bk?.data ? `<button class="btn ghost" data-act="restore-auto">↩️ Restore automatic snapshot (${fmtDate(bk.date)})</button>` : ''}
      <button class="btn danger ghost" data-act="reset">Erase all data</button>
      <div class="tiny muted center">Light v${APP_VERSION} · ${Object.keys(S.days).length} days tracked</div>
    </div>`, { label: 'Settings', onClose: render });
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Actions ----------
function markRadio(act, el) { $$(`[data-act="${act}"]`).forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); }); }
function addCelebrate(el, msg) { burst(el); buzz(); toast(msg); }
function removeWithUndo(arr, idx, label) {
  const [item] = arr.splice(idx, 1);
  persist(); render();
  toast(`${label} deleted`, { undo: () => { arr.splice(idx, 0, item); persist(); render(); } });
}
const A = {
  tab: (el) => go(el.dataset.tab),
  'open-morning': () => openWizard('morning'),
  'open-evening': () => openWizard('evening'),
  'open-evening-y': () => openWizard('evening', addDays(today(), -1)),
  'open-weekly': () => openWizard('weekly'),
  'water+': () => { const d = day(); d.water = (d.water || 0) + 1; persist(); buzz(); if (d.water === S.settings.waterTarget) { burst(); toast('💧 Water goal reached! +10 bonus XP'); } else toast(`💧 +5 XP · ${d.water}/${S.settings.waterTarget}`); render(); },
  'water-': () => { const d = day(); d.water = Math.max(0, (d.water || 0) - 1); persist(); render(); },
  hyg: (el) => { const d = day(); const l = el.dataset.l, it = el.dataset.item; d[l][it] = !d[l][it]; persist(); buzz(); if (d[l][it] && hygRatio(d, l) === 1) addCelebrate(el, l === 'hygAM' ? '🪥 Morning routine complete!' : '🌙 Night routine complete!'); render(); },
  hygtab: (el) => { UI.hyg = el.dataset.v; render(); },
  prio: (el) => { const p = day().morning?.priorities?.[+el.dataset.i]; if (!p) return; p.done = !p.done; persist(); if (p.done) addCelebrate(el, '✅ +10 XP — nice!'); render(); },
  'log-exercise': () => quickNum('exercise', '🏃 Minutes of exercise today', 5),
  focus: () => openFocus(),
  'focus-from-wiz': () => { const lbl = wiz?.draft?.priorities?.[0]?.t; wiz = null; closeModal(); openFocus(lbl); },
  'focus-start': (el) => {
    const mins = +el.dataset.v;
    S.timer = { start: Date.now(), dur: mins * 60000, label: $('#fo-label').value.trim() };
    persist(); buzz(20);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    renderFocusRunning();
  },
  'focus-stop': () => finishFocus(false),
  'focus-cancel': () => { if (!confirm('Cancel this session without logging it?')) return; S.timer = null; persist(); document.title = 'Light'; closeModal(); },
  chest: () => openChest(),
  qn: (el) => { const i = $('#qn-v'); i.value = Math.max(0, (+i.value || 0) + +el.dataset.s); },
  'qn-set': (el) => { $('#qn-v').value = el.dataset.v; },
  'qn-save': (el) => { const d = day(); d[el.dataset.k] = Math.max(0, +$('#qn-v').value || 0); persist(); closeModal(); toast('Saved 💪'); },
  'go-comedy': () => go('grow', { grow: 'comedy' }),
  'go-freedom': () => go('grow', { grow: 'freedom' }),
  settings: () => openSettings(),
  'set-theme': (el) => { S.settings.theme = el.dataset.v; save(); applyTheme(); markRadio('set-theme', el); },
  'set-accent': (el) => { S.settings.accent = el.dataset.v; save(); applyTheme(); markRadio('set-accent', el); buzz(); },
  'start-workout': (el) => openWorkout(el.dataset.w),
  'wp-pause': () => {
    if (!wp) return;
    if (wp.paused) { wp.endsAt = Date.now() + wp.left; wp.paused = false; } else { wp.left = wpLeft(); wp.paused = true; try { speechSynthesis.cancel(); } catch { /* */ } }
    renderWP();
  },
  'wp-skip': () => { if (wp && !wp.done) advanceWP(); },
  'wp-end': () => {
    if (!wp) return;
    if (wp.done || Date.now() - wp.start < 120000) { closeModal(); return; }
    if (confirm('End the workout and log the minutes you did?')) finishWP(false);
  },
  'wp-voice': () => { wp.voice = !wp.voice; S.settings.fitVoice = wp.voice; save(); if (!wp.voice) { try { speechSynthesis.cancel(); } catch { /* */ } } renderWP(); },
  'fit-level': (el) => { S.settings.fitLevel = el.dataset.v; save(); render(); },
  'fit-group': (el) => { UI.fitGroup = el.dataset.v; render(); },
  'plan-tick': (el) => {
    const d = day(); d.plan ||= {};
    const k = el.dataset.k; d.plan[k] = !d.plan[k];
    persist(); if (d.plan[k]) addCelebrate(el, 'Nice — ticked off ✓'); render();
  },
  'hyg-am': () => { UI.hyg = 'hygAM'; render(); $('#hyg-sec')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); },
  'hyg-pm': () => { UI.hyg = 'hygPM'; render(); $('#hyg-sec')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); },
  'modal-close': () => closeModal(),
  sos: () => openSOS(),
  'sos-type': (el) => { sosType = el.dataset.v; renderSOS(1); },
  'sos-won': () => logSOS('won'),
  'sos-slip': () => logSOS('slip'),
  // Wizard
  'wiz-close': () => closeModal(),
  'wiz-next': () => { wiz.step = Math.min(wiz.steps.length - 1, wiz.step + 1); renderWizard(); },
  'wiz-back': () => { wiz.step = Math.max(0, wiz.step - 1); renderWizard(); },
  'wiz-done': () => {
    const t = wiz.type; wiz = null; closeModal(); burst(); buzz([30, 40, 30]);
    toast({ morning: '🌅 Morning check-in complete — go win the day!', evening: '🌙 Evening check-in complete — rest well!', weekly: '🗓️ Weekly review saved — new week, new light.' }[t]);
  },
  wset: (el) => { const k = el.dataset.k; let v = el.dataset.v; if (!el.dataset.str) v = v === 'true' ? true : v === 'false' ? false : +v; wiz.draft[k] = wiz.draft[k] === v && el.dataset.str ? '' : v; buzz(8); renderWizard(true); },
  wtoggle: (el) => { wiz.draft[el.dataset.k] = !wiz.draft[el.dataset.k]; renderWizard(true); },
  wstep: (el) => { const k = el.dataset.k; wiz.draft[k] = clamp(round1((+wiz.draft[k] || 0) + +el.dataset.s), 0, +el.dataset.max); renderWizard(true); },
  wprio: (el) => { const p = wiz.draft.priorities[+el.dataset.i]; p.done = !p.done; buzz(8); renderWizard(true); },
  wchk: (el) => { const o = wiz.draft[el.dataset.k]; o[el.dataset.item] = !o[el.dataset.item]; buzz(8); renderWizard(true); },
  wtx: () => {
    const amt = +$('#w-amt').value;
    if (!(amt > 0)) { toast('Enter an amount'); $('#w-amt').focus(); return; }
    S.tx.push({ id: uid(), date: wiz.k, type: 'out', amount: amt, cat: $('#w-cat').value, note: $('#w-note').value.trim() });
    persist(); renderWizard(true); toast('Logged 🧾');
  },
  // Money
  mtype: (el) => { UI.mType = el.dataset.v; render(); },
  mcat: (el) => { UI.mCat = el.dataset.v; $$('[data-act="mcat"]').forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); }); },
  deltx: (el) => removeWithUndo(S.tx, S.tx.findIndex((t) => t.id === el.dataset.id), 'Entry'),
  // Feed
  claim: (el) => {
    const k = today(); if ((S.claims[k] || 0) >= CLAIM_CAP) { toast('Daily challenge cap reached — go live your life! 🌍'); return; }
    S.claims[k] = (S.claims[k] || 0) + 1;
    const { it } = reelOf(el); if (it) nudge(S.feedPrefs, it.kind, SIGNAL.claim);
    persist(); addCelebrate(el, '✨ +10 XP — real life wins!');
    el.disabled = true; el.textContent = 'Done ✓';
    $$('[data-claims]').forEach((e) => { e.textContent = `${S.claims[k]}/${CLAIM_CAP} today`; });
  },
  like: (el) => { const { r, it } = reelOf(el); if (it) { const on = !S.feedLikes[it.id]; setLike(r, it, on); if (on) burst(el); } },
  'feed-save': (el) => {
    const { it } = reelOf(el); if (!it) return;
    const i = S.saved.findIndex((s) => s.id === it.id);
    if (i >= 0) S.saved.splice(i, 1); else { S.saved.push({ id: it.id, tag: KIND_META[it.kind].tag, body: itemText(it) }); nudge(S.feedPrefs, it.kind, SIGNAL.save); }
    persist();
    const on = i < 0;
    el.classList.toggle('on', on); el.setAttribute('aria-pressed', on);
    el.innerHTML = `<span class="r-ic">${icon('bookmark', 24, on ? 'filled' : '')}</span><span>${on ? 'Saved' : 'Save'}</span>`;
    toast(on ? '📌 Saved — find it in Grow → Journal' : 'Removed from saved');
  },
  reflect: (el) => {
    const { it } = reelOf(el); if (!it) return;
    const prompt = itemText(it);
    openModal(`<form data-form="reflect" data-kind="${it.kind}" novalidate><div class="row between"><h2>💬 Reflect</h2><button type="button" class="icon-btn" data-act="modal-close" aria-label="Close">${icon('x', 18)}</button></div>
      <div class="card small" style="margin:12px 0">${esc(prompt)}</div>
      <label class="lbl" for="rf-text">What does this mean for you? How will you use it today?</label>
      <textarea id="rf-text" placeholder="Write freely…" maxlength="2000"></textarea><input type="hidden" id="rf-prompt" value="${esc(prompt)}">
      <button class="btn primary block" style="margin-top:12px" type="submit">Save to journal · +10 XP</button></form>`, { label: 'Reflect', onClose: render });
    $('#rf-text').focus();
  },
  quiz: (el) => {
    const { r, it } = reelOf(el); if (!it || $('.r-opt[disabled]', r)) return;
    const j = +el.dataset.j, ok = j === it.data.a, first = !(it.id in S.quiz);
    $$('.r-opt', r).forEach((b, k) => { b.disabled = true; if (k === it.data.a) b.classList.add('right'); });
    if (!ok) el.classList.add('wrong');
    $('.r-why', r).hidden = false;
    if (first) S.quiz[it.id] = ok;
    nudge(S.feedPrefs, it.kind, SIGNAL.answer); persist();
    if (ok) { burst(el); buzz([20, 30, 20]); toast(first ? '🧠 Correct! +5 XP' : '🧠 Correct!'); } else buzz(40);
  },
  poll: (el) => {
    const { r, it } = reelOf(el); if (!it || $('.r-opt[disabled]', r)) return;
    $$('.r-opt', r).forEach((b) => { b.disabled = true; });
    el.classList.add('right');
    const why = $('.r-why', r); why.textContent = it.data.o[+el.dataset.j].r; why.hidden = false;
    nudge(S.feedPrefs, it.kind, SIGNAL.answer); save(); buzz(10);
  },
  punch: (el) => { const p = el.parentElement.querySelector('.r-punch'); el.hidden = true; p.hidden = false; p.classList.add('pop'); buzz(15); },
  'feed-water': (el) => {
    const d = day(); d.water = (d.water || 0) + 1; persist(); burst(el); buzz();
    el.disabled = true; el.textContent = `💧 Logged · ${d.water}/${S.settings.waterTarget}`;
  },
  'feed-next': () => scrollReel(1),
  'feed-mode': (el) => { feed.mode = el.dataset.v; render({ full: true }); },
  'feed-topic': (el) => {
    feed.topic = el.dataset.v; render({ full: true }); buzz(8);
    // Only the chip row scrolls (never the page), and only when the chips don't all fit.
    const row = $('.feed-topics'), chip = $('.ft-chip.on');
    if (row && chip && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
  },
  'feed-more': (el) => { const { it } = reelOf(el); if (it && !isSpecial(it)) openFeedMenu(it); },
  'more-like': () => { const it = feed.menu; if (!it) return; nudge(S.feedPrefs, it.kind, 5); save(); closeModal(); toast(`${icon('heart', 16)} You’ll see more ${KIND_META[it.kind].tag.toLowerCase()}`); },
  'less-like': () => {
    const it = feed.menu; if (!it) return;
    nudge(S.feedPrefs, it.kind, -6); save(); closeModal();
    toast(`Got it — fewer ${KIND_META[it.kind].tag.toLowerCase()} cards`, { undo: () => { nudge(S.feedPrefs, it.kind, 6); save(); } });
    scrollReel(1);
  },
  'copy-card': async () => {
    const it = feed.menu; if (!it) return;
    try { await navigator.clipboard.writeText(itemText(it)); toast('Copied to clipboard'); } catch { toast('Couldn’t copy on this device'); }
    closeModal();
  },
  share: async (el) => {
    const text = el.dataset.b + '\n— shared from Light';
    const { it } = reelOf(el); if (it) { nudge(S.feedPrefs, it.kind, SIGNAL.share); save(); }
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('Copied to clipboard 📋'); }
    } catch { /* user cancelled */ }
  },
  refeed: () => { save(); render({ full: true }); toast('🔄 Fresh cards'); },
  // Stats
  range: (el) => { UI.range = +el.dataset.v; render(); },
  domain: (el) => { UI.domain = el.dataset.v; render(); },
  // Grow
  growtab: (el) => { UI.grow = el.dataset.v; syncHash(true); render(); $('.grow-tabs .on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); },
  deljoke: (el) => removeWithUndo(S.jokes, S.jokes.findIndex((j) => j.id === el.dataset.id), 'Joke'),
  delsaved: (el) => removeWithUndo(S.saved, +el.dataset.i, 'Saved card'),
  // Settings & data
  ics: () => { download('light-reminders.ics', buildICS(S.settings, today(), location.href.split('#')[0]), 'text/calendar'); toast('📅 Open the downloaded file to add the reminders to your calendar.', { ms: 5000 }); },
  notif: async () => { try { const r = await Notification.requestPermission(); toast(r === 'granted' ? '🔔 Notifications on' : 'Notifications not allowed'); } catch { /* unsupported */ } closeModal(); },
  export: () => { download(`light-backup-${today()}.json`, JSON.stringify(S, null, 2), 'application/json'); toast('Backup downloaded'); },
  import: () => $('#import-file')?.click(),
  'restore-auto': () => {
    const b = backupInfo(); if (!b?.data) return;
    if (!confirm(`Restore your data to how it was on ${fmtDate(b.date)}? Changes since then will be lost.`)) return;
    replaceState(b.data); wiz = null; applyTheme(); closeModal(); render(); toast('Snapshot restored ✓');
  },
  reset: () => {
    if (!confirm('Erase ALL Light data on this device? This cannot be undone. (Export a backup first if unsure.)')) return;
    if (!confirm('Really erase everything?')) return;
    resetState(); wiz = null; applyTheme(); closeModal(); render();
  },
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; closeModal(); },
};

// Forms (Enter key submits, mobile "Go" button works)
const FORMS = {
  onboard: () => {
    const name = $('#ob-name').value.trim();
    if (!name) { toast('Please enter your name'); $('#ob-name').focus(); return; }
    S.profile = { name, goals: ['#ob-g1', '#ob-g2', '#ob-g3'].map((s) => ({ t: $(s).value.trim(), p: 0 })), why: $('#ob-why').value.trim(), created: today() };
    S.settings.currency = $('#ob-cur').value.trim() || '₱';
    S.settings.budget = Math.max(0, +$('#ob-budget').value || 0);
    S.settings.bedTime = $('#ob-bed').value || '22:30';
    S.settings.wakeTime = $('#ob-wake').value || '06:30';
    persist(); render(); burst(); toast(`Welcome, ${esc(firstName())}! Your light starts today ✨`);
  },
  addtx: () => {
    const amt = +$('#m-amt').value;
    if (!(amt > 0)) { toast('Enter an amount'); $('#m-amt').focus(); return; }
    const date = $('#m-date').value || today();
    S.tx.push({ id: uid(), date, type: UI.mType, amount: amt, cat: UI.mCat, note: $('#m-note').value.trim() });
    persist(); buzz();
    if (UI.mType === 'out' && BAD_CATS.includes(UI.mCat)) toast('Logged honestly — that takes courage. This resets that freedom streak; tomorrow is a fresh start.', { ms: 5000 });
    else if (UI.mType === 'save') { burst(); toast(`🏦 ${cur(amt)} saved. Future-you says thanks!`); }
    else toast(UI.mType === 'in' ? '💰 Income logged' : '🧾 Expense logged');
    render();
    $('#m-amt')?.focus();
  },
  addjoke: () => { const t = $('#joke-in').value.trim(); if (!t) { toast('Write a joke first — even a terrible one!'); return; } S.jokes.push({ id: uid(), date: today(), text: t }); persist(); burst(); toast('🎤 Joke saved · +10 XP'); render(); },
  reflect: (form) => {
    const t = $('#rf-text').value.trim(); if (!t) { toast('Write something first'); return; }
    S.journal.push({ id: uid(), date: today(), prompt: $('#rf-prompt').value, text: t });
    nudge(S.feedPrefs, form.dataset.kind, SIGNAL.reflect);
    persist(); closeModal(); toast('📓 Saved to journal · +10 XP');
  },
  addjournal: (form) => { const t = $('#journal-in').value.trim(); if (!t) { toast('Write something first'); return; } S.journal.push({ id: uid(), date: today(), prompt: form.dataset.p, text: t }); persist(); toast('📓 Saved · +10 XP'); render(); },
  settings: () => {
    const st = S.settings, p = S.profile;
    p.name = $('#s-name').value.trim() || p.name;
    p.goals = [0, 1, 2].map((i) => { const t = $('#s-g' + i).value.trim(); const old = p.goals[i]; return { t, p: old && old.t === t ? old.p : 0 }; });
    p.why = $('#s-why').value.trim();
    st.currency = $('#s-cur').value.trim() || st.currency;
    st.budget = Math.max(0, +$('#s-budget').value || 0);
    st.savingsName = $('#s-sname').value.trim() || 'Savings';
    st.savingsGoal = Math.max(0, +$('#s-sgoal').value || 0);
    st.waterTarget = clamp(Math.round(+$('#s-water').value || 8), 1, 30);
    st.sleepTarget = clamp(+$('#s-sleep').value || 8, 4, 12);
    st.bedTime = $('#s-bed').value || st.bedTime;
    st.wakeTime = $('#s-wake').value || st.wakeTime;
    st.socialLimit = Math.max(0, +$('#s-social').value || 0);
    st.weightUnit = $('#s-wu').value;
    st.haptics = $('#s-haptics').checked;
    const lines = (id) => $(id).value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (lines('#s-am').length) st.hygAM = lines('#s-am');
    if (lines('#s-pm').length) st.hygPM = lines('#s-pm');
    persist(); closeModal(); toast('Settings saved ✓');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && A[el.dataset.act]) { e.preventDefault(); A[el.dataset.act](el); return; }
  if (e.target.id === 'modal' && !wiz) closeModal();
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (f && FORMS[f.dataset.form]) { e.preventDefault(); FORMS[f.dataset.form](f); }
});
// Wizard free-text / time / number / range inputs: update the draft without re-rendering (keeps focus & caret).
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!wiz || !el.dataset.w) return;
  const k = el.dataset.w;
  if (k === 'prio') { wiz.draft.priorities[+el.dataset.i].t = el.value; return; }
  if (k === 'goalp') { wiz.draft.goals[+el.dataset.i].p = +el.value; const v = $('#gp-v' + el.dataset.i); if (v) v.textContent = el.value + '%'; return; }
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
      if (S.profile && !confirm('Replace the data on this device with this backup?')) return;
      replaceState(data); wiz = null; applyTheme(); closeModal(); render(); toast('Backup restored ✓');
    } catch { toast('That file is not a valid Light backup.'); }
  };
  r.readAsText(f);
});
document.addEventListener('keydown', (e) => {
  if (!modalOpen() && UI.tab === 'feed' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
    const dir = { ArrowDown: 1, PageDown: 1, j: 1, ' ': 1, ArrowUp: -1, PageUp: -1, k: -1 }[e.key];
    if (dir) { e.preventDefault(); scrollReel(dir); return; }
    if (e.key === 'l') { const r = $('.reel.active'); const it = feed.items[feed.active]; if (r && it && it.kind !== 'pause') setLike(r, it, !S.feedLikes[it.id]); }
    return;
  }
  if (!modalOpen()) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key === 'Tab') {
    // Focus trap: keep keyboard focus inside the open dialog.
    const f = $$('.sheet button:not([disabled]), .sheet input:not(.sr-only), .sheet select, .sheet textarea, .sheet [href], .sheet summary').filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === $('.sheet'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
$('#sos').addEventListener('click', openSOS);

// ---------- Platform: PWA install, updates, lifecycle, errors ----------
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'activated' && hadController) toast('✨ A new version of Light is ready.', { action: { label: 'Refresh', fn: () => location.reload() }, ms: 15000 });
        });
      });
    } catch { /* offline support unavailable */ }
  });
}
navigator.storage?.persist?.().catch(() => {});

let lastDay = today();
// Flush feed memory/preferences when the app is backgrounded or closed (mobile apps rarely get a clean "unload").
window.addEventListener('pagehide', () => { if (S.profile) save(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (S.profile) save(); return; }
  if (S.timer && timerLeftMs() <= 0) finishFocus(true);
  if (today() !== lastDay && !modalOpen()) { lastDay = today(); snapshotDaily(); render(); }
});
let errShown = false;
const onErr = (e) => { console.error(e); if (!errShown) { errShown = true; toast('⚠️ Something went wrong. Your data is safe.', { ms: 4000 }); setTimeout(() => { errShown = false; }, 10000); } };
window.addEventListener('error', (e) => onErr(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => onErr(e.reason));

// Debug/testing hook (harmless in production).
window.__light = { get state() { return S; }, scores, computeXP, render, version: APP_VERSION };

// Keep the "Right now" plan current: re-render Today when the time block changes.
let lastBlock = null;
setInterval(() => {
  if (!S.profile || UI.tab !== 'today' || modalOpen() || document.visibilityState !== 'visible') return;
  const id = dayPlan().blocks.find((b) => b.current)?.id;
  if (lastBlock && id !== lastBlock) render();
  lastBlock = id;
}, 60000);

// Back/forward buttons and manual URL edits move between pages.
const onRoute = () => {
  if (!S.profile) return;
  const r = routeFromHash();
  if (r.tab === UI.tab && (!r.grow || r.grow === UI.grow)) return;
  if (modalOpen()) closeModal();
  go(r.tab, r.grow ? { grow: r.grow } : {}, { push: false });
};
window.addEventListener('popstate', onRoute);
window.addEventListener('hashchange', onRoute);

// ---------- Boot ----------
applyTheme();
snapshotDaily();
if (S.profile && awardBadges().length) save();
Object.assign(UI, routeFromHash()); // reopen the page you were on
if (S.profile) syncHash(true);
render();
if (S.timer && timerLeftMs() <= 0) finishFocus(true);
