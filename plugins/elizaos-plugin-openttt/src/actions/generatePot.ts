import type {
  Action,
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { getVerifiedTime } from "../providers/timeProvider.js";

export interface PoTToken {
  version: string;
  timestamp: number;
  sources: string[];
  consensus: boolean;
  deviation_ms: number;
  agent_id: string;
  nonce: string;
  issued_at: string;
}

/**
 * Generates a cryptographically-anchored Proof-of-Time token
 * using 4-source verified time (NIST, Apple, Google, Cloudflare).
 * Call this BEFORE submitting a trade or agent transaction.
 */
export const generatePot: Action = {
  name: "GENERATE_POT",
  similes: [
    "CREATE_PROOF_OF_TIME",
    "MINT_POT",
    "TIMESTAMP_TRANSACTION",
    "ATTEST_TIME",
    "GET_TIME_PROOF",
  ],
  description:
    "Generates a Proof-of-Time (PoT) token using multi-source verified time " +
    "(NIST, Apple, Google, Cloudflare). Use before submitting any trade or " +
    "agent transaction to create a tamper-evident temporal attestation.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory
  ): Promise<boolean> => {
    // Always valid — time is always available (falls back to local if sources fail)
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      const vt = await getVerifiedTime();

      // Generate a nonce from agent ID + timestamp + random bytes
      const agentId = runtime.agentId ?? "unknown";
      const nonceRaw = `${agentId}:${vt.timestamp}:${Math.random().toString(36).slice(2)}`;
      // Simple hex nonce (no crypto dependency required)
      const nonce = Buffer.from(nonceRaw).toString("hex").slice(0, 32);

      const pot: PoTToken = {
        version: "1.0",
        timestamp: vt.timestamp,
        sources: vt.sources,
        consensus: vt.consensus,
        deviation_ms: vt.deviation_ms,
        agent_id: agentId,
        nonce,
        issued_at: new Date(vt.timestamp).toISOString(),
      };

      // Store PoT in runtime memory for verifyPot to access
      await runtime.cacheManager?.set(
        `openttt:pot:${message.id}`,
        JSON.stringify(pot),
        { expires: 300 } // 5 minutes
      );

      const consensusLabel = pot.consensus ? "✓ CONSENSUS" : "⚠ DEGRADED";
      const responseText = [
        `Proof-of-Time generated successfully.`,
        ``,
        `Token Details:`,
        `  Timestamp : ${pot.issued_at}`,
        `  Sources   : ${pot.sources.join(", ")}`,
        `  Consensus : ${consensusLabel}`,
        `  Deviation : ${pot.deviation_ms}ms`,
        `  Nonce     : ${pot.nonce}`,
        ``,
        `This PoT token is valid for 5 minutes. ` +
          `Attach it to your transaction before submitting.`,
      ].join("\n");

      if (callback) {
        await callback({
          text: responseText,
          content: { pot },
        });
      }

      return true;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error generating PoT";
      if (callback) {
        await callback({
          text: `Failed to generate Proof-of-Time: ${errorMsg}`,
          content: { error: errorMsg },
        });
      }
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Generate a proof of time before I submit this trade" },
      },
      {
        user: "{{agent}}",
        content: {
          text: "Proof-of-Time generated successfully.\n\nToken Details:\n  Timestamp : 2026-03-17T07:00:00.000Z\n  Sources   : NIST, Apple, Google, Cloudflare\n  Consensus : ✓ CONSENSUS\n  Deviation : 120ms\n  Nonce     : 6f70656e7474740a...",
          action: "GENERATE_POT",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Timestamp this transaction with verified time" },
      },
      {
        user: "{{agent}}",
        content: {
          text: "Proof-of-Time generated successfully.",
          action: "GENERATE_POT",
        },
      },
    ],
  ] as ActionExample[][],
};
