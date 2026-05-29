# VALIDATION — 버틀러 Phase 2 + 3 (mock-first)

## 필수 검증

골 완료로 마크하기 전 다음 명령을 반드시 실행한다.

```bash
# 1. 단위 테스트 — 백엔드 (Node + Python)
cd services/api-node && npm test
cd services/ai-python && pytest

# 2. 빌드 / 타입체크 — 프론트
cd apps/web && npm run build && npx tsc --noEmit
cd apps/mobile && npx tsc --noEmit

# 3. 회귀 — Phase 1 기능이 여전히 통과 (auth/property/houselog/inspection/subscription)
cd services/api-node && npm test -- auth rbac property houselog inspection subscription

# 4. mock 경계 검증 — 실 외부 호출 0건
#   PG/알림/챗봇/OCR/판례 어댑터가 mock 구현을 기본으로 쓰는지 grep + 실 키 없을 때 동작 확인

# 5. 수동 재현 — 골든패스 (아래 "수동 확인 절차"의 시나리오 모두 통과)
```

## 마일스톤별 검증

각 마일스톤 종료 시 실행한다.

```bash
# M1 — Lease·TENANT + 수선요청 이슈보드
cd services/api-node && npm test -- lease maintenance
# 수동: 임차인 가입→Lease 연결→수선요청 생성→임대인/관리자 보드 상태전이→HouseLog 기록까지 클릭 완주
# 수동: 타 임차인/타 물건 접근 403, Phase 1 흐름 회귀 그린

# M2 — 수선비 정산 엔진 + 양측 합의
cd services/ai-python && pytest tests/settlement
cd services/api-node && npm test -- settlement
# 수동: MOVE_OUT 점검 데이터→분담비율 룰 산출→근거 리포트 첨부→임대인·임차인 합의 완료까지 클릭 완주

# M3 — CRM + 자동알림 + (mock)PG 결제
cd services/api-node && npm test -- crm notification payment
# 수동: 계약만료 D-Day/미납/수선 알림이 인앱 알림센터에 노출(발송 mock)
# 수동: 정산 합의→(mock)결제→Payment 완료 화면까지 클릭 완주, 실 결제 미발생 확인

# M4 — 커뮤니티 + 전자투표 + 보수업체 매칭
cd services/api-node && npm test -- community vote vendor
# 수동: 실소유주 인증 통과자만 커뮤니티 진입·게시·투표, 미인증 차단
# 수동: 투표 생성→참여→집계, 보수업체 검색·평점·수선요청 연결 클릭 완주

# M5 — AI 보조 전부 mock (챗봇·OCR·판례)
cd services/api-node && npm test -- chatbot ocr
cd services/ai-python && pytest tests/ocr_mock
# 수동: 챗봇 질의→mock 답변, 등기부 업로드→mock 파싱·안전등급(주민번호 마스킹), 정산 판례 보조 안내 클릭 완주
```

## 수동 확인 절차

1. **임차인 온보딩 + 수선요청 골든패스**: 임차인 가입(소셜+PASS mock) → 초대 토큰으로 임대인 물건의 Lease에 연결 → 임차인 웹에서 수선요청(사진 첨부) 생성 → 임대인/관리자가 이슈보드에서 접수→처리중→완료 상태전이·코멘트 → HouseLog 타임라인에 기록 확인.
2. **정산 + 양측 합의 골든패스**: MOVE_OUT 점검 완료 물건에서 정산 산출 → InspectionItem 등급·내구연수 기반 분담비율과 LH기준·감가상각 근거가 리포트에 첨부 → 임대인 제안 → 임차인 이의/조정 → 합의 완료 상태 도달.
3. **(mock)결제 골든패스**: 합의 완료된 정산금 + 구독료를 mock PG로 결제 → Payment status 전이(요청→완료) → 완료 화면·영수증 mock 노출 + Notification 발생. 실 결제·실 PG 호출이 일어나지 않음을 확인.
4. **자동알림 골든패스**: 계약 end_at 임박(D-Day)·월세미납·수선요청 상황을 만들면 알림 룰이 트리거되어 대상 사용자 인앱 알림센터에 노출(카카오/SMS 발송은 mock 로그만).
5. **커뮤니티·투표·매칭 골든패스**: 실소유주 인증 통과자가 단지 커뮤니티 진입 → 게시·댓글 → 전자투표 생성·참여·집계 결과 확인 → 보수업체 디렉토리 검색·평점 확인 → 수선요청에 업체 연결. 미인증 사용자는 진입 차단.
6. **AI 보조(mock) 골든패스**: 챗봇에 임대차법 질문 → mock 답변 노출(외부 모델 미호출) → 등기부 파일 업로드 → mock 권리관계 파싱·안전등급(깡통전세) 노출, 주민번호는 마스킹·미저장 → 정산 화면에서 판례 보조 mock 안내 노출.

