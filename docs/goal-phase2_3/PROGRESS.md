## 골 검토 요약 (Step 8 자동 생성)

- 목표: Phase 1 위에 정산·CRM·이슈보드·커뮤니티·매칭 실로직 동작 + PG·알림·챗봇·OCR·판례는 전부 mock, 임차인 포함 전 역할이 정산→합의→(mock)결제·수선·커뮤니티·AI보조까지 UI 클릭 완주
- 마일스톤: M1 Lease·TENANT+이슈보드 / M2 정산엔진+양측합의 / M3 CRM+알림+(mock)PG결제 / M4 커뮤니티+투표+업체매칭 / M5 AI보조 전부 mock(챗봇·OCR·판례)
- 필수 검증: `npm test`(api-node) + `pytest`(ai-python) + `npm run build && tsc --noEmit`(web/mobile) + Phase 1 회귀 + mock 경계 grep + 수동 6종 시나리오 클릭 완주
- scope 잠금: mock 경로(PG·알림·챗봇·OCR·판례) 실 API 연결 금지 + 실로직 경로(정산·CRM룰·이슈보드·커뮤니티·투표·매칭) mock 우회 금지 + 보증금 합의전 자동공제 금지 + 주민번호 평문 0건 + Phase 1 회귀 금지

---

# PROGRESS

## 현재 골

Phase 1 위에 정산·CRM·이슈보드·커뮤니티·보수업체 매칭의 핵심 로직을 실제로 동작시키고, PG 결제·알림 발송·AI 챗봇·AI OCR·판례 AI는 전부 mock 어댑터로 대체해, 임차인 포함 전 역할이 정산→합의→(mock)결제·수선요청·커뮤니티·투표·매칭·AI 보조(mock)까지 UI에서 클릭으로 완주하는 Phase 2+3 제품을 완성한다.

## 현재 마일스톤

🎉 **Phase 2 + 3 mock-first 전 마일스톤(M1~M5) 완료** — 전체 통합 E2E 완주 + 277개 자동 테스트 그린

## 완료

- ✅ **M5 AI 보조 전부 mock (챗봇·OCR 등기부·판례)** (2026-05-29) — UI 클릭 완주 + ai-python 경유 라이브 E2E
  - **전부 mock(외부 모델 호출 0)**: `ai-python butler_ai/{chatbot,ocr,precedents}`(정식 mock 호스트) + `api-node aiassist/clients.ts`(HTTP + 로컬 mock fallback, 둘 다 mock)
  - **챗봇**: 키워드 분류(임대차법/세무/일반) mock RAG + 출처 + 면책. ChatbotLog 기록.
  - **OCR 등기부**: 깡통전세 안전등급(근저당/시세 비율 ≥0.8 DANGER/≥0.6 CAUTION) + **주민번호 마스킹(`######-*******`)·평문 비저장**(테스트·E2E로 RRN 0건 검증).
  - **판례 보조**: 정산 상세에 유사 판례 mock. 모든 응답 mock:true + disclaimer.
  - 견고성: AI HTTP 실패 시 라우트 502(크래시 아님).
  - Prisma ChatbotLog/OcrDocument + 마이그레이션 0006. 병렬: 웹 UI / api-node 테스트 백그라운드 에이전트.


- ✅ **M4 단지 커뮤니티 + 전자투표 + 보수업체 매칭** (2026-05-29) — 전부 실로직, UI 클릭 완주 + 라이브 스모크
  - **커뮤니티(실소유주 게이트)**: `community/membership.ts`(임대인=소유 물건 complexName / 임차인=ACTIVE 임대차 / 관리자=전체), `community/repository.ts`(Post/Comment), `routes/community.ts`(단지별 게시·댓글, 비멤버 403)
  - **전자투표**: `vote/repository.ts`(투표/Ballot, `tally` 순수함수, 1인1표 unique), `routes/votes.ts`(생성·투표·집계·마감, 중복 409/마감 409)
  - **보수업체**: `vendor/repository.ts` + `rating.ts`(평점 집계) + `routes/vendors.ts`(디렉토리·검색·리뷰, 등록 ADMIN/리뷰 LANDLORD·TENANT, 중복 409)
  - Prisma CommunityPost/PostComment/Vote/Ballot/Vendor/VendorReview + 마이그레이션 0005
  - 병렬: 보수업체 백엔드(백그라운드 에이전트) + 커뮤니티·투표(직접) 동시 → 웹 UI / api-node 테스트 에이전트 동시
  - 라이브 스모크: my-complexes→게시·댓글, 비멤버 403, 투표 생성·집계·중복409, 업체 등록·평점·RBAC 403


