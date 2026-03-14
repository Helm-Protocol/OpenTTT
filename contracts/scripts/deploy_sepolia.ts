import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account found. Ensure DEPLOYER_PRIVATE_KEY is set in your environment.");
  }
  
  console.log(`Deploying contracts to ${network.name} with the account: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);

  // User provided treasury address
  const treasuryAddress = "0x98603D935b6Ba2472a7cb48308e801F7ab6287f7";

  // Deploy TTT
  console.log("Deploying TTT (ERC-1155)...");
  const TTT = await ethers.getContractFactory("TTT");
  const ttt = await TTT.deploy();
  await ttt.waitForDeployment();
  const tttAddress = await ttt.getAddress();
  console.log(`TTT deployed to: ${tttAddress}`);

  // Deploy ProtocolFee
  console.log("Deploying ProtocolFee with treasury:", treasuryAddress);
  const ProtocolFee = await ethers.getContractFactory("ProtocolFee");
  const protocolFee = await ProtocolFee.deploy(treasuryAddress);
  await protocolFee.waitForDeployment();
  const protocolFeeAddress = await protocolFee.getAddress();
  console.log(`ProtocolFee deployed to: ${protocolFeeAddress}`);

  console.log("\nDeployment Summary:");
  console.log("-------------------");
  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Treasury: ${treasuryAddress}`);
  console.log(`TTT: ${tttAddress}`);
  console.log(`ProtocolFee: ${protocolFeeAddress}`);
  console.log("-------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
