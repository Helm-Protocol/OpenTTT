"use strict";
// sdk/src/logger.ts — Structured Logging Wrapper
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["SILENT"] = 4] = "SILENT";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
const LOG_LEVEL_NAMES = {
    [LogLevel.DEBUG]: "DEBUG",
    [LogLevel.INFO]: "INFO",
    [LogLevel.WARN]: "WARN",
    [LogLevel.ERROR]: "ERROR",
    [LogLevel.SILENT]: "SILENT",
};
/**
 * Default log handler that writes to the console.
 */
const defaultHandler = (level, message) => {
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
class Logger {
    static instance;
    static currentLevel = LogLevel.INFO;
    static currentHandler = defaultHandler;
    namespace;
    constructor(namespace = "TTT-SDK") {
        this.namespace = namespace;
    }
    static getInstance(namespace) {
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
    static configure(config) {
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
    static silent() {
        Logger.currentLevel = LogLevel.SILENT;
    }
    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${LOG_LEVEL_NAMES[level]}] [${this.namespace}] ${message}`;
    }
    emit(level, message) {
        if (level < Logger.currentLevel)
            return;
        const formatted = this.formatMessage(level, message);
        Logger.currentHandler(level, formatted);
    }
    info(message) {
        this.emit(LogLevel.INFO, message);
    }
    warn(message) {
        this.emit(LogLevel.WARN, message);
    }
    error(message, error) {
        let msg = message;
        if (error) {
            msg += ` | Error: ${error.message}`;
            if (error.stack) {
                msg += `\nStack: ${error.stack}`;
            }
        }
        this.emit(LogLevel.ERROR, msg);
    }
    debug(message) {
        this.emit(LogLevel.DEBUG, message);
    }
}
exports.Logger = Logger;
exports.logger = Logger.getInstance();
