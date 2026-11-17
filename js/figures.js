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
/** Default far-side target: 3 units behind the near one, or exactly overlapping it if that would be out of reach. */
const farTarget = (t, base, reach) => { const back = [t[0] - 3, t[1]]; return dist(base, back) <= reach ? back : t; };

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
    // Far-side limbs default to just behind the near ones (see farTarget).
    arm: arm(p.hand, p.elbow), arm2: arm(p.hand2 || farTarget(p.hand, sh, UA + FA), p.elbow2 || p.elbow),
    leg: leg(p.foot, p.knee, p.toe ?? 0), leg2: leg(p.foot2 || farTarget(p.foot, hip, TH + SH), p.knee2 || p.knee, p.toe2 ?? p.toe ?? 0),
  };
}

/** Interpolate two pose specs (numbers and points), keeping non-numeric settings from `a`. */
function mix(a, b, t) {
  const out = { ...a };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (Array.isArray(a[k]) && Array.isArray(b[k])) out[k] = lerpP(a[k], b[k], t);
    // A number set in only one pose (headTilt, toe…) blends from/to its default of 0.
    else if (typeof a[k] === 'number' || typeof b[k] === 'number') out[k] = lerp(a[k] ?? 0, b[k] ?? 0, t);
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
  squat: { planted: ['leg', 'leg2'], poses: [
    { hip: [79, 57.6], torso: -90, hand: [109.5, 31], elbow: 'd', foot: [80, 97], knee: 'f' },
    { hip: [63, 76], torso: -52, hand: [112, 58], elbow: 'd', foot: [80, 97], knee: 'f' },
  ] },
  pushup: { planted: ['leg'], poses: [
    { hip: [67, 78.8], torso: -22.3, headTilt: 8, hand: [90, 98], elbow: 'b', foot: [30, 94], knee: 'u', toe: 80 },
    { hip: [69.85, 90.5], torso: -5, headTilt: 4, hand: [90, 98], elbow: 'u', foot: [30, 94], knee: 'u', toe: 80 },
  ] },
  plank: { planted: ['leg'], move: 1.6, hold: 0.6, poses: [
    { hip: [69, 87], torso: -10, headTilt: 8, hand: [114, 98], elbow: 'd', foot: [30, 94], knee: 'u', toe: 80 },
    { hip: [69, 85.5], torso: -11, headTilt: 8, hand: [114, 98], elbow: 'd', foot: [30, 94], knee: 'u', toe: 80 },
  ] },
  lunge: { planted: ['leg', 'leg2'], poses: [
    { hip: [77, 64], torso: -90, hand: [81, 84], elbow: 'b', foot: [98, 97], knee: 'f', foot2: [52, 94], knee2: 'f', toe2: 65 },
    { hip: [77, 78], torso: -90, hand: [81, 97], elbow: 'b', foot: [98, 97], knee: 'f', foot2: [52, 94], knee2: 'd', toe2: 65 },
  ] },

  // ---- Chest & arms ----
  kneepush: { planted: ['leg'], poses: [
    { hip: [66.2, 85.2], torso: -36, headTilt: 10, hand: [90, 98], elbow: 'b', foot: [32.7, 87], knee: 'd', toe: 195 },
    { hip: [69.4, 92.2], torso: -14, headTilt: 6, hand: [90, 98], elbow: 'u', foot: [32.7, 87], knee: 'd', toe: 195 },
  ] },
  inclinepush: { planted: ['leg'], props: [{ box: [70, 75, 56, 25] }], poses: [
    { hip: [57.7, 65.1], torso: -46.2, headTilt: 12, hand: [79, 74], elbow: 'b', foot: [30, 94], knee: 'u', toe: 75 },
    { hip: [66.1, 76.8], torso: -25.4, headTilt: 8, hand: [79, 74], elbow: 'u', foot: [30, 94], knee: 'u', toe: 75 },
  ] },
  diamond: { planted: ['leg'], poses: [
    { hip: [67, 78.8], torso: -22.3, headTilt: 8, hand: [88, 98], elbow: 'b', foot: [30, 94], knee: 'u', toe: 80 },
    { hip: [69.85, 90.5], torso: -5, headTilt: 4, hand: [88, 98], elbow: 'u', foot: [30, 94], knee: 'u', toe: 80 },
  ] },
  pike: { planted: ['leg'], poses: [
    { hip: [60, 58], torso: 40, hand: [100, 98], elbow: 'u', foot: [41, 93], knee: 'u', toe: 75 },
    { hip: [63, 61], torso: 52, hand: [100, 98], elbow: 'u', foot: [41, 93], knee: 'u', toe: 75 },
  ] },
  dips: { planted: ['leg'], props: [{ box: [26, 71, 36, 29] }], poses: [
    { hip: [63, 69.5], torso: -88, hand: [62, 70], elbow: 'b', foot: [92, 96], knee: 'u' },
    { hip: [64, 87.5], torso: -88, hand: [62, 70], elbow: 'b', foot: [92, 96], knee: 'u' },
  ] },

  // ---- Legs & glutes ----
  bridge: { planted: ['leg'], poses: [
    { hip: [70, 93.5], torso: 180, hand: [70, 97], elbow: 'd', foot: [90, 96], knee: 'u' },
    { hip: [64.6, 76.3], torso: 145, headTilt: 35, hand: [70, 97], elbow: 'd', foot: [90, 96], knee: 'u' },
  ] },
  wallsit: { planted: ['leg'], move: 1.5, hold: 0.6, props: [{ wall: [44, 4] }], poses: [
    { hip: [52, 76], torso: -90, hand: [64, 74], elbow: 'f', foot: [72, 96], knee: 'u' },
    { hip: [52, 75], torso: -90, hand: [64, 73], elbow: 'f', foot: [72, 96], knee: 'u' },
  ] },
  calf: { props: [{ wall: [112, 4] }], poses: [
    { hip: [80, 56.5], torso: -90, hand: [106, 38], elbow: 'd', foot: [80, 96], knee: 'f', toe: 0 },
    { hip: [82, 50.5], torso: -90, hand: [106, 38], elbow: 'd', foot: [82, 90], knee: 'f', toe: 50 },
  ] },
  stepup: { planted: ['leg'], vb: '0 -16 160 126', props: [{ box: [84, 87, 44, 13] }], poses: [
    { hip: [72, 58], torso: -90, hand: [78, 58], elbow: 'd', foot: [95, 85], knee: 'f', foot2: [70, 97], knee2: 'f' },
    { hip: [97, 46], torso: -90, hand: [101, 76], elbow: 'd', foot: [95, 85], knee: 'f', foot2: [90, 72], knee2: 'f' },
  ] },
  splitsquat: { planted: ['leg', 'leg2'], props: [{ box: [22, 75, 34, 25] }], poses: [
    { hip: [80, 62], torso: -85, hand: [86, 64], elbow: 'b', foot: [98, 97], knee: 'f', foot2: [50, 72], knee2: 'd', toe2: 200 },
    { hip: [78, 80], torso: -85, hand: [84, 82], elbow: 'b', foot: [98, 97], knee: 'f', foot2: [50, 72], knee2: 'd', toe2: 200 },
  ] },

  // ---- Core ----
  sideplank: { planted: ['leg'], move: 1.2, poses: [
    { hip: [68.8, 85.3], torso: -14, hand: [98, 47], elbow: 'f', hand2: [110, 97], elbow2: 'd', foot: [30, 95], foot2: [30, 95], knee: 'u', knee2: 'u', toe: 80, toe2: 80 },
    { hip: [67.6, 81.3], torso: -20, hand: [96, 40], elbow: 'f', hand2: [110, 97], elbow2: 'd', foot: [30, 95], foot2: [30, 95], knee: 'u', knee2: 'u', toe: 80, toe2: 80 },
  ] },
  climber: { move: 0.32, hold: 0.06, poses: [
    { hip: [67, 78.8], torso: -22.3, headTilt: 8, hand: [95, 98], elbow: 'b', foot: [30, 94], knee: 'u', toe: 80, foot2: [66, 95], knee2: 'f', toe2: 80 },
    { hip: [67, 78.8], torso: -22.3, headTilt: 8, hand: [95, 98], elbow: 'b', foot: [66, 95], knee: 'f', toe: 80, foot2: [30, 94], knee2: 'u', toe2: 80 },
  ] },
  bicycle: { move: 0.55, hold: 0.1, poses: [
    { hip: [75, 93], torso: 200, hand: [40, 74], elbow: 'u', foot: [114, 86], knee: 'u', foot2: [82, 72], knee2: 'u' },
    { hip: [75, 93], torso: 200, hand: [40, 74], elbow: 'u', foot: [82, 72], knee: 'u', foot2: [114, 86], knee2: 'u' },
  ] },
  legraise: { poses: [
    { hip: [70, 93.5], torso: 180, hand: [70.8, 96], elbow: 'u', foot: [109, 91], knee: 'u' },
    { hip: [70, 93.5], torso: 180, hand: [70.8, 96], elbow: 'u', foot: [72, 54], knee: 'f' },
  ] },
  deadbug: { poses: [
    { hip: [70, 93.5], torso: 180, hand: [40, 63], elbow: 'f', hand2: [37, 63], elbow2: 'f', foot: [88, 74], knee: 'u', foot2: [85, 74], knee2: 'u' },
    { hip: [70, 93.5], torso: 180, hand: [12, 90], elbow: 'u', hand2: [37, 63], elbow2: 'f', foot: [88, 74], knee: 'u', foot2: [109, 88], knee2: 'u' },
    { hip: [70, 93.5], torso: 180, hand: [40, 63], elbow: 'f', hand2: [37, 63], elbow2: 'f', foot: [88, 74], knee: 'u', foot2: [85, 74], knee2: 'u' },
    { hip: [70, 93.5], torso: 180, hand: [40, 63], elbow: 'f', hand2: [12, 90], elbow2: 'u', foot: [109, 88], knee: 'u', foot2: [85, 74], knee2: 'u' },
  ] },

  // ---- Back ----
  superman: { poses: [
    { hip: [75, 94], torso: 180, hand: [15, 94], elbow: 'u', foot: [114, 95], knee: 'd', toe: 90 },
    { hip: [75, 94], torso: 190, hand: [17, 80], elbow: 'u', foot: [113, 86], knee: 'd', toe: 60 },
  ] },
  birddog: { planted: ['leg'], move: 1, hold: 0.6, poses: [
    { hip: [60, 78], torso: -10, hand: [90, 98], elbow: 'b', hand2: [87, 98], elbow2: 'b', foot: [40, 97], knee: 'd', toe: 180, foot2: [37, 97], knee2: 'd', toe2: 180 },
    { hip: [60, 78], torso: -10, hand: [119, 68], elbow: 'd', hand2: [87, 98], elbow2: 'b', foot: [40, 97], knee: 'd', toe: 180, foot2: [21, 74], knee2: 'd', toe2: 180 },
  ] },

  // ---- Cardio ----
  jacks: { front: true, move: 0.32, hold: 0.08, poses: [
    { hip: [80, 58], torso: -90, hand: [86, 86], elbow: 'f', hand2: [74, 86], elbow2: 'b', foot: [84, 97], knee: 'f', toe: 0, foot2: [76, 97], knee2: 'b', toe2: 180 },
    { hip: [80, 58], torso: -90, hand: [93, 1], elbow: 'f', hand2: [67, 1], elbow2: 'b', foot: [92, 96], knee: 'f', toe: 0, foot2: [68, 96], knee2: 'b', toe2: 180 },
  ] },
  highknees: { move: 0.3, hold: 0.05, poses: [
    { hip: [78, 58], torso: -88, hand: [66, 48], elbow: 'd', hand2: [92, 40], elbow2: 'd', foot: [88, 78], knee: 'f', foot2: [78, 97], knee2: 'f' },
    { hip: [78, 58], torso: -88, hand: [92, 40], elbow: 'd', hand2: [66, 48], elbow2: 'd', foot: [78, 97], knee: 'f', foot2: [88, 78], knee2: 'f' },
  ] },
  burpee: { move: 0.45, hold: 0.15, poses: [
    { hip: [79, 57.6], torso: -90, hand: [84, 86], elbow: 'b', foot: [80, 97], knee: 'f' },
    { hip: [64, 84], torso: -20, headTilt: 10, hand: [92, 98], elbow: 'b', foot: [80, 97], knee: 'f' },
    { hip: [67, 78.8], torso: -22.3, headTilt: 8, hand: [92, 98], elbow: 'b', foot: [30, 94], knee: 'u', toe: 80 },
    { hip: [64, 84], torso: -20, headTilt: 10, hand: [92, 98], elbow: 'b', foot: [80, 97], knee: 'f' },
  ] },
  boxing: { planted: ['leg', 'leg2'], move: 0.22, hold: 0.12, poses: [
    { hip: [78, 60], torso: -85, hand: [111, 26], elbow: 'd', hand2: [90, 24], elbow2: 'd', foot: [90, 97], knee: 'f', foot2: [66, 97], knee2: 'f' },
    { hip: [78, 60], torso: -85, hand: [93, 22], elbow: 'd', hand2: [90, 24], elbow2: 'd', foot: [90, 97], knee: 'f', foot2: [66, 97], knee2: 'f' },
    { hip: [78, 60], torso: -85, hand: [93, 22], elbow: 'd', hand2: [110, 24], elbow2: 'd', foot: [90, 97], knee: 'f', foot2: [66, 97], knee2: 'f' },
    { hip: [78, 60], torso: -85, hand: [93, 22], elbow: 'd', hand2: [90, 24], elbow2: 'd', foot: [90, 97], knee: 'f', foot2: [66, 97], knee2: 'f' },
  ] },

  // ---- Mobility ----
  catcow: { planted: ['leg'], move: 1.4, hold: 0.5, poses: [
    { hip: [60, 76], torso: -14, headTilt: 60, hand: [90, 98], elbow: 'b', foot: [40, 97], knee: 'd', toe: 180 },
    { hip: [60, 80], torso: -8, headTilt: -32, hand: [90, 98], elbow: 'b', foot: [40, 97], knee: 'd', toe: 180 },
  ] },
  childpose: { planted: ['leg'], move: 1.8, hold: 0.6, poses: [
    { hip: [55.6, 85.5], torso: 10.6, hand: [115, 97], elbow: 'd', foot: [52, 97], knee: 'f', toe: 180, foot2: [52, 97], knee2: 'f' },
    { hip: [55.6, 84], torso: 13, hand: [115, 97], elbow: 'd', foot: [52, 97], knee: 'f', toe: 180, foot2: [52, 97], knee2: 'f' },
  ] },
  hipflexor: { planted: ['leg', 'leg2'], move: 1.3, hold: 0.6, poses: [
    { hip: [75, 78], torso: -90, hand: [80, 78], elbow: 'b', foot: [98, 97], knee: 'f', foot2: [44, 96], knee2: 'd', toe2: 180 },
    { hip: [80, 80], torso: -95, hand: [85, 80], elbow: 'b', foot: [98, 97], knee: 'f', foot2: [44, 96], knee2: 'd', toe2: 180 },
  ] },
  hamstring: { planted: ['leg'], move: 1.4, hold: 0.6, poses: [
    { hip: [55, 94], torso: -80, hand: [82, 86], elbow: 'd', foot: [95, 95], knee: 'u', toe: -90, foot2: [75, 96], knee2: 'u' },
    { hip: [55, 94], torso: -30, hand: [100, 92], elbow: 'u', foot: [95, 95], knee: 'u', toe: -90, foot2: [75, 96], knee2: 'u' },
  ] },
  chest: { planted: ['leg', 'leg2'], move: 1.3, hold: 0.6, props: [{ wall: [66, 5] }], poses: [
    { hip: [85, 59], torso: -88, hand: [70, 22], elbow: 'b', foot: [94, 97], knee: 'f', foot2: [76, 97], knee2: 'f' },
    { hip: [88, 60], torso: -82, hand: [70, 22], elbow: 'b', foot: [94, 97], knee: 'f', foot2: [76, 97], knee2: 'f' },
  ] },
  neck: { planted: ['leg'], move: 0.9, hold: 0.5, poses: [
    { hip: [80, 57.5], torso: -90, headTilt: 0, hand: [83, 86], elbow: 'b', foot: [80, 97], knee: 'f' },
    { hip: [80, 57.5], torso: -90, headTilt: 28, hand: [83, 86], elbow: 'b', foot: [80, 97], knee: 'f' },
    { hip: [80, 57.5], torso: -90, headTilt: 0, hand: [83, 86], elbow: 'b', foot: [80, 97], knee: 'f' },
    { hip: [80, 57.5], torso: -90, headTilt: -24, hand: [83, 86], elbow: 'b', foot: [80, 97], knee: 'f' },
  ] },
};
export const hasFigure = (id) => !!FIGURES[id];
export const poseCount = (id) => FIGURES[id]?.poses.length || 0;

