/**
 * Structured error codes for OpenTTT SDK.
 * TTT_E001-E009: Config, TTT_E010-E019: Signer, TTT_E020-E029: Network,
 * TTT_E030-E039: Contract, TTT_E040-E049: TimeSynthesis, TTT_E050-E059: Fee
 */
export const ERROR_CODES = {
  // Config errors (TTT_E001-E009)
  CONFIG_MISSING_SIGNER: "TTT_E001",
  CONFIG_INVALID: "TTT_E002",

  // Signer errors (TTT_E010-E019)
  SIGNER_NOT_INITIALIZED: "TTT_E010",
  SIGNER_MISSING_KEY: "TTT_E011",
  SIGNER_INVALID_KEY_FORMAT: "TTT_E012",
  SIGNER_NO_EIP712: "TTT_E013",
  SIGNER_PRIVY_NOT_IMPLEMENTED: "TTT_E014",
  SIGNER_KMS_AWS_INIT_FAILED: "TTT_E015",
  SIGNER_KMS_GCP_MISSING_FIELDS: "TTT_E016",
  SIGNER_KMS_GCP_INIT_FAILED: "TTT_E017",
  SIGNER_KMS_UNSUPPORTED_PROVIDER: "TTT_E018",
  SIGNER_UNSUPPORTED_TYPE: "TTT_E019",

  // Network errors (TTT_E020-E029)
  NETWORK_INVALID_RPC: "TTT_E020",
  NETWORK_CONNECTION_FAILED: "TTT_E021",
  NETWORK_CANNOT_RECONNECT: "TTT_E022",
  NETWORK_RECONNECTION_EXHAUSTED: "TTT_E023",
  NETWORK_TX_DROPPED: "TTT_E024",
  NETWORK_PROVIDER_NOT_CONNECTED: "TTT_E025",
  NETWORK_BLOCK_NOT_FOUND: "TTT_E026",

  // Contract errors (TTT_E030-E039)
  CONTRACT_SIGNER_NOT_CONNECTED: "TTT_E030",
  CONTRACT_INVALID_ADDRESS: "TTT_E031",
  CONTRACT_NOT_ATTACHED: "TTT_E032",
  CONTRACT_BURN_FAILED: "TTT_E033",
  CONTRACT_MINT_FAILED: "TTT_E034",
  CONTRACT_BALANCE_QUERY_FAILED: "TTT_E035",
  CONTRACT_SWAP_FAILED: "TTT_E036",
  CONTRACT_INVALID_KEY_FORMAT: "TTT_E037",

  // TimeSynthesis errors (TTT_E040-E049)
  TIME_SYNTHESIS_INTEGRITY_FAILED: "TTT_E040",
  TIME_SYNTHESIS_INSUFFICIENT_CONFIDENCE: "TTT_E041",
  TIME_SYNTHESIS_SOURCE_NOT_FOUND: "TTT_E042",
  TIME_SYNTHESIS_ALL_SOURCES_FAILED: "TTT_E043",
  TIME_SYNTHESIS_POT_ALL_FAILED: "TTT_E044",
  TIME_SYNTHESIS_SELF_VERIFY_FAILED: "TTT_E045",

  // Fee errors (TTT_E050-E059)
  FEE_CALCULATION_FAILED: "TTT_E050",
} as const;

export type TTTErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Base error class for TTT SDK errors with storytelling capabilities.
 */
export class TTTBaseError extends Error {
  public readonly code: TTTErrorCode;

  constructor(
    codeOrMessage: TTTErrorCode | string,
    messageOrReason: string,
    reasonOrFix: string,
    fix?: string
  ) {
    // Support both old (message, reason, fix) and new (code, message, reason, fix) signatures
    const hasCode = fix !== undefined;
    const code = hasCode ? codeOrMessage as TTTErrorCode : "TTT_E002" as TTTErrorCode;
    const message = hasCode ? messageOrReason : codeOrMessage as string;
    const reason = hasCode ? reasonOrFix : messageOrReason;
    const fixStr = hasCode ? fix! : reasonOrFix;
    super(`[${code}] ${message} (Reason: ${reason}. Fix: ${fixStr})`);
    this.code = code;
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Errors related to SDK or Engine configuration.
 */
export class TTTConfigError extends TTTBaseError {}

export class TTTSignerError extends TTTBaseError {}

export class TTTNetworkError extends TTTBaseError {}

export class TTTContractError extends TTTBaseError {}

export class TTTTimeSynthesisError extends TTTBaseError {}

export class TTTFeeError extends TTTBaseError {}
