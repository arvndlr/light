// Light — line icon set. Original 24×24 stroke icons (1.75px, round caps & joins)
// drawn to match the app's soft, rounded style. They inherit color via currentColor.

const P = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"/>',
  sunrise: '<path d="M12 3v3.5M5.3 9.3l1.4 1.4M18.7 9.3l-1.4 1.4M2.5 17.5h19M6.5 17.5a5.5 5.5 0 0 1 11 0M8.5 21h7"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3.5"/><path d="M3 10h18M6.5 6V5.2A2.2 2.2 0 0 1 9.2 3l8.3 1.5"/><circle cx="16.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/>',
  sparkles: '<path d="M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5l-1.7-4.8L4.5 10l4.8-1.7z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  sparkle: '<path d="M12 4l1.9 6.1L20 12l-6.1 1.9L12 20l-1.9-6.1L4 12l6.1-1.9z"/>',
  chart: '<path d="M3.5 20.5h17M6.5 20.5v-6M12 20.5v-11M17.5 20.5v-8"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-3.9-2.8-6.5-7-6.5 0 4 2.8 6.5 7 6.5z"/><path d="M12 10c0-3.3 2.4-5.5 6.5-5.5 0 3.4-2.4 5.5-6.5 5.5z"/>',
  settings: '<path d="M4 6.5h9M19 6.5h1M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="16" cy="6.5" r="2.2"/><circle cx="9" cy="12" r="2.2"/><circle cx="17" cy="17.5" r="2.2"/>',
  book: '<path d="M5 19V5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5 2.5 2.5 0 0 0 7.5 22H19"/><path d="M9 7.5h6"/>',
  bookOpen: '<path d="M12 6.5C10 5 7 4.5 3.5 5v14c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v14"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  droplet: '<path d="M12 3.5c3.2 3.8 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 2.8-6.7 6-10.5z"/>',
  flag: '<path d="M5.5 21V4M5.5 4H17l-2.2 4L17 12H5.5"/>',
  shield: '<path d="M12 3l7 2.8v5.4c0 4.4-2.9 7.9-7 9.8-4.1-1.9-7-5.4-7-9.8V5.8z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2a4.6 4.6 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pie: '<path d="M20.5 13A8.5 8.5 0 1 1 11 3.5V13z"/><path d="M14.5 3.7A8.5 8.5 0 0 1 20.3 9.5h-5.8z"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.3c-.5-.8-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 2s1.1 1.6 2.6 2 2.6.9 2.6 2-1.1 2-2.6 2c-1.1 0-2.1-.5-2.6-1.3M12 6.5V8M12 16v1.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  mind: '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 13c1.5-2 3-2 4.5 0s3 2 4.5 0"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.3 1.8M10 2.5h4M18.5 6l1.2-1.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5v1.3A3.2 3.2 0 0 0 8 10M16 5.5h3v1.3A3.2 3.2 0 0 1 16 10M12 13v4M8.5 21h7M9.5 17h5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
  message: '<path d="M5.5 4h13A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4h0A2.5 2.5 0 0 1 3 14.5v-8A2.5 2.5 0 0 1 5.5 4z"/>',
  bookmark: '<path d="M6.5 3.5h11v17L12 16.5l-5.5 4z"/>',
  share: '<path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5 12.5v6A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-6"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4.5" rx="1.2"/><path d="M5.5 12.5V21h13v-8.5M12 8v13"/><path d="M12 8C10.5 5 7 4.5 7 6.5S10 8 12 8zm0 0c1.5-3 5-3.5 5-1.5S14 8 12 8z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5M20 3.5v5h-5"/>',
  flame: '<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3 1.9-5 3.5-6.4.2 1.9 1.2 3 2.4 3.4C11 8 12.2 5.2 14.6 3c.4 3.1 4.4 5.6 4.4 11.4 0 3.8-3.1 6.6-7 6.6z"/>',
  activity: '<path d="M3 12h4l2.5-6.5 5 13L17 12h4"/>',
  pen: '<path d="M4 20h4.2L19.4 8.8a2.4 2.4 0 0 0-3.4-3.4L4.8 16.6z"/><path d="M14.5 7l3.4 3.4"/>',
  phoneOff: '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M11 18h2M3.5 3.5l17 17"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M11 18h2"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.8" cy="8.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.2" cy="15.2" r="1.1" fill="currentColor" stroke="none"/>',
  burger: '<path d="M4.5 11a7.5 6 0 0 1 15 0z"/><path d="M3.5 14.5h17M4.5 17.5h15a0 0 0 0 1 0 0 2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/>',
  cup: '<path d="M6 7.5h12M7.3 7.5 8.8 21h6.4l1.5-13.5M12 7.5l1.8-4.5H17"/>',
  dumbbell: '<rect x="2.5" y="9" width="3" height="6" rx="1"/><rect x="5.5" y="6" width="3.5" height="12" rx="1.2"/><rect x="15" y="6" width="3.5" height="12" rx="1.2"/><rect x="18.5" y="9" width="3" height="6" rx="1"/><path d="M9 12h6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.8"/><path d="M9 7V5.5A2 2 0 0 1 11 3.5h2a2 2 0 0 1 2 2V7M3 12.5h18"/>',
  bowl: '<path d="M3.5 11.5h17c0 4.4-3.8 8-8.5 8s-8.5-3.6-8.5-8z"/><path d="M9.5 8c0-1 .9-1.5.9-2.5M13.5 8c0-1 .9-1.5.9-2.5"/>',
  bus: '<rect x="4.5" y="3" width="15" height="15" rx="3"/><path d="M4.5 11h15M8 18v3M16 18v3M8 14.5h.01M16 14.5h.01"/>',
  bag: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  gamepad: '<path d="M7.5 8h9a4.5 4.5 0 0 1 4.5 4.5v.8a3 3 0 0 1-5.3 1.9L14.4 14H9.6l-1.3 1.2A3 3 0 0 1 3 13.3v-.8A4.5 4.5 0 0 1 7.5 8z"/><path d="M8 10.5v3M6.5 12h3M15.5 11h.01M17.3 13h.01"/>',
  pill: '<path d="M10.6 20.4a4.9 4.9 0 0 1-7-7l6.8-6.8a4.9 4.9 0 0 1 7 7z"/><path d="M7 10l7 7"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.3 6.3 0 0 1 21.5 20"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  box: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5z"/><path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3 20.5h18"/>',
  trending: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  wind: '<path d="M3 8.5h10.5a2.75 2.75 0 1 0-2.7-3.3M3 12.5h15a2.75 2.75 0 1 1-2.7 3.3M3 16.5h7"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1 0 1.5-.7 1.5-1.4 0-.9-.8-1.4-.8-2.3 0-.8.7-1.3 1.5-1.3h2.3a4 4 0 0 0 4-4c0-4.4-3.8-8-8.5-8z"/><circle cx="7.8" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="7.8" r="1" fill="currentColor" stroke="none"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>',
  download: '<path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M5 20.5h14"/>',
  play: '<path d="M7.5 4.8v14.4a1 1 0 0 0 1.5.9l11-7.2a1 1 0 0 0 0-1.8L9 3.9a1 1 0 0 0-1.5.9z"/>',
  pause: '<rect x="6.5" y="4.5" width="3.5" height="15" rx="1.2"/><rect x="14" y="4.5" width="3.5" height="15" rx="1.2"/>',
  skip: '<path d="M5.5 5.5v13l9-6.5z"/><path d="M18.5 5v14"/>',
  bellOff: '<path d="M8.6 5.6A6 6 0 0 1 18 11v5.5l1.5 2H10M6 11v5.5l-1.5 2H8"/><path d="M10 21h4M3.5 3.5l17 17"/>',
  compassPlan: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.5 2"/><path d="M12 3.5v1.5M20.5 12H19M12 20.5V19M3.5 12H5"/>',
  lungs: '<path d="M12 3.5v7.5M12 11l-2.2 2M12 11l2.2 2"/><path d="M9.6 8.2C7 8.2 4.5 11.4 4.5 15.6c0 2.6 1.2 4 3 4 1.9 0 2.6-1.3 2.6-3.1v-6.3c0-1.3-.2-2-.5-2z"/><path d="M14.4 8.2c2.6 0 5.1 3.2 5.1 7.4 0 2.6-1.2 4-3 4-1.9 0-2.6-1.3-2.6-3.1v-6.3c0-1.3.2-2 .5-2z"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  thumbDown: '<path d="M7.5 13.5V4M7.5 13.5l3.6 6.2a1.9 1.9 0 0 0 3.5-1.3L13.8 15h4.6a2 2 0 0 0 2-2.4l-1.3-6.7A2.4 2.4 0 0 0 16.7 4H7.5M7.5 4H5a1.5 1.5 0 0 0-1.5 1.5v6.5A1.5 1.5 0 0 0 5 13.5h2.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
};

