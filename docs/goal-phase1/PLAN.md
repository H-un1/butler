# PLAN — 버틀러 Phase 1 (Butler MVP)

## 목표

원격 임대인이 비대면으로 가입·물건 등록·공공데이터 대시보드 확인·점검 의뢰·PDF 리포트 수령·구독 결제까지 완주할 수 있고, 임대인+관리자 공용 웹과 점검자 모바일이 같은 서버에 붙어 실제 사용자가 등록·점검을 의뢰할 수 있는 Phase 1 풀스코프 제품을 완성한다.

## 참조 문서

- PRD.md (./PRD/01_PRD.md)
- 데이터 모델 (./PRD/02_DATA_MODEL.md)
- Phase 분리 (./PRD/03_PHASES.md)
- 프로젝트 스펙 / 절대 하지 마 (./PRD/04_PROJECT_SPEC.md)
- VALIDATION.md
- RECOVERY.md

## 마일스톤 1: 기반 + 인증·RBAC·채널

- 범위(Scope): 모노레포 디렉토리(`apps/web` + `apps/mobile` + `services/api-node` + `services/ai-python` + `packages/shared`) 셋업, MySQL 스키마(User/Property/HouseLogEntry/Inspection/InspectionItem/Report/Subscription), Redis 셋업, 카카오/네이버 OAuth, PASS 본인인증(주민번호 비저장, `verified_at`만), JWT 세션, RBAC 미들웨어(LANDLORD/INSPECTOR/ADMIN), 임대인+관리자 공용 React 웹앱(로그인 후 role로 진입 화면·메뉴·API 권한 분기), 점검자 React Native 셸.
- 완료 조건: 3개 역할 각각 로그인 → 본인 권한 화면 진입 OK / 타 role API 호출은 403 / DB에 주민번호 평문 없음 / RBAC 단위 테스트 통과.
- 검증: `npm test -- auth rbac` + RBAC 401/403 수동 확인 + DB 컬럼 grep.

## 마일스톤 2: 물건 등록 + 공공데이터 ETL + 자산 대시보드

- 범위(Scope): 임대인 웹에서 도로명 주소+동/호 등록, FastAPI ETL이 국토부 실거래가·건축물대장·K-APT를 호출해 Property에 매핑, Redis 캐시 + rate limit, AMI 점수 산출(가중치는 04에서 정의되면 갱신), 자산 대시보드(시세 트래킹·단지정보·관리비·AMI).
- 완료 조건: 주소 입력에서 대시보드 노출까지 30초 내 / 공공 API 키는 `.env` / 실 API 또는 공식 sandbox만 사용(더미 응답 금지).
- 검증: ETL 통합 테스트(`pytest tests/etl`) + 30초 측정 수동 시연.

## 마일스톤 3: House Log (append-only 타임라인)

- 범위(Scope): HouseLogEntry 생성/조회 API, UPDATE/DELETE 금지 강제(DB 트리거 또는 서비스 레벨), 점검·리포트 생성 시 ref_id로 자동 연결, 임대인 웹에 물건별 타임라인 뷰.
- 완료 조건: UPDATE/DELETE 시도 시 거절되는 단위 테스트 통과 / 점검 1건 생성 시 HouseLogEntry 자동 추가 / 타임라인 뷰가 최신순 정렬 및 첨부 URL 노출.
- 검증: `npm test -- houselog` + 임대인 웹 타임라인 수동 확인.

## 마일스톤 4: 스마트 점검 리포트 (점검자앱 → PDF)

- 범위(Scope): 점검자 모바일에서 의뢰 수락·구역별 체크리스트·사진/동영상 업로드·파손 마킹·등급(A~F) 입력, FastAPI가 AI 결함분석 보조 호출(자체 학습 vs 외부 API는 NEEDS CLARIFICATION 결정에 따름), PDF 자동 생성, 임대인 알림(앱 푸시) + Report 레코드 + HouseLogEntry 자동 기록 + S3 서명 URL.
- 완료 조건: 점검자 제출 → 5분 내 PDF 임대인에게 도착 / Report·HouseLogEntry 자동 생성 / S3 직접 URL 노출 없이 서명 URL만.
- 검증: 통합 테스트(점검 생성→리포트 PDF→HouseLog 기록) + 수동 5분 측정.

## 마일스톤 5: 구독 과금 + 관리자 콘솔 + 배포

- 범위(Scope): 보유 물건수 기반 구간 요금(1~3채 / 4~10채 / 11채+ 또는 확정된 구간) 산출, PG 구독 결제(구독료 한정 — 정산금 결제는 Phase 2), 관리자 콘솔 화면(회원·물건·점검·구독 운영·검수), AWS 배포(ECS 또는 EC2 + RDS MySQL + ElastiCache Redis + S3) + GitHub Actions CI/CD.
- 완료 조건: 구간별 청구액 단위 테스트 통과 / PG sandbox 결제 성공 / 관리자 콘솔이 같은 웹 도메인에서 role=ADMIN으로 진입 / staging /health 200 / main 머지 시 CI 자동 빌드·테스트·배포.
- 검증: `npm test -- subscription` + PG sandbox 통합 + staging health check + 관리자 콘솔 수동 시연.

## 최종 완료 기준

- [ ] 모든 마일스톤 완료
- [ ] VALIDATION.md의 모든 검증 통과
- [ ] scope 위반 없음 (Phase 2/3 기능 침범 0건, 임차인 슬쩍 추가 0건)
- [ ] PROGRESS.md 업데이트
