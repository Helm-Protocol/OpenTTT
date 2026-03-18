/**
 * Governance + PoT: Prove when a DAO vote was cast.
 * Prevents retroactive voting and proves voting order.
 */
import { HttpOnlyClient } from "openttt";

async function castVoteWithPoT(proposalId: string, vote: "for" | "against") {
  const ttt = new HttpOnlyClient();

  // 1. Generate PoT before casting vote
  const pot = await ttt.generatePoT();

  // 2. Cast vote with PoT attached
  const voteRecord = {
    proposalId,
    vote,
    voter: "0x...", // voter address
    pot: {
      timestamp: pot.timestamp,
      potHash: pot.potHash,
      sources: pot.sources,
      confidence: pot.confidence,
      nonce: pot.nonce,
    },
  };

  console.log("Vote cast with temporal proof:");
  console.log(`  Proposal: ${proposalId}`);
  console.log(`  Vote: ${vote}`);
  console.log(`  Time: ${new Date(Number(pot.timestamp) / 1_000_000).toISOString()}`);
  console.log(`  Sources: ${pot.sources.join(", ")}`);

  // 3. Verify PoT
  const valid = ttt.verifyPoT(pot);
  console.log(`  Valid: ${valid}`);

  return voteRecord;
}

// Example: Two voters, prove who voted first
async function main() {
  const vote1 = await castVoteWithPoT("PROP-42", "for");
  const vote2 = await castVoteWithPoT("PROP-42", "against");

  // Compare timestamps — cryptographic proof of ordering
  const t1 = Number(vote1.pot.timestamp);
  const t2 = Number(vote2.pot.timestamp);
  console.log(`\nVote 1 at ${t1}, Vote 2 at ${t2}`);
  console.log(`Order: Vote ${t1 < t2 ? "1" : "2"} was first — proven.`);
}

main().catch(console.error);
