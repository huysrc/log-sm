import { RedactionOptions } from './types';

/**
 * Deep clone and redact sensitive fields from an object
 */
export function redactFields(
  obj: any,
  options: RedactionOptions
): any {
  if (!options.fields || options.fields.length === 0) {
    return obj;
  }

  const replacement = options.replacement ?? '[REDACTED]';
  
  // Handle primitives
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => 
      options.deep ? redactFields(item, options) : item
    );
  }

  // Clone the object
  const result: any = {};

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;

    const value = obj[key];
    const shouldRedact = options.fields.some(field => matchesField(key, field));

    if (shouldRedact) {
      result[key] = replacement;
    } else if (options.deep && value !== null && typeof value === 'object') {
      result[key] = redactFields(value, options);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Check if a key matches a field pattern (supports nested paths)
 */
function matchesField(key: string, field: string): boolean {
  // Simple exact match
  if (key === field) {
    return true;
  }

  // Check if it's part of a nested path
  const parts = field.split('.');
  return parts[parts.length - 1] === key;
}

/**
 * Apply redaction to nested paths like "user.password"
 */
export function redactNestedFields(
  obj: any,
  path: string,
  replacement: string
): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const parts = path.split('.');
  const key = parts[0];

  if (parts.length === 1) {
    // Last part of the path
    if (obj.hasOwnProperty(key)) {
      const result = Array.isArray(obj) ? [...obj] : { ...obj };
      result[key] = replacement;
      return result;
    }
    return obj;
  }

  // Recurse into nested object
  if (obj.hasOwnProperty(key)) {
    const result = Array.isArray(obj) ? [...obj] : { ...obj };
    result[key] = redactNestedFields(
      obj[key],
      parts.slice(1).join('.'),
      replacement
    );
    return result;
  }

  return obj;
}
