// 판례 보조 검색 api-node 클라이언트 (Phase 3 M5 — 전부 mock).
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.
// ⚠️ 실제 판례 검색/법률 자문이 아니라 mock 데모입니다.

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// 검색 결과 판례 한 건(mock)
export type Precedent = {
  caseNo: string; // 사건번호
  court: string; // 법원
  summary: string; // 요지
  relevance: number; // 관련도(0~1)
};

// POST /precedents/search 응답
export type PrecedentSearchResult = {
  precedents: Precedent[];
  mock: true;
  disclaimer: string;
};

export type SearchInput = {
  query: string;
  category?: string;
};

// POST /precedents/search — 질의(정산 제목/카테고리 등)로 유사 판례 mock 검색
export async function search(
  token: string,
  input: SearchInput
): Promise<PrecedentSearchResult> {
  const r = await fetch(`${API_BASE}/precedents/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `판례 검색 실패 (${r.status})`);
  }
  return r.json();
}

// 관련도(0~1)를 % 문자열로
export function formatRelevance(r: number): string {
  return `${Math.round(r * 100)}%`;
}
