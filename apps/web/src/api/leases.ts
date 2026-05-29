// 임대차(Lease) api-node 클라이언트.
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.

import type { LeaseStatus } from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type LeaseDto = {
  id: string;
  propertyId: string;
  // 백엔드가 추가하는 사람친화 필드 (optional — 미반영 시 shortCode로 fallback)
  propertyAddress?: string;
  landlordId: string;
  tenantId: string | null;
  status: LeaseStatus;
  deposit: number;
  rent: number | null;
  startAt: string;
  endAt: string;
  // 임대인 응답에만 노출 — 임차인 응답에서는 null
  inviteToken: string | null;
  invitedPhone: string | null;
};

export type CreateLeaseInput = {
  propertyId: string;
  deposit: number;
  rent?: number;
  startAt: string; // ISO
  endAt: string; // ISO
  invitedPhone?: string;
};

// POST /leases (LANDLORD) — 계약 생성 + inviteToken 발급
export async function createLease(
  token: string,
  input: CreateLeaseInput
): Promise<LeaseDto> {
  const r = await fetch(`${API_BASE}/leases`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `임대차 생성 실패 (${r.status})`);
  }
  return r.json();
}

// GET /leases/mine (LANDLORD 또는 TENANT)
export async function listMyLeases(token: string): Promise<LeaseDto[]> {
  const r = await fetch(`${API_BASE}/leases/mine`, { headers: authHeader(token) });
  if (!r.ok) throw new Error(`임대차 목록 조회 실패 (${r.status})`);
  return r.json();
}

// POST /leases/accept (TENANT) — 초대 토큰으로 계약 연결
export async function acceptLease(
  token: string,
  inviteToken: string
): Promise<LeaseDto> {
  const r = await fetch(`${API_BASE}/leases/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ inviteToken }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `계약 연결 실패 (${r.status})`);
  }
  return r.json();
}

// POST /leases/:id/end (LANDLORD)
export async function endLease(token: string, id: string): Promise<LeaseDto> {
  const r = await fetch(`${API_BASE}/leases/${id}/end`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `계약 종료 실패 (${r.status})`);
  }
  return r.json();
}

// === 표시용 라벨 ===========================================================
export const LEASE_STATUS_LABEL: Record<LeaseStatus, string> = {
  PENDING: '초대 대기',
  ACTIVE: '계약 중',
  ENDED: '종료',
};

export const LEASE_STATUS_COLORS: Record<LeaseStatus, { bg: string; fg: string }> = {
  PENDING: { bg: '#FFF4E5', fg: '#B7791F' },
  ACTIVE: { bg: '#E6F4EA', fg: '#1B7F3A' },
  ENDED: { bg: '#EEF0F3', fg: '#4E5968' },
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}