- ✅ **M3 임대차 CRM + 자동알림 + (mock)PG 결제** (2026-05-29) — UI 클릭 완주 + 라이브 E2E
  - **알림(자동)**: `notification/rules.ts`(계약만료 D-day·월세미납 룰, 순수함수) + repository + mock 발송 어댑터(카카오/SMS **실 호출 0**, IN_APP 적재) + service. 정산 propose/dispute/agree·수선 create/status·결제 완료 시 알림 emit 배선. scan 멱등(existsByTypeRef).
  - **(mock)PG 결제**: `payment/gateway.ts`(mock PG, `mock_pay_` chargeId, 실 결제 0) + repository + routes(정산금/구독료/월세). 정산 AGREED 후에만 정산금 결제, 중복 결제 409, **보증금 자동공제 없음**(E2E·테스트로 deposit 불변 검증).
  - **CRM 개요**: `routes/crm.ts` GET /crm/overview(임대인 본인/관리자 전체) — 만료 D-day·월세상태·오픈수선·정산상태 집계 + summary.
  - 견고성 수정: 정산 엔진(ai-python) HTTP 호출 실패 시 라우트가 502 반환(이전엔 unhandled rejection으로 프로세스 크래시) — mock-first에서 ai-python 미가용 대비.
  - `apps/web`: NotificationCenter(종+배지), CrmOverviewPanel, MyPaymentsPanel, 정산금/월세/구독료 mock 결제 버튼("실제 청구 없음" 명시).
  - Prisma Notification/Payment + 마이그레이션 0004. 병렬: 웹 UI / api-node 테스트 서브에이전트 2개.


- ✅ **M2 수선비 정산 엔진(룰베이스) + 양측 합의** (2026-05-29) — UI 클릭 완주 + ai-python 엔진 경유 라이브 E2E
  - 룰엔진(본체): LH 부담기준표 + 표준 내구연수 + 감가상각. `services/api-node/src/settlement/rules.ts`(TS) ↔ `services/ai-python/butler_ai/settlement/`(정식 호스트) **동일 상수표 + 런타임 parity 확인**(도배F 350,000 / 배관D 133,333 / 합산 483,333 양쪽 일치). JS Math.round ↔ py `floor(x+0.5)`로 반올림 parity.
  - InspectionItem 등급·markedDefect를 **권위값으로 덮어써** 정산이 실제 점검 데이터 참조(임대인 자가신고 방지)
  - 합의 플로우: DRAFT→PROPOSED→(DISPUTED↔PROPOSED)→AGREED/REJECTED, 이벤트 append-only 로그, 근거 스냅샷 동결(JSON)
  - **보증금 자동공제 없음** — 합의(AGREED)는 HouseLog CONTRACT만 남기고 결제는 M3 mock PG로 분리 (테스트로 deposit 불변 검증)
  - `api-node`: settlement repository/engineClient(http ai-python + local 실제계산 fallback)/routes(compute/propose/dispute/agree/reject), app.ts 배선, Prisma Settlement/SettlementEvent + 마이그레이션 0003
  - `apps/web`: SettlementNew(임대인 산출·제안), SettlementDetailPanel(라인·근거·이벤트 타임라인), TenantHome 정산 섹션(합의/이의), 라우트
  - 병렬 처리: ai-python 엔진+pytest / 웹 UI / api-node 테스트를 서브에이전트 3개로 동시 구현


