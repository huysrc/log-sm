const { test } = require('node:test');
const assert = require('node:assert');
const { createLogger, LogLevel, MemorySink, ConsoleSink } = require('../dist/index.js');

test('Logger - basic logging', () => {
  const sink = new MemorySink();
  const logger = createLogger({ sinks: [sink], level: LogLevel.DEBUG });

  logger.debug('Debug message', { userId: 123 });
  logger.info('Info message', { action: 'login' });
  logger.warn('Warning message', { attempts: 3 });
  logger.error('Error message', { error: 'Not found' });
  logger.fatal('Fatal message', { critical: true });

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 5);
  assert.strictEqual(logs[0].level, 'debug');
  assert.strictEqual(logs[0].message, 'Debug message');
  assert.strictEqual(logs[0].userId, 123);
  assert.strictEqual(logs[1].level, 'info');
  assert.strictEqual(logs[2].level, 'warn');
  assert.strictEqual(logs[3].level, 'error');
  assert.strictEqual(logs[4].level, 'fatal');
});

test('Logger - log level filtering', () => {
  const sink = new MemorySink();
  const logger = createLogger({ sinks: [sink], level: LogLevel.WARN });

  logger.debug('Should not appear');
  logger.info('Should not appear');
  logger.warn('Should appear');
  logger.error('Should appear');

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 2);
  assert.strictEqual(logs[0].level, 'warn');
  assert.strictEqual(logs[1].level, 'error');
});

test('Logger - structured data', () => {
  const sink = new MemorySink();
  const logger = createLogger({ sinks: [sink] });

  logger.info('User login', {
    userId: 'user123',
    ip: '192.168.1.1',
    timestamp: 1234567890,
    metadata: { browser: 'Chrome', os: 'Linux' }
  });

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].userId, 'user123');
  assert.strictEqual(logs[0].ip, '192.168.1.1');
  assert.deepStrictEqual(logs[0].metadata, { browser: 'Chrome', os: 'Linux' });
});

test('Logger - timestamp format', () => {
  const sink = new MemorySink();
  const logger = createLogger({ sinks: [sink] });

  logger.info('Test message');

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.ok(logs[0].timestamp);
  // Verify ISO 8601 format
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(logs[0].timestamp));
});

test('Logger - child logger with context', () => {
  const sink = new MemorySink();
  const logger = createLogger({ sinks: [sink] });
  const childLogger = logger.child({ requestId: 'req-123', service: 'api' });

  childLogger.info('Request received', { path: '/users' });

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].requestId, 'req-123');
  assert.strictEqual(logs[0].service, 'api');
  assert.strictEqual(logs[0].path, '/users');
});

test('Logger - setLevel', () => {
  const sink = new MemorySink();
  const logger = createLogger({ sinks: [sink], level: LogLevel.DEBUG });

  logger.debug('Debug 1');
  logger.info('Info 1');

  logger.setLevel(LogLevel.ERROR);

  logger.debug('Debug 2');
  logger.info('Info 2');
  logger.error('Error 1');

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 3);
  assert.strictEqual(logs[0].message, 'Debug 1');
  assert.strictEqual(logs[1].message, 'Info 1');
  assert.strictEqual(logs[2].message, 'Error 1');
});

test('Logger - multiple sinks', () => {
  const sink1 = new MemorySink();
  const sink2 = new MemorySink();
  const logger = createLogger({ sinks: [sink1, sink2] });

  logger.info('Test message');

  assert.strictEqual(sink1.getLogs().length, 1);
  assert.strictEqual(sink2.getLogs().length, 1);
  assert.strictEqual(sink1.getLogs()[0].message, 'Test message');
  assert.strictEqual(sink2.getLogs()[0].message, 'Test message');
});

test('Logger - addSink and removeSink', () => {
  const sink1 = new MemorySink();
  const sink2 = new MemorySink();
  const logger = createLogger({ sinks: [sink1] });

  logger.info('Message 1');
  logger.addSink(sink2);
  logger.info('Message 2');
  logger.removeSink(sink1);
  logger.info('Message 3');

  assert.strictEqual(sink1.getLogs().length, 2);
  assert.strictEqual(sink2.getLogs().length, 2);
});
