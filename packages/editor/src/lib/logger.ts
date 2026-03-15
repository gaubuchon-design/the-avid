// =============================================================================
//  THE AVID — Structured Logging System
// =============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
  timestamp: number;
  sessionId: string;
}

// Generate a unique session ID once per page load
const SESSION_ID =
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Current minimum log level
let currentLevel: LogLevel = LogLevel.INFO;

// ---------------------------------------------------------------------------
//  Transport layer
// ---------------------------------------------------------------------------

type LogTransport = (entry: LogEntry) => void;

const transports: LogTransport[] = [];

/** Built-in console transport. */
const consoleTransport: LogTransport = (entry) => {
  const prefix = `[${entry.category}]`;
  const methods: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
    [LogLevel.DEBUG]: 'debug',
    [LogLevel.INFO]: 'info',
    [LogLevel.WARN]: 'warn',
    [LogLevel.ERROR]: 'error',
    [LogLevel.FATAL]: 'error',
  };
  const method = methods[entry.level] ?? 'info';

  if (entry.error) {
    console[method](prefix, entry.message, entry.data ?? '', entry.error);
  } else if (entry.data) {
    console[method](prefix, entry.message, entry.data);
  } else {
    console[method](prefix, entry.message);
  }
};

// Initialise with the console transport
transports.push(consoleTransport);

// ---------------------------------------------------------------------------
//  Public helpers
// ---------------------------------------------------------------------------

/**
 * Set the minimum log level. Messages below this level are discarded.
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Get the current minimum log level.
 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * Register an additional log transport.
 * @returns An unsubscribe function that removes the transport.
 */
export function addTransport(transport: LogTransport): () => void {
  transports.push(transport);
  return () => {
    const idx = transports.indexOf(transport);
    if (idx >= 0) transports.splice(idx, 1);
  };
}

/**
 * Get the current session ID (stable for the lifetime of the page).
 */
export function getSessionId(): string {
  return SESSION_ID;
}

// ---------------------------------------------------------------------------
//  Internal emit
// ---------------------------------------------------------------------------

function emit(entry: LogEntry): void {
  if (entry.level < currentLevel) return;
  for (const transport of transports) {
    try {
      transport(entry);
    } catch {
      // Transport errors must never break the application
    }
  }
}

// ---------------------------------------------------------------------------
//  Logger class
// ---------------------------------------------------------------------------

export class Logger {
  constructor(private category: string) {}

  debug(message: string, data?: Record<string, unknown>): void {
    emit({
      level: LogLevel.DEBUG,
      category: this.category,
      message,
      data,
      timestamp: Date.now(),
      sessionId: SESSION_ID,
    });
  }

  info(message: string, data?: Record<string, unknown>): void {
    emit({
      level: LogLevel.INFO,
      category: this.category,
      message,
      data,
      timestamp: Date.now(),
      sessionId: SESSION_ID,
    });
  }

  warn(message: string, data?: Record<string, unknown>): void {
    emit({
      level: LogLevel.WARN,
      category: this.category,
      message,
      data,
      timestamp: Date.now(),
      sessionId: SESSION_ID,
    });
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    emit({
      level: LogLevel.ERROR,
      category: this.category,
      message,
      data,
      timestamp: Date.now(),
      sessionId: SESSION_ID,
      error: error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined,
    });
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    emit({
      level: LogLevel.FATAL,
      category: this.category,
      message,
      data,
      timestamp: Date.now(),
      sessionId: SESSION_ID,
      error: error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined,
    });
  }
}

// ---------------------------------------------------------------------------
//  Factory
// ---------------------------------------------------------------------------

/**
 * Create a namespaced logger instance.
 *
 * @example
 * ```ts
 * const log = createLogger('Timeline');
 * log.info('Playhead moved', { tc: '01:02:03:04' });
 * ```
 */
export function createLogger(category: string): Logger {
  return new Logger(category);
}
