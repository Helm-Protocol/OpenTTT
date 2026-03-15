import { ethers } from "hardhat";
async function main() {
  const tttAddress = "0xde357135cA493e59680182CDE9E1c6A4dA400811";
  const hookAddress = "0x8C633b05b833a476925F7d9818da6E215760F2c7";
  const ttt = await ethers.getContractAt("TTT", tttAddress);
  const MINTER_ROLE = await ttt.MINTER_ROLE();
  console.log("Granting MINTER_ROLE to", hookAddress);
  const tx = await ttt.grantRole(MINTER_ROLE, hookAddress);
  await tx.wait();
  const ok = await ttt.hasRole(MINTER_ROLE, hookAddress);
  console.log("MINTER_ROLE granted:", ok);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
