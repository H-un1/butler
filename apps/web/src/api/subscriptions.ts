const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type Tier = 'TIER_1' | 'TIER_2' | 'TIER_3';
export type Status = 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'PAUSED';

export type SubscriptionPreview =
  | {
      eligible: true;
      propertyCount: number;
      tier: Tier;
      perPropertyKrw: number;
      monthlyFee: number;
    }
  | {
      eligible: false;
      reason: string;
      propertyCount?: number;
    };

export type SubscriptionRecord = {
  id: string;
  tier: Tier;
  monthlyFee: number;
  propertyCount: number;
  billingDate: number;
  status: Status;
  firstChargeId?: string;
};

export async function previewSubscription(token: string): Promise<SubscriptionPreview> {
  const r = await fetch(`${API_BASE}/subscriptions/preview`, { headers: authHeader(token) });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `구독 미리보기 실패 (${r.status})`);
  }
  return r.json();
}

export async function createSubscription(
  token: string,
  input: { billingDate: number }
): Promise<SubscriptionRecord> {
  const r = await fetch(`${API_BASE}/subscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `구독 가입 실패 (${r.status})`);
  }
  return r.json();
}

export async function getMySubscription(token: string): Promise<SubscriptionRecord | null> {
  const r = await fetch(`${API_BASE}/subscriptions/me`, { headers: authHeader(token) });
  if (r.status === 404) return null;
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `구독 조회 실패 (${r.status})`);
  }
  return r.json();
}

export async function cancelSubscription(
  token: string,
  id: string
): Promise<{ id: string; status: Status }> {
  const r = await fetch(`${API_BASE}/subscriptions/${id}/cancel`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `구독 해지 실패 (${r.status})`);
  }
  return r.json();
}
