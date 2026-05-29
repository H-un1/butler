const API_BASE = '/api';

export type HouseLogEntry = {
  id: string;
  type: 'INSPECTION' | 'REPAIR' | 'CONTRACT' | 'OWNER_CHANGE';
  title: string;
  occurredAt: string;
  refId: string | null;
  attachmentUrls: string[];
};

export async function listHouseLog(
  token: string,
  propertyId: string
): Promise<HouseLogEntry[]> {
  const r = await fetch(`${API_BASE}/properties/${propertyId}/house-log`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`타임라인 조회 실패 (${r.status})`);
  return r.json();
}
