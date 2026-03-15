#!/usr/bin/env node
// @helm-protocol/ttt-mcp — MCP Server for OpenTTT Proof of Time
// Provides 5 tools for AI agents: pot_generate, pot_verify, pot_query, pot_stats, pot_health

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { potGenerate, potVerify, potQuery, potStats, potHealth } from "./tools";

const server = new McpServer({
  name: "ttt-mcp",
  version: "0.1.0",
});

// ---------- Tool 1: pot_generate ----------

server.tool(
  "pot_generate",
  "Generate a Proof of Time for a transaction. Returns potHash, timestamp, stratum, and GRG integrity shards.",
  {
    txHash: z.string().describe("Transaction hash (hex with 0x prefix)"),
    chainId: z.number().describe("Chain ID (e.g. 8453 for Base, 84532 for Base Sepolia)"),
    poolAddress: z.string().describe("DEX pool contract address"),
  },
  async (args) => {
    try {
      const result = await potGenerate(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ---------- Tool 2: pot_verify ----------

server.tool(
  "pot_verify",
  "Verify a Proof of Time using its hash and GRG shards. Returns validity, mode (turbo/full), and timestamp.",
  {
    potHash: z.string().describe("PoT hash to verify (hex with 0x prefix)"),
    grgShards: z.array(z.string()).describe("Array of hex-encoded GRG integrity shards"),
    chainId: z.number().describe("EVM chain ID (e.g. 84532 for Base Sepolia)"),
    poolAddress: z.string().describe("Uniswap V4 pool address (0x-prefixed)"),
  },
  async (args) => {
    try {
      const result = await potVerify(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ---------- Tool 3: pot_query ----------

server.tool(
  "pot_query",
  "Query Proof of Time history from local log and on-chain subgraph.",
  {
    startTime: z.number().optional().describe("Start time (unix ms). Default: 24h ago"),
    endTime: z.number().optional().describe("End time (unix ms). Default: now"),
    limit: z.number().optional().describe("Max entries to return. Default: 100, max: 1000"),
  },
  async (args) => {
    try {
      const result = await potQuery(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ---------- Tool 4: pot_stats ----------

server.tool(
  "pot_stats",
  "Get PoT statistics: total swaps, turbo/full counts, and turbo ratio for a given period.",
  {
    period: z.enum(["day", "week", "month"]).describe("Time period for statistics"),
  },
  async (args) => {
    try {
      const result = await potStats(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ---------- Tool 5: pot_health ----------

server.tool(
  "pot_health",
  "Check PoT system health: time source status, subgraph sync, server uptime, and current mode.",
  {},
  async () => {
    try {
      const result = await potHealth();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ---------- Start Server ----------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ttt-mcp] OpenTTT MCP Server running on stdio");
}

main().catch((err) => {
  console.error("[ttt-mcp] Fatal:", err);
  process.exit(1);
});
