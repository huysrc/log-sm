import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// These tests are meant to catch packaging/export-map regressions.
// They require "npm run build" to have produced dist/*.

test('exports: ESM import from main entry works', async () => {
  const mod = await import('../dist/core.js');
  assert.equal(typeof mod.createLogger, 'function');
  assert.equal(typeof mod.LogLevel, 'object');
});

test('exports: CJS require from main entry works', () => {
  const require = createRequire(import.meta.url);
  const mod = require('../dist/core.cjs');
  assert.equal(typeof mod.createLogger, 'function');
});

test('exports: subpath imports work (format/redact)', async () => {
  const fmt = await import('../dist/format.js');
  const red = await import('../dist/redact.js');
  assert.equal(typeof fmt.createConsoleFormatter, 'function');
  assert.equal(typeof red.redact, 'function');
  assert.equal(typeof red.makeMask, 'function');
});
