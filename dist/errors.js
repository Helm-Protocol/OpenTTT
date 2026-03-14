"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTTFeeError = exports.TTTTimeSynthesisError = exports.TTTContractError = exports.TTTNetworkError = exports.TTTSignerError = exports.TTTConfigError = exports.TTTBaseError = void 0;
/**
 * Base error class for TTT SDK errors with storytelling capabilities.
 */
class TTTBaseError extends Error {
    message;
    reason;
    fix;
    constructor(message, reason, fix) {
        super(`${message} (Reason: ${reason}. Fix: ${fix})`);
        this.message = message;
        this.reason = reason;
        this.fix = fix;
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.TTTBaseError = TTTBaseError;
/**
 * Errors related to SDK or Engine configuration.
 */
class TTTConfigError extends TTTBaseError {
    constructor(message, reason, fix) {
        super(message, reason, fix);
    }
}
exports.TTTConfigError = TTTConfigError;
/**
 * Errors related to Signer (PrivateKey, Turnkey, Privy, KMS) acquisition or usage.
 */
class TTTSignerError extends TTTBaseError {
    constructor(message, reason, fix) {
        super(message, reason, fix);
    }
}
exports.TTTSignerError = TTTSignerError;
/**
 * Errors related to Network (RPC, ChainID, Connectivity).
 */
class TTTNetworkError extends TTTBaseError {
    constructor(message, reason, fix) {
        super(message, reason, fix);
    }
}
exports.TTTNetworkError = TTTNetworkError;
/**
 * Errors related to Smart Contract interaction (TTT.sol, ProtocolFee.sol).
 */
class TTTContractError extends TTTBaseError {
    constructor(message, reason, fix) {
        super(message, reason, fix);
    }
}
exports.TTTContractError = TTTContractError;
/**
 * Errors related to NTP/KTSat Time Synthesis.
 */
class TTTTimeSynthesisError extends TTTBaseError {
    constructor(message, reason, fix) {
        super(message, reason, fix);
    }
}
exports.TTTTimeSynthesisError = TTTTimeSynthesisError;
/**
 * Errors related to Dynamic Fee Engine or Protocol Fee collection.
 */
class TTTFeeError extends TTTBaseError {
    constructor(message, reason, fix) {
        super(message, reason, fix);
    }
}
exports.TTTFeeError = TTTFeeError;
