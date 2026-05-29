// api-node → ai-python ETL 백엔드 브리지.
// 키 없을 때는 ai-python이 503을 반환하므로 그대로 통과.

export type EnrichOk = {
  status: 'ok';
  enrichment: {
    address: string;
    market_price: { latest_price: number | null; avg_last_12m: number | null; sample_count: number };
    building: { built_year: number | null; area_m2: number | null; parking_per_household: number | null };
    complex: { households: number | null; mgmt_fee_monthly: number | null; brand: string | null };
  };
  ami_score: number | null;
};

export type EnrichUnavailable = { status: 'unavailable'; reason: string };

export type EnrichResult = EnrichOk | EnrichUnavailable;

export interface EnrichClient {
  enrich(address: string): Promise<EnrichResult>;
}

export function makeHttpEnrichClient(baseUrl: string): EnrichClient {
  return {
    async enrich(address) {
      const r = await fetch(`${baseUrl}/etl/enrich`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (r.status === 503) {
        const body = (await r.json().catch(() => ({}))) as { detail?: string };
        return { status: 'unavailable', reason: body.detail ?? '공공데이터 API 미설정' };
      }
      if (!r.ok) {
        throw new Error(`ai-python ETL 호출 실패 ${r.status}`);
      }
      const body = (await r.json()) as Omit<EnrichOk, 'status'>;
      return { status: 'ok', ...body };
    },
  };
}
