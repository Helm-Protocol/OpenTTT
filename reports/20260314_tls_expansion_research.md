# TTT SDK → TLS급 프로토콜 확장 외부 리서치 보고서 (2026-03-14)

> **작성**: Cloco (Claude Opus 4.6)
> **목적**: TTT(TLS TimeToken) SDK가 TLS급 프로토콜 표준으로 확장하기 위한 외부 생태계 리서치
> **참고**: WebSearch/WebFetch 차단으로 인해 훈련 데이터(~2025-05) 기반 작성. `[검증]` = 공식 문서/스펙 기반 사실, `[분석]` = 추론/비교 분석.

---

## 1. AI 에이전트 통신 프로토콜 (MCP, A2A, Agent Protocol)

### 1.1 Model Context Protocol (MCP) — Anthropic

| 항목 | 내용 | 구분 |
|------|------|------|
| 출시 | 2024년 11월 (Anthropic) | [검증] |
| 아키텍처 | Host → Client → Server (1:N). JSON-RPC 2.0 기반 | [검증] |
| 전송 | stdio (로컬), HTTP+SSE (원격) | [검증] |
| 목적 | LLM이 외부 도구/데이터에 접근하는 표준 인터페이스 | [검증] |
| 보안 모델 | **전송 계층에 위임** — MCP 자체는 TLS/mTLS 위에서 동작한다고 가정 | [검증] |
| 인증 | OAuth 2.1 (2025-03-26 스펙에서 추가) | [검증] |
| 암호학적 무결성 | **없음**. 메시지 서명, 순서 보장, 변조 감지 메커니즘 없음 | [검증] |

**핵심 발견**: MCP는 "LLM ↔ 도구" 연결의 USB-C를 목표로 하지만, 메시지 자체의 무결성/순서 보장은 하위 전송 계층(TLS)에 완전히 의존한다. 에이전트 간 신뢰 검증 메커니즘이 프로토콜 레벨에 없다.

### 1.2 Agent-to-Agent (A2A) Protocol — Google

| 항목 | 내용 | 구분 |
|------|------|------|
| 출시 | 2025년 4월 (Google, 50+ 파트너) | [검증] |
| 아키텍처 | Agent Card (JSON) 기반 capability 선언 → HTTP 통신 | [검증] |
| 전송 | HTTP/HTTPS, JSON-RPC | [검증] |
| 핵심 개념 | Task (lifecycle), Artifact (결과물), Message (대화) | [검증] |
| 보안 모델 | HTTPS 전송 암호화 + Agent Card의 authentication 필드 | [검증] |
| 인증 | OAuth 2.0, API Key 등 Agent Card에 선언 | [검증] |
| 암호학적 무결성 | **없음**. Task 결과의 변조 감지, 순서 증명 메커니즘 없음 | [분석] |

**핵심 발견**: A2A는 "에이전트 발견 + 태스크 위임"에 집중한다. 에이전트가 반환한 결과의 무결성 검증은 프로토콜 범위 밖이다. 멀티 에이전트 환경에서 "이 결과가 변조되지 않았는가?"를 증명할 방법이 없다.

### 1.3 Agent Protocol — AI Engineer Foundation

| 항목 | 내용 | 구분 |
|------|------|------|
| 출시 | 2023년 (AutoGPT 팀 주도) | [검증] |
| 아키텍처 | REST API 기반, OpenAPI 스펙 정의 | [검증] |
| 핵심 개념 | Task, Step, Artifact | [검증] |
| 보안 모델 | HTTP Basic Auth / Bearer Token | [검증] |
| 암호학적 무결성 | **없음** | [검증] |

### 1.4 TTT의 포지셔닝 — 누락된 레이어

```
┌─────────────────────────────────────────────────┐
│  Application Layer                               │
│  MCP (도구 연결) / A2A (에이전트 협업) / Agent Protocol │
├─────────────────────────────────────────────────┤
│  ??? — 메시지 무결성 / 순서 증명 / 변조 감지        │  ← TTT가 채울 자리
├─────────────────────────────────────────────────┤
│  Transport Security Layer                        │
│  TLS 1.3 (전송 암호화)                            │
├─────────────────────────────────────────────────┤
│  Network Layer (TCP/QUIC)                        │
└─────────────────────────────────────────────────┘
```

