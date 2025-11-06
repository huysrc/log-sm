/**
 * Custom sink example - creating your own output destination
 */
const { createLogger, MemorySink, StreamSink } = require('../dist/index.js');
const fs = require('fs');

// Example 1: Using MemorySink for testing
const memorySink = new MemorySink();
const testLogger = createLogger({ sinks: [memorySink] });

testLogger.info('Test message 1');
testLogger.info('Test message 2');

console.log('Captured logs:', memorySink.getLogs());

// Example 2: Using StreamSink to write to file
const fileStream = fs.createWriteStream('/tmp/app.log', { flags: 'a' });
const fileSink = new StreamSink(fileStream);
const fileLogger = createLogger({ sinks: [fileSink] });

fileLogger.info('This goes to file');
fileLogger.error('Error logged to file');

// Example 3: Custom sink implementation
class DatabaseSink {
  constructor(db) {
    this.db = db;
  }

  write(entry) {
    // Simulate writing to database
    console.log('Writing to database:', entry.message);
    // In real implementation:
    // this.db.query('INSERT INTO logs ...', entry);
  }
}

// Example 4: Multiple sinks (console + file + custom)
class AlertSink {
  write(entry) {
    if (entry.level === 'fatal' || entry.level === 'error') {
      console.log('🚨 ALERT:', entry.message);
      // In real implementation, send to alerting system
    }
  }
}

const multiLogger = createLogger({
  sinks: [
    new StreamSink(process.stdout),
    new StreamSink(fileStream),
    new AlertSink()
  ]
});

multiLogger.info('Normal operation');
multiLogger.error('Something went wrong!');  // Will trigger alert
multiLogger.fatal('System failure!');  // Will trigger alert

// Clean up
fileStream.end();
