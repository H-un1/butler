# 버틀러(Butler) — 데이터 모델

> 이 문서는 앱에서 다루는 핵심 데이터의 구조를 정의합니다.
> 개발자가 아니어도 이해할 수 있는 "개념적 ERD"입니다.
> Phase 1 핵심 엔티티 중심, Phase 2+ 는 연결점만 표시합니다.

---

## 전체 구조

```
User (사용자)
  └─1:N─> Property (물건/자산)
              ├─1:N─> Lease (계약) ──── tenant_id ──> User(임차인)
              ├─1:N─> HouseLogEntry (생애주기 기록)
              └─1:N─> Inspection (점검) ── inspector_id ──> User(점검자)
                          └─1:N─> InspectionItem (점검항목)
                                      └─(집계)─> Report (리포트 PDF)

User(임대인) ─1:N─> Subscription (구독/과금)

--- Phase 2+ (연결점만) ---
MaintenanceRequest ─> Property / Lease
Settlement ─> Lease (분담비율, 룰베이스)
Payment ─> Settlement / Subscription (PG)
Notification ─> User
Vendor / Community / ChatbotLog
```

---

## 엔티티 상세 (Phase 1)

### User (사용자)
서비스를 쓰는 모든 사람. 역할(role)로 임대인·임차인·점검자·관리자를 구분한다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 (자동 생성) | usr_a1b2 | O |
| role | 역할 (LANDLORD/TENANT/INSPECTOR/ADMIN) | LANDLORD | O |
| name | 이름 | 홍길동 | O |
| phone | 연락처 | 010-1234-5678 | O |
| email | 이메일 | hong@example.com | X |
| auth_provider | 로그인 수단 (kakao/naver) | kakao | O |
| verified_at | 본인인증 완료 시각 (**주민번호 비저장**, 결과만) | 2026-05-24T10:00 | X |
| created_at | 가입일 (자동) | 2026-05-24 | O |

> ⚠️ 주민등록번호 등 고유식별정보는 저장하지 않는다. PASS 본인인증의 **성공 여부와 시각**만 보관한다.

### Property (물건/자산)
임대인이 보유·관리하는 한 채의 집. 공공데이터가 자동 연동된다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | prop_001 | O |
| owner_id | 소유 임대인 (→User) | usr_a1b2 | O |
| address | 도로명 주소 | 서울시 강서구 …로 12 | O |
| complex_name | 단지명 | 항공아파트 | X |
| dong / ho | 동/호 | 101 / 1203 | X |
| area_m2 | 전용면적 | 84.9 | X |
| built_year | 준공연도 (건축물대장) | 2015 | X |
| parking | 주차 정보 (건축물대장) | 세대당 1.2 | X |
| mgmt_fee | 관리비 (K-APT) | 230,000 | X |
| market_price | 실거래가 (국토부, 자동갱신) | 920,000,000 | X |
| ami_score | 자산관리지수 (자체 산출) | 82 | X |
| created_at | 등록일 | 2026-05-24 | O |

### Lease (계약)
한 물건에 대한 임대차 계약. 임대인-임차인을 연결한다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | lease_001 | O |
| property_id | 대상 물건 (→Property) | prop_001 | O |
| landlord_id | 임대인 (→User) | usr_a1b2 | O |
| tenant_id | 임차인 (→User) | usr_c3d4 | X |
| deposit | 보증금 | 50,000,000 | O |
| rent | 월세 | 700,000 | X |
| start_at / end_at | 계약 시작/종료 | 2026-06-01 / 2028-05-31 | O |

