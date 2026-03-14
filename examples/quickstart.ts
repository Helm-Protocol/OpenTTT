// Run: npx ts-node examples/quickstart.ts
// Requires: OPERATOR_PK environment variable set to a valid private key
//
// Level 1 — "Just Works" (3 lines to start minting TimeTokens)

import { TTTClient } from "../src";

async function main() {
  const ttt = await TTTClient.forBase({ privateKey: process.env.OPERATOR_PK! });
  ttt.startAutoMint();
  console.log("Auto-minting started. Press Ctrl+C to stop.");
}

main().catch(console.error);
