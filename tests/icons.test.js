import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icon, ico, iconize, iconFor, ICON_NAMES } from '../js/icons.js';

test('every icon renders as a decorative 24x24 SVG', () => {
  for (const n of ICON_NAMES) {
    const s = icon(n, 20);
    assert.match(s, /^<svg class="i" width="20" height="20" viewBox="0 0 24 24"/);
    assert.match(s, /aria-hidden="true"/);
  }
  assert.equal(icon('nope'), '');
});
test('emoji lookup ignores the variation selector', () => {
  assert.equal(iconFor('☀️'), 'sun');
  assert.equal(iconFor('☀'), 'sun');
  assert.equal(iconFor('👨‍👩‍👧'), 'users');
  assert.equal(ico('🦄'), '🦄', 'unknown emoji is kept as-is');
});
test('iconize swaps section-title and icon-slot emoji only', () => {
  const html = '<h2>📖 Today’s guide</h2><div class="q-ic" aria-hidden="true">💧</div><p>I ❤️ water</p><div class="r-big">🔥</div><h2>🦄 Unicorns</h2>';
  const out = iconize(html);
  assert.match(out, /<h2><svg class="i h-ic"[^]*?<\/svg>Today’s guide<\/h2>/);
  assert.match(out, /<div class="q-ic" aria-hidden="true"><svg/);
  assert.ok(out.includes('<p>I ❤️ water</p>'), 'emoji inside text content stays');
  assert.ok(out.includes('<div class="r-big">🔥</div>'), 'feed card art stays');
  assert.ok(out.includes('<h2>🦄 Unicorns</h2>'), 'unmapped emoji stays');
});
