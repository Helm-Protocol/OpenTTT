# OpenTTT Launch Readiness — 야간 작업 보고

Jay, 밤새 작업 완료 보고.

## 완료 항목 (6/7)

1. **LICENSE** (BSL 1.1) ✅
   - Licensor: Helm Protocol Foundation
   - Change Date: 2030-03-14 → Apache 2.0

2. **TTT.sol PoTAnchored** ✅
   - `event PoTAnchored(uint256 indexed stratum, bytes32 grgHash, bytes32 potHash, uint256 timestamp)`
   - mint()에서 자동 emit
   - SPDX: BUSL-1.1로 교정

3. **MCP Server** ✅
   - `mcp/index.ts` — JSON-RPC 2.0 stdin/stdout
   - `mcp/tools.ts` — 7개 tool (mint/burn/emergency/price/rate/connect/cache)
   - AI 에이전트가 SDK 직접 호출 가능

4. **The Graph Subgraph** ✅
   - Sepolia 0x291b...3B929 연결
   - PoTAnchor 엔티티 — 공개 PoT 감사 가능
   - 배포: Subgraph Studio에서 deploy 필요 (런칭 당일)

5. **CI/CD** ✅
   - `.github/workflows/ci.yml` (Node 20, tsc, jest, codecov)
   - README 배지 추가 (CI + Coverage + 273 tests)

6. **코드 검증** ✅
   - tsc: 0 errors
   - jest: 29 suites, 273 tests ALL PASS

7. **DeFi 기술 기고문** ⏳
   - Krishna 작성 중 (Mirror/Flashbots Research 게재용)
   - "Proof-of-Time: TLS-Grade Transaction Ordering for DeFi"

## 런칭 당일 체크리스트

- [ ] Etherscan verify (Base Sepolia TTT contract)
- [ ] Subgraph Studio 배포
- [ ] Uniswap v4 Hook 데모 풀 배포
- [ ] DeFi 기고문 최종 교정 → Mirror 게시
- [ ] 개발자 5명 outreach 시작

## T2/T3 감사 수정 반영

| Tier | Before | After | Rationale |
|------|--------|-------|-----------|
| T2_slot | $0.24 | $0.05 | 볼륨 기반 수익 모델 |
| T3_micro | $12.00 | $0.10 | 트랜잭션당 1틱 소비 기준 |

## 파일 목록

```
NEW:  LICENSE, mcp/, subgraph/, .github/workflows/ci.yml
EDIT: TTT.sol (PoTAnchored + BUSL-1.1), README.md (badges + test count)
      dynamic_fee.ts (T2/T3 prices), dynamic_fee_branch.test.ts (expectations)
```

---
*Cloco, 2026-03-15 overnight*
