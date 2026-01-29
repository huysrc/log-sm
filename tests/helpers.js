import assert from 'node:assert/strict';

/** Create in-memory sinks that capture calls in arrays for assertions. */
export function makeCaptureSinks() {
  const calls = {
    error: [],
    warn: [],
    info: [],
    debug: [],
  };

  const sinks = {
    error: (msg, data) => calls.error.push({ msg, data }),
    warn: (msg, data) => calls.warn.push({ msg, data }),
    info: (msg, data) => calls.info.push({ msg, data }),
    debug: (msg, data) => calls.debug.push({ msg, data }),
  };

  return { calls, sinks };
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Patch globalThis.console for the duration of fn().
 * Restores even if fn throws.
 */
export async function withPatchedConsole(stubConsole, fn) {
  const gt = globalThis;
  const prev = gt.console;
  gt.console = stubConsole;
  try {
    return await fn();
  } finally {
    gt.console = prev;
  }
}

/** Assert no calls were captured for all levels. */
export function assertNoCalls(calls) {
  assert.equal(calls.error.length, 0);
  assert.equal(calls.warn.length, 0);
  assert.equal(calls.info.length, 0);
  assert.equal(calls.debug.length, 0);
}
