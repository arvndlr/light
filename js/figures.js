// Animated exercise demos: a simple side-view figure drawn as inline SVG.
// Each exercise is 2+ key poses. A pose places the hip, the torso angle and the
// hand/foot targets; two-bone IK solves elbows and knees, so limb lengths never
// change while animating. Frames are pre-computed and played with SVG <animate>.

// Bone lengths (viewBox units). Ground is at y = 100.
export const BONES = { torso: 30, neck: 4, head: 7, upper: 16, fore: 15, thigh: 20, shin: 20, foot: 6 };
export const GROUND = 100;
const { torso: T, neck: N, head: HR, upper: UA, fore: FA, thigh: TH, shin: SH, foot: FT } = BONES;
const rad = (d) => (d * Math.PI) / 180;
const dir = (deg) => [Math.cos(rad(deg)), Math.sin(rad(deg))];
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Two-bone IK: joint between `a` and target `t`, with bone lengths l1, l2.
 * bend: 'f' forward (+x), 'b' back (−x), 'u' up (−y), 'd' down (+y) — picks which of the two solutions to use.
 * Unreachable targets are clamped (limb points straight at the target).
 */
export function ik(a, t, l1, l2, bend) {
  let d = dist(a, t);
  const ux = (t[0] - a[0]) / (d || 1), uy = (t[1] - a[1]) / (d || 1);
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const base = [a[0] + ux * along, a[1] + uy * along];
  const m1 = [base[0] - uy * h, base[1] + ux * h], m2 = [base[0] + uy * h, base[1] - ux * h];
  const pick = { f: m1[0] > m2[0], b: m1[0] < m2[0], u: m1[1] < m2[1], d: m1[1] > m2[1] }[bend || 'f'];
  const mid = pick ? m1 : m2;
  const end = add(mid, [(t[0] - mid[0]), (t[1] - mid[1])], l2 / (dist(mid, t) || 1));
  return [mid, end];
}

/** Resolve a pose spec into joint coordinates. */
export function solve(p) {
  const hip = p.hip;
  const sh = add(hip, dir(p.torso), T);
  const head = add(sh, dir(p.torso + (p.headTilt || 0)), N + HR);
  const arm = (t, bend) => { const [e, h] = ik(sh, t, UA, FA, bend); return [sh, e, h]; };
  const leg = (t, bend, fa) => { const [k, a] = ik(hip, t, TH, SH, bend); return [hip, k, a, add(a, dir(fa), FT)]; };
  return {
    head, torso: [hip, sh],
    arm: arm(p.hand, p.elbow), arm2: arm(p.hand2 || add(p.hand, [-3, 0]), p.elbow2 || p.elbow),
    leg: leg(p.foot, p.knee, p.toe ?? 0), leg2: leg(p.foot2 || add(p.foot, [-3, 0]), p.knee2 || p.knee, p.toe2 ?? p.toe ?? 0),
  };
}

/** Interpolate two pose specs (numbers and points), keeping non-numeric settings from `a`. */
function mix(a, b, t) {
  const out = { ...a };
  for (const k of Object.keys(a)) {
    if (Array.isArray(a[k]) && Array.isArray(b[k])) out[k] = lerpP(a[k], b[k], t);
    else if (typeof a[k] === 'number' && typeof b[k] === 'number') out[k] = lerp(a[k], b[k], t);
  }
  return out;
}
const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;

/**
 * Sample a looping animation: key poses with per-segment move time and hold time (seconds).
 * Returns { frames: [joints], dur }.
 */
export function sample(fig, perSecond = 12) {
  const keys = fig.poses, move = fig.move ?? 0.9, hold = fig.hold ?? 0.35;
  const frames = [];
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i], b = keys[(i + 1) % keys.length];
    const nh = Math.max(1, Math.round(hold * perSecond)), nm = Math.max(2, Math.round(move * perSecond));
    for (let j = 0; j < nh; j++) frames.push(solve(a));
    for (let j = 0; j < nm; j++) frames.push(solve(mix(a, b, ease(j / nm))));
  }
  return { frames, dur: keys.length * (move + hold) };
}