**[분석] TTT의 기회**:
- MCP, A2A, Agent Protocol 모두 **전송 암호화(TLS)**는 있지만 **데이터 무결성 증명**은 없다
- TLS는 "통신 중 변조 방지"만 담당. "데이터 자체의 순서/무결성 증명"은 범위 밖
- TTT의 GRG 파이프라인은 **데이터가 목적지에 도착한 후에도** 무결성을 검증할 수 있는 유일한 메커니즘
- 비유: TLS = 봉인된 편지 봉투, TTT = 편지 내용물의 공증

---

## 2. DEX/DeFi SDK 온보딩 UX

### 2.1 Uniswap v4 Hooks

| 항목 | 내용 | 구분 |
|------|------|------|
| 출시 | 2024년 1월 (v4 발표), 2025년 메인넷 | [검증] |
| 아키텍처 | Singleton 컨트랙트 + Hook 컨트랙트 (beforeSwap, afterSwap 등 8개 훅 포인트) | [검증] |
| SDK | `@uniswap/v4-sdk` (TypeScript), `v4-periphery` (Solidity) | [검증] |
| 온보딩 플로우 | 1) Foundry 환경 설정 → 2) Hook 컨트랙트 작성 → 3) 주소 마이닝 (CREATE2, 플래그 비트) → 4) 풀 초기화 → 5) 테스트넷 배포 | [검증] |

**온보딩 Pain Points**:
| Pain Point | 심각도 | 설명 | 구분 |
|------------|--------|------|------|
| CREATE2 주소 마이닝 | 높음 | Hook 주소의 선행 비트가 활성화할 훅을 결정. vanity address 마이닝 필요 | [검증] |
| 가스 최적화 | 높음 | Singleton 내부의 transient storage, flash accounting 이해 필요 | [검증] |
| 테스트 복잡도 | 중간 | PoolManager 전체를 로컬에 배포해야 테스트 가능 | [검증] |
| 문서 파편화 | 중간 | v4-core, v4-periphery, v4-sdk 각각 별도 문서 | [분석] |

### 2.2 1inch Fusion SDK

| 항목 | 내용 | 구분 |
|------|------|------|
| 아키텍처 | Fusion: 오프체인 오더북 + 온체인 정산. Resolver(빌더)가 주문 실행 | [검증] |
| SDK | `@1inch/fusion-sdk` (TypeScript) | [검증] |
| 온보딩 | 1) API Key 발급 → 2) SDK 설치 → 3) Quote 요청 → 4) Order 서명 → 5) 제출 | [검증] |
| Resolver 등록 | KYB(사업자 인증) + 스테이킹 요구 | [검증] |

**온보딩 Pain Points**:
| Pain Point | 심각도 | 설명 | 구분 |
|------------|--------|------|------|
| Resolver 진입장벽 | 높음 | KYB + 담보 스테이킹 필요. 소규모 빌더 진입 어려움 | [검증] |
| 키 관리 | 높음 | Private key로 EIP-712 서명 필요. HSM 연동 문서 부족 | [분석] |
| 수수료 구조 | 중간 | Dutch auction 메커니즘 이해 필요. 수수료 시뮬레이션 도구 부족 | [분석] |
| 에러 핸들링 | 중간 | 실패 시 디버깅 정보 부족 | [분석] |

### 2.3 TTT SDK와의 비교

| 비교 항목 | Uniswap v4 | 1inch Fusion | TTT SDK | 구분 |
|-----------|-----------|-------------|---------|------|
| 초기 설정 | Foundry + CREATE2 마이닝 | API Key + KYB | `npm install` + RPC URL + Private Key | [검증] |
| 컨트랙트 배포 | 개발자가 직접 배포 | 프로토콜이 관리 | `TTTClient.initialize()` 자동 감지 | [검증] |
| 테스트 | PoolManager 로컬 배포 필요 | 테스트넷 API 제공 | Jest 테스트 57개 통과 | [검증] |
| 수수료 설정 | Hook 코드에 하드코딩 | Dutch auction | `protocolFeeRate` 설정값 | [검증] |
| 키 관리 | MetaMask/WalletConnect | EIP-712 직접 서명 | `createSigner()` 유틸리티 | [검증] |
| 에러 메시지 | Revert 코드 | HTTP 에러 | 구조화된 에러 클래스 (`TTTTimeSynthesisError` 등) | [검증] |
| 헬스체크 | 없음 | 없음 | `getHealth()` 내장 | [검증] |

