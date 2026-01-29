import test from 'node:test';
import assert from 'node:assert/strict';

import { redact, makeMask } from '../dist/redact.js';

function deepCloneJSON(x) {
  return JSON.parse(JSON.stringify(x));
}

test('redact: does not mutate input objects', () => {
  const input = { password: 'p', nested: { token: 't' }, arr: [{ secret: 's' }] };
  const before = deepCloneJSON(input);

  const out = redact(input, ['password', 'token', 'secret']);

  // Output masked
  assert.equal(out.password, '***');
  assert.equal(out.nested.token, '***');
  assert.equal(out.arr[0].secret, '***');

  // Input unchanged
  assert.deepEqual(input, before);
});

test('makeMask: does not mutate input objects', () => {
  const mask = makeMask(['password']);
  const input = { password: 'p', ok: 1 };
  const before = deepCloneJSON(input);
  const out = mask(input);
  assert.deepEqual(out, { password: '***', ok: 1 });
  assert.deepEqual(input, before);
});
