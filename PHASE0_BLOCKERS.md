# PHASE 0 — 배포 전 필수 수정 (17개) [RESOLVED]
# TLS+++ 6단계 감사 결과 종합. 전부 수정 완료 (2026-03-13).

---

## BATCH 1: 보안 CRITICAL (먼저)

### B1-1: TURBO GRG 검증 스킵 제거 [RESOLVED 2026-03-13]
- 요약: `AdaptiveSwitch.verifyBlock()`에서 모드에 관계없이 `GrgInverse.verify()`를 항상 호출하도록 수정. 무결성 실패 시 즉시 FULL 모드 강제 전환.

### B1-2: EIP-712 서명 필수 + nonce + deadline [RESOLVED 2026-03-13]
- 요약: `ProtocolFeeCollector` 및 `signFeeMessage`에 `nonce`와 `deadline` 필드 추가. `usedSignatures` 캐시를 통한 리플레이 공격 방지 및 만료 체크 구현.

### B1-3: 비용 계산 통일 (ttt_builder ↔ x402_enforcer) [RESOLVED 2026-03-13]
- 요약: 하드코딩된 `TICK_COST` 제거. `DynamicFeeEngine`을 중앙 진실 소스로 활용하여 모든 모듈에서 오라클 기반 비용 계산 수행.

### B1-4: tickCount 검증 [RESOLVED 2026-03-13]
- 요약: `DynamicFeeEngine.calculateMintFee()` 등에서 `tickCount`가 0 이하일 경우 예외를 발생시키도록 가드 로직 추가.

### B1-5: SHA-256 체크섬 4→8바이트 [RESOLVED 2026-03-13]
- 요약: `GrgForward`와 `GrgInverse`의 무결성 체크섬을 4바이트에서 8바이트로 확장하여 충돌 저항성 강화.

### B1-6: Golay 버퍼 오버플로 수정 [RESOLVED 2026-03-13]
- 요약: `golay.ts`에서 입력 데이터 길이에 따른 정확한 버퍼 할당 로직 적용 및 디코딩 시 6바이트 정렬 검증 추가.

### B1-7: Uniswap 오라클 정밀도 [RESOLVED 2026-03-13]
- 요약: `DynamicFeeEngine`에서 Uniswap `sqrtPriceX96`을 이용한 가격 계산 시 정밀도 손실을 방지하기 위한 비트 시프트 연산 최적화.

### B1-8: Chainlink staleness + 가격 상한 [RESOLVED 2026-03-13]
- 요약: Chainlink 데이터의 `updatedAt`이 1시간(1800s * 2) 이내인지 검증하고, 비정상적인 고가 발생 시 `fallbackPrice` 사용 로직 구현.

### B1-9: AdaptiveSwitch 인스턴스 기반으로 리팩토링 [RESOLVED 2026-03-13]
- 요약: `AdaptiveSwitch`를 인스턴스화하여 빌더별 독립적인 슬라이딩 윈도우(20블록) 관리. 90% 임계값 및 실패 시 3블록 쿨다운 적용.

---

## BATCH 2: 스마트 컨트랙트 (그다음)

### B2-1: TTT.sol burn() onlyOwner 제거 [RESOLVED 2026-03-13]
- 요약: `burn()` 함수의 `onlyOwner` 수식어 제거. `TTTMinted` 및 `TTTBurned` 이벤트에 `grgHash`와 `tier` 필드 추가.

### B2-2: TTT.sol Pausable 추가 [RESOLVED 2026-03-13]
- 요약: OpenZeppelin `Pausable` 도입. 긴급 상황 시 관리자가 `mint`/`burn`을 중단할 수 있는 기능 추가.

### B2-3: TTT.sol tokenId 인코딩 SDK와 일치 [RESOLVED 2026-03-13]
- 요약: SDK의 `keccak256(chainId, pool, timestamp, slotIndex)` 방식과 동일하게 컨트랙트 `getTokenId` 로직 동기화.

### B2-4: TTT.sol 메타데이터 URI 설정 [RESOLVED 2026-03-13]
- 요약: `ERC1155Supply` 상속 및 초기 URI 설정. 발행량 추적 기능 활성화.

### B2-5: ProtocolFee.sol 생성 [RESOLVED 2026-03-13]
- 요약: EIP-712 기반 서명 검증 및 USDC 수수료 정산 기능을 갖춘 독립적인 `ProtocolFee.sol` 컨트랙트 구현.

---

## BATCH 3: 누락 모듈 (마지막)

### B3-1: 온체인 수수료 전송 연결 [RESOLVED 2026-03-13]
- 요약: `ProtocolFeeCollector`가 온체인 `ProtocolFee` 컨트랙트와 상호작용하여 실제 USDC 전송 및 서명 제출을 수행하도록 연결.

### B3-2: README 실제 API와 일치 [RESOLVED 2026-03-13]
- 요약: `TTTClient` 생성자, 팩토리 메서드(`forBase`, `forSepolia`) 등 최신 SDK API 사양에 맞게 README 예제 전면 개편.

### B3-3: getStatus()에 TTT 잔액 추가 [RESOLVED 2026-03-13]
- 요약: `TTTClient.getStatus()` 호출 시 계정의 ETH 잔액뿐만 아니라 해당 토큰 ID의 TTT 잔액도 함께 반환하도록 고도화.
