// sdk/src/logger.ts — Structured Logging Wrapper

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Custom log handler function type.
 * @param level - The severity level of the log message.
 * @param message - The formatted log message string.
 */
export type LogHandler = (level: LogLevel, message: string) => void;

interface LoggerConfig {
  level?: LogLevel;
  handler?: LogHandler;
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.SILENT]: "SILENT",
};

/**
 * Default log handler that writes to the console.
 */
const defaultHandler: LogHandler = (level: LogLevel, message: string) => {
  switch (level) {
    case LogLevel.DEBUG:
      console.debug(message);
      break;
    case LogLevel.INFO:
      console.log(message);
      break;
    case LogLevel.WARN:
      console.warn(message);
      break;
    case LogLevel.ERROR:
      console.error(message);
      break;
  }
};

export class Logger {
  private static instance: Logger;
  private static currentLevel: LogLevel = LogLevel.INFO;
  private static currentHandler: LogHandler = defaultHandler;
  private namespace: string;

  private constructor(namespace: string = "TTT-SDK") {
    this.namespace = namespace;
  }

  public static getInstance(namespace?: string): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(namespace);
    }
    return Logger.instance;
  }

  /**
   * Configure the global logger level and/or handler.
   * @param config - Configuration object with optional level and handler.
   *
   * @example
   * ```typescript
   * Logger.configure({ level: LogLevel.DEBUG });
   * Logger.configure({ handler: (level, msg) => myLogService.send(msg) });
   * Logger.configure({ level: LogLevel.WARN, handler: customHandler });
   * ```
   */
  public static configure(config: LoggerConfig): void {
    if (config.level !== undefined) {
      Logger.currentLevel = config.level;
    }
    if (config.handler !== undefined) {
      Logger.currentHandler = config.handler;
    }
  }

  /**
   * Convenience method to suppress all log output.
   * Equivalent to `Logger.configure({ level: LogLevel.SILENT })`.
   */
  public static silent(): void {
    Logger.currentLevel = LogLevel.SILENT;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${LOG_LEVEL_NAMES[level]}] [${this.namespace}] ${message}`;
  }

  private emit(level: LogLevel, message: string): void {
    if (level < Logger.currentLevel) return;
    const formatted = this.formatMessage(level, message);
    Logger.currentHandler(level, formatted);
  }

  public info(message: string): void {
    this.emit(LogLevel.INFO, message);
  }

  public warn(message: string): void {
    this.emit(LogLevel.WARN, message);
  }

  public error(message: string, error?: Error): void {
    let msg = message;
    if (error) {
      msg += ` | Error: ${error.message}`;
      if (error.stack) {
        msg += `\nStack: ${error.stack}`;
      }
    }
    this.emit(LogLevel.ERROR, msg);
  }

  public debug(message: string): void {
    this.emit(LogLevel.DEBUG, message);
  }
}

export const logger = Logger.getInstance();
