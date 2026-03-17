export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SILENT = 4
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
export declare class Logger {
    private static instance;
    private static currentLevel;
    private static currentHandler;
    private namespace;
    private constructor();
    static getInstance(namespace?: string): Logger;
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
    static configure(config: LoggerConfig): void;
    /**
     * Convenience method to suppress all log output.
     * Equivalent to `Logger.configure({ level: LogLevel.SILENT })`.
     */
    static silent(): void;
    private formatMessage;
    private emit;
    info(message: string): void;
    warn(message: string): void;
    error(message: string, error?: Error): void;
    debug(message: string): void;
}
export declare const logger: Logger;
export {};