### HouseLogEntry (생애주기 기록)
주택의 모든 사건(점검·수리·계약·소유주변경)을 시간순으로 쌓는 **불변 타임라인**. 자산가치 증명·분쟁 예방의 핵심.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | log_001 | O |
| property_id | 대상 물건 (→Property) | prop_001 | O |
| type | 기록 유형 (INSPECTION/REPAIR/CONTRACT/OWNER_CHANGE) | INSPECTION | O |
| title | 요약 제목 | 2026 정기점검 완료 | O |
| occurred_at | 사건 발생 시각 | 2026-05-24 | O |
| ref_id | 연결된 원본(점검/리포트 등) id | insp_001 | X |
| attachment_urls | 첨부(사진/PDF) URL 목록 | [s3://…] | X |

> 원칙: HouseLogEntry는 **수정·삭제하지 않고 추가만** 한다(append-only). 증빙 신뢰성의 근거.

### Inspection (점검)
임대인 의뢰로 점검자가 수행하는 한 건의 현장 점검.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | insp_001 | O |
| property_id | 대상 물건 (→Property) | prop_001 | O |
| inspector_id | 담당 점검자 (→User) | usr_e5f6 | O |
| type | 유형 (REGULAR/REPAIR/MOVE_OUT) | REGULAR | O |
| status | 상태 (REQUESTED/SCHEDULED/IN_PROGRESS/DONE) | DONE | O |
| scheduled_at | 점검 예정 시각 | 2026-05-24 14:00 | O |

### InspectionItem (점검 항목)
한 점검 안의 개별 체크 항목(구역·항목별). 사진·등급을 가진다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | item_001 | O |
| inspection_id | 소속 점검 (→Inspection) | insp_001 | O |
| area | 점검 구역 | 욕실 | O |
| checklist_key | 체크 항목 키 | bathroom.leak | O |
| grade | 등급 (A~F) | B | O |
| photo_urls | 사진 URL 목록 | [s3://…] | X |
| note | 특이사항 메모 | 실리콘 노후 | X |
| marked_defect | 파손/결함 마킹 여부 | true | X |

### Report (리포트)
한 점검의 결과를 묶은 PDF 산출물. House Log에 연결된다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | rpt_001 | O |
| inspection_id | 원본 점검 (→Inspection) | insp_001 | O |
| pdf_url | 생성된 PDF 위치 | s3://…/rpt_001.pdf | O |
| generated_at | 생성 시각 | 2026-05-24 | O |
| shared_with | 공유 대상 사용자 id 목록 | [usr_c3d4] | X |
| status | 상태 (GENERATED/SHARED) | SHARED | O |

### Subscription (구독/과금)
임대인이 보유 물건수 기준으로 내는 월 구독.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | sub_001 | O |
| landlord_id | 임대인 (→User) | usr_a1b2 | O |
| property_count | 과금 기준 물건수 | 5 | O |
| tier | 구간 (구간 할인 적용) | TIER_2 | O |
| monthly_fee | 월 구독료 | 39,000 | O |
| status | 상태 (ACTIVE/PAST_DUE/CANCELED) | ACTIVE | O |
| billing_date | 결제일 | 매월 1일 | O |

---

## 관계 요약

- **User(임대인) 1명** → 여러 **Property**.
- **Property 1개** → 여러 **Lease**, 여러 **HouseLogEntry**, 여러 **Inspection**.
- **Lease**는 임대인(landlord_id)과 임차인(tenant_id) 두 User를 연결.
- **Inspection 1건** → 여러 **InspectionItem** → 집계되어 1개의 **Report** 생성.
- **Report / Inspection / 수리 / 계약** 사건은 모두 **HouseLogEntry**로 타임라인에 누적.
- **User(임대인)** → 여러 **Subscription**(보통 1개 활성).

---

## Phase 2+ 엔티티 (연결점)

- **MaintenanceRequest** (수선요청) → Property/Lease. 임차인이 요청, 이슈보드로 협업.
- **Settlement** (수선비 정산) → Lease 기반. 룰베이스 분담비율, 근거 데이터(LH기준·감가상각·내구연수) 스냅샷 포함.
- **Payment** (결제) → Subscription(구독료) / Settlement(정산금). PG 연동.
- **Notification** (알림) → User. 계약만료/미납/수선/리포트도착.
- **Vendor**(보수업체), **Community/Post/Vote**(커뮤니티·투표), **ChatbotLog**(AI 상담), **OcrDocument**(등기부 분석) — Phase 3.

---

## 왜 이 구조인가

- **Property 중심 설계**: 모든 데이터(계약·점검·로그·정산)가 "한 채의 집"을 축으로 모인다. 원격 임대인의 멘탈모델("내 집별로 관리")과 일치하고, House Log를 물건 단위 타임라인으로 자연스럽게 구성.
- **HouseLog를 별도 append-only 엔티티로 분리**: 점검·수리·계약이 각자 자기 테이블을 가지면서도, HouseLogEntry가 이를 통합 참조(ref_id)해 "증빙용 불변 이력"을 보장. 시장 표준에서 "양측 서명 점검기록이 분쟁 해결의 핵심 증거"라는 점과 부합.
- **확장성**: Settlement/Payment/Notification 등 Phase 2+ 엔티티는 기존 Property/Lease/Inspection을 참조만 하면 되어, Phase 1 뼈대를 바꾸지 않고 얹을 수 있음.
- **단순성·컴플라이언스**: 주민번호 등 고유식별정보를 처음부터 스키마에서 배제 → 개인정보 리스크 최소화.

---

## [NEEDS CLARIFICATION]

- [ ] AMI(ami_score) 산출에 들어가는 입력 필드와 가중치 정의.
- [ ] 공공데이터 갱신 주기와 캐시 정책 (market_price 등을 얼마나 자주 갱신할지).
- [ ] 임차인이 tenant_id로 연결되기 전(가입 전) 상태를 어떻게 표현할지 (초대 토큰 등).
- [ ] House Log의 데이터 보관기간·파기 정책(개인정보 라이프사이클).
