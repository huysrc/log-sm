import test from 'node:test';
import assert from 'node:assert/strict';

import { redact, maskArgs, makeMask, extendDefaultMaskKeys, DEFAULT_MASK_KEYS } from '../dist/redact.js';

test('redact: maskArgs masks DEFAULT_MASK_KEYS by default', () => {
  const out = maskArgs({ password: 'p', token: 't', ok: 1 });
  assert.deepEqual(out, { password: '***', token: '***', ok: 1 });
});

test('redact: makeMask(undefined) uses default set; makeMask([]) is identity', () => {
  const maskDefault = makeMask();
  const maskNone = makeMask([]);

  assert.deepEqual(maskDefault({ password: 'p' }), { password: '***' });
  assert.deepEqual(maskNone({ password: 'p' }), { password: 'p' });
});

test('redact: extendDefaultMaskKeys affects subsequent makeMask()', () => {
  extendDefaultMaskKeys(['mysecret']);
  const mask = makeMask();
  assert.deepEqual(mask({ mysecret: 'x', ok: 1 }), { mysecret: '***', ok: 1 });
});

test('redact: supports case-insensitive keys and partialMatch', () => {
  const out1 = redact({ AccessToken: 'a' }, ['accessToken'], { mask: 'X', ciKeys: true });
  assert.deepEqual(out1, { AccessToken: 'X' });

  const out2 = redact({ my_accessToken_value: 'a' }, ['accessToken'], { mask: 'X', ciKeys: true, partialMatch: true });
  assert.deepEqual(out2, { my_accessToken_value: 'X' });
});

test('redact: handles circular references', () => {
  const a = { password: 'p' };
  a.self = a;

  const out = redact(a, ['password']);
  assert.equal(out.password, '***');
  assert.equal(out.self, '[Circular]');
});

test('redact: depth and node guards', () => {
  const deep = { a: { b: { c: { d: { e: 1 } } } } };
  const out = redact(deep, ['x'], { maxDepth: 2 });
  // maxDepth=2 means at depth>=2 => '[DepthLimit]'
  assert.deepEqual(out, { a: { b: '[DepthLimit]' } });

  // Node guard: create many nodes
  const huge = { a: [] };
  for (let i = 0; i < 200; i++) huge.a.push({ i });
  const out2 = redact(huge, ['x'], { maxNodes: 10 });
  // Current behavior: once maxNodes is exceeded, additional nodes are replaced with tooLargeValue
  // (the root object is preserved).
  assert.ok(out2 && out2.a && Array.isArray(out2.a));
  assert.equal(out2.a.length, 200);
  // First few nodes are kept
  assert.deepEqual(out2.a.slice(0, 3), [{ i: 0 }, { i: 1 }, { i: 2 }]);
  // And then the guard kicks in
  assert.equal(out2.a[9], '[TooLarge]');
});

test('redact: Map/Set/Error/Date/Buffer handling', () => {
  const m = new Map([['password', 'p'], ['ok', 1]]);
  const s = new Set(['password', 'x']);

  const e = new Error('boom');
  e.code = 'E1';

  const dt = new Date('2020-01-01T00:00:00.000Z');

  const obj = { m, s, e, dt, buf: Buffer.from('abc') };

  const out = redact(obj, ['password'], { mask: '***', maskMapKeys: true });

  // Map becomes array of [k,v]
  assert.ok(Array.isArray(out.m));
  assert.deepEqual(out.m, [['***', 'p'], ['ok', 1]]);

  // Set becomes array
  assert.ok(Array.isArray(out.s));
  assert.deepEqual(out.s, ['password', 'x']); // values not masked unless they are objects with keys

  // Error becomes {name,message,code}
  assert.equal(out.e.name, 'Error');
  assert.equal(out.e.message, 'boom');
  assert.equal(out.e.code, 'E1');

  // Date cloned
  assert.ok(out.dt instanceof Date);
  assert.equal(out.dt.toISOString(), dt.toISOString());

  // Buffer summarized
  assert.equal(out.buf, '[Buffer]');
});

test('redact: getter throws => getterErrorValue', () => {
  const obj = {};
  Object.defineProperty(obj, 'password', {
    enumerable: true,
    get() { throw new Error('nope'); },
  });

  const out = redact(obj, ['password'], { getterErrorValue: '[X]' });
  // key matched => mask wins, getter not invoked
  assert.equal(out.password, '***');

  const obj2 = {};
  Object.defineProperty(obj2, 'ok', {
    enumerable: true,
    get() { throw new Error('nope'); },
  });

  const out2 = redact(obj2, ['password'], { getterErrorValue: '[X]' });
  assert.equal(out2.ok, '[X]');
});

test('redact: includeInherited and includeSymbols', () => {
  const sym = Symbol('s');
  const proto = { password: 'p' };
  const obj = Object.create(proto);
  obj.ok = 1;
  obj[sym] = 'x';

  const out1 = redact(obj, ['password'], { includeInherited: false, includeSymbols: false });
  assert.deepEqual(out1, { ok: 1 });

  const out2 = redact(obj, ['password'], { includeInherited: true, includeSymbols: true });
  assert.equal(out2.password, '***');
  assert.equal(out2.ok, 1);
  // symbols are included only if enumerable; direct assignment makes it enumerable on plain objects
  assert.equal(out2[sym], 'x');
});
