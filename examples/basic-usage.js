/**
 * Basic usage example
 */
const { createLogger, LogLevel } = require('../dist/index.js');

// Create a logger with default settings
const logger = createLogger();

// Log at different levels
logger.debug('This is a debug message');
logger.info('Application started');
logger.warn('This is a warning');
logger.error('An error occurred');
logger.fatal('Critical system failure');

// Log with structured data
logger.info('User login', {
  userId: 'user123',
  ip: '192.168.1.1',
  timestamp: Date.now()
});

// Create a logger with custom level
const prodLogger = createLogger({
  level: LogLevel.WARN
});

prodLogger.debug('Not shown'); // Won't be logged
prodLogger.info('Not shown');  // Won't be logged
prodLogger.warn('This will be shown');
prodLogger.error('This will be shown');
