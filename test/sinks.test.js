const { test } = require('node:test');
const assert = require('node:assert');
const { ConsoleSink, StreamSink, MemorySink, NoOpSink } = require('../dist/index.js');

test('MemorySink - stores logs', () => {
  const sink = new MemorySink();
  const entry1 = { level: 'info', timestamp: '2024-01-01T00:00:00Z', message: 'Test 1' };
  const entry2 = { level: 'error', timestamp: '2024-01-01T00:00:01Z', message: 'Test 2' };

  sink.write(entry1);
  sink.write(entry2);

  const logs = sink.getLogs();
  assert.strictEqual(logs.length, 2);
  assert.deepStrictEqual(logs[0], entry1);
  assert.deepStrictEqual(logs[1], entry2);
});

test('MemorySink - clear', () => {
  const sink = new MemorySink();
  sink.write({ level: 'info', timestamp: '2024-01-01T00:00:00Z', message: 'Test' });
  
  assert.strictEqual(sink.getLogs().length, 1);
  
  sink.clear();
  
  assert.strictEqual(sink.getLogs().length, 0);
});

test('MemorySink - returns copy of logs', () => {
  const sink = new MemorySink();
  const entry = { level: 'info', timestamp: '2024-01-01T00:00:00Z', message: 'Test' };
  
  sink.write(entry);
  const logs = sink.getLogs();
  logs.push({ level: 'debug', timestamp: '2024-01-01T00:00:01Z', message: 'Extra' });
  
  // Original logs should not be affected
  assert.strictEqual(sink.getLogs().length, 1);
});

test('NoOpSink - discards all logs', () => {
  const sink = new NoOpSink();
  
  // Should not throw
  sink.write({ level: 'info', timestamp: '2024-01-01T00:00:00Z', message: 'Test' });
  sink.write({ level: 'error', timestamp: '2024-01-01T00:00:01Z', message: 'Test 2' });
  
  // NoOpSink has no way to retrieve logs, so we just verify it doesn't crash
  assert.ok(true);
});

test('StreamSink - writes to stream', () => {
  const chunks = [];
  const mockStream = {
    write(chunk) {
      chunks.push(chunk);
    }
  };

  const sink = new StreamSink(mockStream, false);
  const entry = { level: 'info', timestamp: '2024-01-01T00:00:00Z', message: 'Test' };

  sink.write(entry);

  assert.strictEqual(chunks.length, 1);
  assert.ok(chunks[0].includes('"message":"Test"'));
  assert.ok(chunks[0].endsWith('\n'));
});

test('StreamSink - pretty printing', () => {
  const chunks = [];
  const mockStream = {
    write(chunk) {
      chunks.push(chunk);
    }
  };

  const sink = new StreamSink(mockStream, true);
  const entry = { level: 'info', timestamp: '2024-01-01T00:00:00Z', message: 'Test' };

  sink.write(entry);

  assert.strictEqual(chunks.length, 1);
  // Pretty printed JSON should have newlines
  assert.ok(chunks[0].includes('\n  '));
});

test('ConsoleSink - creates without error', () => {
  // Just verify we can create sinks
  const sink1 = new ConsoleSink();
  const sink2 = new ConsoleSink(true);
  
  assert.ok(sink1);
  assert.ok(sink2);
});
