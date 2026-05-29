# 버틀러 (Butler)

원격 임대인을 위한 부동산 자산관리 SaaS — Phase 1 MVP.

## 채널 (Phase 1)

| 앱 | 사용자 | 위치 |
|----|--------|------|
| 웹 (React) | 임대인(LANDLORD) + 관리자(ADMIN) — **role 분기** | `apps/web` |
| 모바일 (RN/Expo) | 점검자(INSPECTOR) | `apps/mobile` |
| API (Node) | 인증·자산·계약·알림 | `services/api-node` |
| AI 백엔드 (FastAPI) | OCR·AMI·정산·ETL | `services/ai-python` |

임차인(TENANT)은 Phase 2부터.

## 시작하기

```bash
# 1. 의존성
npm install

# 2. 환경변수
cp .env.example .env
# .env 편집

# 3. DB (MySQL + Redis 로컬 실행 필요)
npm --workspace services/api-node run db:migrate

# 4. 개발 서버
npm run dev:api      # localhost:4000
npm run dev:web      # localhost:5173
npm run dev:mobile   # expo go
```

## 테스트

```bash
npm test                          # 전체 workspace 단위 테스트
npm --workspace services/api-node run test
npm run typecheck                 # 전체 워크스페이스 tsc --noEmit
npm --workspace apps/web run build
```

## 문서

- [PRD](./PRD/01_PRD.md) — 무엇을 만드는지
- [데이터 모델](./PRD/02_DATA_MODEL.md)
- [Phase 분리](./PRD/03_PHASES.md)
- [프로젝트 스펙 / 절대 하지 마](./PRD/04_PROJECT_SPEC.md)
- [PLAN.md](./PLAN.md) — Phase 1 마일스톤
- [VALIDATION.md](./VALIDATION.md) — 완료 검증 조건
- [PROGRESS.md](./PROGRESS.md) — 진척 현황