- ✅ **M1 Lease·TENANT 활성화 + 수선요청 이슈 협업보드** (2026-05-29) — UI 클릭 완주 + 라이브 E2E 검증
  - `packages/shared`: ROLES에 TENANT 추가(WEB_ROLES 포함), Lease/Maintenance enum(LEASE_STATUSES, MAINTENANCE_CATEGORIES/STATUSES, MAINTENANCE_TRANSITIONS + canTransitionMaintenance 가드)
  - Prisma 스키마: Role enum TENANT, Lease/MaintenanceRequest/MaintenanceComment 모델 + 관계, 마이그레이션 `0002_phase2_lease_maintenance.sql` 명시
  - `api-node`: `lease/repository.ts`(초대토큰 1회용, PENDING→ACTIVE→ENDED), `maintenance/repository.ts`(상태전이 + 코멘트 append-only 이력), `routes/leases.ts`(생성+초대/accept/mine/:id/end, HouseLog CONTRACT append), `routes/maintenance.ts`(임차인 생성→HouseLog REPAIR, board, 상태전이 권한분기, 코멘트), app.ts 배선
  - `apps/web`: 로그인 TENANT 옵션, `/tenant` TenantHome(계약연결·수선요청·상세), PropertyDashboard 계약생성+초대토큰 노출, LandlordHome/AdminHome 이슈보드, 공통 MaintenanceBoard/MaintenanceDetailPanel + api 클라이언트
  - `db/client.ts`: Prisma를 getPrisma 호출 시 native createRequire로 **지연 로드** — 인메모리 모드에서 CJS↔ESM(tsx) 해석 오류 회피 (server.ts 기동 복구)
  - 병렬 처리: 웹 UI / 백엔드 테스트를 서브에이전트 2개로 동시 구현

## 마지막 검증 결과

```text
[shared]    vitest  4 PASS   + tsc OK
[api-node]  vitest 92 PASS   (Phase1 회귀 61 + M1 신규 31) + tsc OK
[web]       vitest  5 PASS   + tsc OK + vite build OK (247KB/gzip 74KB)
[mobile]    tsc OK

[라이브 E2E] 인메모리 dev-mock 서버(:4055) curl 완주:
  임대인 로그인 → 물건 등록 → 계약+초대토큰(PENDING) → 임차인 로그인 → accept(ACTIVE)
  → 수선요청(OPEN) → 임대인 보드 → OPEN→IN_PROGRESS→RESOLVED → 임차인 CLOSED
  → 코멘트 이력 4건 → HouseLog(REPAIR+CONTRACT×2) → 타 임차인 접근 403
```

stale Phase 1 테스트 2건(roles.test.ts "3 roles"/auth.test.ts "rejects TENANT")은 M1 의도(임차인 활성화)에 맞춰 기대값 갱신 — 테스트 삭제 아님.

### M2 검증 (2026-05-29)
```text
[shared] 4 PASS  [api-node] 121 PASS (M1 92 + M2 29)  [ai-python] 29 PASS (18 + 11)
[web] tsc OK + build OK  [mobile] tsc OK
[라이브 E2E] api-node(:4055) → ai-python(:8055) 정산 엔진 경유:
  계약 ACTIVE → compute(tenant 483,333 = 350k+133k, ai-python parity 일치)
  → propose → 임차인 dispute → 임대인 재propose → 임차인 agree(AGREED)
  → events COMPUTED,PROPOSED,DISPUTED,PROPOSED,AGREED → deposit 50,000,000 불변 → HouseLog CONTRACT
  → 임차인 compute 시도 403
```
주의(테스트 하네스): Windows curl이 한글 본문/`-d` 없는 POST를 GET으로 보내는 아티팩트 발견 — 서버 버그 아님(web/api-node fetch는 UTF-8 POST 정상).

