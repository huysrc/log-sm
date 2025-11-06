import { LogSink, LogEntry } from './types';

/**
 * Console sink that outputs to console (Node/Browser compatible)
 */
export class ConsoleSink implements LogSink {
  private pretty: boolean;

  constructor(pretty: boolean = false) {
    this.pretty = pretty;
  }

  write(entry: LogEntry): void {
    const output = this.pretty 
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    // Use appropriate console method based on level
    switch (entry.level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
      case 'fatal':
        console.error(output);
        break;
      default:
        console.log(output);
    }
  }
}

/**
 * Stream sink for Node.js writable streams
 */
export class StreamSink implements LogSink {
  private stream: any; // NodeJS.WritableStream but avoiding Node types for zero-dep
  private pretty: boolean;

  constructor(stream: any, pretty: boolean = false) {
    this.stream = stream;
    this.pretty = pretty;
  }

  write(entry: LogEntry): void {
    const output = this.pretty 
      ? JSON.stringify(entry, null, 2) + '\n'
      : JSON.stringify(entry) + '\n';
    
    this.stream.write(output);
  }
}

/**
 * Memory sink for testing or buffering logs
 */
export class MemorySink implements LogSink {
  public logs: LogEntry[] = [];

  write(entry: LogEntry): void {
    this.logs.push(entry);
  }

  clear(): void {
    this.logs = [];
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }
}

/**
 * No-op sink that discards all logs
 */
export class NoOpSink implements LogSink {
  write(_entry: LogEntry): void {
    // Intentionally empty
  }
}
