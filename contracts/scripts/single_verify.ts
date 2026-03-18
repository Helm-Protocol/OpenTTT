/**
 * single_verify.ts — Single verifySwap() call for use by pot_bot_loop.sh
 */
import { ethers } from "hardhat";

const TTT_HOOK_SIMPLE = "0x8C633b05b833a476925F7d9818da6E215760F2c7";
const POOL_ID = ethers.keccak256(ethers.toUtf8Bytes("openttt-base-sepolia-poc"));

const TTT_HOOK_SIMPLE_ABI = [
  "function verifySwap(address sender, bytes32 pool, int256 swapDelta) external",
  "function getStats() external view returns (uint256 totalSwaps, uint256 turboSwaps, uint256 fullSwaps)",
  "event SwapVerified(address indexed sender, bytes32 indexed pool, address indexed hook, string mode, uint256 feeAmount, bytes32 potHash)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const hookSimple = new ethers.Contract(TTT_HOOK_SIMPLE, TTT_HOOK_SIMPLE_ABI, deployer);

  // Random swap delta between 5-50 TTT
  const amount = 5 + Math.floor(Math.random() * 45);
  const swapDelta = ethers.parseUnits(String(amount), 18);

  const tx = await hookSimple.verifySwap(deployer.address, POOL_ID, swapDelta, { gasLimit: 100_000 });
  const receipt = await tx.wait();

  // Parse event
  const event = receipt.logs.find((log: any) => {
    try { return hookSimple.interface.parseLog({ topics: log.topics, data: log.data })?.name === "SwapVerified"; }
    catch { return false; }
  });

  if (event) {
    const parsed = hookSimple.interface.parseLog({ topics: event.topics, data: event.data });
    if (parsed) {
      console.log(`  OK: mode=${parsed.args.mode} fee=${parsed.args.feeAmount} gas=${receipt.gasUsed} tx=${receipt.hash}`);
    }
  } else {
    console.log(`  OK: gas=${receipt.gasUsed} tx=${receipt.hash}`);
  }

  const [total, turbo, full] = await hookSimple.getStats();
  console.log(`  Stats: total=${total} turbo=${turbo} full=${full}`);
}

main().catch((e) => { console.error(`  FAIL: ${e.message?.substring(0, 100)}`); process.exitCode = 1; });
