// Screen time from the Android app: syncing, categories, and how it feeds the Time page.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { replaceState, DEFAULTS, S, migrate } from '../js/store.js';
import { syncScreen, appCat, screenOn, screenByCat, screenAvg } from '../js/screen.js';
import { dayMinutes, timeInsights } from '../js/time.js';
import { today, addDays } from '../js/util.js';

const T = today();
const fake = (days, granted = true) => {
  globalThis.window = { LightNative: { usage: (n, roll) => { fake.args = [n, roll]; return JSON.stringify(granted ? { granted: true, days } : { granted: false }); } } };
};
beforeEach(() => { const s = DEFAULTS(); s.profile = { name: 'T', goals: [], created: T }; replaceState(s); delete globalThis.window; });

test('without the Android app, sync reports unavailable', () => {
  assert.equal(syncScreen(), 'unavailable');
  fake({}, false);
  assert.equal(syncScreen(), 'denied');
});

test('sync stores rounded minutes per day and asks for Light days (3 AM rollover)', () => {
  fake({ [T]: [{ p: 'com.zhiliaoapp.musically', n: 'TikTok', m: 95.4, c: 'video' }, { p: 'x.tiny', n: 'Tiny', m: 0.4, c: '' }] });
  assert.equal(syncScreen(8), 'ok');
  assert.deepEqual(fake.args, [8, 3]);
  assert.deepEqual(S.screen[T], [{ p: 'com.zhiliaoapp.musically', n: 'TikTok', m: 95, c: 'video' }]);
  assert.ok(S.screenAt > 0);
});

test('categories: your choice, then known apps, then Android category, then other', () => {
  assert.equal(appCat({ p: 'com.zhiliaoapp.musically', c: 'video' }), 'social'); // known app beats Android's guess
  assert.equal(appCat({ p: 'some.game', c: 'game' }), 'games');
  assert.equal(appCat({ p: 'com.whatsapp', c: 'social' }), 'chat');
  assert.equal(appCat({ p: 'some.tool', c: '' }), 'phone');
  S.settings.appCats = { 'com.google.android.youtube': 'learn' };
  assert.equal(appCat({ p: 'com.google.android.youtube', c: 'video' }), 'learn');
});

test('screen time fills in time leaks on the Time page', () => {
  S.screen = { [T]: [{ p: 'com.facebook.katana', n: 'Facebook', m: 80, c: 'social' }, { p: 'com.google.android.youtube', n: 'YouTube', m: 40, c: 'video' }, { p: 'com.whatsapp', n: 'WhatsApp', m: 30, c: 'social' }] };
  S.days[T] = { evening: { socialMin: 30 } };
  replaceState(S);
  assert.deepEqual(screenByCat(T), { social: 80, videos: 40, chat: 30 });
  const m = dayMinutes(T);
  assert.equal(m.social, 80); // the bigger of check-in (30) and screen time (80)
  assert.equal(m.videos, 40);
  assert.equal(m.chat, undefined); // messaging shows on the card, not as scheduled time
  assert.equal(screenOn(T)[0].cat, 'social');
});

test('7-day averages and screen-time insights', () => {
  const day = (k, fb, yt) => [[k, [{ p: 'com.facebook.katana', n: 'Facebook', m: fb, c: 'social' }, { p: 'com.google.android.youtube', n: 'YouTube', m: yt, c: 'video' }]]];
  S.screen = Object.fromEntries([...day(T, 150, 100), ...day(addDays(T, -1), 90, 60)]);
  replaceState(S);
  const a = screenAvg(7);
  assert.equal(a.days, 2);
  assert.equal(a.apps[0].n, 'Facebook');
  assert.equal(a.apps[0].m, 120);
  assert.equal(a.total, 200);
  const ins = timeInsights().map((x) => x.t);
  assert.ok(ins.some((t) => t.startsWith('Your phone takes 3h 20m a day')), ins.join('\n'));
  assert.ok(ins.includes('Facebook is your biggest time leak: 2h a day.'));
});

test('older backups get empty screen data', () => {
  const m = migrate({ settings: {} });
  assert.deepEqual(m.screen, {});
  assert.deepEqual(m.settings.appCats, {});
});
