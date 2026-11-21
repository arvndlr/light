// "Open Light instead?": which apps to offer, the weekly count, and what's sent to the phone.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { replaceState, DEFAULTS, S } from '../js/store.js';
import { nudgeReady, nudgeCfg, nudgeCandidates, nudgeWeek, pushNudge } from '../js/screen.js';
import { today, addDays } from '../js/util.js';

const T = today();
beforeEach(() => { const s = DEFAULTS(); s.profile = { name: 'T', goals: [], created: T }; replaceState(s); delete globalThis.window; });

test('needs Android app version 2', () => {
  assert.equal(nudgeReady(), false);
  globalThis.window = { LightNative: { version: () => 1 } };
  assert.equal(nudgeReady(), false);
  globalThis.window = { LightNative: { version: () => 2 } };
  assert.equal(nudgeReady(), true);
});

test('candidates: watched apps and time-leak apps, most used first; useful apps left out', () => {
  S.screen = { [T]: [{ p: 'com.facebook.katana', n: 'Facebook', m: 40, c: '' }, { p: 'com.zhiliaoapp.musically', n: 'TikTok', m: 90, c: '' }, { p: 'com.duolingo', n: 'Duolingo', m: 30, c: '' }, { p: 'x.game', n: 'Puzzle', m: 10, c: 'game' }] };
  S.settings.nudge = { on: true, apps: { 'com.reddit.frontpage': { n: 'Reddit', limit: 0 } } };
  assert.deepEqual(nudgeCandidates(T).map((a) => a.n), ['TikTok', 'Facebook', 'Puzzle', 'Reddit']);
});

test('weekly count adds the last 7 days only', () => {
  const stats = { [T]: { a: { s: 3, l: 2, c: 1 } }, [addDays(T, -6)]: { b: { s: 1, l: 1 } }, [addDays(T, -7)]: { a: { s: 9, l: 9 } } };
  globalThis.window = { LightNative: { nudgeStats: () => JSON.stringify(stats) } };
  const w = nudgeWeek(7, T);
  assert.deepEqual([w.shown, w.light, w.cont], [4, 3, 1]);
});

test('settings reach the phone, and turn off with no apps', () => {
  let sent;
  globalThis.window = { LightNative: { setNudge: (j) => { sent = JSON.parse(j); return true; } } };
  S.settings.nudge = { on: true, apps: { 'com.facebook.katana': { n: 'Facebook', limit: 30 } } };
  assert.equal(pushNudge({ title: 'X' }, 'line'), true);
  assert.deepEqual([sent.on, sent.apps['com.facebook.katana'].limit, sent.rollover, sent.t.title, sent.line], [true, 30, 3, 'X', 'line']);
  S.settings.nudge = { on: true, apps: {} };
  pushNudge({});
  assert.equal(sent.on, false);
  assert.equal(nudgeCfg().on, true);
});
