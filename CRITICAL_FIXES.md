# CRITICAL FIXES — TLS+++ 감사 결과 즉시 수정 (전부 수정 후 npm test PASS 필수)

## FIX-1: TURBO 모드 GRG 검증 스킵 제거
**파일**: src/adaptive_switch.ts:65-68
**문제**: TURBO에서 GRG 검증을 완전히 스킵함 → 변조 데이터 무검증 통과
**수정**: TURBO에서도 GRG 검증은 항상 실행. TURBO의 혜택은 수수료 할인만. GRG skip 절대 금지.
```typescript
// BEFORE (위험):
if (this.currentMode === AdaptiveMode.TURBO) {
  logger.info(`[AdaptiveSwitch] TURBO mode: Skipping GRG full verification`);
  return AdaptiveMode.TURBO;
}
// AFTER (안전):
const integrityOk = GrgInverse.verify(block.data, tttRecord.grgPayload);
if (!integrityOk) {
  logger.error(`[AdaptiveSwitch] GRG integrity FAILED — forcing FULL mode`);
  this.currentMode = AdaptiveMode.FULL;
  this.history[this.history.length - 1] = false; // 이번 블록 실패 기록
  return AdaptiveMode.FULL;
}
return this.currentMode; // TURBO든 FULL이든, GRG는 항상 검증
```

## FIX-2: EIP-712 서명 필수화 + 리플레이 방지
**파일**: src/protocol_fee.ts:25-35, 44-55
**문제**: signature/user가 optional → 서명 없이 수수료 수취 가능. nonce 없어서 리플레이 가능.
**수정**:
1. signature, user를 REQUIRED로 변경 (optional ? 제거)
2. EIP-712 types에 nonce(uint256) + deadline(uint256) 추가
3. 사용된 서명을 Set<string>에 저장, 중복 거부
4. deadline 초과 시 throw
```typescript
// types에 추가:
{ name: "nonce", type: "uint256" },
{ name: "deadline", type: "uint256" }
// 검증에 추가:
if (Date.now() > Number(deadline) * 1000) throw new Error("Signature expired");
if (this.usedSignatures.has(signature)) throw new Error("Signature already used");
this.usedSignatures.add(signature);
```

## FIX-3: consumeTick 오라클 가격 연동
**파일**: src/ttt_builder.ts:47-60
**문제**: consumeTick이 TIER_USD_MICRO * 10^12로 계산 → 오라클 가격 완전 무시 → 200배 과소청구
**수정**: DynamicFeeEngine.calculateMintFee()를 호출하여 실제 오라클 기반 비용 사용
```typescript
// BEFORE: const costTTT = (usdCostFactor * (10n ** 12n));
// AFTER: DynamicFeeEngine에서 계산된 tttAmount 사용
```

## FIX-4: ttt_builder vs x402_enforcer 비용 통일
**파일**: src/x402_enforcer.ts:19-23, src/ttt_builder.ts
**문제**: TICK_COST와 TIER_USD_MICRO가 10^15배 차이
**수정**: x402_enforcer.ts의 TICK_COST를 제거하고 TIER_USD_MICRO를 공통 소스로 사용. 또는 DynamicFeeEngine을 단일 진실 소스(single source of truth)로 통일.

## FIX-5: tickCount 검증
**파일**: src/dynamic_fee.ts:147 부근
**문제**: tickCount=0이면 수수료 0
**수정**: `if (tickCount <= 0) throw new Error("[DynamicFee] tickCount must be positive");`

## FIX-6: TTT.sol burn() 사용자 접근 허용
**파일**: contracts/contracts/TTT.sol:33
**문제**: onlyOwner라서 일반 사용자가 자기 토큰을 못 태움 → 경제모델 불가
**수정**: burn()에서 onlyOwner 제거, _burn(msg.sender, ...) 유지. 또는 별도 burnFrom() 추가.
```solidity
function burn(uint256 amount, bytes32 grgHash, uint256 tier) external nonReentrant {
    _burn(msg.sender, uint256(grgHash), amount);
    emit TTTBurned(msg.sender, uint256(grgHash), amount, tier);
}
```
+ mint/burn에 이벤트 추가: `event TTTMinted(address indexed to, uint256 indexed tokenId, uint256 amount);`
+ `event TTTBurned(address indexed from, uint256 indexed tokenId, uint256 amount, uint256 tier);`
+ amount=0 방어: `require(amount > 0, "Amount must be positive");`

## FIX-7: SHA-256 체크섬 8바이트로 확장
**파일**: src/grg_forward.ts, src/grg_inverse.ts
**문제**: 4바이트(32bit) → ~65K 시도로 birthday attack 가능
**수정**: 체크섬을 8바이트(64bit)로 확장. ~2^32 시도 필요 → 실질적으로 안전.

## FIX-8: Uniswap 오라클 정밀도 수정
**파일**: src/dynamic_fee.ts:99-101
**문제**: sub-dollar 토큰에서 sqrtPrice 계산 결과 0
**수정**: 스케일을 10^24로 확장하거나 직접 공식 사용:
```typescript
const priceScaled = (BigInt(sqrtPriceX96) * BigInt(sqrtPriceX96) * 1000000n) >> 192n;
```

## FIX-9: AdaptiveSwitch 강화
**파일**: src/adaptive_switch.ts
**문제**: 20% 부정해도 TURBO 유지, 5블록만에 TURBO 진입
**수정**:
1. windowSize를 20으로 확장
2. threshold를 90%로 상향
3. 최소 진입 블록을 windowSize 전체(20)로 변경
4. 단일 실패 시 penalty cooldown 3블록 (즉시 FULL 전환 + 3블록 유지)

## FIX-10: Golay 버퍼 오버플로 수정
**파일**: src/golay.ts:91-118, 128-129
**문제**: 입력이 3바이트 배수 아닐 때 버퍼 오버플로, 잘린 입력에서 undefined 읽음
**수정**:
1. golayEncode: 출력 크기를 Math.ceil(data.length / 3) * 6으로 정확 계산
2. golayDecode: 시작에 `if (encoded.length % 3 !== 0) throw new Error("Invalid encoded length");`

## FIX-11: Chainlink staleness 검증 + oracle 상한
**파일**: src/dynamic_fee.ts
**수정**: latestRoundData의 updatedAt 확인 (1시간 이내). price 상한 검증 (MAX_PRICE = 10^12n 등).

## FIX-12: NTP confidence/stratum 검증
**파일**: src/auto_mint.ts (TimeSynthesis 결과 사용하는 곳)
**수정**: `if (synthesized.confidence === 0 || synthesized.stratum >= 16) throw new Error("Time source unsynchronized");`

---
전부 수정 후 npm test 전체 PASS 확인. 보고: [MEGA-FIX] DONE — 수정파일 목록 + 테스트결과.
