import test from 'node:test';
import assert from 'node:assert/strict';

import { createLogger } from '../dist/core.js';
import { makeCaptureSinks, sleep, withPatchedConsole } from './helpers.js';

test('core: level resolves from explicit option', () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({ level: 'debug', sinks, env: {} });

  log.error('e1');
  log.warn('w1');
  log.info('i1');
  log.debug('d1');

  assert.equal(calls.error.length, 1);
  assert.equal(calls.warn.length, 1);
  assert.equal(calls.info.length, 1);
  assert.equal(calls.debug.length, 1);
});

test('core: level resolves from env.DEBUG_MODE', () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({ sinks, env: { DEBUG_MODE: 'true' } });

  log.debug('d');
  assert.equal(calls.debug.length, 1);
});

test('core: LOG_LEVEL=WARN uses warnLevel as base gate', () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({
    sinks,
    warnLevel: 'info',
    env: { LOG_LEVEL: 'WARN' },
  });

  log.info('i');
  assert.equal(calls.info.length, 1);
});

test('core: NODE_ENV=production defaults base level to ERROR', () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({ sinks, env: { NODE_ENV: 'production' } });

  log.info('i');
  assert.equal(calls.info.length, 0);

  // WARN is gated by warnLevel (default ERROR), so visible at ERROR.
  log.warn('w');
  assert.equal(calls.warn.length, 1);
});

test('core: warnLevel=INFO hides warn at base ERROR', () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({ sinks, env: { NODE_ENV: 'production' }, warnLevel: 'info' });

  log.warn('w');
  assert.equal(calls.warn.length, 0);
});

test('core: warnFallback routes to error sink when warn sink missing', () => {
  const calls = { error: [], warn: [], info: [], debug: [] };
  const log = createLogger({
    level: 'info',
    warnFallback: 'error',
    sinks: {
      error: (msg, data) => calls.error.push({ msg, data }),
    },
    env: {},
  });

  log.warn('w', { a: 1 });
  assert.equal(calls.error.length, 1);
  assert.equal(calls.error[0].msg, 'w');
  assert.deepEqual(calls.error[0].data, { a: 1 });
});

test('core: debugFallback routes to info sink when debug sink missing', () => {
  const calls = { error: [], warn: [], info: [], debug: [] };
  const log = createLogger({
    level: 'debug',
    debugFallback: 'info',
    sinks: {
      info: (msg, data) => calls.info.push({ msg, data }),
    },
    env: {},
  });

  log.debug('d', { x: 1 });
  assert.equal(calls.info.length, 1);
  assert.equal(calls.info[0].msg, 'd');
  assert.deepEqual(calls.info[0].data, { x: 1 });
});

test('core: sinks=null creates a no-op logger and does not touch console', async () => {
  const throwingConsole = {
    error() { throw new Error('console.error should not be called'); },
    warn() { throw new Error('console.warn should not be called'); },
    info() { throw new Error('console.info should not be called'); },
    debug() { throw new Error('console.debug should not be called'); },
    log() { throw new Error('console.log should not be called'); },
  };

  await withPatchedConsole(throwingConsole, async () => {
    const log = createLogger({ sinks: null, level: 'debug', env: {} });
    log.error('e');
    log.warn('w');
    log.info('i');
    log.debug('d');
  });
});

test('core: consoleFormatter applies only to console fallback (not custom sinks)', async () => {
  const { calls, sinks } = makeCaptureSinks();

  const consoleCalls = { error: [], info: [] };
  const stubConsole = {
    error: (m, d) => consoleCalls.error.push({ m, d }),
    warn: () => {},
    info: (m, d) => consoleCalls.info.push({ m, d }),
    debug: () => {},
    log: () => {},
  };

  await withPatchedConsole(stubConsole, async () => {
    const log = createLogger({
      // provide only info sink => error falls back to console.* and uses consoleFormatter
      sinks: { info: sinks.info },
      consoleFormatter: (lvl, msg, data) => ({ msg: `FMT:${lvl}:${msg}`, data }),
      level: 'info',
      env: {},
    });

    log.info('hello', { a: 1 });
    log.error('boom', { b: 2 });

    assert.equal(calls.info.length, 1);
    assert.equal(calls.info[0].msg, 'hello'); // not formatted
    assert.deepEqual(calls.info[0].data, { a: 1 });

    assert.equal(consoleCalls.error.length, 1);
    assert.equal(consoleCalls.error[0].m, 'FMT:error:boom');
    assert.deepEqual(consoleCalls.error[0].d, { input: 'boom', b: 2 });
  });
});