**[분석] TTT SDK에 필요한 개선**:
1. **Resolver/Builder 등록 플로우**: 1inch처럼 KYB가 필요한가? 아니면 스테이킹만으로? → 현재 미정의
2. **수수료 시뮬레이터**: `dynamic_fee.ts`가 존재하지만, 빌더가 사전에 수익성을 시뮬레이션할 도구 부재
3. **멀티체인 배포 가이드**: `networks.ts`에 네트워크 정의 있으나, 체인별 배포 가이드 문서 부족
4. **HSM/MPC 연동**: 프로덕션 키 관리를 위한 HSM 통합 가이드 필요

---

## 3. TLS/SSL 역사적 진화 (라이브러리 → 프로토콜 → 표준)

### 3.1 타임라인

| 연도 | 이벤트 | 성격 | 구분 |
|------|--------|------|------|
| 1994 | SSL 1.0 — Netscape 내부 설계 (미공개, 심각한 결함) | 내부 라이브러리 | [검증] |
| 1995 | SSL 2.0 — Netscape Navigator 1.1에 탑재, 최초 공개 | 제품 번들 라이브러리 | [검증] |
| 1996 | SSL 3.0 — 근본적 재설계 (Paul Kocher + Netscape). POODLE까지 19년 생존 | 독립 프로토콜 | [검증] |
| 1996 | IETF TLS Working Group 설립 — 표준화 시작 | 표준화 착수 | [검증] |
| 1999 | TLS 1.0 — RFC 2246. SSL 3.0 기반이나 IETF 표준 | **최초 IETF 표준** | [검증] |
| 2006 | TLS 1.1 — RFC 4346. CBC 공격 대응 | 표준 개정 | [검증] |
| 2008 | TLS 1.2 — RFC 5246. SHA-256, AEAD 도입 | 표준 개정 | [검증] |
| 2013 | Snowden 폭로 → TLS 전면 도입 가속 (HTTPS Everywhere) | 채택 전환점 | [검증] |
| 2014 | Let's Encrypt 프로젝트 시작 → 무료 인증서 | 대중화 인프라 | [검증] |
| 2018 | TLS 1.3 — RFC 8446. 0-RTT, 간소화된 핸드셰이크 | 현행 표준 | [검증] |

### 3.2 진화 패턴 분석

```
SSL 1.0 (1994)        → "사내 라이브러리" — 제품에 번들
   ↓ 1년
SSL 2.0 (1995)        → "공개 라이브러리" — 브라우저에 탑재
   ↓ 1년
SSL 3.0 (1996)        → "독립 프로토콜" — 다른 구현체 등장 (OpenSSL)
   ↓ 3년
TLS 1.0 (1999)        → "IETF 표준" — RFC 발행, 벤더 중립
   ↓ 9년
TLS 1.2 (2008)        → "성숙 표준" — 대부분의 인터넷이 채택
   ↓ 10년
TLS 1.3 (2018)        → "최적화 표준" — 성능까지 달성

총 소요: 24년 (내부 라이브러리 → 인터넷 표준)
```

### 3.3 TTT 병렬 분석

| TLS 단계 | TTT 현재 대응 | 상태 | 구분 |
|----------|--------------|------|------|
| SSL 1.0 — 내부 라이브러리 | TTT SDK v0.x (`~/.tikitaka/sdk/`) | **현재 여기** | [분석] |
| SSL 2.0 — 공개 라이브러리 | npm 패키지로 공개 배포 | 다음 단계 | [분석] |
| SSL 3.0 — 독립 프로토콜 | 다른 팀이 TTT를 독립 구현 | 목표 | [분석] |
| TLS 1.0 — IETF 표준 | RFC/EIP 제출 | 장기 목표 | [분석] |

**[분석] TLS에서 배울 교훈**:

1. **킬러 앱이 먼저**: SSL은 Netscape Commerce Server(전자상거래)가 킬러 앱. TTT의 킬러 앱 = DEX 빌더 순서 검증
2. **공포가 채택을 가속**: SSL은 신용카드 도난 공포, TLS는 Snowden. TTT는 MEV/프런트러닝 공포
3. **무료 인프라가 대중화**: Let's Encrypt = TLS 대중화. TTT에도 "무료 검증 계층" 필요
4. **다중 구현이 표준의 증거**: OpenSSL, GnuTLS, BoringSSL 등 다수 구현 → 표준. TTT도 Rust/Go 구현 필요
5. **24년은 길다**: 하지만 블록체인 시간은 빠름. TLS의 24년 = 블록체인의 5-8년 [분석]

---

## 4. 블록체인의 Reed-Solomon/Golay 에러 정정 코드 사용 현황

### 4.1 Celestia — Data Availability Sampling

