// Run: npx ts-node examples/custom-rpc.ts
// Requires: OPERATOR_PK environment variable set to a valid private key
//
// Level 2 — Custom RPC endpoint and tier selection

import { TTTClient } from "../src";

async function main() {
  const ttt = await TTTClient.forSepolia({
    privateKey: process.env.OPERATOR_PK!,
    rpcUrl: "https://my-rpc.example.com",
    tier: "T2_slot",
  });

  const status = await ttt.getStatus();
  console.log(`Tier: ${status.tier}`);
  console.log(`Balance: ${status.balance} ETH`);

  ttt.startAutoMint();
  console.log("Auto-minting started on custom RPC. Press Ctrl+C to stop.");

  process.on("SIGINT", async () => {
    await ttt.destroy();
    process.exit(0);
  });
}

main().catch(console.error);
