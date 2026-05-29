// 점검자 모바일 — api-node 클라이언트.
// 개발 시뮬레이터에서는 BUTLER_API_BASE 환경변수 또는 기본값(localhost) 사용.

export const API_BASE =
  // @ts-expect-error Expo env injection
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BUTLER_API_BASE) ||
  'http://10.0.2.2:4000'; // Android 에뮬레이터의 host loopback (iOS는 http://localhost:4000)

export type InspectionListItem = {
  id: string;
  propertyId: string;
  type: 'REGULAR' | 'REPAIR' | 'MOVE_OUT';
  status: 'REQUESTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'DONE';
  scheduledAt: string;
};

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function listMyInspections(token: string): Promise<InspectionListItem[]> {
  const r = await fetch(`${API_BASE}/inspections/mine`, { headers: authHeaders(token) });
  if (!r.ok) throw new Error(`목록 조회 실패 (${r.status})`);
  return r.json();
}

export async function acceptInspection(token: string, id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/inspections/${id}/accept`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!r.ok) throw new Error(`수락 실패 (${r.status})`);
}

export async function submitInspection(token: string, id: string): Promise<{ pdfUrl: string }> {
  const r = await fetch(`${API_BASE}/inspections/${id}/submit`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!r.ok) throw new Error(`제출 실패 (${r.status})`);
  return r.json();
}
