/**
 * Base error class for TTT SDK errors with storytelling capabilities.
 */
export class TTTBaseError extends Error {
  constructor(
    public readonly message: string,
    public readonly reason: string,
    public readonly fix: string
  ) {
    super(`${message} (Reason: ${reason}. Fix: ${fix})`);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Errors related to SDK or Engine configuration.
 */
export class TTTConfigError extends TTTBaseError {
  constructor(message: string, reason: string, fix: string) {
    super(message, reason, fix);
  }
}

/**
 * Errors related to Signer (PrivateKey, Turnkey, Privy, KMS) acquisition or usage.
 */
export class TTTSignerError extends TTTBaseError {
  constructor(message: string, reason: string, fix: string) {
    super(message, reason, fix);
  }
}

/**
 * Errors related to Network (RPC, ChainID, Connectivity).
 */
export class TTTNetworkError extends TTTBaseError {
  constructor(message: string, reason: string, fix: string) {
    super(message, reason, fix);
  }
}

/**
 * Errors related to Smart Contract interaction (TTT.sol, ProtocolFee.sol).
 */
export class TTTContractError extends TTTBaseError {
  constructor(message: string, reason: string, fix: string) {
    super(message, reason, fix);
  }
}

/**
 * Errors related to NTP/GEO-Sat operator Time Synthesis.
 */
export class TTTTimeSynthesisError extends TTTBaseError {
  constructor(message: string, reason: string, fix: string) {
    super(message, reason, fix);
  }
}

/**
 * Errors related to Dynamic Fee Engine or Protocol Fee collection.
 */
export class TTTFeeError extends TTTBaseError {
  constructor(message: string, reason: string, fix: string) {
    super(message, reason, fix);
  }
}
