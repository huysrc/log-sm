/**
 * log-sm: A zero-dependency, ultra-fast, structured logger
 * for Node, Homey, and Web runtimes
 */

export { Logger, createLogger } from './logger';
export { ConsoleSink, StreamSink, MemorySink, NoOpSink } from './sinks';
export { redactFields } from './redaction';
export {
  LogLevel,
  LogLevelName,
  LogEntry,
  LogSink,
  LoggerConfig,
  RedactionOptions,
} from './types';

// Default export
import { createLogger } from './logger';
import { LogLevel } from './types';

export default {
  createLogger,
  LogLevel,
};
