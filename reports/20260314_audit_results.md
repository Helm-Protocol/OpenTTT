# TTT SDK TLS+++++++ 전수조사 결과 (2026-03-14)

## 수정 완료 (검증됨: tsc 0 errors, jest 104/104 PASS)

| # | 심각도 | 내용 | 수정 내용 |
|---|--------|------|-----------|
| C1 | CRITICAL | v4_hook.ts balanceOf ERC-1155 인자 누락 | `balanceOf(sender)` → `balanceOf(sender, 0)` |
| H1 | HIGH | networks.ts + ttt_client.ts 제로 주소 보호 없음 | `create()`에 zero address throw 추가 |
| H2 | HIGH | TTTClient health 메트릭 AutoMint 미연결 | `setOnFailure`/`setOnLatency` 콜백 추가 |
| H3 | HIGH | signer.ts GCP KMS 필수 필드 미검증 | null check 추가 |
| M1 | MEDIUM | signer.ts Privy 죽은 객체 | 삭제 |
| M2 | MEDIUM | dynamic_fee.ts AutoBalancer 죽은 코드 | 삭제 |
| M3 | MEDIUM | auto_mint.ts cacheDurationMs 60s→5s | 경고 트리거 해소 |
| TC-GAP | MEDIUM | 테스트 커버리지 6개 모듈 누락 | 6개 테스트 파일 생성 (67→104 tests) |

## Yellow Paper vs Code 불일치 (7건)

| # | Yellow Paper | 코드 | 심각도 |
|---|---|---|---|
| YP1 | T3_micro = $1.50 | TIER_USD_MICRO T3_micro = 12000000n ($12.00) | HIGH — 8배 차이 |
| YP2 | Golay P matrix 값 | golay.ts P matrix 값 다름 | MEDIUM — 동작은 정상 |
| YP3 | RS GF poly 0x11B | reed_solomon.ts POLY = 0x11D | LOW — 코드가 정확 |
| YP4 | Golomb k=4 고정 | grg_forward.ts k 자동 계산 | LOW — 코드가 더 나음 |
| YP5 | TURBO 진입 90% | adaptive_switch.ts 95% | LOW — 코드가 더 보수적 |
| YP6 | 수수료 BOOTSTRAP 3% | FEE_TIERS BOOTSTRAP mintFee=500 (5%) | MEDIUM |
| YP7 | PoT confidence 0.7 최소 | auto_mint.ts 0.5 최소 | LOW |

**결론: 코드가 진실, Yellow Paper 수정 필요 (Jay 확인 2026-03-14)**

## 클라이언트/경쟁사 조사 결과

### 3 Pain Killers (helm_doc2.txt)
- **HelmShield** (Base MEV 보호): ⚠️ "유일" 주장 거짓 — Flashbots 이미 Base 통합
- **HelmGuardian** (에이전트 생존 보험): ✅ 고유 — 경쟁자 없음
- **HelmCollective** (에이전트 풀 인간 고용): ✅ 고유 — 경쟁자 없음

### 2-Track 전략 (helm_yellow_paper.txt)
- **Track 1: HelmOracle** — cortex.rs 90% 완료. LLM hallucination 사전 탐지. **경쟁자 없음.**
- **Track 2: HelmSentinel** — 분산 인프라 B2B. ⚠️ "데이터 품질 유일" 주장 거짓 — Cleanlab 존재.

### 핵심 결론
- **HelmOracle만 진정한 moat** — 새 카테고리(pre-LLM hallucination detection)
- SDK가 좁다: TTT는 DEX 도구가 아니라 TLS급 프로토콜이어야 함
- 제안: SDK → Protocol Layer (tttps://) 확장
