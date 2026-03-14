/**
 * TTT SDK — Quickstart Example
 *
 * 3줄로 시작하는 DEX 운영자용 자동 민팅.
 * Base Sepolia 테스트넷에서 실행.
 */
import { TTTClient } from '../src';

async function main() {
  // 1. 클라이언트 생성 (signer만 필수, 나머지는 기본값)
  const client = await TTTClient.forSepolia({
    signer: { type: 'privateKey', envVar: 'PRIVATE_KEY' }
  });

  // 2. 상태 확인
  const status = await client.getStatus();
  console.log(`Tier: ${status.tier}`);
  console.log(`Balance: ${status.balance} ETH`);

  // 3. 자동 민팅 시작
  client.startAutoMint();
  console.log('Auto-minting started. Press Ctrl+C to stop.');

  // Graceful shutdown
  process.on('SIGINT', () => {
    client.stopAutoMint();
    console.log('Stopped.');
    process.exit(0);
  });
}

main().catch(console.error);
