// Screen time per app. Only the Light Android app can read it (window.LightNative, see android/);
// in a browser this module just reports that it's unavailable. Data stays on the phone.
import { S } from './store.js';
import { today, addDays, sum, DAY_ROLLOVER_HOURS } from './util.js';

export const native = () => (typeof window !== 'undefined' && window.LightNative) || null;
export const isAndroidWeb = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !native();
export const APK_URL = 'https://github.com/arvndlr/light/releases/download/android/light.apk';

// Known apps → Light time category. Anything else falls back to Android's own app category.
const PKG = {
  social: ['com.facebook.katana', 'com.facebook.lite', 'com.instagram.android', 'com.instagram.barcelona', 'com.zhiliaoapp.musically', 'com.ss.android.ugc.trill',
    'com.twitter.android', 'com.reddit.frontpage', 'com.snapchat.android', 'com.pinterest', 'com.tumblr', 'com.lemon.lvoverseas', 'com.kumu.ph'],
  videos: ['com.google.android.youtube', 'com.netflix.mediaclient', 'com.amazon.avod.thirdpartyclient', 'com.disney.disneyplus', 'com.iqiyi.i18n', 'tv.twitch.android.app',
    'com.vivamax.app', 'com.viu.phone', 'com.hbo.hbonow', 'com.google.android.apps.youtube.kids', 'com.bilibili.app.in', 'com.kapamilya.iwanttfc'],
  games: ['com.mobile.legends', 'com.tencent.ig', 'com.garena.game.codm', 'com.dts.freefireth', 'com.dts.freefiremax', 'com.roblox.client', 'com.supercell.clashofclans',
    'com.miHoYo.GenshinImpact', 'com.activision.callofduty.shooter', 'com.king.candycrushsaga'],
  chat: ['com.facebook.orca', 'com.facebook.mlite', 'com.whatsapp', 'com.viber.voip', 'org.telegram.messenger', 'com.discord', 'jp.naver.line.android',
    'com.google.android.apps.messaging', 'com.samsung.android.messaging', 'com.android.mms', 'com.google.android.dialer', 'com.samsung.android.dialer', 'com.skype.raider'],
  learn: ['com.duolingo', 'org.coursera.android', 'com.google.android.apps.classroom', 'com.udemy.android', 'org.khanacademy.android', 'com.quizlet.quizletandroid',
    'com.medium.reader', 'com.amazon.kindle', 'com.google.android.apps.books', 'com.sololearn', 'com.brainly', 'org.wikipedia', 'com.openai.chatgpt', 'com.anthropic.claude'],
  work: ['com.microsoft.teams', 'com.Slack', 'com.google.android.gm', 'com.microsoft.office.outlook', 'com.google.android.apps.docs', 'com.google.android.apps.docs.editors.docs',
    'com.google.android.apps.docs.editors.sheets', 'com.microsoft.office.word', 'com.microsoft.office.excel', 'us.zoom.videomeetings', 'com.google.android.apps.meetings', 'com.notion.id'],
  rest: ['com.spotify.music', 'com.google.android.apps.youtube.music', 'com.apple.android.music'],
};
const BY_PKG = Object.fromEntries(Object.entries(PKG).flatMap(([c, ps]) => ps.map((p) => [p, c])));
const BY_ANDROID = { game: 'games', video: 'videos', social: 'social', news: 'social', image: 'social', audio: 'rest', maps: 'commute', productivity: 'work' };

/** Light time category for an app: your own choice, then known apps, then Android's category. */
export const appCat = (a) => S.settings.appCats?.[a.p] || BY_PKG[a.p] || BY_ANDROID[a.c] || 'phone';

/** Pull the last `days` days from the phone into S.screen. Returns 'ok' | 'denied' | 'unavailable' | 'error'. */
export function syncScreen(days = 8) {
  const n = native();
  if (!n?.usage) return 'unavailable';
  let r;
  try { r = JSON.parse(n.usage(days, DAY_ROLLOVER_HOURS)); } catch { return 'error'; }
  if (!r.granted) return 'denied';
  if (r.error || !r.days) return 'error';
  S.screen = S.screen || {};
  const oldest = addDays(today(), -(days - 1));
  for (const [k, apps] of Object.entries(r.days)) if (k >= oldest) S.screen[k] = apps.map((a) => ({ p: a.p, n: a.n, m: Math.round(a.m), c: a.c || '' })).filter((a) => a.m >= 1).sort((a, b) => b.m - a.m);
  const cut = addDays(today(), -90); // keep three months
  for (const k of Object.keys(S.screen)) if (k < cut) delete S.screen[k];
  S.screenAt = Date.now();
  return 'ok';
}

/** Apps used on a day, with your categories applied. */
export const screenOn = (k) => (S.screen?.[k] || []).map((a) => ({ ...a, cat: appCat(a) }));
export const screenTotal = (k) => sum(screenOn(k).map((a) => a.m));
/** Minutes per Light time category on a day. */
export function screenByCat(k) {
  const out = {};
  for (const a of screenOn(k)) out[a.cat] = (out[a.cat] || 0) + a.m;
  return out;
}
/** Average minutes per day per app over the last n days that have screen data. */
export function screenAvg(n = 7, k = today()) {
  const keys = Array.from({ length: n }, (_, i) => addDays(k, -i)).filter((x) => S.screen?.[x]?.length);
  const apps = {};
  for (const x of keys) for (const a of screenOn(x)) {
    const o = apps[a.p] || (apps[a.p] = { p: a.p, n: a.n, cat: a.cat, m: 0 });
    o.m += a.m;
  }
  const list = Object.values(apps).map((a) => ({ ...a, m: keys.length ? a.m / keys.length : 0 })).sort((a, b) => b.m - a.m);
  return { days: keys.length, apps: list, total: sum(list.map((a) => a.m)) };
}