### M3 검증 (2026-05-29)
```text
[shared] 4  [api-node] 161 PASS (M1·M2 121 + M3 40)  [ai-python] 29  [web] tsc+build  [mobile] tsc
[라이브 E2E] api-node(:4056) → ai-python(:8000) 엔진:
  정산 propose → 임차인 SETTLEMENT 알림 → agree → 정산금 mock결제(PAID, mock_pay_, 350,000)
  → 보증금 50,000,000 불변(자동공제 없음) → 월세 mock결제(PAID) → scan 1차 created 2 / 2차 0(멱등)
  → CONTRACT_EXPIRY 알림 → CRM 요약(expiringSoon 1, D-10, rent PAID, stl AGREED)
  → unread 4 → read-all → 임대인 정산금결제 403 → HouseLog REPAIR+CONTRACT×3 → 결제내역 RENT/SETTLEMENT PAID
```
참고: `.env`의 AI_BACKEND_BASE_URL=:8000 사용 시 ai-python 미가동이면 정산 compute가 502(크래시 아님). periodOf는 서버 로컬 TZ 기준(KST 전제).

### M4 검증 (2026-05-29)
```text
[api-node] 197 PASS (M3 170 + M4 27) + tsc  [ai-python] 45 (+M5 mock 엔진 16 선반영)  [web] tsc+build
[스모크] 커뮤니티 게이트(비멤버 403)·투표 집계/중복409·보수업체 평점/RBAC403
```

### M5 + 최종 통합 검증 (2026-05-29)
```text
[shared] 4  [api-node] 223 PASS (M4 197 + M5 26) + tsc  [ai-python] 45 (29 + M5 16)
[web] tsc + build + vitest 5  [mobile] tsc          ← 자동 테스트 총 277개 그린
[통합 E2E] api-node(:4059) → ai-python(:8000) 한 흐름 완주:
  M1 물건(단지)+계약 ACTIVE+수선 IN_PROGRESS
  M2 정산 350,000(ai-python 엔진)→AGREED
  M3 mock결제 PAID/mock + 보증금 50,000,000 불변(자동공제 없음) + CRM 만료임박1 + 알림5
  M4 커뮤니티 게시 + 투표 집계1 + 보수업체 평점5
  M5 챗봇 mock=true + OCR DANGER·주민번호 0건(마스킹) + 판례 mock=true
  HouseLog REPAIR,CONTRACT,REPAIR,CONTRACT,CONTRACT
```

## M6 — 임대인 대시보드 전환 + 다크/라이트 테마 (2026-05-29, 추가 요청)
- 테마 시스템: `data-theme`(light/dark)로 팔레트 분리, 기본=시스템(prefers-color-scheme) + 토글(localStorage `butler-theme`). `ThemeProvider`/`useTheme`/`ThemeToggle`/`LightScope`.
- 사이드바 셸 CSS(`admin-*`)의 `body[data-tone=linear]` 스코프 해제 → 변수 기반 공용화(라이트/다크 자동). 공용 `DashboardLayout`(사이드바+테마토글+알림+로그아웃).
- 임대인: `LandlordHome`을 사이드바 대시보드로 전면 이관(대시보드 요약/내 물건/임대차/수선/정산/구독·결제/커뮤니티 + AI 푸터). 파란 액센트.
- 관리자: 공용 셸/테마 대응 + 사이드바에 테마 토글, 알림센터 tone이 테마를 따름.
- App 배선: 임대인·관리자(+공유 심화 페이지)=html 테마 적용 / 임차인·점검자·로그인=`LightScope` 강제 라이트(현행 유지).
- 검증: tsc + `vite build`(87 모듈) 통과, 번들에 테마 로직 포함 확인.

## M7 — 임대인 상시 사이드바 + 관리자 한글화 (2026-05-29, 추가 요청)
- 임대인: React Router 중첩 라우트(레이아웃 `LandlordLayout` + `<Outlet/>`)로 재구성 → 모든 depth(`/landlord/*`: 물건 등록·물건 상세·정산 산출·정산 상세·커뮤니티·AI)에서 **사이드바 상시 유지**, 콘텐츠만 교체. activeKey는 경로 기반. `LandlordHome`을 섹션별 라우트 컴포넌트로 분해(LandlordDashboard/Properties/Leases/Maintenance/Settlements/Billing/Community). 깊은 페이지는 풀스크린 래퍼 제거(임대인 전용) 또는 `embedded` prop 분기(임차인 공유: SettlementDetailPage/CommunityPage/AssistantPage standalone 유지).
- 이탈 방지: `CrmOverviewPanel`의 정산 링크를 역할 기반(`/landlord/settlements/:id` vs `/settlements/:id`)으로 보정. 임대인이 클릭하는 공용 컴포넌트의 standalone 이탈 0건 확인.
- 관리자: 콘솔 사이드바·헤딩·테이블·탭·상태 라벨 전부 한글화(코드 식별자·ID 유지).
- 검증: tsc + `vite build`(88 모듈) 통과.

