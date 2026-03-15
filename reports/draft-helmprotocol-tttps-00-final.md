# draft-helmprotocol-tttps-00 — 수정 완료 최종본

## 수정 사항 요약 (7건)

| # | 항목 | 상태 |
|---|------|------|
| 1 | Intended Status → Experimental | ✅ |
| 2 | Abstract에 Experimental 근거 문장 추가 | ✅ |
| 3 | T2/T3 가격 수정 ($0.05/$0.10) | ✅ |
| 4 | RFC 8179 인용 제목 수정 | ✅ |
| 5 | Tolerance 이중 체계 관계 명시 | ✅ |
| 6 | OpenTTT URL → "available upon request" | ✅ |
| 7 | Nash Equilibrium 보강 + MUST 조건 | ✅ |
| 8 | URI scheme 등록 + RFC 7595 참조 추가 | ✅ |

---

## 수정 내용 (Google Docs에 복붙)

### 1. 헤더 (2줄 변경)
```
변경 전: Intended status: Proposed Standard
변경 후: Intended status: Experimental
```

### 2. Abstract 첫 문장 뒤 추가
```
추가 위치: Abstract 마지막 문단 (Primary use cases...) 다음

추가:
   This document has Experimental status to allow deployment
   experience to accumulate prior to consideration for the
   Standards Track.  The GRG Integrity Pipeline specification
   will be made available for independent implementation upon
   patent grant.
```

### 3. Section 7 — 가격표 (2줄 변경)
```
변경 전:
| T2_slot  | 12 s     | $0.24     | L1 slot priority          |
| T3_micro | 100 ms   | $12.00    | Institutional / HFT       |

변경 후:
| T2_slot  | 12 s     | $0.05     | L1 slot priority          |
| T3_micro | 100 ms   | $0.10     | Institutional / HFT       |
```

### 4. Section 11.2 — RFC 8179 인용 수정
```
변경 전:
[RFC8179]  Arkko, J. and A. Farrel, "Well-Known URI for IETF
           Notes", BCP 79, RFC 8179, DOI 10.17487/RFC8179,
           May 2017, <https://www.rfc-editor.org/info/rfc8179>.

변경 후:
[RFC8179]  Bradner, S. and J. Contreras, "Intellectual Property
           Rights in IETF Technology", BCP 79, RFC 8179,
           DOI 10.17487/RFC8179, May 2017,
           <https://www.rfc-editor.org/info/rfc8179>.
```

### 5. Section 5.2 — Tolerance 관계 명시 (추가)
```
추가 위치: "T3_micro (100 ms intervals):    10 ms" 바로 아래

추가:
   NOTE: The tier-specific tolerances defined above govern the
   AdaptiveSwitch state transitions (TURBO/FULL classification).
   The stratum-based tolerances defined in Section 3.4(g) govern
   PoT source reading validation during PoT generation.  Both
   checks are independent and both MUST pass for a valid PoT to
   be eligible for TURBO classification.
```

### 6. Section 11.2 — OpenTTT URL 변경
```
변경 전:
[OPENTTT]  TikiTaka Labs, "OpenTTT: TTT (TLS TimeToken) SDK",
           <https://github.com/Helm-Protocol/OpenTTT>.

변경 후:
[OPENTTT]  TikiTaka Labs, "OpenTTT: TTT (TLS TimeToken) SDK",
           Reference implementation available upon request.
           Public release planned upon protocol deployment.
```

### 7. Section 5.4 — Nash Equilibrium 보강 (추가)
```
추가 위치: "provided V_mev does not exceed the penalty cost." 뒤

추가:
   Empirical data from Ethereum mainnet (2024-2025) indicates
   mean per-block MEV of approximately $2.50 with 95th percentile
   at $15.00 [EIGENPHI].  The exponential backoff penalty at
   minimum cooldown (20 blocks at TURBO fee discount) creates a
   penalty cost of approximately $4.00 per incident at T1_block
   pricing, scaling to $80.00 at maximum backoff (320 blocks).
   This ensures U_honest > U_byzantine for the vast majority of
   observed MEV opportunities.

   Implementations MUST configure penalty parameters such that
   L_penalty exceeds the estimated 95th-percentile V_mev for
   the target deployment context.
```

### 8. Section 8 — URI scheme 등록 (IANA 표 형식으로 교체)
```
추가 위치: Section 8 항목 3 뒤

기존 텍스트 삭제 후 아래로 교체:

   4.  Registration in the "Uniform Resource Identifier (URI)
       Schemes" registry [RFC7595]:

       +-------------------+----------------------------------------------+
       | Field             | Value                                        |
       +-------------------+----------------------------------------------+
       | Scheme name       | tttps                                        |
       | Status            | provisional                                  |
       | Applications/     | TLS 1.3 connections augmented with           |
       | protocols that    | Proof-of-Time temporal attestation           |
       | use this scheme   | via the pot_temporal_attestation              |
       |                   | TLS extension defined in this document.      |
       | Contact           | H.J <heime.jorgen@proton.me>                 |
       | Change controller | IETF <iesg@ietf.org>                         |
       | Reference         | [RFCXXXX] (this document)                    |
       +-------------------+----------------------------------------------+

       NOTE: Status is "provisional" during the Experimental phase.
       Upon Standards Track advancement, the authors will request
       update to "permanent" status.
```

```
Section 11.1 Normative References에 추가:

[RFC7595]  Thaler, D., Hansen, T., and T. Hardie, "Guidelines
           and Registration Procedures for URI Schemes", BCP 35,
           RFC 7595, DOI 10.17487/RFC7595, June 2015,
           <https://www.rfc-editor.org/info/rfc7595>.
```

**참고 (Jay 확인사항):**
- URI 별도 신청 불필요. 드래프트가 RFC로 발간되면 IANA가 Section 8을 보고 자동 등록.
- Experimental이므로 Status = "provisional". Standards Track 승격 시 "permanent"로 업데이트 요청.
- Circle/Ripple/Tether가 RFC 발간 전에 tttps:// 사용해야 하면 Early Allocation 요청 가능 (WG 의장 승인 필요, 드래프트 내 명시만 하면 됨).

---

## 저자명 관련

IETF는 pseudonym 허용하나, 향후 SEP(Standard Essential Patent) 지위 주장 시 **특허 출원자 = 드래프트 저자**여야 법적 효력 극대화. 본명 사용 강력 권고.

## IP 보호 현황

| 구분 | 보호 상태 |
|------|----------|
| OpenTTT 공개 repo | E8/8D/lattice/kissing 노출 제로 ✅ |
| IETF 드래프트 | GRG 추상 인터페이스만 공개 ✅ |
| HMAC 키 유도 ABI 순서 | 비공개 (Helm 모 리포) ✅ |
| Vandermonde 캐시 무효화 | 비공개 ✅ |
| Golomb m=16 최적화 | 비공개 ✅ |
| T3_micro 비트배열 최적화 | 비공개 ✅ |

## 3-Layer 배포 모델

- **Layer 1**: 공개 SDK (BSL-1.1) — API 공개, GRG 내부 = 컴파일된 바이너리
- **Layer 2**: 엔터프라이즈 SDK — 소스 + SLA + NDA (Siemens/Bosch급)
- **Layer 3**: TTT Labs 운영 인프라 — NTP 앙상블, PoT 발급, CT Log (완전 비공개)

## Subgraph 상태
- scaffold 완료, codegen + build 성공
- Graph Studio 토큰으로 실배포 대기

---
*Cloco, 2026-03-15*
