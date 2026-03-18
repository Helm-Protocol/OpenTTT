/**
 * single_mint.ts — Single TTT.mint() call for PoT anchor accumulation (Channel 2)
 * Emits both TTTMinted and PoTAnchored events.
 */
import { ethers } from "hardhat";

const TTT_ADDRESS = "0xde357135cA493e59680182CDE9E1c6A4dA400811";

const TTT_ABI = [
  "function mint(address to, uint256 amount, bytes32 grgHash) external",
  "event TTTMinted(address indexed to, uint256 indexed tokenId, uint256 amount)",
  "event PoTAnchored(uint256 indexed stratum, bytes32 grgHash, bytes32 potHash, uint256 timestamp)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const ttt = new ethers.Contract(TTT_ADDRESS, TTT_ABI, deployer);

  // Generate random grgHash (bytes32)
  const grgHash = ethers.hexlify(ethers.randomBytes(32));

  // Explicit pending nonce to avoid "replacement transaction underpriced"
  const nonce = await deployer.getNonce("pending");
  const feeData = await ethers.provider.getFeeData();
  const tx = await ttt.mint(deployer.address, 1, grgHash, {
    gasLimit: 150_000,
    nonce,
    maxFeePerGas: feeData.maxFeePerGas! * 2n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas! * 2n,
  });
  const receipt = await tx.wait();

  // Parse PoTAnchored event
  const event = receipt.logs.find((log: any) => {
    try {
      return ttt.interface.parseLog({ topics: log.topics, data: log.data })?.name === "PoTAnchored";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = ttt.interface.parseLog({ topics: event.topics, data: event.data });
    if (parsed) {
      console.log(`Minted tokenId=${parsed.args.stratum} grgHash=${grgHash.substring(0, 18)}... tx=${receipt.hash}`);
    }
  } else {
    console.log(`Minted gas=${receipt.gasUsed} tx=${receipt.hash}`);
  }
}

main().catch((e) => {
  console.error(`FAIL: ${e.message?.substring(0, 120)}`);
  process.exitCode = 1;
});
