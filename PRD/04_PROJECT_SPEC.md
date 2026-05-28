# 버틀러(Butler) — 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.

---

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 모바일 앱 | React Native (iOS + Android) | 임대인·임차인·점검자 앱을 단일 코드베이스로. 산학팀 숙련도 높고 생태계·AI코딩 호환 최상 |
| 웹 관리자 | React.js | 관리자(ADMIN) 콘솔. RN과 컴포넌트/지식 공유 |
| 주 백엔드 | Node.js | API·인증·CRM·실시간 알림. JS 생태계, 실시간 처리에 유리 |
| AI/데이터 백엔드 | Python + FastAPI | OCR·AMI 산출·정산 룰엔진·공공데이터 ETL. Python AI 생태계 강점 |
| DB | MySQL + Redis(캐시) | 관계형 모델에 적합, 공공데이터/세션 캐시는 Redis |
| 인프라 | AWS + Docker + GitHub Actions | 클라우드 네이티브, 컨테이너 배포, CI/CD 자동화 |
| 인증 | 소셜 로그인(카카오/네이버 OAuth) + PASS 본인인증 | 가입 마찰 최소화 + 실소유주 신뢰 확보. 부동산 도메인 필수 |
| 파일 저장 | AWS S3 | 점검 사진·PDF 리포트 저장 |

> 백엔드 2개(Node + Python) 운영: 일반 API/실시간은 Node, AI/데이터 파이프라인은 Python. API Gateway로 라우팅.

---

## 시스템 아키텍처 (요약)

```
CLIENT      iOS App / Android App (RN) · Web Admin (React)
   │
SERVER      API Gateway / Load Balancer / Auth(JWT)
   │         ├─ Node: Member · Asset · Contract · Support(알림)
   │         └─ Python(FastAPI): OCR · AMI Model · Settlement Engine · ETL
   │
DATA & AI   MySQL · Redis(Cache) · S3(files) · AI Core(OCR/AMI)
   │
EXTERNAL    공공데이터(국토부/건축물대장/K-APT) · PG(결제) · 알림(카카오 알림톡/SMS) · PASS(본인인증)
```

---

## 프로젝트 구조 (모노레포 예시)

```
butler/
├── apps/
│   ├── mobile/         # React Native (임대인/임차인/점검자)
│   └── admin-web/      # React 웹 관리자
├── services/
│   ├── api-node/       # Node 백엔드 (인증·자산·계약·알림)
│   └── ai-python/      # FastAPI (OCR·AMI·정산·ETL)
├── packages/
│   └── shared/         # 공용 타입·상수 (역할·상태 enum 등)
├── infra/              # Docker, GitHub Actions, AWS 설정
├── .env.example        # 환경변수 템플릿 (실제 값 X)
└── README.md
```

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- [ ] **주민등록번호 등 고유식별정보를 DB에 저장하지 마** — PASS 본인인증은 성공 여부·시각(verified_at)만 보관.
- [ ] API 키·PG 비밀키·공공데이터 인증키를 코드에 직접 쓰지 마 (.env 사용).
- [ ] HouseLogEntry를 수정·삭제하지 마 — append-only. 이력 신뢰성의 근거.
- [ ] 공공데이터 API 응답을 더미/하드코딩으로 대체하고 "완성"이라고 하지 마.
- [ ] 정산(Settlement)을 임의 AI 추론으로 만들지 마 — Phase 2의 룰베이스(LH기준·내구연수·감가상각)가 본체, AI는 보조.
- [ ] 임대인이 임차인 보증금을 앱이 임의로 자동 공제하게 만들지 마 — 양측 합의 후 결제로 분리.
- [ ] 기존 DB 스키마(02_DATA_MODEL)를 임의 변경하지 마 — 변경은 마이그레이션으로 명시.
- [ ] 역할(RBAC) 검증 없이 API를 열지 마 — 임차인이 타인 물건 데이터에 접근 불가.
- [ ] 테스트 없이 배포하지 마.

---

## 항상 해 (ALWAYS DO)

- [ ] 변경하기 전에 계획을 먼저 보여줘.
- [ ] 환경변수는 .env로 관리, .env.example만 커밋.
- [ ] 모든 API에 역할 기반 권한(RBAC) 검증을 넣어.
- [ ] 개인정보(연락처 등)는 최소수집·암호화 저장, 접근 로그 남겨.
- [ ] 점검 사진·PDF는 S3에 저장하고 서명된 URL로만 접근.
- [ ] 에러는 사용자에게 친절한 한국어 메시지로 표시.
- [ ] 모바일 우선 반응형 UI (앱이 주 채널).
- [ ] 공공데이터 호출은 캐시(Redis) + 호출제한(rate limit) 고려.

---

## 테스트 방법

```bash
# 모바일 앱
cd apps/mobile && npm run start

# 웹 관리자
cd apps/admin-web && npm run dev

# Node 백엔드
cd services/api-node && npm run dev && npm test

# Python AI 백엔드
cd services/ai-python && uvicorn main:app --reload && pytest

# 타입 체크 (TS)
npx tsc --noEmit
```

---

## 배포 방법

- Docker 이미지 빌드 → AWS(ECS/EC2) 배포, RDS(MySQL) + ElastiCache(Redis) + S3.
- GitHub Actions로 main 브랜치 머지 시 테스트 → 빌드 → 스테이징 배포 자동화.
- 모바일 앱은 스토어 심사(App Store / Play Store) 후 배포 (Phase 1 후반 마일스톤).

---

## 환경변수

| 변수명 | 설명 | 어디서 발급 |
|--------|------|------------|
| MOLIT_API_KEY | 국토부 실거래가 API 키 | 공공데이터포털(data.go.kr) |
| BLDRGST_API_KEY | 건축물대장 API 키 | 공공데이터포털 |
| KAPT_API_KEY | K-APT 단지정보 API 키 | 공동주택관리정보시스템 |
| KAKAO_OAUTH_KEY / NAVER_OAUTH_KEY | 소셜 로그인 키 | 카카오/네이버 개발자센터 |
| PASS_API_KEY | PASS 본인인증 연동 키 | 인증 대행사(예: NICE) |
| PG_SECRET_KEY | PG 결제 비밀키 (Phase 2) | PG사(예: 토스페이먼츠) |
| JWT_SECRET | 토큰 서명 키 | 직접 생성 |
| AWS_S3_BUCKET / AWS_KEY | 파일 저장 | AWS 콘솔 |

> .env 파일에 저장. 절대 GitHub에 올리지 마세요 (.gitignore 등록).

---

## [NEEDS CLARIFICATION]

- [ ] 모노레포(Turborepo/Nx) vs 멀티레포 결정.
- [ ] PASS 본인인증 대행사 선정 및 비용.
- [ ] PG사 선정 (Phase 2) 및 정산 수수료 정책.
- [ ] AI 결함분석/AMI 모델을 자체 학습할지, 외부 비전 API를 쓸지.
