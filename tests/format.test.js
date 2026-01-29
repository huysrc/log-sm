import test from 'node:test';
import assert from 'node:assert/strict';

import { createConsoleFormatter } from '../dist/format.js';

test('format: createConsoleFormatter returns {msg,data} and does not stringify data', () => {
  const f = createConsoleFormatter('off');
  const out = f('info', 'hello', { a: 1 });

  assert.ok(typeof out.msg === 'string');
  assert.deepEqual(out.data, { a: 1 });
});

test('format: color=off produces no ANSI codes', () => {
  const f = createConsoleFormatter('off');
  const out = f('error', 'boom');
  assert.ok(!out.msg.includes('\x1b['));
});

test('format: color=on produces ANSI codes', () => {
  const f = createConsoleFormatter('on');
  const out = f('error', 'boom');
  assert.ok(out.msg.includes('\x1b['));
});
