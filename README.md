# log-sm

**A zero-dependency, ultra-fast, structured logger for Node, Homey, and Web runtimes.**

Built around a **tiny-first core** with optional **deep redaction**, **pluggable sinks**, and **predictable levels** — ideal for developers who value **clarity**, **lightweight design**, and **control** without heavy abstractions.

[![npm version](https://img.shields.io/npm/v/log-sm.svg)](https://www.npmjs.com/package/log-sm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🚀 **Zero dependencies** - No external packages required
- ⚡ **Ultra-fast** - Minimal overhead, optimized for performance
- 📊 **Structured logging** - JSON output with rich metadata
- 🔌 **Pluggable sinks** - Write logs to console, files, databases, or custom destinations
- 🔒 **Deep redaction** - Automatically hide sensitive data
- 📝 **Predictable log levels** - debug, info, warn, error, fatal
- 🌐 **Multi-runtime** - Works in Node.js, Homey, and browser environments
- 🪶 **Tiny footprint** - Minimal bundle size impact
- 🎯 **Type-safe** - Full TypeScript support

## 📦 Installation

```bash
npm install log-sm
```

## 🚀 Quick Start

```javascript
const { createLogger } = require('log-sm');

const logger = createLogger();

logger.info('Application started');
logger.warn('Something needs attention');
logger.error('An error occurred', { userId: 123, error: 'Not found' });
```

## 📖 Documentation

### Basic Usage

```javascript
const { createLogger, LogLevel } = require('log-sm');

// Create a logger with default settings
const logger = createLogger();

// Log at different levels
logger.debug('Debug information');
logger.info('Informational message');
logger.warn('Warning message');
logger.error('Error message');
logger.fatal('Critical failure');

// Add structured data
logger.info('User login', {
  userId: 'user123',
  ip: '192.168.1.1',
  timestamp: Date.now()
});
```

### Log Levels

Log-sm supports five log levels in order of severity:

- `DEBUG` (0) - Detailed debugging information
- `INFO` (1) - Informational messages
- `WARN` (2) - Warning messages
- `ERROR` (3) - Error messages
- `FATAL` (4) - Critical failures

```javascript
const logger = createLogger({
  level: LogLevel.WARN  // Only log WARN, ERROR, and FATAL
});

logger.debug('Not shown');
logger.info('Not shown');
logger.warn('This is shown');
logger.error('This is shown');
```

### Child Loggers

Create child loggers with additional context:

```javascript
const logger = createLogger();

const requestLogger = logger.child({
  requestId: 'req-12345',
  service: 'api'
});

requestLogger.info('Request received', { path: '/users' });
// Output: {"level":"info","timestamp":"...","message":"Request received","requestId":"req-12345","service":"api","path":"/users"}
```

### Redaction

Protect sensitive data with automatic redaction:

```javascript
const logger = createLogger({
  redaction: {
    fields: ['password', 'token', 'ssn', 'creditCard'],
    replacement: '[REDACTED]',
    deep: true  // Traverse nested objects
  }
});

logger.info('User registration', {
  username: 'john',
  password: 'secret123',  // Will be redacted
  profile: {
    ssn: '123-45-6789'  // Will be redacted (deep)
  }
});
// Output: {"level":"info",...,"username":"john","password":"[REDACTED]","profile":{"ssn":"[REDACTED]"}}
```

### Pluggable Sinks

Direct logs to different destinations:

```javascript
const { createLogger, ConsoleSink, StreamSink, MemorySink } = require('log-sm');
const fs = require('fs');

// Console output (default)
const logger1 = createLogger({
  sinks: [new ConsoleSink()]
});

// Write to a file stream
const fileStream = fs.createWriteStream('/tmp/app.log', { flags: 'a' });
const logger2 = createLogger({
  sinks: [new StreamSink(fileStream)]
});

// In-memory (useful for testing)
const memorySink = new MemorySink();
const logger3 = createLogger({
  sinks: [memorySink]
});

// Multiple sinks
const logger4 = createLogger({
  sinks: [
    new ConsoleSink(),
    new StreamSink(fileStream)
  ]
});
```

### Custom Sinks

Create your own sink by implementing the `LogSink` interface:

```javascript
class DatabaseSink {
  write(entry) {
    // entry contains: level, timestamp, message, and any custom fields
    db.query('INSERT INTO logs VALUES (?)', [JSON.stringify(entry)]);
  }
}

const logger = createLogger({
  sinks: [new DatabaseSink()]
});
```

### Pretty Printing

Enable pretty-printed JSON for development:

```javascript
const logger = createLogger({
  pretty: true  // Formats JSON with indentation
});
```

## 🎯 API Reference

### `createLogger(config?)`

Creates a new logger instance.

**Parameters:**
- `config.level` - Minimum log level (default: `LogLevel.INFO`)
- `config.sinks` - Array of log sinks (default: `[new ConsoleSink()]`)
- `config.redaction` - Redaction configuration
- `config.pretty` - Enable pretty printing (default: `false`)

### Logger Methods

- `logger.debug(message, data?)` - Log debug message
- `logger.info(message, data?)` - Log info message
- `logger.warn(message, data?)` - Log warning message
- `logger.error(message, data?)` - Log error message
- `logger.fatal(message, data?)` - Log fatal message
- `logger.child(context)` - Create child logger with context
- `logger.setLevel(level)` - Change minimum log level
- `logger.getLevel()` - Get current log level
- `logger.addSink(sink)` - Add a new sink
- `logger.removeSink(sink)` - Remove a sink

### Built-in Sinks

- `ConsoleSink` - Output to console (Node/Browser)
- `StreamSink` - Output to Node.js writable stream
- `MemorySink` - Store logs in memory (useful for testing)
- `NoOpSink` - Discard all logs

## 🌐 Runtime Compatibility

### Node.js

```javascript
const { createLogger } = require('log-sm');
const logger = createLogger();
```

### ES Modules

```javascript
import { createLogger } from 'log-sm';
const logger = createLogger();
```

### Browser

```html
<script type="module">
  import { createLogger } from './node_modules/log-sm/dist/index.mjs';
  const logger = createLogger();
  logger.info('Running in browser');
</script>
```

### Homey

```javascript
const { createLogger } = require('log-sm');
const logger = createLogger();
```

## 📊 Performance

Log-sm is designed for minimal overhead:

- Zero dependencies = smaller bundle size
- Optimized hot paths for level checking
- Lazy JSON serialization
- No heavy abstractions

## 🔧 Examples

See the [examples](./examples) directory for more usage patterns:

- [basic-usage.js](./examples/basic-usage.js) - Getting started
- [child-logger.js](./examples/child-logger.js) - Using child loggers
- [redaction.js](./examples/redaction.js) - Redacting sensitive data
- [custom-sink.js](./examples/custom-sink.js) - Creating custom sinks

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Built with a focus on simplicity, performance, and developer experience.
