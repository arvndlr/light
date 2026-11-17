import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asthmaControl, BREATHING, RED_FLAGS, IMMUNITY, TRIGGERS, MYTHS, breathing } from '../js/health.js';

test('asthma check: unknown with no logs', () => {
  assert.equal(asthmaControl([undefined, undefined]).status, 'unknown');
});
test('asthma check: good when symptoms and reliever use are rare', () => {
  const r = asthmaControl([{ puffs: 0, sym: 0 }, { puffs: 2, sym: 1 }, { puffs: 0, sym: 0 }, undefined]);
  assert.equal(r.status, 'good');
  assert.equal(r.relieverDays, 1);
  assert.equal(r.logged, 3);
});
test('asthma check: flags reliever use on more than 2 days', () => {
  assert.equal(asthmaControl([{ puffs: 1 }, { puffs: 2 }, { puffs: 1 }]).status, 'check');
});
test('asthma check: any night waking or severe day means check with a doctor', () => {
  assert.equal(asthmaControl([{ night: true }]).status, 'check');
  assert.equal(asthmaControl([{ sym: 3 }]).status, 'check');
});
test('health content is complete', () => {
  assert.ok(RED_FLAGS.length >= 4 && IMMUNITY.length >= 8 && TRIGGERS.length >= 6 && MYTHS.length >= 3);
  for (const b of BREATHING) { assert.ok(b.inhale > 0 && b.exhale >= b.inhale, b.id); assert.ok(b.hold <= 2, `${b.id}: no long breath-holds`); }
  assert.equal(breathing('belly').n, 'Belly breathing');
});
