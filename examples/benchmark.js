/**
 * Performance benchmark
 */
const { createLogger, LogLevel, NoOpSink } = require('../dist/index.js');

// Use NoOpSink to isolate logger performance from I/O
const logger = createLogger({
  sinks: [new NoOpSink()],
  level: LogLevel.DEBUG
});

const iterations = 100000;

// Benchmark simple logging
console.log(`Benchmarking ${iterations} simple log calls...`);
const start1 = Date.now();
for (let i = 0; i < iterations; i++) {
  logger.info('Simple message');
}
const end1 = Date.now();
const duration1 = end1 - start1;
console.log(`Time: ${duration1}ms`);
console.log(`Rate: ${Math.round(iterations / (duration1 / 1000))} ops/sec`);
console.log(`Per-call: ${(duration1 / iterations).toFixed(4)}ms`);

console.log();

// Benchmark structured logging
console.log(`Benchmarking ${iterations} structured log calls...`);
const start2 = Date.now();
for (let i = 0; i < iterations; i++) {
  logger.info('Structured message', {
    userId: i,
    action: 'test',
    timestamp: Date.now(),
    metadata: { key: 'value' }
  });
}
const end2 = Date.now();
const duration2 = end2 - start2;
console.log(`Time: ${duration2}ms`);
console.log(`Rate: ${Math.round(iterations / (duration2 / 1000))} ops/sec`);
console.log(`Per-call: ${(duration2 / iterations).toFixed(4)}ms`);

console.log();

// Benchmark with level filtering (messages not logged)
const filteredLogger = createLogger({
  sinks: [new NoOpSink()],
  level: LogLevel.ERROR
});

console.log(`Benchmarking ${iterations} filtered (skipped) log calls...`);
const start3 = Date.now();
for (let i = 0; i < iterations; i++) {
  filteredLogger.debug('This is skipped');
}
const end3 = Date.now();
const duration3 = end3 - start3;
console.log(`Time: ${duration3}ms`);
console.log(`Rate: ${Math.round(iterations / (duration3 / 1000))} ops/sec`);
console.log(`Per-call: ${(duration3 / iterations).toFixed(4)}ms`);
console.log('(Should be near-zero overhead due to level filtering)');
