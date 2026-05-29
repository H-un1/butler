const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type InspectionType = 'REGULAR' | 'REPAIR' | 'MOVE_OUT';

export type RequestInspectionInput = {
  propertyId: string;
  type: InspectionType;
  scheduledAt: string; // ISO
  inspectorId?: string;
};

export type RequestInspectionResponse = {
  id: string;
  status: string;
  type: InspectionType;
  scheduledAt: string;
};

export type PropertyInspectionItem = {
  id: string;
  type: InspectionType;
  status: string;
  scheduledAt: string;
};

// 특정 물건의 점검 목록 (임대인 소유·관리자) — 정산 연결 드롭다운용
export async function listInspectionsByProperty(
  token: string,
  propertyId: string
): Promise<PropertyInspectionItem[]> {
  const r = await fetch(
    `${API_BASE}/inspections?propertyId=${encodeURIComponent(propertyId)}`,
    { headers: authHeader(token) }
  );
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `점검 목록 조회 실패 (${r.status})`);
  }
  return r.json();
}

export async function requestInspection(
  token: string,
  input: RequestInspectionInput
): Promise<RequestInspectionResponse> {
  const r = await fetch(`${API_BASE}/inspections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    const err = new Error(body.error ?? `점검 의뢰 실패 (${r.status})`);
    (err as Error & { status?: number }).status = r.status;
    throw err;
  }
  return r.json();
}
