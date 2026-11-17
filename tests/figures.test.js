import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGURES, BONES, GROUND, sample, solve, ik, figureSVG } from '../js/figures.js';
import { EXERCISES } from '../js/fitness.js';

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

test('every figure belongs to a real exercise', () => {
  for (const id of Object.keys(FIGURES)) assert.ok(EXERCISES.some((e) => e.id === id), id);
});
test('IK keeps bone lengths for reachable targets', () => {
  const [mid, end] = ik([0, 0], [20, 10], 16, 15, 'u');
  assert.ok(near(len([0, 0], mid), 16, 0.01));
  assert.ok(near(len(mid, end), 15, 0.01));
  assert.ok(near(end[0], 20, 0.01) && near(end[1], 10, 0.01));
});
test('limbs never stretch or shrink in any frame', () => {
  for (const [id, fig] of Object.entries(FIGURES)) {
    for (const f of sample(fig).frames) {
      for (const k of ['arm', 'arm2']) {
        assert.ok(near(len(f[k][0], f[k][1]), BONES.upper), `${id} upper arm`);
        assert.ok(near(len(f[k][1], f[k][2]), BONES.fore), `${id} forearm`);
      }
      for (const k of ['leg', 'leg2']) {
        assert.ok(near(len(f[k][0], f[k][1]), BONES.thigh), `${id} thigh`);
        assert.ok(near(len(f[k][1], f[k][2]), BONES.shin), `${id} shin`);
      }
      assert.ok(near(len(f.torso[0], f.torso[1]), BONES.torso), `${id} torso`);
    }
  }
});
test('planted feet stay put and nothing goes through the floor', () => {
  for (const [id, fig] of Object.entries(FIGURES)) {
    const frames = sample(fig).frames;
    for (const leg of fig.planted || []) {
      const first = frames[0][leg][2];
      for (const f of frames) assert.ok(near(f[leg][2][0], first[0], 1) && near(f[leg][2][1], first[1], 1), `${id} ${leg} foot slides`);
    }
    for (const f of frames) {
      for (const k of ['arm', 'arm2', 'leg', 'leg2']) for (const p of f[k]) assert.ok(p[1] <= GROUND + 3.5, `${id} ${k} below floor`);
      assert.ok(f.head[1] + BONES.head <= GROUND + 1, `${id} head below floor`);
    }
  }
});
test('figure SVG is animated by default and static on request', () => {
  assert.match(figureSVG('squat'), /data-fig="squat"/);
  assert.doesNotMatch(figureSVG('squat', { still: true }), /data-fig/);
  assert.equal(figureSVG('nope'), '');
  assert.ok(solve(FIGURES.squat.poses[0]).head);
});

test('every exercise has a figure, and planted feet can actually reach their targets', () => {
  for (const e of EXERCISES) assert.ok(FIGURES[e.id], `missing figure: ${e.id}`);
  for (const [id, fig] of Object.entries(FIGURES)) for (const p of fig.poses) {
    assert.ok(len(p.hip, p.foot) <= BONES.thigh + BONES.shin + 0.1, `${id}: foot out of reach`);
    if (p.foot2) assert.ok(len(p.hip, p.foot2) <= BONES.thigh + BONES.shin + 0.1, `${id}: foot2 out of reach`);
  }
});
