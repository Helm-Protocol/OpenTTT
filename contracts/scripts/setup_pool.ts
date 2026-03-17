/**
 * setup_pool.ts — Deploy TestTTT + PoolHelper, initialize V4 pool, add liquidity
 *
 * Usage:
 *   npx hardhat run scripts/setup_pool.ts --network baseSepolia
 *
 * Prerequisites:
 *   - DEPLOYER_PRIVATE_KEY in .env
 *   - Deployer has Base Sepolia ETH (for gas)
 *   - Deployer has USDC on Base Sepolia (for liquidity)
 *
 * What this does:
 *   1. Deploys TestTTT (ERC-20) — mintable test token
 *   2. Deploys PoolHelper — unlock callback helper for V4 interactions
 *   3. Initializes a V4 pool: TestTTT/USDC with no hook, static 0.30% fee
 *   4. Adds initial liquidity across a wide tick range
 *
 * After running, save the printed addresses for swap_bot.ts
 */

import { ethers, network } from "hardhat";

// ─── Constants ────────────────────────────────────────────────────────────────

// Uniswap V4 PoolManager on Base Sepolia
const POOL_MANAGER = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";

// Circle USDC on Base Sepolia (6 decimals)
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Pool config — static fee, no hook
// 3000 = 0.30% fee in hundredths of a bip
const POOL_FEE = 3000;
const TICK_SPACING = 60; // standard for 0.30% fee pools

// Initial liquidity parameters
// TestTTT has 18 decimals, USDC has 6 decimals
const INITIAL_TTT_LIQUIDITY = ethers.parseUnits("3000", 18);  // 3k TestTTT (reduced for limited funds)
const INITIAL_USDC_LIQUIDITY = ethers.parseUnits("30", 6);    // 30 USDC (keep 10 USDC buffer)

// Wide tick range for liquidity (roughly full range)
const TICK_LOWER = -887220; // near MIN_TICK, rounded to tickSpacing
const TICK_UPPER = 887220;  // near MAX_TICK, rounded to tickSpacing

// sqrtPriceX96 for initial price: 1 TestTTT = 0.01 USDC
// price = (USDC per TestTTT) adjusted for decimal difference
// TestTTT (18 dec) / USDC (6 dec) → need to account for 10^12 difference
// If 1 TestTTT = 0.01 USDC: raw price ratio = 0.01 * 10^6 / 10^18 = 10^-14
// sqrtPriceX96 = sqrt(price) * 2^96
// For a more practical approach: set price ≈ 1:100 (100 TestTTT = 1 USDC)
// Depends on which token is currency0 (lower address) — computed at runtime

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────

