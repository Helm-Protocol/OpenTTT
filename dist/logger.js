"use strict";
// sdk/src/logger.ts — Structured Logging Wrapper
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["DEBUG"] = "DEBUG";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    static instance;
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
    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] [${this.namespace}] ${message}`;
    }
    info(message) {
        console.log(this.formatMessage(LogLevel.INFO, message));
    }
    warn(message) {
        console.warn(this.formatMessage(LogLevel.WARN, message));
    }
    error(message, error) {
        let msg = message;
        if (error) {
            msg += ` | Error: ${error.message}`;
            if (error.stack) {
                msg += `\nStack: ${error.stack}`;
            }
        }
        console.error(this.formatMessage(LogLevel.ERROR, msg));
    }
    debug(message) {
        if (process.env.DEBUG) {
            console.debug(this.formatMessage(LogLevel.DEBUG, message));
        }
    }
}
exports.Logger = Logger;
exports.logger = Logger.getInstance();
