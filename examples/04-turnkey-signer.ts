/**
 * TTT SDK — Turnkey Institutional Signer Example
 *
 * 기관급 커스터디(Turnkey)를 사용하는 DEX 운영자.
 * 프라이빗 키가 절대 서버에 노출되지 않음.
 */
import { TTTClient } from '../src';

async function main() {
  const client = await TTTClient.forBase({
    signer: {
      type: 'turnkey',
      apiBaseUrl: 'https://api.turnkey.com',
      organizationId: process.env.TURNKEY_ORG_ID!,
      privateKeyId: process.env.TURNKEY_PRIVATE_KEY_ID!,
      apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
      apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
    },
    tier: 'T1_block',
  });

  // 헬스체크
  const health = await client.getHealth();
  console.log(`Healthy: ${health.healthy}`);
  console.log(`RPC: ${health.checks.rpcConnected}`);
  console.log(`Signer: ${health.checks.signerAvailable}`);

  // 상태
  const status = await client.getStatus();
  console.log(`Balance: ${status.balance} ETH`);

  // 운영 시작
  client.startAutoMint();
}

main().catch(console.error);
