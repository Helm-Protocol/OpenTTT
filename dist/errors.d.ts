/**
 * Structured error codes for OpenTTT SDK.
 * TTT_E001-E009: Config, TTT_E010-E019: Signer, TTT_E020-E029: Network,
 * TTT_E030-E039: Contract, TTT_E040-E049: TimeSynthesis, TTT_E050-E059: Fee
 */
export declare const ERROR_CODES: {
    readonly CONFIG_MISSING_SIGNER: "TTT_E001";
    readonly CONFIG_INVALID: "TTT_E002";
    readonly SIGNER_NOT_INITIALIZED: "TTT_E010";
    readonly SIGNER_MISSING_KEY: "TTT_E011";
    readonly SIGNER_INVALID_KEY_FORMAT: "TTT_E012";
    readonly SIGNER_NO_EIP712: "TTT_E013";
    readonly SIGNER_PRIVY_NOT_IMPLEMENTED: "TTT_E014";
    readonly SIGNER_KMS_AWS_INIT_FAILED: "TTT_E015";
    readonly SIGNER_KMS_GCP_MISSING_FIELDS: "TTT_E016";
    readonly SIGNER_KMS_GCP_INIT_FAILED: "TTT_E017";
    readonly SIGNER_KMS_UNSUPPORTED_PROVIDER: "TTT_E018";
    readonly SIGNER_UNSUPPORTED_TYPE: "TTT_E019";
    readonly NETWORK_INVALID_RPC: "TTT_E020";
    readonly NETWORK_CONNECTION_FAILED: "TTT_E021";
    readonly NETWORK_CANNOT_RECONNECT: "TTT_E022";
    readonly NETWORK_RECONNECTION_EXHAUSTED: "TTT_E023";
    readonly NETWORK_TX_DROPPED: "TTT_E024";
    readonly NETWORK_PROVIDER_NOT_CONNECTED: "TTT_E025";
    readonly NETWORK_BLOCK_NOT_FOUND: "TTT_E026";
    readonly CONTRACT_SIGNER_NOT_CONNECTED: "TTT_E030";
    readonly CONTRACT_INVALID_ADDRESS: "TTT_E031";
    readonly CONTRACT_NOT_ATTACHED: "TTT_E032";
    readonly CONTRACT_BURN_FAILED: "TTT_E033";
    readonly CONTRACT_MINT_FAILED: "TTT_E034";
    readonly CONTRACT_BALANCE_QUERY_FAILED: "TTT_E035";
    readonly CONTRACT_SWAP_FAILED: "TTT_E036";
    readonly CONTRACT_INVALID_KEY_FORMAT: "TTT_E037";
    readonly TIME_SYNTHESIS_INTEGRITY_FAILED: "TTT_E040";
    readonly TIME_SYNTHESIS_INSUFFICIENT_CONFIDENCE: "TTT_E041";
    readonly TIME_SYNTHESIS_SOURCE_NOT_FOUND: "TTT_E042";
    readonly TIME_SYNTHESIS_ALL_SOURCES_FAILED: "TTT_E043";
    readonly TIME_SYNTHESIS_POT_ALL_FAILED: "TTT_E044";
    readonly TIME_SYNTHESIS_SELF_VERIFY_FAILED: "TTT_E045";
    readonly FEE_CALCULATION_FAILED: "TTT_E050";
};
export type TTTErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
/**
 * Base error class for TTT SDK errors with storytelling capabilities.
 */
export declare class TTTBaseError extends Error {
    readonly code: TTTErrorCode;
    constructor(codeOrMessage: TTTErrorCode | string, messageOrReason: string, reasonOrFix: string, fix?: string);
}
/**
 * Errors related to SDK or Engine configuration.
 */
export declare class TTTConfigError extends TTTBaseError {
}
export declare class TTTSignerError extends TTTBaseError {
}
export declare class TTTNetworkError extends TTTBaseError {
}
export declare class TTTContractError extends TTTBaseError {
}
export declare class TTTTimeSynthesisError extends TTTBaseError {
}
export declare class TTTFeeError extends TTTBaseError {
}
