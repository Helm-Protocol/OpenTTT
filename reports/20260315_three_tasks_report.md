# 3개 태스크 진행 보고

## 1. Etherscan Verify — 대기 (API 키 필요)

**상태:** Basescan API 키 없어서 자동 검증 불가

**준비 완료 사항:**
- TTT.sol 재컴파일 완료 (PoTAnchored 이벤트 포함 ABI 갱신)
- Hardhat verify 설정 완료 (hardhat.config.ts)
- 컴파일러: Solidity 0.8.27, optimizer 200 runs, EVM cancun

**필요한 작업:**
1. https://basescan.org/apis 에서 무료 API 키 생성
2. `contracts/.env`에 `ETHERSCAN_API_KEY=키값` 추가
3. 실행:
```bash
cd contracts && npx hardhat verify --network baseSepolia 0x291b83F605F2dA95cf843d4a53983B413ef3B929
```

**대안:** Basescan 웹에서 직접 수동 검증 가능 (Standard JSON Input)

---

## 2. Subgraph 배포 — 빌드 완료, 배포 대기

**상태:** codegen + build 성공. Graph Studio 인증 토큰 필요.

**완료:**
- ✅ npm install (의존성 설치)
- ✅ ABI 갱신 (PoTAnchored 이벤트 반영, contracts 재컴파일)
- ✅ graph codegen (타입 생성)
- ✅ graph build (WASM 컴파일 → build/subgraph.yaml)

**배포 방법:**
1. https://thegraph.com/studio/ 에서 subgraph 생성 (이름: openttt-sepolia)
2. `graph auth --studio <DEPLOY_KEY>` 인증
3. `npm run deploy` 실행

**서브그래프 스펙:**
- 네트워크: Sepolia
- 컨트랙트: 0x291b83F605F2dA95cf843d4a53983B413ef3B929
- 이벤트: PoTAnchored(indexed uint256, bytes32, bytes32, uint256)
- 엔티티: PoTAnchor (id, stratum, grgHash, potHash, timestamp, blockNumber, txHash)

---

## 3. DeFi 기고문 검토 — 완료

**제목:** "Proof-of-Time: TLS-Grade Transaction Ordering for DeFi"
**분량:** 105줄, 8개 섹션

### IP 보호 검토 ✅
- E8 lattice: 노출 없음 ✅
- 8D 벡터: 노출 없음 ✅
- 양자화 알고리즘: 노출 없음 ✅
- kissing number: 노출 없음 ✅
- G-Score: "Global ordering score"로만 언급 (scalar, 공개 안전) ✅

### 기술 정확성 ✅
- MEV 문제 정의 정확
- GRG 파이프라인 설명 적절 (Golomb-Rice + Reed-Solomon + Golay)
- Adaptive Switch TURBO/FULL 메커니즘 정확
- 경쟁사 비교 (Flashbots SUAVE, MEV-Share, Angstrom) 공정
- 코드 예시 `TTTClient.forSepolia` 사용법 정확

### 수정 제안 (3건)
1. **Tier 설명 불일치** — 기고문에서 T2_slot을 "High-Frequency Arbitrage"라고 했는데, 실제 SDK에서는 "Active Traders". 통일 필요.
2. **가격 미기재** — Tier별 가격($0.001~$0.10)을 명시하면 비즈니스 명확성 증가
3. **T0 무료 전략 미반영** — Jay 전략(T0 스폰서 무료)이 아직 기고문에 안 들어감. Let's Encrypt 비유 추가하면 강력.

### 게재 준비도: 90%
- Mirror 게시 가능 수준
- 위 3건 수정하면 100%

---
*Cloco, 2026-03-15*