/** Inline SVG for an icon name. Decorative by default (aria-hidden). */
export function icon(name, size = 20, cls = '') {
  const body = P[name];
  if (!body) return '';
  return `<svg class="i${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
export const ICON_NAMES = Object.keys(P);

/** Emoji used across the app's data/content → matching line icon. */
const EMOJI = {
  '☀': 'sun', '🌤': 'sun', '🌙': 'moon', '😴': 'moon', '🌅': 'sunrise', '🌗': 'contrast',
  '💰': 'coin', '✨': 'sparkles', '📊': 'pie', '🌱': 'sprout', '⚙': 'settings',
  '📖': 'book', '📓': 'bookOpen', '📒': 'book', '📚': 'book', '🎓': 'book', '🎯': 'target', '💡': 'bulb', '💧': 'droplet',
  '🗺': 'flag', '🛡': 'shield', '😂': 'smile', '🙂': 'smile', '➕': 'plus', '🧾': 'receipt', '🗓': 'calendar',
  '🔮': 'compass', '🧩': 'eye', '🧠': 'mind', '⏱': 'timer', '🕰': 'clock', '❤': 'heart', '🏆': 'trophy',
  '🎤': 'mic', '💬': 'message', '🔖': 'bookmark', '📌': 'bookmark', '🎁': 'gift', '🔄': 'refresh', '🔥': 'flame',
  '🏃': 'activity', '📝': 'pen', '📵': 'phoneOff', '📱': 'phone', '🎲': 'dice', '🍔': 'burger', '🥤': 'cup',
  '💪': 'dumbbell', '💼': 'briefcase', '🍚': 'bowl', '🚌': 'bus', '🛍': 'bag', '🎮': 'gamepad', '💊': 'pill',
  '👨‍👩‍👧': 'users', '👤': 'user', '📦': 'box', '🏦': 'bank', '📈': 'trending', '⛔': 'ban', '🚫': 'ban',
  '🫁': 'lungs', '🍳': 'bowl', '🧼': 'droplet', '💉': 'shield', '🚭': 'ban', '🎒': 'bag', '🩺': 'heart', '🎨': 'palette', '🔔': 'bell', '🪥': 'sparkle', '🪞': 'sparkle', '✅': 'checkCircle',
  '🌊': 'wind', '🦵': 'dumbbell', '⚡': 'activity', '🧘': 'sparkle', '🥗': 'bowl', '🏋': 'dumbbell', '🧭': 'compassPlan', '📜': 'clock', '🎭': 'mic', '🌍': 'compass', '⬇': 'download', '🔒': 'lock', '💸': 'wallet',
};
const norm = (e) => String(e).replace(/️/g, '');
export const iconFor = (e) => EMOJI[norm(e)];
/** Icon for an emoji if we have one, otherwise the emoji itself. */
export const ico = (e, size = 18, cls = '') => { const n = iconFor(e); return n ? icon(n, size, cls) : e; };

const EMO = '\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic})*\\uFE0F?';
const H2_RE = new RegExp(`(<h2[^>]*>)\\s*(${EMO})\\s*`, 'gu');
// Whole class tokens only (so "r-big" or "r-ic" never count as the "big"/"ic" slots).
const SLOT_RE = new RegExp(`(class="(?:[^"]*\\s)?(?:q-ic|nu-ic|ic|big|cat|chest-ic|ico)(?:\\s[^"]*)?"[^>]*>)\\s*(${EMO})`, 'gu');
/**
 * Swap emoji in icon "slots" (section-title prefixes and .q-ic/.nu-ic/.ic/.big/.cat/.ico boxes)
 * for line icons, so content and logic can keep using simple emoji tokens.
 */
export function iconize(html) {
  return html
    .replace(H2_RE, (m, tag, e) => (iconFor(e) ? `${tag}${icon(iconFor(e), 18, 'h-ic')}` : m))
    .replace(SLOT_RE, (m, tag, e) => (iconFor(e) ? tag + icon(iconFor(e), 22) : m));
}
