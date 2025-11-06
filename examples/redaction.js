/**
 * Redaction example - hiding sensitive data
 */
const { createLogger } = require('../dist/index.js');

// Create logger with redaction
const logger = createLogger({
  redaction: {
    fields: ['password', 'token', 'ssn', 'creditCard'],
    replacement: '[REDACTED]',
    deep: true
  }
});

// Sensitive fields will be redacted
logger.info('User registration', {
  username: 'john.doe',
  email: 'john@example.com',
  password: 'super-secret-password',  // Will be redacted
  profile: {
    name: 'John Doe',
    ssn: '123-45-6789'  // Will be redacted (deep redaction)
  }
});

// Output will show:
// {"level":"info","timestamp":"...","message":"User registration","username":"john.doe","email":"john@example.com","password":"[REDACTED]","profile":{"name":"John Doe","ssn":"[REDACTED]"}}

logger.info('API request', {
  method: 'POST',
  url: '/api/payment',
  headers: {
    authorization: 'Bearer abc123',  // Not redacted (not in fields list)
    token: 'secret-token'  // Will be redacted
  },
  body: {
    amount: 100,
    creditCard: '4111-1111-1111-1111'  // Will be redacted
  }
});
