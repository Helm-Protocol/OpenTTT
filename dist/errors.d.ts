/**
 * Base error class for TTT SDK errors with storytelling capabilities.
 */
export declare class TTTBaseError extends Error {
    readonly message: string;
    readonly reason: string;
    readonly fix: string;
    constructor(message: string, reason: string, fix: string);
}
/**
 * Errors related to SDK or Engine configuration.
 */
export declare class TTTConfigError extends TTTBaseError {
    constructor(message: string, reason: string, fix: string);
}
/**
 * Errors related to Signer (PrivateKey, Turnkey, Privy, KMS) acquisition or usage.
 */
export declare class TTTSignerError extends TTTBaseError {
    constructor(message: string, reason: string, fix: string);
}
/**
 * Errors related to Network (RPC, ChainID, Connectivity).
 */
export declare class TTTNetworkError extends TTTBaseError {
    constructor(message: string, reason: string, fix: string);
}
/**
 * Errors related to Smart Contract interaction (TTT.sol, ProtocolFee.sol).
 */
export declare class TTTContractError extends TTTBaseError {
    constructor(message: string, reason: string, fix: string);
}
/**
 * Errors related to NTP/KTSat Time Synthesis.
 */
export declare class TTTTimeSynthesisError extends TTTBaseError {
    constructor(message: string, reason: string, fix: string);
}
/**
 * Errors related to Dynamic Fee Engine or Protocol Fee collection.
 */
export declare class TTTFeeError extends TTTBaseError {
    constructor(message: string, reason: string, fix: string);
}
