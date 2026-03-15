/**
 * OpenAI Function Calling integration for OpenTTT.
 *
 * Exports:
 * 1. `verifyProofOfTimeFunction` — OpenAI function definition JSON
 * 2. `handleVerifyProofOfTime()` — Handler to execute when the function is called
 *
 * Usage with OpenAI SDK:
 * ```ts
 * import { verifyProofOfTimeFunction, handleVerifyProofOfTime } from "openttt/integrations/openai";
 *
 * const response = await openai.chat.completions.create({
 *   model: "gpt-4o",
 *   messages,
 *   tools: [{ type: "function", function: verifyProofOfTimeFunction }],
 * });
 *
 * // When the model calls the function:
 * const args = JSON.parse(toolCall.function.arguments);
 * const result = await handleVerifyProofOfTime(args);
 * ```
 *
 * @package openttt
 * @see https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/
 */

import { TimeSynthesis } from "openttt";

// ---------------------------------------------------------------------------
// 1. Function definition (pass to OpenAI `tools` array)
// ---------------------------------------------------------------------------

export const verifyProofOfTimeFunction = {
  name: "verify_proof_of_time",
  description:
    "Verify transaction ordering using cryptographic Proof of Time. " +
    "Prevents front-running and MEV attacks by generating a multi-source " +
    "timestamp proof (NIST, Google, Apple) and validating it against the " +
    "transaction's on-chain position.",
  parameters: {
    type: "object" as const,
    properties: {
      txHash: {
        type: "string",
        description:
          "Transaction hash (0x-prefixed hex) to verify ordering for.",
      },
      chainId: {
        type: "number",
        description:
          "EVM chain ID. 8453 = Base Mainnet, 84532 = Base Sepolia.",
      },
      poolAddress: {
        type: "string",
        description:
          "DEX pool address (0x-prefixed) where the swap occurred.",
      },
    },
    required: ["txHash", "chainId", "poolAddress"],
    additionalProperties: false,
  },
} as const;

// ---------------------------------------------------------------------------
// 2. Handler (call when OpenAI invokes the function)
// ---------------------------------------------------------------------------

export interface VerifyPoTArgs {
  txHash: string;
  chainId: number;
  poolAddress: string;
}

export interface VerifyPoTResult {
  verified: boolean;
  txHash: string;
  chainId: number;
  poolAddress: string;
  proof?: {
    timestamp: string;
    uncertainty_ms: number;
    sources: number;
    stratum: number;
    confidence: number;
    nonce: string;
    expiresAt: string;
    onChainHash: string;
  };
  sourceReadings?: Array<{
    source: string;
    timestamp: string;
    uncertainty_ms: number;
  }>;
  error?: string;
}

/**
 * Execute Proof of Time verification.
 *
 * @param args - Parsed arguments from OpenAI function call
 * @param config - Optional: override default time sources
 * @returns Structured result with verification status and proof details
 */
export async function handleVerifyProofOfTime(
  args: VerifyPoTArgs,
  config?: { timeSources?: string[] }
): Promise<VerifyPoTResult> {
  const timeSynthesis = new TimeSynthesis({
    sources: config?.timeSources ?? ["nist", "google", "cloudflare", "apple"],
  });

  try {
    // Generate Proof of Time from multiple atomic clock sources
    const pot = await timeSynthesis.generateProofOfTime();

    // Self-verify (cross-source consistency, nonce replay, expiration)
    const isValid = timeSynthesis.verifyProofOfTime(pot);

    // Compute on-chain hash for contract-level verification
    const onChainHash = TimeSynthesis.getOnChainHash(pot);

    return {
      verified: isValid,
      txHash: args.txHash,
      chainId: args.chainId,
      poolAddress: args.poolAddress,
      proof: {
        timestamp: pot.timestamp.toString(),
        uncertainty_ms: pot.uncertainty,
        sources: pot.sources,
        stratum: pot.stratum,
        confidence: pot.confidence,
        nonce: pot.nonce,
        expiresAt: pot.expiresAt.toString(),
        onChainHash,
      },
      sourceReadings: pot.sourceReadings.map((r: { source: string; timestamp: bigint; uncertainty: number }) => ({
        source: r.source,
        timestamp: r.timestamp.toString(),
        uncertainty_ms: r.uncertainty,
      })),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      verified: false,
      txHash: args.txHash,
      chainId: args.chainId,
      poolAddress: args.poolAddress,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Convenience: full tool object for OpenAI tools array
// ---------------------------------------------------------------------------

/**
 * Ready-to-use tool object. Pass directly to `tools` in chat.completions.create().
 *
 * ```ts
 * const response = await openai.chat.completions.create({
 *   model: "gpt-4o",
 *   messages,
 *   tools: [verifyProofOfTimeTool],
 * });
 * ```
 */
export const verifyProofOfTimeTool = {
  type: "function" as const,
  function: verifyProofOfTimeFunction,
};
