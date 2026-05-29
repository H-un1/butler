// 수선요청 이슈 협업보드(MaintenanceRequest) api-node 클라이언트.
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.

import type { MaintenanceCategory, MaintenanceStatus } from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type MaintenanceRequestDto = {
  id: string;
  propertyId: string;
  leaseId: string | null;
  requesterId: string;
  // 백엔드가 추가하는 사람친화 필드 (optional — 미반영 시 shortCode로 fallback)
  requesterName?: string;
  category: MaintenanceCategory;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  photoUrls: string[];
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceComment = {
  id: string;
  authorId: string;
  // 백엔드가 추가하는 사람친화 필드 (optional — 미반영 시 shortCode로 fallback)
  authorName?: string;
  body: string;
  systemEvent: string | null;
  createdAt: string;
};

export type MaintenanceDetail = MaintenanceRequestDto & {
  comments: MaintenanceComment[];
};

export type CreateMaintenanceInput = {
  propertyId: string;
  leaseId?: string;
  category: MaintenanceCategory;
  title: string;
  description?: string;
  photoUrls?: string[];
};

// POST /maintenance (TENANT, 해당 물건에 ACTIVE 임대차 필요)
export async function createMaintenance(
  token: string,
  input: CreateMaintenanceInput
): Promise<MaintenanceRequestDto> {
  const r = await fetch(`${API_BASE}/maintenance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `수선요청 생성 실패 (${r.status})`);
  }
  return r.json();
}

// GET /maintenance/mine (TENANT)
export async function listMyMaintenance(
  token: string
): Promise<MaintenanceRequestDto[]> {
  const r = await fetch(`${API_BASE}/maintenance/mine`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`수선요청 목록 조회 실패 (${r.status})`);
  return r.json();
}

// GET /maintenance/board (LANDLORD: 본인 물건 / ADMIN: 전체)
export async function listMaintenanceBoard(
  token: string
): Promise<MaintenanceRequestDto[]> {
  const r = await fetch(`${API_BASE}/maintenance/board`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`이슈보드 조회 실패 (${r.status})`);
  return r.json();
}

// GET /maintenance/:id — 상세 + 코멘트 타임라인
export async function getMaintenance(
  token: string,
  id: string
): Promise<MaintenanceDetail> {
  const r = await fetch(`${API_BASE}/maintenance/${id}`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`수선요청 상세 조회 실패 (${r.status})`);
  return r.json();
}

// POST /maintenance/:id/status — 상태전이(+선택 코멘트)
export async function updateMaintenanceStatus(
  token: string,
  id: string,
  status: MaintenanceStatus,
  comment?: string
): Promise<MaintenanceRequestDto> {
  const r = await fetch(`${API_BASE}/maintenance/${id}/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(comment ? { status, comment } : { status }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `상태 변경 실패 (${r.status})`);
  }
  return r.json();
}

// POST /maintenance/:id/comments
export async function addMaintenanceComment(
  token: string,
  id: string,
  body: string
): Promise<MaintenanceComment> {
  const r = await fetch(`${API_BASE}/maintenance/${id}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ body }),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `코멘트 작성 실패 (${r.status})`);
  }
  return r.json();
}

// === 표시용 라벨 ===========================================================
export const CATEGORY_LABEL: Record<MaintenanceCategory, string> = {
  PLUMBING: '누수·배관',
  ELECTRICAL: '전기',
  APPLIANCE: '가전·설비',
  STRUCTURAL: '구조·마감',
  ETC: '기타',
};

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: '접수',
  IN_PROGRESS: '처리중',
  RESOLVED: '해결',
  CLOSED: '종료',
  REJECTED: '반려',
};

export const MAINTENANCE_STATUS_COLORS: Record<
  MaintenanceStatus,
  { bg: string; fg: string }
> = {
  OPEN: { bg: '#FFF4E5', fg: '#B7791F' },
  IN_PROGRESS: { bg: 'var(--brand-soft)', fg: 'var(--brand-hover)' },
  RESOLVED: { bg: '#E6F4EA', fg: '#1B7F3A' },
  CLOSED: { bg: '#EEF0F3', fg: '#4E5968' },
  REJECTED: { bg: '#FDECEC', fg: '#C0392B' },
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
