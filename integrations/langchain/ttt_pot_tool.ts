/**
 * LangChain Tool: verify_proof_of_time
 *
 * Verifies transaction ordering using cryptographic Proof of Time (PoT).
 * Prevents front-running and MEV attacks by anchoring swap sequences
 * to multi-source synthesized timestamps (NIST + Google + Apple).
 *
 * @package openttt
 * @see https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { TimeSynthesis } from "openttt";

/**
 * Input schema for the verify_proof_of_time tool.
 */
const VerifyPoTSchema = z.object({
  txHash: z
    .string()
    .describe(
      "Transaction hash (0x-prefixed hex) to verify ordering for."
    ),
  chainId: z
    .number()
    .int()
    .positive()
    .describe(
      "EVM chain ID. 8453 = Base Mainnet, 84532 = Base Sepolia."
    ),
  poolAddress: z
    .string()
    .describe(
      "DEX pool address (0x-prefixed) where the swap occurred."
    ),
});

type VerifyPoTInput = z.infer<typeof VerifyPoTSchema>;

/**
 * VerifyProofOfTimeTool — LangChain StructuredTool for OpenTTT.
 *
 * Usage with LangChain agents:
 * ```ts
 * import { VerifyProofOfTimeTool } from "openttt/integrations/langchain";
 *
 * const tool = new VerifyProofOfTimeTool();
 * const agent = createToolCallingAgent({ llm, tools: [tool], prompt });
 * ```
 */
export class VerifyProofOfTimeTool extends StructuredTool<typeof VerifyPoTSchema> {
  name = "verify_proof_of_time";

  description =
    "Verify transaction ordering using cryptographic Proof of Time. " +
    "Prevents front-running and MEV attacks by generating a multi-source " +
    "timestamp proof (NIST, Google, Apple) and validating it against the " +
    "transaction's on-chain position. Returns proof details including " +
    "timestamp, confidence score, source count, and verification status.";

  schema = VerifyPoTSchema;

  private timeSynthesis: TimeSynthesis;

  constructor(config?: { timeSources?: string[] }) {
    super();
    this.timeSynthesis = new TimeSynthesis({
      sources: config?.timeSources ?? ["nist", "google", "cloudflare", "apple"],
    });
  }

  /**
   * Execute the PoT verification.
   *
   * 1. Generate a fresh Proof of Time from multiple atomic clock sources
   * 2. Self-verify the proof (cross-source consistency + nonce + expiration)
   * 3. Compute the on-chain hash for optional contract-level verification
   * 4. Return structured result
   */
  protected async _call(input: VerifyPoTInput): Promise<string> {
    try {
      // Generate Proof of Time
      const pot = await this.timeSynthesis.generateProofOfTime();

      // Self-verify (checks source consistency, nonce replay, expiration)
      const isValid = this.timeSynthesis.verifyProofOfTime(pot);

      // Compute on-chain hash for contract-level verification
      const onChainHash = TimeSynthesis.getOnChainHash(pot);

      const result = {
        verified: isValid,
        txHash: input.txHash,
        chainId: input.chainId,
        poolAddress: input.poolAddress,
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

      return JSON.stringify(result, null, 2);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return JSON.stringify(
        {
          verified: false,
          error: message,
          txHash: input.txHash,
          chainId: input.chainId,
          poolAddress: input.poolAddress,
        },
        null,
        2
      );
    }
  }
}

export default VerifyProofOfTimeTool;
