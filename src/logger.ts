import { LogLevel, LogLevelName, LogEntry, LogSink, LoggerConfig } from './types';
import { redactFields } from './redaction';
import { ConsoleSink } from './sinks';

/**
 * Ultra-fast structured logger with zero dependencies
 */
export class Logger {
  private level: LogLevel;
  private sinks: LogSink[];
  private redactionOptions?: LoggerConfig['redaction'];
  private context: Record<string, any>;

  constructor(config: LoggerConfig = {}, context: Record<string, any> = {}) {
    this.level = config.level ?? LogLevel.INFO;
    this.sinks = config.sinks ?? [new ConsoleSink(config.pretty ?? false)];
    this.redactionOptions = config.redaction;
    this.context = context;
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, 'debug', message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.INFO, 'info', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.WARN, 'warn', message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.ERROR, 'error', message, data);
  }

  /**
   * Log a fatal error message
   */
  fatal(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.FATAL, 'fatal', message, data);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    // Merge parent context with new context
    const mergedContext = { ...this.context, ...context };
    
    return new Logger({
      level: this.level,
      sinks: this.sinks,
      redaction: this.redactionOptions,
    }, mergedContext);
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Add a sink
   */
  addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  /**
   * Remove a sink
   */
  removeSink(sink: LogSink): void {
    const index = this.sinks.indexOf(sink);
    if (index > -1) {
      this.sinks.splice(index, 1);
    }
  }

  /**
   * Internal logging method
   */
  private log(
    levelNum: LogLevel,
    levelName: LogLevelName,
    message: string,
    data?: Record<string, any>
  ): void {
    // Skip if below minimum level
    if (levelNum < this.level) {
      return;
    }

    // Create log entry with context
    const entry: LogEntry = {
      level: levelName,
      timestamp: new Date().toISOString(),
      message,
      ...this.context,
      ...data,
    };

    // Apply redaction if configured
    const finalEntry = this.redactionOptions
      ? redactFields(entry, this.redactionOptions)
      : entry;

    // Write to all sinks
    for (const sink of this.sinks) {
      sink.write(finalEntry);
    }
  }
}

/**
 * Create a new logger instance
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}