const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const PARTS = ['leg2', 'arm2', 'torso', 'leg', 'arm'];
const CLASS = { leg2: 'fig-far', arm2: 'fig-far', torso: 'fig-body', leg: 'fig-limb', arm: 'fig-limb' };
const propSVG = (pr) => (pr.box ? `<rect class="fig-prop" x="${pr.box[0]}" y="${pr.box[1]}" width="${pr.box[2]}" height="${pr.box[3]}" rx="3"/>`
  : pr.wall ? `<rect class="fig-prop" x="${pr.wall[0]}" y="-20" width="${pr.wall[1]}" height="${GROUND + 20}" rx="2"/>` : '');
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
  const cls = (k) => (fig.front && CLASS[k] === 'fig-far' ? 'fig-limb' : CLASS[k]); // front view: both sides equally visible
  return `<svg class="fig" viewBox="${fig.vb || '0 0 160 110'}" ${still ? '' : `data-fig="${id}"`} role="img" aria-label="${label || 'Exercise demonstration'}">
    ${(fig.props || []).map(propSVG).join('')}
    <line class="fig-ground" x1="8" y1="${GROUND}" x2="152" y2="${GROUND}"/>
    ${PARTS.map((k) => `<polyline class="${cls(k)}" data-k="${k}" points="${pts(f0[k])}"/>`).join('')}
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
