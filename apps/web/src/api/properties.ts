const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type PropertyListItem = {
  id: string;
  address: string;
  complexName: string | null;
  dong: string | null;
  ho: string | null;
  builtYear: number | null;
  marketPrice: string | null;
  amiScore: number | null;
};

export type DashboardResponse =
  | {
      status: 'ok';
      property: { id: string; address: string; complexName: string | null; dong: string | null; ho: string | null };
      enrichment: {
        address: string;
        market_price: { latest_price: number | null; avg_last_12m: number | null; sample_count: number };
        building: { built_year: number | null; area_m2: number | null; parking_per_household: number | null };
        complex: { households: number | null; mgmt_fee_monthly: number | null; brand: string | null };
      };
      ami_score: number | null;
    }
  | {
      status: 'unavailable';
      property: { id: string; address: string; complexName: string | null; dong: string | null; ho: string | null };
      enrichment: null;
      ami_score: null;
      reason: string;
    };

export async function createProperty(
  token: string,
  input: { address: string; complexName?: string; dong?: string; ho?: string }
): Promise<{ id: string }> {
  const r = await fetch(`${API_BASE}/properties`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `등록 실패 (${r.status})`);
  }
  return r.json();
}

export async function listProperties(token: string): Promise<PropertyListItem[]> {
  const r = await fetch(`${API_BASE}/properties`, { headers: authHeader(token) });
  if (!r.ok) throw new Error(`물건 목록 조회 실패 (${r.status})`);
  return r.json();
}

export async function getDashboard(token: string, id: string): Promise<DashboardResponse> {
  const r = await fetch(`${API_BASE}/properties/${id}/dashboard`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`대시보드 조회 실패 (${r.status})`);
  return r.json();
}
