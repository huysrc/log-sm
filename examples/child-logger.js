/**
 * Child logger example - adding context
 */
const { createLogger } = require('../dist/index.js');

const logger = createLogger();

// Create a child logger with request context
const requestLogger = logger.child({
  requestId: 'req-12345',
  service: 'api',
  version: '1.0.0'
});

// All logs from child will include the context
requestLogger.info('Request received', { path: '/users', method: 'GET' });
requestLogger.info('Database query', { query: 'SELECT * FROM users', duration: 45 });
requestLogger.info('Response sent', { status: 200, duration: 123 });

// Create nested child loggers
const dbLogger = requestLogger.child({
  component: 'database'
});

dbLogger.info('Connection opened');
dbLogger.warn('Slow query detected', { duration: 5000 });
