// (mock)PG 결제(Payment) api-node 클라이언트.
// ⚠️ 실 PG 미연동 — mock 어댑터로만 동작(실제 청구 0). 보증금 자동공제 없음.
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.

import type { PaymentType, PaymentStatus } from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type PaymentDto = {
  id: string;
  payerId: string;
  type: PaymentType | string;
  refId: string | null;
  amount: number;
  status: PaymentStatus | string;
  provider: string; // mock PG provider 식별자
  mockChargeId: string | null;
  period: string | null; // YYYY-MM (월세 등)
  paidAt: string | null;
  createdAt: string;
};

// POST /payments/settlement/:settlementId (TENANT) — 정산금 결제(mock)
export async function paySettlement(
  token: string,
  settlementId: string
): Promise<PaymentDto> {
  const r = await fetch(`${API_BASE}/payments/settlement/${settlementId}`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `정산금 결제 실패 (${r.status})`);
  }
  return r.json();
}

// POST /payments/subscription (LANDLORD) — 구독료 결제(mock)
export async function paySubscription(token: string): Promise<PaymentDto> {
  const r = await fetch(`${API_BASE}/payments/subscription`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `구독료 결제 실패 (${r.status})`);
  }
  return r.json();
}

// POST /payments/rent (TENANT) — 월세 납부(mock). period 미지정 시 서버가 당월 처리.
export async function payRent(
  token: string,
  input: { leaseId: string; period?: string }
): Promise<PaymentDto> {
  const r = await fetch(`${API_BASE}/payments/rent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `월세 납부 실패 (${r.status})`);
  }
  return r.json();
}

// GET /payments/mine — 내 결제 내역
export async function listMyPayments(token: string): Promise<PaymentDto[]> {
  const r = await fetch(`${API_BASE}/payments/mine`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`결제 내역 조회 실패 (${r.status})`);
  return r.json();
}

// === 표시용 라벨 ===========================================================
export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  SUBSCRIPTION: '구독료',
  SETTLEMENT: '정산금',
  RENT: '월세',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  REQUESTED: '요청',
  PAID: '완료',
  FAILED: '실패',
  CANCELED: '취소',
};

export const PAYMENT_STATUS_COLORS: Record<
  PaymentStatus,
  { bg: string; fg: string }
> = {
  REQUESTED: { bg: '#FFF4E5', fg: '#B7791F' },
  PAID: { bg: '#E6F4EA', fg: '#1B7F3A' },
  FAILED: { bg: '#FDECEC', fg: '#C0392B' },
  CANCELED: { bg: '#EEF0F3', fg: '#4E5968' },
};

export function formatKrw(n: number): string {
  return `${n.toLocaleString()}원`;
}

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