test('core: levelTags prefix messages', () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({
    sinks,
    level: 'info',
    levelTags: { info: '[I]' },
    env: {},
  });

  log.info('hello');
  assert.equal(calls.info.length, 1);
  assert.equal(calls.info[0].msg, '[I] hello');
});

test('core: mask then truncate pipeline, BigInt and Buffer handling', () => {
  const { calls, sinks } = makeCaptureSinks();

  const log = createLogger({
    sinks,
    level: 'info',
    truncate: 5,
    mask: (x) => {
      if (x && typeof x === 'object') {
        const o = { ...(x) };
        if ('secret' in o) o.secret = '***';
        return o;
      }
      return x;
    },
    env: {},
  });

  log.info('m', { long: '1234567890', secret: 'dont', big: 1n, buf: Buffer.from('abc') });

  assert.equal(calls.info.length, 1);
  const data = calls.info[0].data;

  assert.equal(data.secret, '***');
  assert.equal(data.long, '12345...[truncated]');
  assert.equal(data.big, '1');
  assert.equal(data.buf, '[Buffer 3 bytes]');
});

test('core: error normalization + errorStackPolicy', () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({
    sinks,
    level: 'error',
    errorStackPolicy: 'always',
    env: { NODE_ENV: 'production' },
  });

  const e = new Error('nope');
  e.code = 'E_NOPE';
  log.error(e, { a: 1 });

  assert.equal(calls.error.length, 1);
  const payload = calls.error[0].data;
  assert.equal(payload.name, 'Error');
  assert.equal(payload.message, 'nope');
  assert.equal(payload.code, 'E_NOPE');
  assert.equal(payload.a, 1);
  assert.ok(typeof payload.stack === 'string' && payload.stack.length > 0);
});

test('core: errorInputPolicy and inputKey', () => {
  // ifNonError (default)
  {
    const { calls, sinks } = makeCaptureSinks();
    const log = createLogger({ sinks, level: 'error', env: {} });
    log.error('x', { a: 1 });
    assert.equal(calls.error.length, 1);
    assert.equal(calls.error[0].data.input, 'x');
    assert.equal(calls.error[0].data.a, 1);
  }

  // never
  {
    const { calls, sinks } = makeCaptureSinks();
    const log = createLogger({ sinks, level: 'error', env: {}, errorInputPolicy: 'never' });
    log.error('x', { a: 1 });
    assert.equal(calls.error.length, 1);
    assert.ok(!('input' in calls.error[0].data));
  }

  // always + custom key
  {
    const { calls, sinks } = makeCaptureSinks();
    const log = createLogger({
      sinks,
      level: 'error',
      env: {},
      errorInputPolicy: 'always',
      inputKey: 'raw',
    });
    const e = new Error('boom');
    log.error(e);
    assert.equal(calls.error.length, 1);
    assert.ok('raw' in calls.error[0].data);
  }
});

test('core: non-plain data is wrapped under { data: value } for error()', () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({ sinks, level: 'error', env: {} });

  const dt = new Date('2020-01-01T00:00:00.000Z');
  log.error('x', dt);

  assert.equal(calls.error.length, 1);
  assert.ok(calls.error[0].data.data instanceof Date);
});

test('core: withLevel restores after sync and after throw', () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({ sinks, env: { NODE_ENV: 'production' } }); // base ERROR

  log.info('nope');
  assert.equal(calls.info.length, 0);

  log.withLevel('info', (l) => l.info('yep'));
  assert.equal(calls.info.length, 1);

  log.info('nope2');
  assert.equal(calls.info.length, 1);

  assert.throws(() => {
    log.withLevel('debug', () => {
      throw new Error('fail');
    });
  });

  // restored => debug is still off
  log.debug('nope3');
  assert.equal(calls.debug.length, 0);
});