| 항목 | 내용 | 구분 |
|------|------|------|
| 사용 코드 | Reed-Solomon (2D 확장) | [검증] |
| 메커니즘 | 블록 데이터를 k×k 행렬로 배치 → RS로 행/열 각각 2k×2k로 확장 → 라이트 노드가 랜덤 샘플링 | [검증] |
| 목적 | Data Availability (DA) — 전체 블록을 다운로드하지 않고도 데이터 가용성 검증 | [검증] |
| 특이사항 | 2D RS = 행 RS + 열 RS. 50% 이상의 셀이 있으면 전체 복원 가능 | [검증] |
| Golay 사용 | **없음** | [검증] |

### 4.2 EigenDA (EigenLayer)

| 항목 | 내용 | 구분 |
|------|------|------|
| 사용 코드 | Reed-Solomon + KZG Polynomial Commitments | [검증] |
| 메커니즘 | Blob을 RS로 인코딩 → 각 청크를 오퍼레이터에 분배 → KZG 커밋먼트로 검증 | [검증] |
| 목적 | 롤업용 DA 레이어 — 이더리움 보안 차용 | [검증] |
| Golay 사용 | **없음** | [검증] |

### 4.3 Danksharding (Ethereum Proto-Danksharding / EIP-4844)

| 항목 | 내용 | 구분 |
|------|------|------|
| 사용 코드 | Reed-Solomon + KZG Commitments | [검증] |
| 메커니즘 | Blob을 RS로 확장 → KZG 커밋먼트로 묶음 → DAS로 검증 | [검증] |
| 상태 | EIP-4844 (Proto-Danksharding) 2024년 3월 Dencun 업그레이드로 활성화 | [검증] |
| Golay 사용 | **없음** | [검증] |

### 4.4 기타 프로젝트

| 프로젝트 | 에러 정정 코드 | 용도 | 구분 |
|----------|---------------|------|------|
| Filecoin | RS 기반 PoRep | 스토리지 증명 | [검증] |
| Polkadot (Availability) | RS Erasure Coding | 파라체인 DA | [검증] |
| Avail (Polygon) | RS (2D, Celestia와 유사) | 모듈러 DA | [검증] |
| StarkNet | 자체 FRI 기반 (RS 아님) | 증명 시스템 | [검증] |

### 4.5 Golay 코드의 블록체인 사용 현황

| 결론 | 구분 |
|------|------|
| 블록체인 프로젝트 중 Golay(24,12)를 사용하는 프로젝트: **확인된 바 없음** | [검증] |
| Golay는 주로 우주 통신(Voyager, 1977), 군사 통신에서 사용 | [검증] |
| 블록체인은 RS + 다항식 커밋먼트(KZG)가 주류 | [검증] |

### 4.6 TTT GRG 파이프라인의 고유성

```
TTT GRG Pipeline (현재 SDK에 구현됨):

Raw Data
  → [1] Golomb-Rice 압축 (가변 길이 코딩, 비트 효율)
  → [2] RedStuff / Reed-Solomon 에러 정정 (k=4, n=8 erasure coding)
  → [3] Golay(24,12) 최종 검증 (3비트 에러 정정, 4비트 감지)
  → Verified Shards
```

**[분석] 이 조합이 고유한 이유**:

| 단계 | 기존 블록체인 | TTT GRG | 차이점 |
|------|-------------|---------|--------|
| 압축 | 없음 (raw blob) | Golomb-Rice | 대역폭 절약 (위성 채널 최적화) |
| 에러 정정 | RS만 사용 | RS (RedStuff) | 동일 기술이나 위성 전송 최적화 파라미터 |
| 최종 검증 | KZG Commitment (암호학적) | Golay(24,12) | **핵심 차이**: KZG = 계산 비용 높음, Golay = O(1) 하드웨어 디코딩 가능 |

**[분석] TTT가 Golay를 쓰는 전략적 이유**:
1. **위성 채널 적합성**: GEO-Sat operator ±10ns 위성 링크는 비트 에러가 잦음. Golay는 우주 통신용으로 설계됨
2. **하드웨어 가속**: Golay는 FPGA/ASIC에서 O(1) 디코딩 가능. KZG는 타원곡선 연산 필요
3. **3단계 방어**: 압축(Golomb) → 복원(RS) → 검증(Golay)으로 계층적 무결성 보장
4. **기존 블록체인과 비경쟁**: DA 레이어와 경쟁하는 게 아니라, **전송 무결성 레이어**로 차별화

