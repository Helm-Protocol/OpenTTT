# OpenTTT LangChain Integration

**Problem**: DEX swaps get front-run. Your agent can't prove transaction ordering.

**Solution**: `verify_proof_of_time` generates cryptographic timestamps from 3+ atomic clock sources (NIST, Google, Apple) and verifies swap ordering on-chain.

**Result**: Your agent detects MEV attacks in one tool call.

## Installation

```bash
npm install openttt @langchain/core zod
```

## Quick Start

```typescript
import { VerifyProofOfTimeTool } from "openttt/integrations/langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// 1. Create the tool
const potTool = new VerifyProofOfTimeTool();

// 2. Wire into your agent
const llm = new ChatOpenAI({ model: "gpt-4o" });
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a DeFi security agent. Use verify_proof_of_time to check transaction ordering."],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);

const agent = createToolCallingAgent({ llm, tools: [potTool], prompt });
const executor = new AgentExecutor({ agent, tools: [potTool] });

// 3. Run
const result = await executor.invoke({
  input: "Verify ordering for tx 0xabc123... on Base (chain 8453) pool 0xdef456...",
});
```

## Tool Details

| Field | Value |
|-------|-------|
| **Name** | `verify_proof_of_time` |
| **Inputs** | `txHash` (string), `chainId` (number), `poolAddress` (string) |
| **Output** | JSON with `verified`, `proof` (timestamp, confidence, sources), `sourceReadings` |

## Configuration

```typescript
// Custom time sources
const tool = new VerifyProofOfTimeTool({
  timeSources: ["nist", "google", "cloudflare"],
});
```

## What the Proof Contains

```json
{
  "verified": true,
  "proof": {
    "timestamp": "1742000000000000000",
    "uncertainty_ms": 2.5,
    "sources": 3,
    "stratum": 1,
    "confidence": 1.0,
    "nonce": "a1b2c3...",
    "expiresAt": "1742000060000",
    "onChainHash": "0x..."
  },
  "sourceReadings": [
    { "source": "nist", "timestamp": "...", "uncertainty_ms": 1.2 },
    { "source": "apple", "timestamp": "...", "uncertainty_ms": 3.1 },
    { "source": "google", "timestamp": "...", "uncertainty_ms": 2.0 }
  ]
}
```

## How It Works

1. Queries 3+ independent atomic clock sources simultaneously
2. Synthesizes a median timestamp with confidence score
3. Self-verifies cross-source consistency (stratum-adaptive tolerance)
4. Applies nonce + expiration for replay protection
5. Computes `keccak256` hash for optional on-chain contract verification

## Learn More

- [IETF Draft: Proof of Time](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)
- [OpenTTT SDK](https://github.com/Helm-Protocol/OpenTTT)
- [Yellow Paper](https://github.com/Helm-Protocol/OpenTTT/blob/main/YELLOW_PAPER.md)
