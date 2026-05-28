# 버틀러(Butler) — 디자인 시스템 레퍼런스

> 실제 CSS 기반 디자인 토큰. "느낌"이 아니라 hex·폰트·간격 숫자.
> AI에게 화면을 시킬 때 해당 `design.md`를 **프롬프트에 함께 첨부**한다.

## 채널별 매핑

| 채널 | 대상 사용자 | 디자인 베이스 | 레퍼런스 |
|------|------------|--------------|----------|
| **모바일 앱** (임대인 + 임차인) | LANDLORD, TENANT | **Toss** — Friendly Fintech, 신뢰감·여백·큰 숫자 | [`app-toss/design.md`](./app-toss/design.md) |
| **웹 관리자** (ADMIN) | 운영·검수 | **Linear** — 데이터 밀도·표·hairline 구조 | [`admin-linear/design.md`](./admin-linear/design.md) |

> 점검자(INSPECTOR) 앱은 Phase 1 운영모델 미결 → 디자인 보류. 추후 앱(Toss 베이스) 재사용 + 현장용 고대비/큰 버튼 변형.

## 앱: 임대인 ↔ 임차인은 "하나의 디자인 시스템"

React Native 단일 코드베이스 → 토큰·컴포넌트 공유. 역할 차이는 **색을 바꾸지 않고 구성으로만** 분기.

| | 임대인 앱 | 임차인 앱 |
|---|---|---|
| 베이스 | Toss design.md (공유) | Toss design.md (공유) |
| 성격 | 자산·데이터 중심 (대시보드·AMI·시세 비중 ↑) | 요청·확인 중심 (수선요청 CTA 명확, 단계 단순) |
| 강조 | 정보 위계·숫자 | 행동 유도(버튼)·진행상태 |

## ⚠️ 브랜드 통일 규칙 (가장 중요)

앱은 Toss Blue, 웹은 Linear Violet — **두 브랜드 색이 섞이면 한 제품으로 안 보인다.** 다음으로 통일:

- **버틀러 Primary = Toss Blue `#3182F6`** (앱·웹 공통 액션 컬러)
- 웹 관리자는 **Linear의 레이아웃·밀도·hairline 구조만 차용**하고, 보라색 액션(`#7070FF`)은 전부 **`#3182F6`으로 치환**한다.
- 텍스트 near-black은 앱 `#191F28`(Toss) / 웹 `#282A30`(Linear) — 각 베이스 유지 OK (둘 다 순수 검정 아님).
- 에러/경고 등 시맨틱 색도 한쪽 기준으로 통일 권장 (Toss `#F04452` 계열).

## 핵심 토큰 요약 (빠른 참조)

### 앱 (Toss)
| 역할 | Hex |
|---|---|
| Primary / CTA | `#3182F6` |
| CTA hover | `#1B64DA` |
| Primary soft | `#E8F3FF` |
| 배경 | `#FFFFFF` / muted `#F2F4F6` |
| 본문 텍스트 | `#191F28` / 보조 `#6B7684` |
| 보더 | `#E5E8EB` |
| 폰트 | Toss Product Sans → 대체 **Pretendard / Noto Sans KR**, body 15px / line-height 1.6 |
| radius | control 8px, card 16–20px |

### 웹 (Linear, 단 브랜드색은 #3182F6으로 치환)
| 역할 | Hex |
|---|---|
| Primary / CTA | `#3182F6` *(Linear 기본 #7070FF에서 치환)* |
| 배경 dark | `#08090A` / panel `#0F1011` |
| 배경 light | `#FFFFFF` / `#F8F8F8` |
| 텍스트 | dark `#F7F8F8` / light `#282A30` / muted `#6F6E77` |
| 보더(hairline) | light `#E9E8EA` / dark `#23252A` |
| 폰트 | Inter Variable, weight 400/510/590/680 |
| 깊이 | shadow 대신 **1px hairline + inset ring** |

## 다음 단계
1. 폰트 라이선스 확정 — Toss Product Sans는 비공개 → 실제로는 **Pretendard** 사용(웹/앱 한글 공통으로도 좋음).
2. 위 토큰을 Phase 1 핵심 화면에 적용해 목업 생성: `/insane-design:build` 또는 goaljaby 구현 시 design.md 첨부.
3. 핵심 화면 우선순위: 임대인 대시보드 → 점검 리포트 → House Log → (임차인) 수선요청.
