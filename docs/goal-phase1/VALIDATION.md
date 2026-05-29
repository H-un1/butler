# VALIDATION — 버틀러 Phase 1 (Butler MVP)

## 필수 검증

골 완료로 마크하기 전 다음 명령을 반드시 실행한다.

```bash
# 1. 단위 테스트 — 백엔드 (Node + Python)
cd services/api-node && npm test
cd services/ai-python && pytest

# 2. 빌드 / 타입체크 — 프론트
cd apps/web && npm run build && npx tsc --noEmit
cd apps/mobile && npx tsc --noEmit

# 3. 수동 재현 — 골든패스 (아래 "수동 확인 절차"의 5개 시나리오 모두 통과)
```

## 마일스톤별 검증

각 마일스톤 종료 시 실행한다.

```bash
# M1 — 기반 + 인증·RBAC·채널
cd services/api-node && npm test -- auth rbac
# 수동: 임대인 로그인 → role=LANDLORD 진입, 같은 도메인에서 관리자 로그인 → role=ADMIN 메뉴 분기 확인
# 수동: 점검자 RN 셸 빌드·실행 (npx expo start 등)

# M2 — 물건 등록 + 공공데이터 ETL + 대시보드
cd services/ai-python && pytest tests/etl
cd services/api-node && npm test -- property
# 수동: 주소 입력 → 30초 내 시세·단지·AMI가 대시보드에 노출되는지 측정

# M3 — House Log (append-only)
cd services/api-node && npm test -- houselog
# 단위 테스트로 UPDATE/DELETE 시도 시 거절되는지 검증

# M4 — 스마트 점검 리포트
cd services/api-node && npm test -- inspection
cd services/ai-python && pytest tests/report_pdf
# 수동: 점검자 모바일 → 사진 5장 업로드 → 5분 내 PDF 임대인에게 도착, House Log에 자동 기록

# M5 — 구독 과금 + 관리자 콘솔 + 배포
cd services/api-node && npm test -- subscription
# 수동: 1~3채 / 4~10채 / 11채+ 구간별 청구 금액 정확성 확인 (PG sandbox)
# 수동: AWS staging /health 200 응답, 관리자 콘솔 회원·물건·구독 운영 동작
```

## 수동 확인 절차

1. **임대인 가입·인증 골든패스**: 카카오 또는 네이버 로그인 → PASS 본인인증 통과 → role=LANDLORD로 임대인 홈에 진입. DB에 주민번호 평문이 저장되지 않고 `verified_at`만 보관되는지 확인.
2. **role 분기**: 같은 웹 도메인에서 관리자 계정으로 로그인 → role=ADMIN의 운영 메뉴(회원·물건·점검·구독)로 분기되는지, 임대인 전용 메뉴가 숨겨지는지 확인.
3. **물건 등록 + 공공데이터 30초**: 임대인이 도로명 주소 + 동/호 입력 → 국토부/건축물대장/K-APT 데이터가 자동으로 채워지고 시세·AMI 점수가 30초 내 대시보드에 표출.
4. **점검자 → PDF 5분 골든패스**: 임대인이 정기 점검 의뢰 → 점검자 모바일 앱에서 의뢰 수락 → 체크리스트 작성·사진 5장 업로드·등급 입력 → 제출 후 5분 내 PDF 리포트가 임대인 알림으로 도착 + House Log 타임라인에 자동 기록.
5. **구독 과금 구간 청구**: 보유 물건수 1~3채 / 4~10채 / 11채+ 구간별로 청구 금액이 정확히 산출되고 PG sandbox로 결제가 완료되는지 확인.

## 완료 기준 매핑

| PRD 완료 기준 | 검증 방식 | 상태 |
| --- | --- | --- |
| 임대인 주소 입력 → 30초 내 공공데이터 대시보드 노출 | 통합 테스트 + 수동 시나리오 3 | 미달성 |
| 점검자 현장 점검 → 5분 내 PDF 리포트 자동 생성 | 통합 테스트 + 수동 시나리오 4 | 미달성 |
| 모든 점검 리포트가 House Log 타임라인에 누락 없이 기록 | 단위 + 통합 테스트 (M3·M4) | 미달성 |
| 임대인 구독 + 보유 물건수 구간 할인 정확 과금 | 단위 + 통합 테스트 (M5) + 수동 시나리오 5 | 미달성 |
| 주민등록번호 등 고유식별정보 평문 비저장 | 코드 grep + DB 스키마 검토 + User 단위 테스트 | 미달성 |
| 실제 DB 연결 (목업 데이터 X) | services 기동 + 헬스체크 + 단위 테스트 | 미달성 |
| 실제 인증 (하드코딩 비밀번호 X) | 코드 grep + 카카오/네이버 OAuth + PASS sandbox 통과 | 미달성 |
| 실제 공공데이터 API 연동 (더미 응답 X) | ETL 통합 테스트 (실 API 또는 공식 sandbox) | 미달성 |
| 실제 서버에 배포 (AWS, localhost X) | staging /health 200 + GitHub Actions green | 미달성 |
| 임대인·관리자 공용 웹 + 점검자 모바일이 같은 서버에 붙어 동작 | 통합 테스트 + 수동 시연 (시나리오 2·4) | 미달성 |
| 다른 사람이 가입해 실제 물건 등록·점검 의뢰 가능 | 베타 사용자 수동 시연 | 미달성 |

## 완료로 보지 않는 조건

- 필수 검증 중 하나라도 실패
- PLAN.md 밖의 scope로 변경됨 (특히 Phase 2/3 기능 — Settlement·CRM·PG정산·AI챗봇·OCR·VENDOR — 침범 시 즉시 중단)
- 명시적 승인 없이 public API가 변경됨
- 수동 재현이 여전히 실패함
- 산출물이 생성됐지만 검토되지 않음
- 검증을 통과시키기 위해 테스트가 삭제·skip됨
- 진단 없이 에러가 침묵 처리됨
- 기능 토글이 켜졌으나 내부 플래그가 연결되지 않음
- 임차인(TENANT) 역할·플로우가 Phase 1에 슬쩍 들어옴 (Phase 2로 이연된 결정 위반)
- 주민등록번호 등 고유식별정보가 DB 컬럼·로그·S3에 평문으로 등장
