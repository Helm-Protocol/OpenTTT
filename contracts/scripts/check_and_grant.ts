import { ethers } from "hardhat";
async function main() {
  const tttAddr = "0xde357135cA493e59680182CDE9E1c6A4dA400811";
  const hookAddr = "0x8C633b05b833a476925F7d9818da6E215760F2c7";
  const [deployer] = await ethers.getSigners();
  const ttt = await ethers.getContractAt("TTT", tttAddr);
  
  const ADMIN = await ttt.DEFAULT_ADMIN_ROLE();
  const MINTER = await ttt.MINTER_ROLE();
  
  console.log("Deployer:", deployer.address);
  console.log("Has ADMIN:", await ttt.hasRole(ADMIN, deployer.address));
  console.log("Hook has MINTER:", await ttt.hasRole(MINTER, hookAddr));
  
  // Retry grant with explicit gas
  console.log("\nGranting with explicit gas...");
  const tx = await ttt.grantRole(MINTER, hookAddr, { gasLimit: 100000 });
  const receipt = await tx.wait();
  console.log("TX hash:", receipt?.hash);
  console.log("Status:", receipt?.status);
  console.log("Hook has MINTER now:", await ttt.hasRole(MINTER, hookAddr));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
