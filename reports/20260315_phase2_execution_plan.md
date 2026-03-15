# Phase 2 Execution Plan — M1~M6 Strategic Timeline

## 전략 원칙
- **순서 불변**: IETF Draft → Traction (10,000 PoT) → Vendor 계약
- **순서 역전 = 협상력 상실**: SoftBank에 먼저 가면 안 됨
- **IP 공개 = 특허 출원 후에만**: 공개 전 반드시 provisional patent

---

## M1 (4월) — Foundation & First Traction

### Week 1-2: SDK 완성 + 배포
| 항목 | 산출물 | 담당 |
|------|--------|------|
| Etherscan verify (Base Sepolia) | 검증된 컨트랙트 | Jay (API 키) |
| Subgraph Studio 실배포 | GraphQL 엔드포인트 라이브 | Jay (토큰) |
| npm `openttt@0.1.1` publish | ct_log + trust_store + revenue_tiers 포함 | Cloco |
| Uniswap v4 Hook 데모 풀 | PoT-ordered swap 시연 | Krishna |

### Week 3-4: AI MCP 래퍼 (가장 빠른 시장)
| 항목 | 산출물 | 소요 |
|------|--------|------|
| MCP TypeScript 래퍼 | `@helm-protocol/mcp-ttt` | 2주 |
| 7 MCP tools 통합 테스트 | mcp/tools.ts 기반 | 3일 |
| Anthropic MCP 마켓플레이스 등록 | 리스팅 라이브 | 1일 |
| Claude Desktop 연동 데모 | 스크린캐스트 | 1일 |

### M1 KPI
- [ ] npm 다운로드 100+
- [ ] PoT 발급 1,000개
- [ ] MCP 래퍼 마켓플레이스 등록

### M1 IP 공개 범위
- ✅ npm SDK (BSL-1.1, GRG = 컴파일된 바이너리)
- ❌ E8/8D/lattice/kissing number — 절대 비공개

---

## M2 (5월) — Academic Foundation + IoT Prep

### Week 1-2: Yellow Paper + arXiv
| 항목 | 산출물 | 비고 |
|------|--------|------|
| Yellow Paper v3.0 final | 수학적 증명 보강 | 557줄 → 800줄+ |
| arXiv preprint 제출 | cs.CR (Cryptography & Security) | Prior art 확립 |
| GRG 추상 인터페이스만 공개 | 내부 구현 비공개 유지 | IP 보호 |

### Week 3-4: IoT Rust Edge SDK
| 항목 | 산출물 | 비고 |
|------|--------|------|
| `helm-ttt-edge` crate 정리 | 1,493줄 Rust, cargo build 확인 | no_std 호환 |
| crates.io publish | v0.1.0 | 2주 |
| Raspberry Pi 4 PoT 데모 | 30fps PoT 생성 벤치마크 | 영상 촬영 |
| Embedded World 2027 CFP 제출 | Nuremberg, 2027-03 | 마감 확인 필요 |

### M2 KPI
- [ ] arXiv preprint DOI 확보
- [ ] crates.io publish
- [ ] Raspberry Pi 데모 영상 1개

### M2 IP 공개 범위
- ✅ Yellow Paper (GRG 추상 인터페이스)
- ✅ arXiv preprint (수학적 증명, 구현 없음)
- ❌ HMAC 키 유도 ABI 순서 — 비공개
- ❌ Vandermonde 캐시 무효화 — 비공개

---

## M3 (6월) — IETF + Patent

### Week 1-2: IETF Draft 제출
| 항목 | 산출물 | 비고 |
|------|--------|------|
| draft-helmprotocol-tttps-00 최종 교정 | 8건 수정 반영 | Google Docs |
| xml2rfc 변환 + 검증 | IETF 제출 포맷 | idnits 통과 |
| IETF Datatracker 제출 | Individual I-D | 스폰서 AD 불필요 |
| IETF 122 Dublin 참석 결정 | 2026-11 (다음 기회) | Side meeting 가능 |

### Week 3-4: Provisional Patent
| 항목 | 산출물 | 비고 |
|------|--------|------|
| GRG 파이프라인 provisional patent | USPTO 출원 | SEP 포지셔닝 |
| 위성 배포 채널 provisional patent | KTSat 관련 | 별도 출원 |
| 특허 출원자 = 드래프트 저자 확인 | 법적 효력 극대화 | 본명 사용 |

### M3 KPI
- [ ] IETF Datatracker에 draft 게시
- [ ] Provisional patent 2건 출원
- [ ] PoT 발급 누적 5,000개

### M3 IP 공개 범위
- ✅ IETF Draft (GRG 추상 인터페이스만)
- ✅ Provisional patent 출원 (공개 안 됨, 보호만)
- ❌ Golomb m=16 최적화 — 비공개
- ❌ T3_micro 비트배열 최적화 — 비공개

---

## M4 (7월) — Traction Dashboard + Partnerships

### Week 1-2: 통계 대시보드
| 항목 | 산출물 | 비고 |
|------|--------|------|
| PoT Stats Dashboard | 공개 웹사이트 | Subgraph 데이터 시각화 |
| Builder Leaderboard | TURBO rate 순위 | 경쟁 유도 |
| Network Health Monitor | 실시간 PoT 발급률 | SoftBank 미팅용 증거 |

