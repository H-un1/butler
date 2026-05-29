// 점검자 웹 — api-node 클라이언트.
// PC 브라우저 시연용. Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출.

const API_BASE = '/api';

export type InspectionType = 'REGULAR' | 'REPAIR' | 'MOVE_OUT';
export type InspectionStatus = 'REQUESTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'DONE';
export type InspectionGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type InspectionListItem = {
  id: string;
  propertyId: string;
  // 백엔드가 추가하는 사람친화 필드 (optional — 미반영 시 shortCode로 fallback)
  propertyAddress?: string;
  propertyComplexName?: string;
  type: InspectionType;
  status: InspectionStatus;
  scheduledAt: string;
};

export type InspectionItem = {
  id: string;
  area: string;
  checklistKey: string;
  grade: InspectionGrade;
  note: string | null;
  markedDefect: boolean;
  photoUrls: string[];
};

export type InspectionReport = {
  id: string;
  pdfUrl: string;
  generatedAt: string;
  status: string;
};

export type InspectionDetail = {
  id: string;
  propertyId: string;
  // 백엔드가 추가하는 사람친화 필드 (optional — 미반영 시 shortCode로 fallback)
  propertyAddress?: string;
  propertyComplexName?: string;
  inspectorId: string;
  type: InspectionType;
  status: InspectionStatus;
  scheduledAt: string;
  items: InspectionItem[];
  report: InspectionReport | null;
};

export type AddItemInput = {
  area: string;
  checklistKey: string;
  grade: InspectionGrade;
  note?: string;
  markedDefect?: boolean;
  photoUrls?: string[];
};

export type SubmitResult =
  | { status: 'done'; pdfUrl: string; generatedAt: string }
  | { status: 'submitted-no-report'; reason?: string };

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function listMyInspections(token: string): Promise<InspectionListItem[]> {
  const r = await fetch(`${API_BASE}/inspections/mine`, { headers: authHeader(token) });
  if (!r.ok) throw new Error(`점검 목록 조회 실패 (${r.status})`);
  return r.json();
}

export async function getInspection(token: string, id: string): Promise<InspectionDetail> {
  const r = await fetch(`${API_BASE}/inspections/${id}`, { headers: authHeader(token) });
  if (!r.ok) throw new Error(`점검 상세 조회 실패 (${r.status})`);
  return r.json();
}

export async function acceptInspection(
  token: string,
  id: string
): Promise<{ id: string; status: InspectionStatus }> {
  const r = await fetch(`${API_BASE}/inspections/${id}/accept`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `수락 실패 (${r.status})`);
  }
  return r.json();
}

export async function addInspectionItem(
  token: string,
  id: string,
  input: AddItemInput
): Promise<{ id: string; area: string; grade: InspectionGrade; markedDefect: boolean }> {
  const r = await fetch(`${API_BASE}/inspections/${id}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `항목 추가 실패 (${r.status})`);
  }
  return r.json();
}

export async function submitInspection(token: string, id: string): Promise<SubmitResult> {
  const r = await fetch(`${API_BASE}/inspections/${id}/submit`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `제출 실패 (${r.status})`);
  }
  return r.json();
}

// === 표시용 라벨 ===========================================================
export const TYPE_LABEL: Record<InspectionType, string> = {
  REGULAR: '정기',
  REPAIR: '수리',
  MOVE_OUT: '퇴거',
};

export const STATUS_LABEL: Record<InspectionStatus, string> = {
  REQUESTED: '요청됨',
  SCHEDULED: '예정',
  IN_PROGRESS: '진행 중',
  DONE: '완료',
};

// 현장 친화 컬러 — 고대비 라벨
export const STATUS_COLORS: Record<
  InspectionStatus,
  { bg: string; fg: string }
> = {
  REQUESTED: { bg: '#FFF4E5', fg: '#B7791F' },
  SCHEDULED: { bg: 'var(--brand-soft)', fg: 'var(--brand-hover)' },
  IN_PROGRESS: { bg: '#E6F4EA', fg: '#1B7F3A' },
  DONE: { bg: '#EEF0F3', fg: '#4E5968' },
};

export function formatScheduled(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}