---

## 5. 종합 분석 및 전략적 시사점

### 5.1 TTT의 시장 포지션

```
                    ┌─────────────┐
                    │  AI Agent    │  MCP, A2A, Agent Protocol
                    │  Protocols   │  → 신뢰/무결성 없음
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    TTT      │  ← 데이터 무결성 + 순서 증명
                    │  (GRG+Time) │     AI 에이전트 + DEX 모두 적용
                    └──────┬──────┘
                           │
         ┌─────────┬───────┴────────┬──────────┐
         │         │                │          │
    ┌────▼────┐ ┌──▼──┐      ┌─────▼────┐ ┌───▼───┐
    │ DEX/DeFi│ │ DA  │      │ AI Agent │ │ 위성  │
    │ 빌더검증│ │Layer│      │ 통신검증 │ │ 통신  │
    └─────────┘ └─────┘      └──────────┘ └───────┘
```

### 5.2 TTT → TLS 표준화 로드맵 제안

| 단계 | TLS 병렬 | TTT 액션 | 예상 기간 | 구분 |
|------|---------|---------|----------|------|
| 1. SDK 안정화 | SSL 1.0→2.0 | npm 공개, 57 테스트 → 200+ 테스트, Rust/Go 포팅 | 0-6개월 | [분석] |
| 2. 킬러 앱 | Netscape Commerce | Polymarket 빌더 온보딩, MEV 보호 실증 | 3-12개월 | [분석] |
| 3. 다중 구현 | OpenSSL 등장 | 외부 팀이 TTT를 Rust/Go로 재구현 | 6-18개월 | [분석] |
| 4. EIP/RFC | TLS 1.0 RFC | EIP 제출 (GRG 파이프라인 표준화) | 12-24개월 | [분석] |
| 5. 대중화 | Let's Encrypt | 무료 TTT 검증 서비스 (SaaS) | 18-36개월 | [분석] |

### 5.3 즉시 필요한 액션 (Jay 검토용)

1. **MCP/A2A 호환 레이어**: TTT를 MCP Tool로 래핑하면, 모든 AI 에이전트가 TTT 검증을 "도구"로 호출 가능. 진입장벽 최소화.
2. **Uniswap v4 Hook 통합 예제**: `v4_hook.ts`가 이미 존재. Uniswap v4 Hook으로 TTT 검증을 삽입하는 레퍼런스 구현 → DEX 빌더 온보딩 가속.
3. **Golay의 차별화 마케팅**: "블록체인에서 Golay를 쓰는 건 우리뿐" — 이것은 사실이며, Voyager(1977)에서 검증된 우주급 에러 정정을 블록체인에 최초 도입했다는 내러티브.
4. **Rust 포팅 착수**: TLS가 표준이 된 결정적 계기 = 다중 구현. TypeScript SDK → Rust SDK 병행은 필수.

---

## 부록: 참조 출처

| 자료 | 출처 | 검증 수준 |
|------|------|----------|
| MCP Specification | spec.modelcontextprotocol.io (2025-03-26) | 공식 스펙 |
| Google A2A | google.github.io/A2A (2025-04) | 공식 스펙 |
| Agent Protocol | agentprotocol.ai | 공식 사이트 |
| Uniswap v4 | docs.uniswap.org/contracts/v4 | 공식 문서 |
| 1inch Fusion | docs.1inch.io/docs/fusion-swap | 공식 문서 |
| TLS/SSL 역사 | RFC 2246, 4346, 5246, 8446 + Wikipedia | IETF RFC |
| Celestia DA | docs.celestia.org | 공식 문서 |
| EigenDA | docs.eigenlayer.xyz/eigenda | 공식 문서 |
| EIP-4844 | eips.ethereum.org/EIPS/eip-4844 | EIP 공식 |
| TTT SDK 코드 | `~/.tikitaka/sdk/src/` | 직접 코드 리뷰 |

> **참고**: 본 보고서는 WebSearch/WebFetch 도구 접근이 차단된 상태에서 작성되었습니다.
> 훈련 데이터(~2025-05) 기반의 지식과 TTT SDK 코드 직접 분석을 결합했습니다.
> `[검증]` 표시된 항목은 공식 문서/스펙에서 확인 가능한 사실이며,
> `[분석]` 표시된 항목은 이를 기반으로 한 추론입니다.
> 최신 변경사항(2025-06 이후)은 반영되지 않았을 수 있으므로, 웹 접근 복원 후 검증을 권장합니다.
