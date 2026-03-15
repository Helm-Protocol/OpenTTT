import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account found. Ensure DEPLOYER_PRIVATE_KEY is set in your environment.");
  }

  console.log(`Deploying contracts to ${network.name} with the account: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);

  // Base Sepolia USDC address (Circle official testnet)
  const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  // Treasury = deployer
  const treasuryAddress = "0x98603D935b6Ba2472a7cb48308e801F7ab6287f7";

  // Uniswap V4 PoolManager on Base Sepolia
  // See: https://docs.uniswap.org/contracts/v4/deployments
  const POOL_MANAGER_BASE_SEPOLIA = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";

  // TTTHook fee config
  const MIN_TTT_BALANCE = ethers.parseEther("1.0");  // 1 TTT minimum for turbo
  const TURBO_FEE = 500;    // 0.05% LP fee (turbo mode)
  const FULL_FEE = 10000;   // 1.00% LP fee (full mode)

  // ── 1. Deploy TTT (ERC-1155 + AccessControl) ──
  console.log("\n[1/4] Deploying TTT (ERC-1155)...");
  const TTT = await ethers.getContractFactory("TTT");
  const ttt = await TTT.deploy();
  await ttt.waitForDeployment();
  const tttAddress = await ttt.getAddress();
  console.log(`  TTT deployed to: ${tttAddress}`);

  // ── 2. Deploy ProtocolFee (EIP-712 fee collection) ──
  console.log("\n[2/4] Deploying ProtocolFee with feeRecipient:", treasuryAddress);
  const ProtocolFee = await ethers.getContractFactory("ProtocolFee");
  const protocolFee = await ProtocolFee.deploy(treasuryAddress);
  await protocolFee.waitForDeployment();
  const protocolFeeAddress = await protocolFee.getAddress();
  console.log(`  ProtocolFee deployed to: ${protocolFeeAddress}`);

  // ── 3. Deploy TTTHook (V4 Hook — needs PoolManager + TTT + fee config) ──
  // NOTE: Uniswap V4 hooks require CREATE2 salt mining so the contract address
  // encodes hook permissions in its lowest bits (beforeSwap=bit7, afterSwap=bit6).
  // For testnet PoC we deploy normally first. Production will need CREATE2Deployer.
  console.log("\n[3/4] Deploying TTTHook...");
  console.log(`  PoolManager: ${POOL_MANAGER_BASE_SEPOLIA}`);
  console.log(`  TTT:         ${tttAddress}`);
  console.log(`  minBalance:  ${ethers.formatEther(MIN_TTT_BALANCE)} TTT`);
  console.log(`  turboFee:    ${TURBO_FEE} (${TURBO_FEE / 10000}%)`);
  console.log(`  fullFee:     ${FULL_FEE} (${FULL_FEE / 10000}%)`);
  const TTTHook = await ethers.getContractFactory("TTTHook");
  const tttHook = await TTTHook.deploy(
    POOL_MANAGER_BASE_SEPOLIA,
    tttAddress,
    MIN_TTT_BALANCE,
    TURBO_FEE,
    FULL_FEE
  );
  await tttHook.waitForDeployment();
  const tttHookAddress = await tttHook.getAddress();
  console.log(`  TTTHook deployed to: ${tttHookAddress}`);
  console.log(`  ⚠️  V4 Hook address permission bits: 0x${(BigInt(tttHookAddress) & 0xFFn).toString(16)}`);

  // ── 4. Grant MINTER_ROLE on TTT to TTTHook ──
  console.log("\n[4/4] Granting MINTER_ROLE on TTT to TTTHook...");
  const MINTER_ROLE = await ttt.MINTER_ROLE();
  const grantTx = await ttt.grantRole(MINTER_ROLE, tttHookAddress);
  await grantTx.wait();
  console.log(`  MINTER_ROLE granted to TTTHook (${tttHookAddress})`);

  // Verify the role was granted
  const hasRole = await ttt.hasRole(MINTER_ROLE, tttHookAddress);
  if (!hasRole) {
    throw new Error("MINTER_ROLE grant verification failed!");
  }
  console.log("  Role verification: PASSED");

  // ── Deployment Summary ──
  console.log("\n========================================");
  console.log("  Base Sepolia Deployment Summary");
  console.log("========================================");
  console.log(`  Network:      ${network.name}`);
  console.log(`  Chain ID:     ${(await ethers.provider.getNetwork()).chainId}`);
  console.log(`  Deployer:     ${deployer.address}`);
  console.log(`  Treasury:     ${treasuryAddress}`);
  console.log(`  USDC:         ${USDC_BASE_SEPOLIA}`);
  console.log("----------------------------------------");
  console.log(`  TTT:          ${tttAddress}`);
  console.log(`  ProtocolFee:  ${protocolFeeAddress}`);
  console.log(`  TTTHook:      ${tttHookAddress}`);
  console.log("========================================");
  console.log("\nBasescan links:");
  console.log(`  TTT:         https://sepolia.basescan.org/address/${tttAddress}`);
  console.log(`  ProtocolFee: https://sepolia.basescan.org/address/${protocolFeeAddress}`);
  console.log(`  TTTHook:     https://sepolia.basescan.org/address/${tttHookAddress}`);
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
