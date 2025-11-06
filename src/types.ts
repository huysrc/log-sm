/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

/**
 * String representation of log levels
 */
export type LogLevelName = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Structured log entry
 */
export interface LogEntry {
  level: LogLevelName;
  timestamp: string;
  message: string;
  [key: string]: any;
}

/**
 * Sink interface for pluggable output destinations
 */
export interface LogSink {
  write(entry: LogEntry): void;
}

/**
 * Redaction options for sensitive data
 */
export interface RedactionOptions {
  /**
   * List of field names to redact (supports nested paths with dots)
   */
  fields?: string[];
  /**
   * Replacement text for redacted values
   */
  replacement?: string;
  /**
   * Whether to perform deep redaction (traverse all nested objects)
   */
  deep?: boolean;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /**
   * Minimum log level to output
   */
  level?: LogLevel;
  /**
   * Pluggable sinks for output
   */
  sinks?: LogSink[];
  /**
   * Redaction configuration
   */
  redaction?: RedactionOptions;
  /**
   * Enable/disable pretty printing (default: false for performance)
   */
  pretty?: boolean;
}
