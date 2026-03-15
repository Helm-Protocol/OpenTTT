import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  const tttAddress = "0xde357135cA493e59680182CDE9E1c6A4dA400811";
  const poolManager = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";

  console.log("Deploying TTTHookSimple (PoC — no V4 address-permission requirement)...");
  const TTTHook = await ethers.getContractFactory("TTTHookSimple");
  const hook = await TTTHook.deploy(
    tttAddress,
    ethers.parseEther("1.0"),  // minTTTBalance
    500,    // turboFee 0.05%
    10000   // fullFee 1.00%
  );
  await hook.waitForDeployment();
  const hookAddr = await hook.getAddress();
  console.log("TTTHook deployed to:", hookAddr);

  // Grant MINTER_ROLE
  console.log("Granting MINTER_ROLE...");
  const ttt = await ethers.getContractAt("TTT", tttAddress);
  const MINTER_ROLE = await ttt.MINTER_ROLE();
  const tx = await ttt.grantRole(MINTER_ROLE, hookAddr);
  await tx.wait();
  console.log("MINTER_ROLE granted:", await ttt.hasRole(MINTER_ROLE, hookAddr));

  console.log("\n=== BASE SEPOLIA DEPLOYMENT COMPLETE ===");
  console.log("TTT:         ", tttAddress);
  console.log("ProtocolFee: ", "0xE289337d3a79b22753BDA03510a8b8E4D1040F21");
  console.log("TTTHook:     ", hookAddr);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
