/**
 * TTT SDK — Builder Example
 *
 * 트랜잭션 빌더가 TTT를 구매하고 소비하는 흐름.
 * TURBO 모드에서 20% 수수료 할인을 받는 경제적 인센티브.
 */
import { ethers } from 'ethers';
import { TTTBuilder, EVMConnector } from '../src';

async function main() {
  const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';
  const privateKey = process.env.PRIVATE_KEY!;

  // 1. EVM 연결
  const connector = new EVMConnector();
  await connector.connect(rpcUrl, privateKey);

  // 2. 빌더 인스턴스 생성
  const builder = new TTTBuilder(connector);

  // 3. TTT 구매 (Uniswap V4 풀에서)
  const poolAddress = '0x...'; // DEX 풀 주소
  await builder.purchaseTTT(poolAddress, ethers.parseEther('10'));
  console.log(`Balance after purchase: ${builder.getBalance()}`);

  // 4. 블록 검증 → TURBO/FULL 모드 결정
  // 정직한 빌더: 순서 일치 → TURBO → 빠름 → 수익↑
  // 변조 빌더: 순서 불일치 → FULL → 느림 → 수익↓
  const mode = builder.getMode();
  console.log(`Current mode: ${mode}`);

  // 5. Tick 소비 (TTT 소각)
  const tokenId = '0x...'; // AutoMint에서 생성된 토큰 ID
  await builder.consumeTick(tokenId, 'T1_block');
  console.log(`Balance after tick: ${builder.getBalance()}`);
}

main().catch(console.error);