## M8 — 내부 ID 노출 제거 (사람친화 표시) (2026-05-29, 추가 요청)
- 문제: 화면에 prop_/usr_/lease_/stl_ 같은 내부 ID가 그대로 노출(전 역할 9개 지점).
- 백엔드(api-node): DTO에 가산 필드 추가 — 점검(propertyAddress/complexName), 임대차(propertyAddress), 관리자 구독(landlordName), CRM(tenantName), 수선 코멘트(authorName)·요청(requesterName), 정산 이벤트(actorName). userStore를 admin/crm/maintenance/settlements에 주입. 223 테스트 그린.
- 프론트(web): `lib/displayId.ts`의 `shortCode()`(접두사 제거·대문자 6자) 추가. 점검자/임차인 "물건 ID"→주소, 관리자 테이블 ID→shortCode·임대인명, CRM→임차인명, 정산/수선 타임라인→작성자명, 정산 드롭다운→주소·기간. 초대토큰/mock영수증번호는 의도적 노출이라 유지.
- 정산 "점검 ID 입력칸" → **물건의 점검 선택 드롭다운**으로 개선 + 백엔드 `GET /inspections?propertyId=`(임대인 소유/관리자, 타인 403) 추가.
- 검증: api-node 223 + tsc, web tsc + build(89모듈), 라이브로 propertyAddress/tenantName/점검목록·RBAC 확인.

## 골 완료 (2026-05-29)
Phase 2+3을 mock-first로 완성. mock 경계(PG·알림·AI 챗봇·AI OCR·판례 = 실 호출 0)와 실로직(정산 룰엔진·CRM·이슈보드·커뮤니티·투표·매칭 = 실제 동작)을 분리 준수. 주민번호 평문 0건. Phase 1 회귀 그린. 외부 키 발급 시 각 어댑터(OAuth/PASS/공공데이터/PG/알림/AI)의 실 구현으로 교체만 하면 되도록 셸 유지.

## 실패 시도

| 시도 | 변경 | 결과 | 배운 점 |
| --- | --- | --- | --- |

## 현재 가장 안정적인 상태

Phase 1 풀스코프 완성 직후 (docs/goal-phase1/PROGRESS.md 참조). 다음 작업이 막히면 이 상태로 되돌린다.

## 다음 단계

M1 착수: Lease 엔티티 활성화 마이그레이션 + TENANT role 추가 + 수선요청 이슈보드.

## 리스크 / 블로커

- mock/실로직 경계를 흐리지 않도록 어댑터 인터페이스를 먼저 고정해야 함.
- 정산 룰(LH 부담기준표·표준 내구연수·감가상각)의 구체 수치는 잠정값으로 두고 상수화 — 정식 기준 확정 시 갱신.
- 실소유주 인증 게이트(커뮤니티)와 임차인 초대 토큰 흐름의 보안 설계.

## 인수인계 메모

이 PROGRESS.md는 골잡이가 생성했다. 골 실행 중 매 체크포인트마다 갱신된다. Phase 1 골 기록은 docs/goal-phase1/ 에 보존됨.

## 골 시작 기록
- 시작 시각: 2026-05-29
- 사용 CLI: claude_code
- 컴팩트 후 본문 길이: 1880자 / 4000자
- 자체 검증: PROTECTED_CLAUSES 5/5, 약어 미정의 0건, /goal 시작 OK
- Phase 1 골 문서는 docs/goal-phase1/ 에 보존
