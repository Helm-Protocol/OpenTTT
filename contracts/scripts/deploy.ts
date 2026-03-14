import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer Address:", deployer.address);

  // Deploy TTT
  console.log("Deploying TTT...");
  const TTT = await ethers.getContractFactory("TTT");
  const ttt = await TTT.deploy();
  await ttt.waitForDeployment();
  const tttAddress = await ttt.getAddress();
  console.log(`TTT deployed to: ${tttAddress}`);

  // Deploy ProtocolFee
  console.log("Deploying ProtocolFee...");
  const ProtocolFee = await ethers.getContractFactory("ProtocolFee");
  const protocolFee = await ProtocolFee.deploy();
  await protocolFee.waitForDeployment();
  const protocolFeeAddress = await protocolFee.getAddress();
  console.log(`ProtocolFee deployed to: ${protocolFeeAddress}`);
  
  console.log("Deployment Summary:");
  console.log(`- TTT: ${tttAddress}`);
  console.log(`- ProtocolFee: ${protocolFeeAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
