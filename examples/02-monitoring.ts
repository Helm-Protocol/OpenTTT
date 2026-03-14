/**
 * TTT SDK — Monitoring Example
 *
 * 프로덕션 운영자를 위한 헬스체크 + 알림 설정.
 */
import { ethers } from 'ethers';
import { TTTClient } from '../src';

async function main() {
  const client = await TTTClient.forSepolia({
    signer: { type: 'privateKey', envVar: 'PRIVATE_KEY' }
  });

  // 잔고 최소 임계값 설정 (0.05 ETH 이하면 알림)
  client.setMinBalance(ethers.parseEther('0.05'));

  // 알림 콜백 등록
  client.onAlert((alert) => {
    console.error(`[ALERT] ${alert}`);
    // 여기서 PagerDuty, Slack, Telegram 등 외부 알림 전송 가능
  });

  // 주기적 헬스체크 (30초마다)
  setInterval(async () => {
    const health = await client.getHealth();

    if (health.healthy) {
      console.log(`[OK] mints=${health.metrics.mintCount} fees=${health.metrics.totalFeesPaid} latency=${health.metrics.avgMintLatencyMs}ms`);
    } else {
      console.error(`[UNHEALTHY] alerts: ${health.alerts.join(', ')}`);
      console.error(`  checks: ${JSON.stringify(health.checks)}`);
    }
  }, 30_000);

  client.startAutoMint();
  console.log('Monitoring active. Ctrl+C to stop.');

  process.on('SIGINT', () => {
    client.stopAutoMint();
    process.exit(0);
  });
}

main().catch(console.error);
