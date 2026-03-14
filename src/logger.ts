// sdk/src/logger.ts — Structured Logging Wrapper

export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
}

export class Logger {
  private static instance: Logger;
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

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${this.namespace}] ${message}`;
  }

  public info(message: string): void {
    console.log(this.formatMessage(LogLevel.INFO, message));
  }

  public warn(message: string): void {
    console.warn(this.formatMessage(LogLevel.WARN, message));
  }

  public error(message: string, error?: Error): void {
    let msg = message;
    if (error) {
      msg += ` | Error: ${error.message}`;
      if (error.stack) {
        msg += `\nStack: ${error.stack}`;
      }
    }
    console.error(this.formatMessage(LogLevel.ERROR, msg));
  }

  public debug(message: string): void {
    if (process.env.DEBUG) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message));
    }
  }
}

export const logger = Logger.getInstance();
