# OpenTTT OpenAI Function Calling Integration

Verify DeFi transaction ordering using cryptographic Proof of Time, directly from OpenAI function calling.

## Installation

```bash
npm install openttt openai
```

## Quick Start

```typescript
import OpenAI from "openai";
import {
  verifyProofOfTimeTool,
  handleVerifyProofOfTime,
} from "openttt/integrations/openai";

const openai = new OpenAI();

// 1. Send the tool definition to OpenAI
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "system",
      content: "You are a DeFi security agent. Verify transaction ordering when asked.",
    },
    {
      role: "user",
      content: "Check if tx 0xabc123... was front-run on Base Sepolia pool 0xdef456...",
    },
  ],
  tools: [verifyProofOfTimeTool],
});

// 2. Handle the function call
const toolCall = response.choices[0].message.tool_calls?.[0];
if (toolCall?.function.name === "verify_proof_of_time") {
  const args = JSON.parse(toolCall.function.arguments);
  const result = await handleVerifyProofOfTime(args);

  // 3. Send result back to the model
  const followUp = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      ...messages,
      response.choices[0].message,
      {
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      },
    ],
  });

  console.log(followUp.choices[0].message.content);
}
```

## Exports

### `verifyProofOfTimeTool`

Ready-to-use tool object for the OpenAI `tools` array:

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages,
  tools: [verifyProofOfTimeTool],
});
```

### `verifyProofOfTimeFunction`

The raw function definition object, if you need to wrap it yourself:

```typescript
const customTool = {
  type: "function" as const,
  function: verifyProofOfTimeFunction,
};
```

### `handleVerifyProofOfTime(args, config?)`

Execute the Proof of Time verification when OpenAI calls the function.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `args.txHash` | string | Transaction hash (0x-prefixed hex) |
| `args.chainId` | number | EVM chain ID (8453 = Base, 84532 = Base Sepolia) |
| `args.poolAddress` | string | DEX pool address (0x-prefixed) |
| `config.timeSources` | string[] | Optional. Override default sources. Default: `["nist", "google", "cloudflare", "apple"]` |

**Returns:** `VerifyPoTResult`

```typescript
{
  verified: boolean;
  txHash: string;
  chainId: number;
  poolAddress: string;
  proof?: {
    timestamp: string;        // Nanosecond-precision synthesized timestamp
    uncertainty_ms: number;   // Uncertainty bound in milliseconds
    sources: number;          // Number of time sources used
    stratum: number;          // NTP stratum level
    confidence: number;       // Cross-source confidence (0-1)
    nonce: string;            // Replay protection nonce
    expiresAt: string;        // Proof expiration timestamp
    onChainHash: string;      // keccak256 hash for contract verification
  };
  sourceReadings?: Array<{
    source: string;
    timestamp: string;
    uncertainty_ms: number;
  }>;
  error?: string;             // Present only on failure
}
```

## Multi-Turn Conversation Example

```typescript
import OpenAI from "openai";
import {
  verifyProofOfTimeTool,
  handleVerifyProofOfTime,
} from "openttt/integrations/openai";

const openai = new OpenAI();

async function chat(userMessage: string) {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a DeFi security agent." },
    { role: "user", content: userMessage },
  ];

  let response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    tools: [verifyProofOfTimeTool],
  });

  // Loop to handle tool calls
  while (response.choices[0].message.tool_calls?.length) {
    const assistantMsg = response.choices[0].message;
    messages.push(assistantMsg);

    for (const toolCall of assistantMsg.tool_calls!) {
      if (toolCall.function.name === "verify_proof_of_time") {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await handleVerifyProofOfTime(args);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: [verifyProofOfTimeTool],
    });
  }

  return response.choices[0].message.content;
}

// Usage
const answer = await chat(
  "Verify tx 0xabc123 on Base Sepolia (chain 84532) pool 0xdef456"
);
console.log(answer);
```

## References

- [OpenTTT SDK (npm)](https://www.npmjs.com/package/openttt)
- [OpenTTT GitHub](https://github.com/Helm-Protocol/OpenTTT)
- [IETF Draft: TTTPS Protocol](https://datatracker.ietf.org/doc/draft-helmprotocol-tttps/)
- [OpenAI Function Calling Docs](https://platform.openai.com/docs/guides/function-calling)

## License

MIT
