# PHASE 1 — 배선 완성 (PoT + 수수료 + 스왑 + 전체 연결)
# TLS+++ 감사에서 발견된 "엔진은 있는데 배선 안 됨" 문제 전부 해결.
# PHASE0 (CRITICAL_FIXES 12개 + BLOCKERS 17개) 완료 후 즉시 실행.

---

## W1: PoT → mintTick 파이프라인 배선 (CRITICAL)

### W1-1: auto_mint.ts — generateProofOfTime() 호출 추가
- 파일: src/auto_mint.ts:115 부근
- 현재: `synthesize()`만 호출, timestamp만 추출
- 수정:
  1. `synthesize()` 후 `generateProofOfTime()` 호출
  2. PoT 검증 로직 추가 (confidence < 0.5 → throw)
  3. PoT를 MintResult에 포함시켜 callback으로 전달
```typescript
// BEFORE:
const synthesized = await this.timeSynthesis.synthesize();
// AFTER:
const synthesized = await this.timeSynthesis.synthesize();
const pot = await this.timeSynthesis.generateProofOfTime();
if (pot.confidence < 0.5) throw new Error("[PoT] Insufficient confidence");
```

### W1-2: types.ts — MintResult에 ProofOfTime 필드 추가
- 파일: src/types.ts:25-31
- MintResult interface에 `proofOfTime: ProofOfTime` 필드 추가

### W1-3: verifyProofOfTime() 함수 생성
- 파일: src/time_synthesis.ts
- 새 메서드: `verifyProofOfTime(pot: ProofOfTime): boolean`
  1. signatures 배열이 2개 이상인지 확인
  2. 각 소스 timestamp과 finalTimestamp 차이가 TOLERANCE 이내인지
  3. confidence > 0 확인
  4. 결과 boolean 반환

### W1-4: evm_connector.ts — mint에 PoT 메타데이터 첨부
- 파일: src/evm_connector.ts:80-95
- mintTTT()에 PoT hash를 추가 파라미터로 전달
- on-chain에 PoT fingerprint 기록

---

## W2: 수수료 배선 — Jay 지갑까지 (CRITICAL)

### W2-1: ProtocolFee.sol 생성
- 파일: contracts/contracts/ProtocolFee.sol (새 파일)
- 기능:
  - `collectFee(address token, uint256 amount, bytes signature, uint256 nonce, uint256 deadline)` external
  - EIP-712 서명 검증 내장
  - USDC approve → transferFrom → treasury(protocolFeeRecipient)
  - nonce 리플레이 방지
  - deadline 초과 거부
  - Ownable (treasury 주소 변경은 owner만)
  - event FeeCollected(address indexed payer, uint256 amount, uint256 nonce)

### W2-2: protocol_fee.ts → ProtocolFee.sol 연결
- 파일: src/protocol_fee.ts
- collectMintFee() / collectBurnFee()에서 EVMConnector로 on-chain 호출 추가
- protocolFeeRecipient를 실제 사용
- USDC transferFrom 실행

### W2-3: auto_mint.ts → ProtocolFeeCollector 호출 배선
- 파일: src/auto_mint.ts:155-163 (onMintCallback 부분)
- 현재: 메모리에만 기록
- 수정: `ProtocolFeeCollector.collectMintFee()` 실제 호출

### W2-4: x402_enforcer.ts → DynamicFeeEngine 통일
- 파일: src/x402_enforcer.ts:19-23
- TICK_COST 하드코딩 제거
- DynamicFeeEngine.calculateMintFee()를 단일 진실 소스로 사용

---

## W3: 스왑 실제 구현 (HIGH)

### W3-1: evm_connector.ts swap() 실제 구현
- 파일: src/evm_connector.ts:113-135
- 목업 제거
- Uniswap V4 SwapRouter 실제 호출
- 슬리피지 보호 (amountOutMinimum)
- 가스 추정 + 20% 버퍼

### W3-2: TTT.sol tokenId 인코딩 통일
- 파일: contracts/contracts/TTT.sol:44-46
- 현재: getTokenId(pool, timestamp) — 2파라미터
- 수정: getTokenId(chainId, pool, timestamp, slotIndex) — SDK와 동일 4파라미터
- keccak256(abi.encode(chainId, pool, timestamp, slotIndex))

---

## W4: 클라이언트 UX 완성 (HIGH)

### W4-1: ttt_client.ts getStatus() TTT 잔액 추가
- 파일: src/ttt_client.ts:74-100
- ERC-1155 balanceOf() 쿼리 추가
- ETH + TTT 잔액 둘 다 반환

### W4-2: ttt_client.ts에 PoolRegistry 연결
- PoolRegistry를 TTTClient에서 인스턴스화
- listPools(), getPoolStats() 메서드 노출

### W4-3: 이벤트 리스너 추가
- evm_connector.ts에 contract.on("TTTMinted", ...) 추가
- TTTMinted, TTTBurned, FeeCollected 이벤트 구독
- callback으로 TTTClient에 알림

### W4-4: README.md 실제 API와 일치
- 실제 TTTClient 생성자/메서드 기반 재작성
- quickstart 예제 포함
- 잘못된 client.init() → client.initialize()로 수정

---

## 수정 순서
1. W1 (PoT 배선) → npm test PASS
2. W2 (수수료 배선) → npm test + npx hardhat test PASS
3. W3 (스왑 구현) → npm test PASS
4. W4 (UX 완성) → npm test PASS

전체 완료 후 보고: [PHASE1-WIRING] DONE — 수정파일 + 테스트결과
