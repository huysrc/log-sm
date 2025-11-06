const { test } = require('node:test');
const assert = require('node:assert');
const { createLogger, LogLevel, MemorySink } = require('../dist/index.js');

test('Integration - complete workflow', () => {
  // Setup logger with multiple features
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    level: LogLevel.DEBUG,
    redaction: {
      fields: ['password', 'secret'],
      deep: true
    }
  });

  // Create child logger for request context
  const requestLogger = logger.child({
    requestId: 'req-123',
    service: 'api'
  });

  // Log various events
  requestLogger.info('Request started', { method: 'POST', path: '/login' });
  
  requestLogger.debug('Validating credentials', {
    username: 'testuser',
    password: 'secret123'  // Should be redacted
  });

  requestLogger.warn('Rate limit approaching', {
    remaining: 10,
    limit: 100
  });

  requestLogger.error('Authentication failed', {
    reason: 'Invalid password',
    secret: 'api-key-xyz'  // Should be redacted
  });

  requestLogger.info('Request completed', {
    status: 401,
    duration: 150
  });

  // Verify logs
  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 5);

  // Check first log
  assert.strictEqual(logs[0].level, 'info');
  assert.strictEqual(logs[0].message, 'Request started');
  assert.strictEqual(logs[0].requestId, 'req-123');
  assert.strictEqual(logs[0].service, 'api');
  assert.strictEqual(logs[0].method, 'POST');

  // Check redaction worked
  assert.strictEqual(logs[1].password, '[REDACTED]');
  assert.strictEqual(logs[1].username, 'testuser');
  
  assert.strictEqual(logs[3].secret, '[REDACTED]');
  assert.strictEqual(logs[3].reason, 'Invalid password');

  // Check all logs have timestamps
  logs.forEach(log => {
    assert.ok(log.timestamp);
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(log.timestamp));
  });
});

test('Integration - dynamic level changes', () => {
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    level: LogLevel.INFO
  });

  // Initial logging
  logger.debug('Debug 1');  // Filtered
  logger.info('Info 1');    // Logged
  logger.warn('Warn 1');    // Logged

  assert.strictEqual(sink.getLogs().length, 2);

  // Change level
  logger.setLevel(LogLevel.ERROR);
  
  logger.info('Info 2');    // Filtered
  logger.warn('Warn 2');    // Filtered
  logger.error('Error 1');  // Logged

  assert.strictEqual(sink.getLogs().length, 3);
  
  // Verify level getter
  assert.strictEqual(logger.getLevel(), LogLevel.ERROR);
});

test('Integration - sink management', () => {
  const sink1 = new MemorySink();
  const sink2 = new MemorySink();
  const sink3 = new MemorySink();

  const logger = createLogger({
    sinks: [sink1, sink2]
  });

  logger.info('Message 1');
  
  logger.addSink(sink3);
  logger.info('Message 2');
  
  logger.removeSink(sink1);
  logger.info('Message 3');

  assert.strictEqual(sink1.getLogs().length, 2);
  assert.strictEqual(sink2.getLogs().length, 3);
  assert.strictEqual(sink3.getLogs().length, 2);
});

test('Integration - nested child loggers', () => {
  const sink = new MemorySink();
  const rootLogger = createLogger({ sinks: [sink] });

  const appLogger = rootLogger.child({ app: 'myapp', version: '1.0' });
  const moduleLogger = appLogger.child({ module: 'auth' });
  const componentLogger = moduleLogger.child({ component: 'validator' });

  componentLogger.info('Validation started');

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].app, 'myapp');
  assert.strictEqual(logs[0].version, '1.0');
  assert.strictEqual(logs[0].module, 'auth');
  assert.strictEqual(logs[0].component, 'validator');
  assert.strictEqual(logs[0].message, 'Validation started');
});

test('Integration - complex nested redaction', () => {
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    redaction: {
      fields: ['password', 'token', 'key'],
      replacement: '[HIDDEN]',
      deep: true
    }
  });

  logger.info('Complex data structure', {
    user: {
      name: 'Alice',
      credentials: {
        username: 'alice',
        password: 'secret'  // Should be redacted
      },
      tokens: [
        { type: 'access', token: 'abc123' },  // Should be redacted
        { type: 'refresh', token: 'xyz789' }  // Should be redacted
      ]
    },
    config: {
      api: {
        url: 'https://api.example.com',
        key: 'api-key-123'  // Should be redacted
      }
    }
  });

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  
  const log = logs[0];
  assert.strictEqual(log.user.name, 'Alice');
  assert.strictEqual(log.user.credentials.username, 'alice');
  assert.strictEqual(log.user.credentials.password, '[HIDDEN]');
  assert.strictEqual(log.user.tokens[0].type, 'access');
  assert.strictEqual(log.user.tokens[0].token, '[HIDDEN]');
  assert.strictEqual(log.user.tokens[1].token, '[HIDDEN]');
  assert.strictEqual(log.config.api.url, 'https://api.example.com');
  assert.strictEqual(log.config.api.key, '[HIDDEN]');
});
