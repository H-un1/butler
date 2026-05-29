const API_BASE = '/api';

export type AdminSubscriptionItem = {
  id: string;
  landlordId: string;
  // 백엔드가 추가하는 사람친화 필드 (optional — 미반영 시 shortCode로 fallback)
  landlordName?: string;
  tier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  monthlyFee: number;
  propertyCount: number;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  createdAt: string;
};

export async function listAdminSubscriptions(
  token: string
): Promise<AdminSubscriptionItem[]> {
  const r = await fetch(`${API_BASE}/admin/subscriptions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`구독 목록 조회 실패 (${r.status})`);
  return r.json();
}
