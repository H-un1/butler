// 인앱 알림센터(Notification) api-node 클라이언트.
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.
// 실제 발송(카카오 알림톡/SMS)은 mock — 인앱 목록은 항상 노출된다.

import type { NotificationType, NotificationChannel } from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type NotificationDto = {
  id: string;
  type: NotificationType | string;
  channel: NotificationChannel | string;
  title: string;
  body: string | null;
  refId: string | null;
  read: boolean;
  sentMock: boolean; // mock 발송 여부(실 발송 없음)
  createdAt: string;
};

// GET /notifications/mine — 내 알림 목록(최신순)
export async function listMine(token: string): Promise<NotificationDto[]> {
  const r = await fetch(`${API_BASE}/notifications/mine`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`알림 목록 조회 실패 (${r.status})`);
  return r.json();
}

// GET /notifications/unread-count — 안읽음 개수(종 배지용)
export async function unreadCount(token: string): Promise<number> {
  const r = await fetch(`${API_BASE}/notifications/unread-count`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`안읽음 개수 조회 실패 (${r.status})`);
  const body = (await r.json()) as { count: number };
  return body.count;
}

// POST /notifications/:id/read — 단건 읽음 처리
export async function markRead(
  token: string,
  id: string
): Promise<NotificationDto> {
  const r = await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `읽음 처리 실패 (${r.status})`);
  }
  return r.json();
}

// POST /notifications/read-all — 모두 읽음 처리
export async function markAllRead(
  token: string
): Promise<{ marked: number }> {
  const r = await fetch(`${API_BASE}/notifications/read-all`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `모두 읽음 처리 실패 (${r.status})`);
  }
  return r.json();
}

// POST /notifications/scan (LANDLORD | ADMIN)
// 계약만료·월세미납 등 규칙을 평가해 알림을 생성한다.
export async function scan(
  token: string
): Promise<{ scanned: number; intents: number; created: number }> {
  const r = await fetch(`${API_BASE}/notifications/scan`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `알림 스캔 실패 (${r.status})`);
  }
  return r.json();
}

// === 표시용 라벨 ===========================================================
export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  CONTRACT_EXPIRY: '계약만료',
  RENT_OVERDUE: '월세연체',
  MAINTENANCE: '수선요청',
  REPORT_READY: '리포트',
  SETTLEMENT: '정산',
  PAYMENT: '결제',
};

export const NOTIFICATION_CHANNEL_LABEL: Record<NotificationChannel, string> = {
  IN_APP: '인앱',
  KAKAO: '카카오 알림톡',
  SMS: '문자',
};

// 유형별 배지 색 — 정산/결제는 브랜드, 연체/만료는 경고 톤
export const NOTIFICATION_TYPE_COLORS: Record<
  NotificationType,
  { bg: string; fg: string }
> = {
  CONTRACT_EXPIRY: { bg: '#FFF4E5', fg: '#B7791F' },
  RENT_OVERDUE: { bg: '#FDECEC', fg: '#C0392B' },
  MAINTENANCE: { bg: '#EEF0F3', fg: '#4E5968' },
  REPORT_READY: { bg: '#E6F4EA', fg: '#1B7F3A' },
  SETTLEMENT: { bg: 'var(--brand-soft)', fg: 'var(--brand-hover)' },
  PAYMENT: { bg: 'var(--brand-soft)', fg: 'var(--brand-hover)' },
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}