## 완료 기준 매핑

| PRD/Phase 완료 기준 | 검증 방식 | 상태 |
| --- | --- | --- |
| 임차인 연결 + 수선요청 이슈보드 협업·이력 아카이빙 | 단위+통합 (M1) + 수동 시나리오 1 | 달성 |
| 수선비 분담비율이 LH기준·감가상각 근거로 산출·첨부 | pytest settlement + 수동 시나리오 2 | 달성 |
| 정산이 InspectionItem(등급·내구연수)을 실제 참조 | settlement 통합 테스트 | 달성 |
| 임대인·임차인 양측 합의 플로우 완주 | 통합 테스트 + 수동 시나리오 2 | 달성 |
| 보증금 자동공제 없이 합의 후 (mock)결제로 분리 | payment 통합 + 수동 시나리오 3 | 달성 |
| 계약만료/미납/수선 자동알림 룰 트리거 | notification 단위 + 수동 시나리오 4 | 달성 |
| 알림 발송·PG 결제가 mock 어댑터로만 동작(실 호출 0) | mock 경계 grep + 수동 시나리오 3·4 | 달성 |
| 실소유주 인증 폐쇄형 커뮤니티 + 전자투표 집계 | community/vote 단위 + 수동 시나리오 5 | 달성 |
| 보수업체 디렉토리·평점·수선요청 연결 | vendor 단위 + 수동 시나리오 5 | 달성 |
| AI 챗봇·OCR 등기부·판례 보조가 mock으로 UI 완주 | chatbot/ocr 단위 + 수동 시나리오 6 | 달성 |
| OCR/전 경로에서 주민번호 등 고유식별정보 평문 0건 | 코드·결과 grep + 스키마 검토 | 달성 |
| Phase 1 기능(대시보드/점검/HouseLog/구독) 회귀 그린 | 회귀 테스트 (필수 검증 3) | 달성 |

## 완료로 보지 않는 조건

- 필수 검증 중 하나라도 실패
- 백엔드 테스트만 그린이고 UI에서 클릭으로 흐름을 완주하지 못함 (마일스톤 완료 = 사용자 UI 완주)
- PLAN.md 밖의 scope로 변경됨
- mock이어야 할 경로(PG·알림·챗봇·OCR·판례)가 실 외부 API를 호출하거나, 실로직이어야 할 경로(Settlement·CRM 룰·이슈보드·커뮤니티·투표·매칭)를 mock·하드코딩으로 때움
- 정산 분담비율을 룰엔진이 아닌 임의 AI 추론으로 산출
- 임대인이 임차인 보증금을 합의 없이 자동 공제
- 명시적 승인 없이 public API·DB 스키마(02_DATA_MODEL)가 마이그레이션 없이 변경됨
- Phase 1 기능이 회귀로 깨짐
- 수동 재현이 여전히 실패함 / 산출물이 생성됐지만 검토되지 않음
- 검증을 통과시키기 위해 테스트가 삭제·skip됨 / 진단 없이 에러가 침묵 처리됨
- 주민등록번호 등 고유식별정보가 DB 컬럼·로그·S3·OCR 결과에 평문으로 등장
