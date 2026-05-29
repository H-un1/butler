// 도메인 상태 enum — DB CHECK 제약과 일치해야 한다 (02_DATA_MODEL.md)

export const INSPECTION_TYPES = ['REGULAR', 'REPAIR', 'MOVE_OUT'] as const;
export type InspectionType = (typeof INSPECTION_TYPES)[number];

export const INSPECTION_STATUSES = [
  'REQUESTED',
  'SCHEDULED',
  'IN_PROGRESS',
  'DONE',
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_GRADES = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type InspectionGrade = (typeof INSPECTION_GRADES)[number];

export const REPORT_STATUSES = ['GENERATED', 'SHARED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const HOUSELOG_TYPES = [
  'INSPECTION',
  'REPAIR',
  'CONTRACT',
  'OWNER_CHANGE',
] as const;
export type HouseLogType = (typeof HOUSELOG_TYPES)[number];

export const AUTH_PROVIDERS = ['kakao', 'naver', 'dev-mock'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCELED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_TIERS = ['TIER_1', 'TIER_2', 'TIER_3'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

// === Phase 2 — 임대차(Lease) ===

export const LEASE_STATUSES = ['PENDING', 'ACTIVE', 'ENDED'] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

// === Phase 2 — 수선요청 이슈 협업보드 (MaintenanceRequest) ===

export const MAINTENANCE_CATEGORIES = [
  'PLUMBING', // 누수·배관
  'ELECTRICAL', // 전기
  'APPLIANCE', // 가전·설비
  'STRUCTURAL', // 구조·마감
  'ETC',
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

// 이슈보드 상태전이: OPEN → IN_PROGRESS → RESOLVED → CLOSED (REJECTED는 종료 분기)
export const MAINTENANCE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

// 상태별 허용 전이 — 서버·UI 양쪽에서 가드로 사용
export const MAINTENANCE_TRANSITIONS: Record<
  MaintenanceStatus,
  readonly MaintenanceStatus[]
> = {
  OPEN: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: [],
};

export function canTransitionMaintenance(
  from: MaintenanceStatus,
  to: MaintenanceStatus
): boolean {
  return MAINTENANCE_TRANSITIONS[from].includes(to);
}

// === Phase 2 — 수선비 정산 (Settlement) ===

// 합의 상태전이: DRAFT(산출) → PROPOSED(임대인 제안) → DISPUTED(임차인 이의)
// → PROPOSED(임대인 재제안) → AGREED(양측 합의) / REJECTED(결렬)
export const SETTLEMENT_STATUSES = [
  'DRAFT',
  'PROPOSED',
  'DISPUTED',
  'AGREED',
  'REJECTED',
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_TRANSITIONS: Record<
  SettlementStatus,
  readonly SettlementStatus[]
> = {
  DRAFT: ['PROPOSED', 'REJECTED'],
  PROPOSED: ['AGREED', 'DISPUTED', 'REJECTED'],
  DISPUTED: ['PROPOSED', 'REJECTED'],
  AGREED: [], // 합의 완료 — 종결
  REJECTED: [],
};

export function canTransitionSettlement(
  from: SettlementStatus,
  to: SettlementStatus
): boolean {
  return SETTLEMENT_TRANSITIONS[from].includes(to);
}

// 정산 라인 카테고리 — LH 부담기준표·표준 내구연수가 매핑되는 항목 분류
export const SETTLEMENT_CATEGORIES = [
  'WALLPAPER', // 도배
  'FLOORING', // 바닥재(장판/마루)
  'PAINT', // 도장
  'PLUMBING', // 배관·누수
  'APPLIANCE', // 가전
  'FIXTURE', // 설비(싱크/욕실 등)
  'ETC',
] as const;
export type SettlementCategory = (typeof SETTLEMENT_CATEGORIES)[number];

// 정산 이벤트(append-only 합의 이력) 유형
export const SETTLEMENT_EVENT_TYPES = [
  'COMPUTED',
  'PROPOSED',
  'DISPUTED',
  'AGREED',
  'REJECTED',
  'COMMENT',
] as const;
export type SettlementEventType = (typeof SETTLEMENT_EVENT_TYPES)[number];

// === Phase 2 (M3) — 알림(Notification) ===

// 자동알림 유형 — 계약만료 D-Day / 월세미납 / 수선요청 / 리포트도착 / 정산 / 결제
export const NOTIFICATION_TYPES = [
  'CONTRACT_EXPIRY',
  'RENT_OVERDUE',
  'MAINTENANCE',
  'REPORT_READY',
  'SETTLEMENT',
  'PAYMENT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// 발송 채널 — 실제 발송은 mock(카카오 알림톡/SMS 미연동). 인앱은 항상 노출.
export const NOTIFICATION_CHANNELS = ['IN_APP', 'KAKAO', 'SMS'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// === Phase 2 (M3) — 결제(Payment) ===
// ⚠️ 실 PG 미연동 — mock 어댑터로만 동작(실 결제 0). 보증금 자동공제 없음.

export const PAYMENT_TYPES = ['SUBSCRIPTION', 'SETTLEMENT', 'RENT'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_STATUSES = [
  'REQUESTED',
  'PAID',
  'FAILED',
  'CANCELED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// === Phase 3 (M4) — 단지 커뮤니티 · 전자투표 · 보수업체 ===

export const VOTE_STATUSES = ['OPEN', 'CLOSED'] as const;
export type VoteStatus = (typeof VOTE_STATUSES)[number];

// 보수업체 카테고리는 수선요청 카테고리(MAINTENANCE_CATEGORIES)를 재사용한다.
export type VendorCategory = MaintenanceCategory;

// === Phase 3 (M5) — AI 보조 (전부 mock) ===

export const CHATBOT_TOPICS = ['LEASE_LAW', 'TAX', 'GENERAL'] as const;
export type ChatbotTopic = (typeof CHATBOT_TOPICS)[number];

// 등기부 안전등급 (깡통전세 진단) — mock OCR이 산출
export const OCR_SAFETY_GRADES = ['SAFE', 'CAUTION', 'DANGER'] as const;
export type OcrSafetyGrade = (typeof OCR_SAFETY_GRADES)[number];
