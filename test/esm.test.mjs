/**
 * Test ESM module import
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createLogger, LogLevel, MemorySink } from '../dist/index.mjs';

test('ESM - basic import and usage', () => {
  const sink = new MemorySink();
  const logger = createLogger({ sinks: [sink] });
  
  logger.info('ESM test message', { test: true });
  
  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].level, 'info');
  assert.strictEqual(logs[0].message, 'ESM test message');
  assert.strictEqual(logs[0].test, true);
});

test('ESM - LogLevel enum', () => {
  assert.strictEqual(LogLevel.DEBUG, 0);
  assert.strictEqual(LogLevel.INFO, 1);
  assert.strictEqual(LogLevel.WARN, 2);
  assert.strictEqual(LogLevel.ERROR, 3);
  assert.strictEqual(LogLevel.FATAL, 4);
});

test('ESM - full feature test', () => {
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    level: LogLevel.DEBUG,
    redaction: {
      fields: ['secret'],
      deep: true
    }
  });
  
  const child = logger.child({ context: 'test' });
  child.info('Test', { secret: 'hidden' });
  
  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].context, 'test');
  assert.strictEqual(logs[0].secret, '[REDACTED]');
});
