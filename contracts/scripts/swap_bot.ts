/**
 * swap_bot.ts — Periodic swap + TTTHookSimple.verifySwap() for PoT data accumulation
 *
 * Usage:
 *   npx hardhat run scripts/swap_bot.ts --network baseSepolia
 *
 * Prerequisites:
 *   - Run setup_pool.ts first to deploy contracts and create the pool
 *   - deployment_base_sepolia.json must exist (auto-created by setup_pool.ts)
 *   - Deployer has HOOK_OPERATOR_ROLE on TTTHookSimple (deployer gets it by default)
 *   - Deployer has TestTTT + USDC balances
 *
 * What this does:
 *   1. Loads deployment info from deployment_base_sepolia.json
 *   2. Executes a small swap on the V4 pool (via PoolHelper)
 *   3. Calls TTTHookSimple.verifySwap() with the swap details
 *   4. Logs tx hash + SwapVerified event
 *   5. Repeats every SWAP_INTERVAL_MS (default: 30 seconds)
 *
 * The subgraph indexes SwapVerified events for PoT data accumulation.
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

// How often to swap (ms). Default 30s for testnet.
const SWAP_INTERVAL_MS = 30_000;

// How many swaps to execute (0 = infinite)
const MAX_SWAPS = 10;

// Swap amount: small amount of TestTTT per swap (in wei)
const SWAP_AMOUNT = ethers.parseUnits("10", 18); // 10 TestTTT per swap

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const POOL_HELPER_ABI = [
  "function swap((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, bool zeroForOne, int256 amountSpecified) external returns (int256 amount0, int256 amount1)",
];

const TTT_HOOK_SIMPLE_ABI = [
  "function verifySwap(address sender, bytes32 pool, int256 swapDelta) external",
  "function getStats() external view returns (uint256 totalSwaps, uint256 turboSwaps, uint256 fullSwaps)",
  "event SwapVerified(address indexed sender, bytes32 indexed pool, address indexed hook, string mode, uint256 feeAmount, bytes32 potHash)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeploymentInfo {
  contracts: {
    testTTT: string;
    poolHelper: string;
    poolManager: string;
    usdc: string;
    tttHookSimple: string;
    ttt1155: string;
  };
  poolKey: {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
  };
  poolId: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer found. Set DEPLOYER_PRIVATE_KEY in .env");
  }

  // Load deployment info
  const deploymentPath = path.join(__dirname, "..", "deployment_base_sepolia.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(
      "deployment_base_sepolia.json not found. Run setup_pool.ts first."
    );
  }
  const deployment: DeploymentInfo = JSON.parse(
    fs.readFileSync(deploymentPath, "utf-8")
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log("  TTT Swap Bot — Base Sepolia");
  console.log("=".repeat(60));
  console.log(`  Network:       ${network.name}`);
  console.log(`  Deployer:      ${deployer.address}`);
  console.log(`  PoolHelper:    ${deployment.contracts.poolHelper}`);
  console.log(`  TTTHookSimple: ${deployment.contracts.tttHookSimple}`);
  console.log(`  Pool ID:       ${deployment.poolId}`);
  console.log(`  Swap amount:   ${ethers.formatUnits(SWAP_AMOUNT, 18)} TestTTT`);
  console.log(`  Interval:      ${SWAP_INTERVAL_MS / 1000}s`);
  console.log(`  Max swaps:     ${MAX_SWAPS || "infinite"}`);
  console.log("=".repeat(60));

  // Instantiate contracts
  const poolHelper = new ethers.Contract(
    deployment.contracts.poolHelper,
    POOL_HELPER_ABI,
    deployer
  );
  const hookSimple = new ethers.Contract(
    deployment.contracts.tttHookSimple,
    TTT_HOOK_SIMPLE_ABI,
    deployer
  );
  const testTTT = new ethers.Contract(
    deployment.contracts.testTTT,
    ERC20_ABI,
    deployer
  );
  const usdc = new ethers.Contract(
    deployment.contracts.usdc,
    ERC20_ABI,
    deployer
  );

  // Ensure approvals
  const tttAllowance = await testTTT.allowance(
    deployer.address,
    deployment.contracts.poolHelper
  );
  if (tttAllowance < SWAP_AMOUNT * 100n) {
    console.log("\n  Approving TestTTT to PoolHelper...");
    const tx = await testTTT.approve(
      deployment.contracts.poolHelper,
      ethers.MaxUint256
    );
    await tx.wait();
  }

  const usdcAllowance = await usdc.allowance(
    deployer.address,
    deployment.contracts.poolHelper
  );
  if (usdcAllowance < ethers.parseUnits("10000", 6)) {
    console.log("  Approving USDC to PoolHelper...");
    const tx = await usdc.approve(
      deployment.contracts.poolHelper,
      ethers.MaxUint256
    );
    await tx.wait();
  }

  // Determine swap direction
  const tttIsCurrency0 =
    deployment.poolKey.currency0.toLowerCase() ===
    deployment.contracts.testTTT.toLowerCase();

  // We alternate: sell TestTTT (zeroForOne if TTT is currency0) then buy back
  let swapCount = 0;
  let direction = true; // start by selling TestTTT

  const poolKeyTuple = [
    deployment.poolKey.currency0,
    deployment.poolKey.currency1,
    deployment.poolKey.fee,
    deployment.poolKey.tickSpacing,
    deployment.poolKey.hooks,
  ];

  console.log("\n  Starting swap loop...\n");

  async function executeSwapCycle() {
    swapCount++;
    const zeroForOne = tttIsCurrency0 ? direction : !direction;
    // exactIn: negative amountSpecified
    const amountSpecified = -SWAP_AMOUNT;

    console.log(`  ── Swap #${swapCount} ──────────────────────────────`);
    console.log(`  Direction: ${direction ? "SELL TestTTT → USDC" : "BUY TestTTT ← USDC"}`);
    console.log(`  zeroForOne: ${zeroForOne}`);

    try {
      // Step 1: Execute swap on V4 pool
      const swapTx = await poolHelper.swap(
        poolKeyTuple,
        zeroForOne,
        amountSpecified,
        { gasLimit: 500_000 }
      );
      const swapReceipt = await swapTx.wait();
      console.log(`  Swap tx:    ${swapReceipt.hash}`);

      // Step 2: Call TTTHookSimple.verifySwap() to emit SwapVerified event
      const verifyTx = await hookSimple.verifySwap(
        deployer.address,
        deployment.poolId,
        amountSpecified,
        { gasLimit: 200_000 }
      );
      const verifyReceipt = await verifyTx.wait();
      console.log(`  Verify tx:  ${verifyReceipt.hash}`);

      // Parse SwapVerified event
      const swapVerifiedEvent = verifyReceipt.logs.find((log: any) => {
        try {
          const parsed = hookSimple.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          return parsed?.name === "SwapVerified";
        } catch {
          return false;
        }
      });

      if (swapVerifiedEvent) {
        const parsed = hookSimple.interface.parseLog({
          topics: swapVerifiedEvent.topics,
          data: swapVerifiedEvent.data,
        });
        if (parsed) {
          console.log(`  Mode:       ${parsed.args.mode}`);
          console.log(`  Fee:        ${parsed.args.feeAmount}`);
          console.log(`  PoT Hash:   ${parsed.args.potHash}`);
        }
      }

      // Get cumulative stats
      const [totalSwaps, turboSwaps, fullSwaps] = await hookSimple.getStats();
      console.log(`  Stats:      total=${totalSwaps} turbo=${turboSwaps} full=${fullSwaps}`);
      console.log(`  Gas used:   swap=${swapReceipt.gasUsed} verify=${verifyReceipt.gasUsed}`);
    } catch (error: any) {
      console.error(`  SWAP FAILED: ${error.message}`);
      // Log more detail for debugging
      if (error.data) {
        console.error(`  Error data: ${error.data}`);
      }
    }

    // Alternate direction
    direction = !direction;

    console.log("");
  }

  // Execute swap loop
  for (let i = 0; i < (MAX_SWAPS || Infinity); i++) {
    await executeSwapCycle();

    if (MAX_SWAPS && swapCount >= MAX_SWAPS) {
      console.log(`  Reached MAX_SWAPS (${MAX_SWAPS}). Stopping.`);
      break;
    }

    // Wait for next interval
    if (i < (MAX_SWAPS || Infinity) - 1) {
      console.log(`  Waiting ${SWAP_INTERVAL_MS / 1000}s until next swap...`);
      await new Promise((resolve) => setTimeout(resolve, SWAP_INTERVAL_MS));
    }
  }

  // Final summary
  const [totalSwaps, turboSwaps, fullSwaps] = await hookSimple.getStats();
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Swap Bot Summary");
  console.log("=".repeat(60));
  console.log(`  Total swaps executed: ${swapCount}`);
  console.log(`  TTTHookSimple stats:`);
  console.log(`    Total SwapVerified: ${totalSwaps}`);
  console.log(`    Turbo mode:        ${turboSwaps}`);
  console.log(`    Full mode:         ${fullSwaps}`);
  console.log("=".repeat(60));
  console.log("\n  SwapVerified events are now indexed by the subgraph.");
  console.log("  Check: https://sepolia.basescan.org/address/0x8C633b05b833a476925F7d9818da6E215760F2c7#events\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
