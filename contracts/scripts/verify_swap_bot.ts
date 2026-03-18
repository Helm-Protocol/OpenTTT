/**
 * verify_swap_bot.ts — Direct TTTHookSimple.verifySwap() calls for PoT data accumulation
 *
 * FALLBACK approach: Skip V4 pool complexity, call verifySwap() directly.
 * This emits SwapVerified events that the subgraph indexes.
 *
 * Usage:
 *   npx hardhat run scripts/verify_swap_bot.ts --network baseSepolia
 */

import { ethers, network } from "hardhat";

// ─── Config ───────────────────────────────────────────────────────────────────

const TTT_HOOK_SIMPLE = "0x8C633b05b833a476925F7d9818da6E215760F2c7";
const TTT_1155 = "0xde357135cA493e59680182CDE9E1c6A4dA400811";

// Simulated pool ID (keccak256 of "openttt-base-sepolia-poc")
const SIMULATED_POOL_ID = ethers.keccak256(ethers.toUtf8Bytes("openttt-base-sepolia-poc"));

// How many verifySwap calls
const MAX_CALLS = 20;

// Interval between calls (ms)
const CALL_INTERVAL_MS = 15_000; // 15 seconds

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const TTT_HOOK_SIMPLE_ABI = [
  "function verifySwap(address sender, bytes32 pool, int256 swapDelta) external",
  "function getStats() external view returns (uint256 totalSwaps, uint256 turboSwaps, uint256 fullSwaps)",
  "function minTTTBalance() external view returns (uint256)",
  "function turboFee() external view returns (uint24)",
  "function fullFee() external view returns (uint24)",
  "function tttTokenId() external view returns (uint256)",
  "event SwapVerified(address indexed sender, bytes32 indexed pool, address indexed hook, string mode, uint256 feeAmount, bytes32 potHash)",
];

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer found. Set DEPLOYER_PRIVATE_KEY in .env");
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  PoT Data Accumulation Bot (Direct verifySwap)");
  console.log("=".repeat(60));
  console.log(`  Network:       ${network.name}`);
  console.log(`  Deployer:      ${deployer.address}`);
  console.log(`  TTTHookSimple: ${TTT_HOOK_SIMPLE}`);
  console.log(`  TTT (ERC1155): ${TTT_1155}`);
  console.log(`  Pool ID:       ${SIMULATED_POOL_ID}`);
  console.log(`  Max calls:     ${MAX_CALLS}`);
  console.log(`  Interval:      ${CALL_INTERVAL_MS / 1000}s`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  ETH balance:   ${ethers.formatEther(balance)} ETH`);

  // Check TTT ERC-1155 balance
  const ttt1155 = new ethers.Contract(TTT_1155, ERC1155_ABI, deployer);
  const hookSimple = new ethers.Contract(TTT_HOOK_SIMPLE, TTT_HOOK_SIMPLE_ABI, deployer);

  const tokenId = await hookSimple.tttTokenId();
  const tttBalance = await ttt1155.balanceOf(deployer.address, tokenId);
  const minBalance = await hookSimple.minTTTBalance();
  const turboFee = await hookSimple.turboFee();
  const fullFee = await hookSimple.fullFee();

  console.log(`\n  TTT Balance:   ${tttBalance} (tokenId=${tokenId})`);
  console.log(`  Min for turbo: ${minBalance}`);
  console.log(`  Turbo fee:     ${turboFee}`);
  console.log(`  Full fee:      ${fullFee}`);
  console.log(`  Expected mode: ${tttBalance >= minBalance ? "TURBO" : "FULL"}`);

  // Get initial stats
  const [initTotal, initTurbo, initFull] = await hookSimple.getStats();
  console.log(`\n  Current stats: total=${initTotal} turbo=${initTurbo} full=${initFull}`);
  console.log("=".repeat(60));
  console.log("\n  Starting verifySwap loop...\n");

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < MAX_CALLS; i++) {
    const swapNum = i + 1;
    // Vary the swapDelta to simulate different swap sizes
    const swapDelta = ethers.parseUnits(String(10 + (i % 5) * 5), 18); // 10, 15, 20, 25, 30 TTT cycling

    console.log(`  [${swapNum}/${MAX_CALLS}] verifySwap(delta=${ethers.formatUnits(swapDelta, 18)})...`);

    try {
      const tx = await hookSimple.verifySwap(
        deployer.address,
        SIMULATED_POOL_ID,
        swapDelta,
        { gasLimit: 150_000 }
      );
      const receipt = await tx.wait();

      // Parse SwapVerified event
      const event = receipt.logs.find((log: any) => {
        try {
          return hookSimple.interface.parseLog({ topics: log.topics, data: log.data })?.name === "SwapVerified";
        } catch { return false; }
      });

      if (event) {
        const parsed = hookSimple.interface.parseLog({ topics: event.topics, data: event.data });
        if (parsed) {
          console.log(`    Mode: ${parsed.args.mode} | Fee: ${parsed.args.feeAmount} | Gas: ${receipt.gasUsed}`);
          console.log(`    Tx: ${receipt.hash}`);
        }
      } else {
        console.log(`    Tx: ${receipt.hash} (gas: ${receipt.gasUsed})`);
      }

      successCount++;
    } catch (error: any) {
      console.error(`    FAILED: ${error.message?.substring(0, 120)}`);
      failCount++;

      // If we get access control error, stop immediately
      if (error.message?.includes("AccessControl")) {
        console.error("\n  FATAL: Deployer lacks HOOK_OPERATOR_ROLE. Stopping.");
        break;
      }
    }

    // Wait between calls (except last)
    if (i < MAX_CALLS - 1) {
      await new Promise((resolve) => setTimeout(resolve, CALL_INTERVAL_MS));
    }
  }

  // Final stats
  const [finalTotal, finalTurbo, finalFull] = await hookSimple.getStats();
  const finalBalance = await ethers.provider.getBalance(deployer.address);

  console.log(`\n${"=".repeat(60)}`);
  console.log("  Bot Summary");
  console.log("=".repeat(60));
  console.log(`  Calls: ${successCount} success / ${failCount} failed`);
  console.log(`  Stats: total=${finalTotal} turbo=${finalTurbo} full=${finalFull}`);
  console.log(`  ETH remaining: ${ethers.formatEther(finalBalance)} ETH`);
  console.log(`  ETH spent:     ${ethers.formatEther(balance - finalBalance)} ETH`);
  console.log("=".repeat(60));
  console.log("\n  SwapVerified events indexed by subgraph at:");
  console.log("  https://api.studio.thegraph.com/query/1744392/openttt-base-sepolia/v0.1.0");
  console.log(`  BaseScan: https://sepolia.basescan.org/address/${TTT_HOOK_SIMPLE}#events\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
