export declare enum LogLevel {
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR",
    DEBUG = "DEBUG"
}
export declare class Logger {
    private static instance;
    private namespace;
    private constructor();
    static getInstance(namespace?: string): Logger;
    private formatMessage;
    info(message: string): void;
    warn(message: string): void;
    error(message: string, error?: Error): void;
    debug(message: string): void;
}
export declare const logger: Logger;