test('core: withLevel restores after async', async () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({ sinks, env: { NODE_ENV: 'production' } }); // base ERROR

  await log.withLevel('debug', async (l) => {
    await sleep(10);
    l.debug('d');
  });

  assert.equal(calls.debug.length, 1);

  log.debug('nope');
  assert.equal(calls.debug.length, 1);
});

test('core: withLevelTimed auto-expires and disposer ends early', async () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({ sinks, env: { NODE_ENV: 'production' } }); // base ERROR

  const dispose = log.withLevelTimed('info', 25);
  log.info('i1');
  assert.equal(calls.info.length, 1);

  dispose();
  log.info('i2');
  assert.equal(calls.info.length, 1);

  const dispose2 = log.withLevelTimed('info', 20);
  log.info('i3');
  assert.equal(calls.info.length, 2);

  await sleep(35);
  log.info('i4');
  assert.equal(calls.info.length, 2);

  dispose2(); // idempotent after expiry
});

test('core: debugForMs allows debug regardless of base level and can gate info', async () => {
  const { calls, sinks } = makeCaptureSinks();
  const log = createLogger({ sinks, env: { NODE_ENV: 'production' } }); // base ERROR

  log.debug('nope');
  assert.equal(calls.debug.length, 0);

  const dispose = log.debugForMs(25, { allowInfo: false, includeStack: true });
  log.debug('d1');
  log.info('i1'); // blocked by allowInfo:false
  assert.equal(calls.debug.length, 1);
  assert.equal(calls.info.length, 0);

  dispose();
  log.debug('d2');
  assert.equal(calls.debug.length, 1);

  // Also verify debug window can force stack even when policy is 'never'
  const { calls: calls2, sinks: sinks2 } = makeCaptureSinks();
  const log2 = createLogger({ sinks: sinks2, env: {}, level: 'error', errorStackPolicy: 'never' });

  const d2 = log2.debugForMs(25, { includeStack: true });
  log2.error(new Error('x'));
  assert.equal(calls2.error.length, 1);
  assert.ok(typeof calls2.error[0].data.stack === 'string');

  await sleep(30);
  log2.error(new Error('y'));
  assert.equal(calls2.error.length, 2);
  assert.ok(!('stack' in calls2.error[1].data) || calls2.error[1].data.stack === undefined);

  d2();
});

test('core: tags merging via options.tags and withTags()', () => {
  // dataWins (default)
  {
    const { calls, sinks } = makeCaptureSinks();
    const log = createLogger({ sinks, level: 'info', tags: { service: 's' }, env: {} });

    log.info('m', { a: 1 });
    assert.deepEqual(calls.info[0].data, { service: 's', a: 1 });

    const child = log.withTags({ req: 'r' });
    child.info('m2', { a: 2 });
    assert.deepEqual(calls.info[1].data, { service: 's', req: 'r', a: 2 });
  }

  // tagsWin
  {
    const { calls, sinks } = makeCaptureSinks();
    const log = createLogger({
      sinks,
      level: 'info',
      tags: { t: 1 },
      mergeTagsPolicy: 'tagsWin',
      env: {},
    });

    log.info('m', { t: 999, a: 1 });
    assert.deepEqual(calls.info[0].data, { t: 1, a: 1 });
  }
});

test('core: child() shallow-merges options and merges tags correctly when called on tags wrapper', () => {
  const { calls, sinks } = makeCaptureSinks();

  const parent = createLogger({
    sinks,
    level: 'info',
    tags: { service: 's' },
    env: {},
  });

  const wrapped = parent.withTags({ req: 'r' });
  const child = wrapped.child({ tags: { component: 'c' } });

  child.info('m', { x: 1 });

  assert.equal(calls.info.length, 1);
  assert.deepEqual(calls.info[0].data, { service: 's', req: 'r', component: 'c', x: 1 });
});