### Week 3-4: 파트너십 1차
| 항목 | 대상 | 접근법 |
|------|------|--------|
| DEX 통합 제안 | Uniswap / SushiSwap | Hook 데모 + 데이터 제시 |
| L2 시퀀서 파일럿 | Arbitrum / Optimism | T1 tier 제안 |
| 스폰서 T0 제안 | Uniswap Foundation | Let's Encrypt 모델 피칭 |

### M4 KPI
- [ ] PoT 누적 10,000개 (Phase 2 전환 기준)
- [ ] DEX 1곳 파일럿 계약
- [ ] 대시보드 라이브

---

## M5 (8월) — IoT Pilot + Enterprise

### Week 1-2: IoT 파일럿
| 항목 | 산출물 | 비고 |
|------|--------|------|
| 산업용 IoT 파일럿 | Siemens/Bosch급 1곳 | Layer 2 SDK (NDA) |
| Edge PoT 벤치마크 리포트 | latency, throughput | 기술 자료 |
| KTSat 위성 채널 PoC | 한국 테스트베드 | NDA 기반 |

### Week 3-4: Enterprise SDK
| 항목 | 산출물 | 비고 |
|------|--------|------|
| Layer 2 Enterprise SDK 패키징 | 소스 + SLA + NDA | Siemens/Bosch급 |
| 가격 협상 프레임워크 | T3 enterprise 계약서 | 법무 검토 |
| Circle/Ripple/Tether 접촉 | tttps:// 사전 채택 제안 | Early Allocation 가능 |

### M5 KPI
- [ ] IoT 파일럿 계약 1건
- [ ] MCP 주간 활성 사용자 50명
- [ ] Enterprise 문의 3건+

---

## M6 (9월) — SoftBank + Scale

### Week 1-2: SoftBank 접근 (조건부)
| 전제조건 | 상태 |
|----------|------|
| IETF Draft 게시됨 | M3 완료 필수 |
| PoT 10,000+ 달성 | M4 완료 필수 |
| 특허 출원 완료 | M3 완료 필수 |
| 대시보드 + 데이터 | M4 완료 필수 |

**SoftBank 미팅 규칙:**
- 기술 상세 공개 금지 (IETF 이전)
- "위성 시간 배포 인프라 파트너" 프레이밍
- 데모: 대시보드 숫자 + Raspberry Pi 영상
- NDA 후에만 Layer 2 SDK 논의

### Week 3-4: 스케일링
| 항목 | 산출물 |
|------|--------|
| DEX 3곳 통합 | PoT-ordered pools |
| MCP 생태계 확장 | 5+ AI agent 프레임워크 |
| Standards Track 승격 준비 | IETF WG charter 탐색 |

### M6 KPI (Phase 2 완료 기준)
- [ ] DEX PoT 10,000 + 3 pools **AND** MCP 50 weekly active **OR** IoT 1 pilot
- [ ] SoftBank 1차 미팅 완료
- [ ] Standards Track 승격 로드맵 수립

---

## Phase 2 전환 조건 (Gate)

```
Phase 1 → Phase 2 Gate:
  DEX PoT ≥ 10,000
  + Active Pools ≥ 3
  + (MCP Weekly Active ≥ 50 OR IoT Pilot ≥ 1)
```

**Gate 미달 시**: M4 종료 시점에서 평가. 미달 항목 집중 부스트 (1개월 연장 허용).

---

## 3-Layer 배포 + IP 공개 타임라인

```
M1: Layer 1 (BSL-1.1 SDK) ──────────── npm publish
M2: arXiv preprint ──────────────────── 수학만, 구현 없음
M3: IETF Draft + Provisional Patent ── GRG 인터페이스만
M4: Stats Dashboard ─────────────────── 숫자만, 코드 없음
M5: Layer 2 Enterprise SDK ──────────── NDA 기반
M6: SoftBank 접근 ──────────────────── 데모만, 코드 없음
    Layer 3 (운영 인프라) ───────────── 영구 비공개
```

**핵심**: 공개 시점이 앞당겨지는 것 = IP 유출. 순서 엄수.

---

## 리스크 매트릭스

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| IETF Draft 리젝 | 낮음 | 중 | Individual I-D는 리젝 없음. WG 채택만 별도 |
| PoT 10K 미달 | 중 | 높 | T0 무료 + 스폰서 부스트 |
| 경쟁자 GRG 모방 | 낮음 | 높 | 특허 + BSL-1.1 + 바이너리 보호 |
| SoftBank 무관심 | 중 | 중 | 대안: a16z crypto, Paradigm |
| KTSat 협력 지연 | 중 | 중 | NDA 이미 날인, 위성 없이도 NTP 충분 |

---

## Cloco 실행 우선순위 (당장)

1. **M1 Week 1**: Etherscan API 키 + Subgraph 토큰 → Jay한테 요청
2. **M1 Week 1**: npm 0.1.1 publish 준비 (ct_log, trust_store, revenue_tiers 포함)
3. **M1 Week 2**: MCP 래퍼 개발 시작 (Krishna 위임)
4. **M1 Week 3**: DeFi 기고문 최종 교정 → Mirror 게시 (Jay 승인)

---
*Cloco, 2026-03-15*