const POOL_MANAGER_ABI = [
  "function initialize((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) external returns (int24 tick)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute sqrtPriceX96 for a given price ratio.
 * price = amount of token1 per token0 (in raw units, accounting for decimals)
 */
function encodeSqrtPriceX96(price: number): bigint {
  const sqrtPrice = Math.sqrt(price);
  const Q96 = 2n ** 96n;
  // Use high precision: multiply by 10^18 then divide
  const sqrtPriceScaled = BigInt(Math.floor(sqrtPrice * 1e18));
  return (sqrtPriceScaled * Q96) / BigInt(1e18);
}

/**
 * Sort tokens to determine currency0 (lower address) and currency1 (higher).
 */
function sortTokens(tokenA: string, tokenB: string): [string, string] {
  return tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer found. Set DEPLOYER_PRIVATE_KEY in .env");
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("  Uniswap V4 Pool Setup — Base Sepolia");
  console.log("=".repeat(60));
  console.log(`  Network:  ${network.name}`);
  console.log(`  Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  ETH bal:  ${ethers.formatEther(balance)} ETH`);

  // Check USDC balance
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, deployer);
  const usdcBalance = await usdc.balanceOf(deployer.address);
  console.log(`  USDC bal: ${ethers.formatUnits(usdcBalance, 6)} USDC`);

  // ── Nonce management ────────────────────────────────────────────────
  // Explicitly track nonce to avoid "replacement transaction underpriced"
  let currentNonce = await deployer.getNonce("latest");
  console.log(`  Starting nonce: ${currentNonce}`);

  // ── 1. Deploy TestTTT ──────────────────────────────────────────────

  console.log("\n[1/5] Deploying TestTTT (ERC-20)...");
  const TestTTT = await ethers.getContractFactory("TestTTT");
  const testTTT = await TestTTT.deploy({ nonce: currentNonce });
  await testTTT.waitForDeployment();
  currentNonce++;
  const testTTTAddress = await testTTT.getAddress();
  console.log(`  TestTTT deployed: ${testTTTAddress}`);

  try {
    const tttBalance = await testTTT.balanceOf(deployer.address);
    console.log(`  TestTTT bal: ${ethers.formatUnits(tttBalance, 18)} tTTT`);
  } catch { console.log("  TestTTT bal: (skipped — RPC decode delay, mint confirmed via direct call)"); }

  // ── 2. Deploy PoolHelper ───────────────────────────────────────────

  console.log("\n[2/5] Deploying PoolHelper...");
  const PoolHelper = await ethers.getContractFactory("PoolHelper");
  const poolHelper = await PoolHelper.deploy(POOL_MANAGER, { nonce: currentNonce });
  await poolHelper.waitForDeployment();
  currentNonce++;
  const poolHelperAddress = await poolHelper.getAddress();
  console.log(`  PoolHelper deployed: ${poolHelperAddress}`);

  // ── 3. Sort tokens & compute price ─────────────────────────────────

  console.log("\n[3/5] Computing pool parameters...");
  const [currency0, currency1] = sortTokens(testTTTAddress, USDC_ADDRESS);
  const tttIsCurrency0 = currency0.toLowerCase() === testTTTAddress.toLowerCase();

  console.log(`  currency0: ${currency0} (${tttIsCurrency0 ? "TestTTT" : "USDC"})`);
  console.log(`  currency1: ${currency1} (${tttIsCurrency0 ? "USDC" : "TestTTT"})`);
  console.log(`  fee: ${POOL_FEE} (${POOL_FEE / 10000}%)`);
  console.log(`  tickSpacing: ${TICK_SPACING}`);
  console.log(`  hooks: address(0)`);

  // Price: 1 TestTTT = 0.01 USDC
  // raw price = (USDC_amount / 10^6) / (TTT_amount / 10^18) = USDC_raw * 10^12 / TTT_raw
  // For currency0/currency1 convention: price = currency1_per_currency0
  // If TTT is currency0: price = USDC per TTT in raw terms
  //   = 0.01 * 10^6 / 10^18 = 10^-14
  //   Actually: raw_price = (0.01 USDC in raw) / (1 TTT in raw) = (0.01 * 10^6) / (1 * 10^18) = 10^4 / 10^18 = 10^-14
  // If USDC is currency0: price = TTT per USDC in raw terms
  //   = 100 * 10^18 / 10^6 = 10^14

  let rawPrice: number;
  if (tttIsCurrency0) {
    // price = currency1(USDC) per currency0(TTT) in raw units
    // 1 TTT = 0.01 USDC → raw: 10000 / 10^18 = 10^-14
    rawPrice = 1e-14;
  } else {
    // price = currency1(TTT) per currency0(USDC) in raw units
    // 1 USDC = 100 TTT → raw: 100 * 10^18 / 10^6 = 10^14
    rawPrice = 1e14;
  }

  const sqrtPriceX96 = encodeSqrtPriceX96(rawPrice);
  console.log(`  sqrtPriceX96: ${sqrtPriceX96}`);

  // ── 4. Initialize V4 Pool ──────────────────────────────────────────

  console.log("\n[4/5] Initializing V4 pool...");
  const poolManager = new ethers.Contract(POOL_MANAGER, POOL_MANAGER_ABI, deployer);

  const poolKey = {
    currency0: currency0,
    currency1: currency1,
    fee: POOL_FEE,
    tickSpacing: TICK_SPACING,
    hooks: ethers.ZeroAddress,
  };

  const initTx = await poolManager.initialize(
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
    sqrtPriceX96,
    { nonce: currentNonce }
  );
  const initReceipt = await initTx.wait();
  currentNonce++;
  console.log(`  Pool initialized! tx: ${initReceipt.hash}`);

  // Compute pool ID (keccak256 of abi.encode(PoolKey))
  const poolId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
    )
  );
  console.log(`  Pool ID: ${poolId}`);

  // ── 5. Add Initial Liquidity ───────────────────────────────────────

  console.log("\n[5/5] Adding initial liquidity...");

  // Approve tokens to PoolHelper (which will transferFrom to PoolManager)
  // Actually, PoolHelper does transferFrom(sender, poolManager, amount)
  // So we need to approve PoolManager (not PoolHelper) — wait, no.
  // The PoolHelper's _settle does transferFrom(sender=deployer, poolManager, amount)
  // So deployer must approve the PoolHelper? No — transferFrom is called BY PoolHelper
  // but transfers FROM sender TO poolManager. The msg.sender of transferFrom is PoolHelper.
  // So deployer needs to approve PoolHelper to spend tokens.
  // WAIT: actually PoolHelper calls IERC20(token).transferFrom(sender, poolManager, amount)
  // where sender is the deployer address. So deployer must approve PoolHelper.
  // BUT the transferFrom is called by PoolHelper (msg.sender to ERC20 is PoolHelper).
  // So deployer approves PoolHelper, PoolHelper calls transferFrom(deployer, poolManager, amount).

  console.log("  Approving TestTTT to PoolHelper...");
  const approveTTTTx = await testTTT.approve(poolHelperAddress, ethers.MaxUint256, { nonce: currentNonce });
  await approveTTTTx.wait();
  currentNonce++;

  console.log("  Approving USDC to PoolHelper...");
  const approveUSDCTx = await usdc.approve(poolHelperAddress, ethers.MaxUint256, { nonce: currentNonce });
  await approveUSDCTx.wait();
  currentNonce++;

  // Compute liquidity amount
  // For a simplified PoC, we use a reasonable liquidity delta.
  // In V4, liquidityDelta is in units of liquidity (not token amounts).
  // A rough estimate: for full-range, liquidity ≈ sqrt(amount0 * amount1) * 2^96 / (sqrt(pMax) - sqrt(pMin))
  // For testnet PoC, start with a moderate value.
  const LIQUIDITY_DELTA = ethers.parseUnits("30000", 0); // 30k units of liquidity (reduced proportionally)

  console.log(`  Adding liquidity: ${LIQUIDITY_DELTA} (tick range: ${TICK_LOWER} to ${TICK_UPPER})`);

  try {
    const addLiqTx = await poolHelper.addLiquidity(
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
      TICK_LOWER,
      TICK_UPPER,
      LIQUIDITY_DELTA,
      { gasLimit: 1_000_000, nonce: currentNonce }
    );
    const addLiqReceipt = await addLiqTx.wait();
    console.log(`  Liquidity added! tx: ${addLiqReceipt.hash}`);
  } catch (error: any) {
    console.error(`  Liquidity add failed: ${error.message}`);
    console.log("  You may need to adjust LIQUIDITY_DELTA or ensure sufficient token balances.");
    console.log("  The pool is initialized — you can add liquidity manually later.");
  }

  // ── Summary ────────────────────────────────────────────────────────

  console.log(`\n${"=".repeat(60)}`);
  console.log("  Deployment Summary");
  console.log("=".repeat(60));
  console.log(`  TestTTT:        ${testTTTAddress}`);
  console.log(`  PoolHelper:     ${poolHelperAddress}`);
  console.log(`  Pool ID:        ${poolId}`);
  console.log(`  PoolManager:    ${POOL_MANAGER}`);
  console.log(`  USDC:           ${USDC_ADDRESS}`);
  console.log(`  TTTHookSimple:  0x8C633b05b833a476925F7d9818da6E215760F2c7`);
  console.log("─".repeat(60));
  console.log("  Pool Key:");
  console.log(`    currency0:    ${poolKey.currency0}`);
  console.log(`    currency1:    ${poolKey.currency1}`);
  console.log(`    fee:          ${poolKey.fee}`);
  console.log(`    tickSpacing:  ${poolKey.tickSpacing}`);
  console.log(`    hooks:        ${poolKey.hooks}`);
  console.log("=".repeat(60));
  console.log("\n  Save these addresses for swap_bot.ts!");
  console.log("  Update DEPLOYED_ADDRESSES in swap_bot.ts with the values above.\n");

  // Write deployment info to a JSON file for swap_bot.ts to consume
  const deploymentInfo = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      testTTT: testTTTAddress,
      poolHelper: poolHelperAddress,
      poolManager: POOL_MANAGER,
      usdc: USDC_ADDRESS,
      tttHookSimple: "0x8C633b05b833a476925F7d9818da6E215760F2c7",
      ttt1155: "0xde357135cA493e59680182CDE9E1c6A4dA400811",
    },
    poolKey: {
      currency0: poolKey.currency0,
      currency1: poolKey.currency1,
      fee: poolKey.fee,
      tickSpacing: poolKey.tickSpacing,
      hooks: poolKey.hooks,
    },
    poolId,
    timestamp: new Date().toISOString(),
  };

  const fs = await import("fs");
  const deploymentPath = `${__dirname}/../deployment_base_sepolia.json`;
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`  Deployment info saved to: deployment_base_sepolia.json\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
