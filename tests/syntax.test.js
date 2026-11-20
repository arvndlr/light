// Every browser file must at least parse (app.js isn't imported by other tests, so catch typos and duplicate names here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('all js files parse', () => {
  for (const f of readdirSync(new URL('../js/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', new URL(`../js/${f}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')], { stdio: 'pipe' }), f);
  }
});
