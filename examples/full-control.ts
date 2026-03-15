// Run: npx ts-node examples/full-control.ts
// Requires: Turnkey API credentials configured
//
// Level 3 — Full control with Turnkey institutional signer

import { TTTClient } from "../src";

async function main() {
  const ttt = await TTTClient.create({
    signer: {
      type: "turnkey",
      apiBaseUrl: "https://api.turnkey.com",
      organizationId: "org-...",
      privateKeyId: "pk-...",
      apiPublicKey: "...",
      apiPrivateKey: "...",
    },
    network: "base",
    tier: "T1_block",
    contractAddress: "0x...",
    poolAddress: "0x...",
    timeSources: ["nist", "google", "cloudflare", "apple"],
    protocolFeeRate: 0.05,
    enableGracefulShutdown: true,
  });

  // Health monitoring
  ttt.onAlert((alert) => {
    console.error(`[Alert] ${alert}`);
  });

  const health = await ttt.getHealth();
  console.log("Health:", JSON.stringify(health, null, 2));

  ttt.startAutoMint();
  console.log("Auto-minting started with Turnkey signer. Press Ctrl+C to stop.");
}

main().catch(console.error);