// ---------- Exercise poses (side view, facing right) ----------
export const FIGURES = {
  squat: { poses: [
    { hip: [79, 57.6], torso: -90, hand: [109.5, 31], elbow: 'd', foot: [80, 97], knee: 'f' },
    { hip: [63, 76], torso: -52, hand: [112, 58], elbow: 'd', foot: [80, 97], knee: 'f' },
  ] },
  pushup: { poses: [
    { hip: [67, 78.8], torso: -22.3, headTilt: 8, hand: [90, 98], elbow: 'b', foot: [30, 94], knee: 'u', toe: 80 },
    { hip: [69.85, 90.5], torso: -5, headTilt: 4, hand: [90, 98], elbow: 'u', foot: [30, 94], knee: 'u', toe: 80 },
  ] },
  plank: { move: 1.6, hold: 0.6, poses: [
    { hip: [69, 87], torso: -10, headTilt: 8, hand: [114, 98], elbow: 'd', foot: [30, 94], knee: 'u', toe: 80 },
    { hip: [69, 85.5], torso: -11, headTilt: 8, hand: [114, 98], elbow: 'd', foot: [30, 94], knee: 'u', toe: 80 },
  ] },
  lunge: { poses: [
    { hip: [77, 64], torso: -90, hand: [81, 84], elbow: 'b', foot: [98, 97], knee: 'f', foot2: [52, 94], knee2: 'f', toe2: 65 },
    { hip: [77, 78], torso: -90, hand: [81, 97], elbow: 'b', foot: [98, 97], knee: 'f', foot2: [52, 94], knee2: 'd', toe2: 65 },
  ] },
};
export const hasFigure = (id) => !!FIGURES[id];
export const poseCount = (id) => FIGURES[id]?.poses.length || 0;

const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const PARTS = ['leg2', 'arm2', 'torso', 'leg', 'arm'];
const CLASS = { leg2: 'fig-far', arm2: 'fig-far', torso: 'fig-body', leg: 'fig-limb', arm: 'fig-limb' };
const cache = new Map();
/** Pre-computed animation frames per exercise (30 fps). */
const framesFor = (id) => { if (!cache.has(id)) cache.set(id, sample(FIGURES[id], 30)); return cache.get(id); };

/**
 * SVG markup for an exercise demo. Colors come from CSS (currentColor), so it follows the theme.
 * Animated figures carry data-fig and are moved by animateFigures() (JS frame loop — works in
 * every browser, unlike SMIL which some engines don't repaint).
 * @param {string} id exercise id
 * @param {{ still?: boolean, pose?: number, label?: string }} opts still = one static key pose
 */
export function figureSVG(id, { still = false, pose, label = '' } = {}) {
  const fig = FIGURES[id];
  if (!fig) return '';
  const f0 = still ? solve(fig.poses[pose ?? fig.poses.length - 1]) : framesFor(id).frames[0];
  return `<svg class="fig" viewBox="0 0 160 110" ${still ? '' : `data-fig="${id}"`} role="img" aria-label="${label || 'Exercise demonstration'}">
    <line class="fig-ground" x1="8" y1="${GROUND}" x2="152" y2="${GROUND}"/>
    ${PARTS.map((k) => `<polyline class="${CLASS[k]}" data-k="${k}" points="${pts(f0[k])}"/>`).join('')}
    <circle class="fig-head" r="${HR}" cx="${f0.head[0].toFixed(1)}" cy="${f0.head[1].toFixed(1)}"/>
  </svg>`;
}

let looping = false;
/** Start (or keep) the shared animation loop; it stops itself when no animated figure is on the page. */
export function animateFigures() {
  if (looping || typeof document === 'undefined') return;
  looping = true;
  const tick = (ts) => {
    const figs = document.querySelectorAll('svg.fig[data-fig]');
    if (!figs.length) { looping = false; return; }
    for (const svg of figs) {
      const { frames, dur } = framesFor(svg.dataset.fig);
      const f = frames[Math.floor((((ts / 1000) % dur) / dur) * frames.length) % frames.length];
      for (const el of svg.querySelectorAll('polyline[data-k]')) el.setAttribute('points', pts(f[el.dataset.k]));
      const head = svg.querySelector('.fig-head');
      head.setAttribute('cx', f.head[0].toFixed(1)); head.setAttribute('cy', f.head[1].toFixed(1));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
