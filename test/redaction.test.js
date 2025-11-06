const { test } = require('node:test');
const assert = require('node:assert');
const { createLogger, LogLevel, MemorySink } = require('../dist/index.js');

test('Redaction - simple field redaction', () => {
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    redaction: {
      fields: ['password', 'secret'],
      replacement: '[REDACTED]'
    }
  });

  logger.info('User login', {
    username: 'john',
    password: 'super-secret',
    secret: 'api-key-123'
  });

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].username, 'john');
  assert.strictEqual(logs[0].password, '[REDACTED]');
  assert.strictEqual(logs[0].secret, '[REDACTED]');
});

test('Redaction - deep redaction', () => {
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    redaction: {
      fields: ['password', 'token'],
      replacement: '[HIDDEN]',
      deep: true
    }
  });

  logger.info('Request', {
    user: {
      name: 'Alice',
      password: 'secret123'
    },
    auth: {
      token: 'bearer-xyz'
    }
  });

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].user.name, 'Alice');
  assert.strictEqual(logs[0].user.password, '[HIDDEN]');
  assert.strictEqual(logs[0].auth.token, '[HIDDEN]');
});

test('Redaction - array handling', () => {
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    redaction: {
      fields: ['password'],
      deep: true
    }
  });

  logger.info('Multiple users', {
    users: [
      { name: 'Alice', password: 'pass1' },
      { name: 'Bob', password: 'pass2' }
    ]
  });

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].users[0].name, 'Alice');
  assert.strictEqual(logs[0].users[0].password, '[REDACTED]');
  assert.strictEqual(logs[0].users[1].name, 'Bob');
  assert.strictEqual(logs[0].users[1].password, '[REDACTED]');
});

test('Redaction - without deep option', () => {
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    redaction: {
      fields: ['password'],
      deep: false
    }
  });

  logger.info('User', {
    password: 'top-level-secret',
    nested: {
      password: 'nested-secret'
    }
  });

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].password, '[REDACTED]');
  // Nested password should NOT be redacted when deep=false
  assert.strictEqual(logs[0].nested.password, 'nested-secret');
});

test('Redaction - default replacement', () => {
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    redaction: {
      fields: ['apiKey']
    }
  });

  logger.info('API call', { apiKey: 'secret-key' });

  const logs = sink.getLogs();
  assert.strictEqual(logs[0].apiKey, '[REDACTED]');
});

test('Redaction - no redaction when no fields specified', () => {
  const sink = new MemorySink();
  const logger = createLogger({
    sinks: [sink],
    redaction: {}
  });

  logger.info('Data', { password: 'visible' });

  const logs = sink.getLogs();
  assert.strictEqual(logs[0].password, 'visible');
});
