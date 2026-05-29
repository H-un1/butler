/goal 버틀러 Phase 2+3을 mock-first로 완성한다. PLAN.md(P.md)의 모든 마일스톤이 끝나고 VALIDATION.md(V.md)의 필수 검증이 모두 통과되며, 각 마일스톤이 UI에서 클릭으로 흐름을 완주할 수 있을 때까지 멈추지 말고 구현한다.

[약어] V.md=VALIDATION.md, R.md=RECOVERY.md, P.md=PLAN.md, PR.md=PROGRESS.md

먼저 PRD/01_PRD.md, PRD/03_PHASES.md, PRD/04_PROJECT_SPEC.md, V.md, R.md, P.md를 읽는다. Phase 1 기록은 docs/goal-phase1/PR.md에 보존돼 있다.

핵심 원칙 — mock/실로직 경계:
- mock 어댑터로만 동작(실 외부 API 호출 0건): PG 결제, 알림 발송(카카오 알림톡/SMS), AI 챗봇(RAG), AI OCR 등기부, 판례 AI. 실 키 자리만 비워둔 어댑터 셸을 남긴다.
- mock 아닌 실제 로직으로 동작: 수선비 정산(Settlement, LH 부담기준표+표준 내구연수+감가상각, InspectionItem 등급·내구연수 실제 참조), 양측 합의 상태전이, CRM 자동알림 룰, 수선요청 이슈보드, 단지 커뮤니티/전자투표, 보수업체 매칭.
- 정산 분담비율은 룰엔진이 본체다. 판례 AI(mock)는 보조일 뿐 분담비율을 임의 추론으로 만들지 않는다.
- 보증금은 양측 합의 전에 앱이 자동 공제하지 않는다.

마일스톤은 P.md를 순서대로 진행한다: M1 Lease·TENANT 활성화+수선요청 이슈보드 → M2 정산 엔진(룰베이스)+양측 합의 → M3 CRM+자동알림+(mock)PG 결제 → M4 단지 커뮤니티+전자투표+보수업체 매칭 → M5 AI 보조 전부 mock(챗봇·OCR 등기부·판례). 각 마일스톤의 범위·완료 조건·검증 명령은 P.md와 V.md를 단일 진실 원천으로 따른다.

작업 방식:
- 외부 의존은 어댑터 인터페이스로 추상화하고 mock 구현을 기본값으로 둔다.
- DB 스키마 변경은 02_DATA_MODEL.md에 정의된 엔티티(Lease/MaintenanceRequest/Settlement/Payment/Notification/Vendor/Community/Vote/ChatbotLog/OcrDocument) 기준으로 마이그레이션을 명시한다. 임의 스키마 변경 금지.
- 모든 API에 RBAC를 둔다. 임차인(TENANT) 추가 시에도 타인 물건·계약·정산 접근은 403.
- 주민등록번호 등 고유식별정보는 DB·로그·S3·OCR 결과에 평문으로 저장·노출하지 않는다. PASS는 verified_at만, OCR은 마스킹·비저장.
- Phase 1 기능(대시보드/점검/HouseLog/구독)을 회귀로 깨뜨리지 않는다.

완료 판정과 검증:
- 마일스톤 완료는 백엔드 테스트 그린만으로 인정하지 않는다. V.md의 수동 확인 절차대로 UI에서 클릭으로 흐름을 완주할 수 있어야 완료다.
- 매 마일스톤 종료 시 V.md의 해당 마일스톤 검증 명령과 Phase 1 회귀 검증을 실행한다.

운영 규칙:
- 모든 실패 처리·되돌리기·방향 재확인·scope 잠금 규칙은 R.md를 따른다. R.md에 명시되지 않은 모듈 재작성·public API 변경·scope 확장 금지.
- mock이어야 할 경로를 실 API로 연결하거나, 실로직이어야 할 경로를 mock·하드코딩으로 우회하지 않는다.
- 같은 검증이 서로 다른 3회(3 attempts) 시도 후에도 실패하면 자체 수정을 멈추고 진단·검토 모드로 전환해 사람의 결정을 기다린다(실패한 기준·시도한 수정·실패 이유·다음 안전 옵션 보고).
- 매 체크포인트마다 PROGRESS.md를 업데이트한다(현재 마일스톤·완료·마지막 검증 결과·실패 시도·다음 단계).
