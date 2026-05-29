// 임대차 CRM 개요(CRM Overview) api-node 클라이언트.
// 임대인/관리자가 보유 계약을 한눈에 관리하기 위한 대시보드 데이터.
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.

import type { LeaseStatus, SettlementStatus } from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// 월세 상태 — 납부완료/연체/납부예정/해당없음(무월세)
export type RentStatus = 'PAID' | 'OVERDUE' | 'DUE' | 'NONE';

export type CrmSummary = {
  period: string; // YYYY-MM
  totalLeases: number;
  activeLeases: number;
  expiringSoon: number; // 만료임박
  rentOverdue: number; // 월세연체
  openMaintenance: number; // 오픈 수선
};

export type CrmLeaseRow = {
  leaseId: string;
  propertyId: string;
  address: string;
  status: LeaseStatus;
  tenantId: string | null;
  // 백엔드가 추가하는 사람친화 필드 (optional — 미반영 시 shortCode로 fallback)
  tenantName?: string;
  deposit: number;
  rent: number | null;
  startAt: string;
  endAt: string;
  expiryDday: number | null; // 만료 D-day(음수면 이미 만료)
  rentStatus: RentStatus;
  openMaintenance: number;
  settlementStatus: SettlementStatus | null;
  settlementId: string | null;
};

export type CrmOverview = {
  summary: CrmSummary;
  leases: CrmLeaseRow[];
};

// GET /crm/overview (LANDLORD | ADMIN)
export async function getOverview(token: string): Promise<CrmOverview> {
  const r = await fetch(`${API_BASE}/crm/overview`, {
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `CRM 개요 조회 실패 (${r.status})`);
  }
  return r.json();
}

// === 표시용 라벨 ===========================================================
export const RENT_STATUS_LABEL: Record<RentStatus, string> = {
  PAID: '납부완료',
  OVERDUE: '연체',
  DUE: '납부예정',
  NONE: '해당없음',
};

export const RENT_STATUS_COLORS: Record<RentStatus, { bg: string; fg: string }> = {
  PAID: { bg: '#E6F4EA', fg: '#1B7F3A' },
  OVERDUE: { bg: '#FDECEC', fg: '#C0392B' },
  DUE: { bg: '#FFF4E5', fg: '#B7791F' },
  NONE: { bg: '#EEF0F3', fg: '#4E5968' },
};

// 만료 D-day → 표시 문자열 (오늘=D-day, 지남=D+n)
export function formatDday(d: number | null): string {
  if (d == null) return '—';
  if (d === 0) return 'D-day';
  return d > 0 ? `D-${d}` : `D+${-d}`;
}
