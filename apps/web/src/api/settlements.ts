// 수선비 정산(Settlement) api-node 클라이언트.
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.
// 임대인이 퇴거 점검 데이터를 근거로 정산을 산출·제안하고, 임차인이 합의/이의하는 흐름.

import type {
  SettlementCategory,
  SettlementStatus,
  SettlementEventType,
} from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type SettlementGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

// 산출 요청 시 임대인이 입력하는 라인(점검 데이터를 권위값으로 쓸 수도 있음)
export type SettlementLineInput = {
  checklistKey: string;
  area: string;
  category: SettlementCategory;
  grade: SettlementGrade;
  markedDefect: boolean;
  repairCost: number; // 원 단위
  yearsUsed: number; // 사용연수(년)
};

// 산출 결과 라인 — 서버 룰엔진이 계산한 분담 근거 포함
export type SettlementLine = SettlementLineInput & {
  durabilityYears: number; // 표준 내구연수
  tenantFaultRatio: number; // 임차인 부담비율(0~1)
  gradeSeverity: number; // 등급 심각도 가중치
  residualRatio: number; // 감가상각 잔존비율(0~1)
  tenantShare: number; // 임차인 분담액(원)
  landlordShare: number; // 임대인 분담액(원)
  eligible: boolean; // 정산 대상 여부(결함·등급 기준 통과)
};

// 산출 근거 메타 — 표/공식/룰 버전
export type SettlementBasis = {
  ruleVersion: string;
  durabilityTable: Record<string, number>;
  faultTable: Record<string, number>;
  formula: string;
  computedNote: string;
};

export type SettlementEvent = {
  id: string;
  actorId: string;
  // 백엔드가 추가하는 사람친화 필드 (optional — 미반영 시 shortCode로 fallback)
  actorName?: string;
  type: SettlementEventType | string;
  note: string | null;
  createdAt: string;
};

export type SettlementDto = {
  id: string;
  leaseId: string;
  inspectionId: string | null;
  landlordId: string;
  tenantId: string | null;
  status: SettlementStatus;
  ruleVersion: string;
  totalCost: number;
  tenantTotal: number;
  landlordTotal: number;
  lines: SettlementLine[];
  basis: SettlementBasis;
  createdAt: string;
  updatedAt: string;
};

export type SettlementDetail = SettlementDto & {
  events: SettlementEvent[];
};

export type ComputeSettlementInput = {
  leaseId: string;
  inspectionId?: string;
  lines: SettlementLineInput[];
};

// POST /settlements/compute (LANDLORD) — 정산 산출(DRAFT 생성)
export async function computeSettlement(
  token: string,
  input: ComputeSettlementInput
): Promise<SettlementDto> {
  const r = await fetch(`${API_BASE}/settlements/compute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `정산 산출 실패 (${r.status})`);
  }
  return r.json();
}

// GET /settlements/mine (LANDLORD | TENANT) — 내 정산 목록
export async function listMySettlements(
  token: string
): Promise<SettlementDto[]> {
  const r = await fetch(`${API_BASE}/settlements/mine`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`정산 목록 조회 실패 (${r.status})`);
  return r.json();
}

// GET /settlements/:id — 상세 + 이벤트 타임라인
export async function getSettlement(
  token: string,
  id: string
): Promise<SettlementDetail> {
  const r = await fetch(`${API_BASE}/settlements/${id}`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`정산 상세 조회 실패 (${r.status})`);
  return r.json();
}

// POST /settlements/:id/propose (LANDLORD) — 임차인에게 제안(+선택 라인 수정·메모)
// DRAFT→PROPOSED, DISPUTED→PROPOSED(재제안) 둘 다 이 엔드포인트 사용.
export async function proposeSettlement(
  token: string,
  id: string,
  body?: { lines?: SettlementLineInput[]; note?: string }
): Promise<SettlementDto> {
  const r = await fetch(`${API_BASE}/settlements/${id}/propose`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `제안 실패 (${r.status})`);
  }
  return r.json();
}

// POST /settlements/:id/dispute (TENANT) — 이의 제기(메모 필수)
export async function disputeSettlement(
  token: string,
  id: string,
  note: string
): Promise<SettlementDto> {
  const r = await fetch(`${API_BASE}/settlements/${id}/dispute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ note }),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `이의 제기 실패 (${r.status})`);
  }
  return r.json();
}

// POST /settlements/:id/agree (TENANT) — 합의 완료
export async function agreeSettlement(
  token: string,
  id: string
): Promise<SettlementDto> {
  const r = await fetch(`${API_BASE}/settlements/${id}/agree`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `합의 실패 (${r.status})`);
  }
  return r.json();
}

// POST /settlements/:id/reject (LANDLORD | TENANT) — 결렬(+선택 메모)
export async function rejectSettlement(
  token: string,
  id: string,
  note?: string
): Promise<SettlementDto> {
  const r = await fetch(`${API_BASE}/settlements/${id}/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(note ? { note } : {}),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `결렬 처리 실패 (${r.status})`);
  }
  return r.json();
}

// === 표시용 라벨 ===========================================================
export const SETTLEMENT_CATEGORY_LABEL: Record<SettlementCategory, string> = {
  WALLPAPER: '도배',
  FLOORING: '바닥재',
  PAINT: '도장',
  PLUMBING: '배관·누수',
  APPLIANCE: '가전',
  FIXTURE: '설비',
  ETC: '기타',
};

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  DRAFT: '산출',
  PROPOSED: '제안됨',
  DISPUTED: '이의',
  AGREED: '합의완료',
  REJECTED: '결렬',
};

export const SETTLEMENT_STATUS_COLORS: Record<
  SettlementStatus,
  { bg: string; fg: string }
> = {
  DRAFT: { bg: '#EEF0F3', fg: '#4E5968' },
  PROPOSED: { bg: 'var(--brand-soft)', fg: 'var(--brand-hover)' },
  DISPUTED: { bg: '#FFF4E5', fg: '#B7791F' },
  AGREED: { bg: '#E6F4EA', fg: '#1B7F3A' },
  REJECTED: { bg: '#FDECEC', fg: '#C0392B' },
};

export const SETTLEMENT_GRADES: SettlementGrade[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
];

// 등급 의미 — 점검자 등급 입력 화면(InspectionDo)과 동일한 기준
export const SETTLEMENT_GRADE_HINT: Record<SettlementGrade, string> = {
  A: '문제없음',
  B: '경미',
  C: '주의',
  D: '수리 필요',
  E: '심각',
  F: '교체 필요',
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

export function formatKrw(n: number): string {
  return `${n.toLocaleString()}원`;
}

// 부담비율(0~1)을 % 문자열로
export function formatRatio(r: number): string {
  return `${Math.round(r * 100)}%`;
}
