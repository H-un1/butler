// 보수업체 매칭(디렉토리·평점·리뷰) api-node 클라이언트.
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.
// 조회는 인증된 누구나, 등록은 관리자(ADMIN), 리뷰는 임대인·임차인.
// 업체 카테고리는 수선요청 카테고리(VendorCategory = MaintenanceCategory)를 재사용한다.

import type { VendorCategory } from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type VendorDto = {
  id: string;
  name: string;
  category: VendorCategory;
  region: string;
  phone: string | null;
  description: string | null;
  avgRating: number;
  reviewCount: number;
  createdAt: string;
};

export type VendorReview = {
  id: string;
  authorId: string;
  // 백엔드가 추가하는 사람친화 필드 (optional — 미반영 시 shortCode로 fallback)
  authorName?: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export type VendorDetail = VendorDto & {
  reviews: VendorReview[];
};

export type CreateVendorInput = {
  name: string;
  category: VendorCategory;
  region: string;
  phone?: string;
  description?: string;
};

// GET /vendors?category=&region= — 업체 목록 + 검색 필터
export async function listVendors(
  token: string,
  filter?: { category?: VendorCategory; region?: string }
): Promise<VendorDto[]> {
  const qs = new URLSearchParams();
  if (filter?.category) qs.set('category', filter.category);
  if (filter?.region) qs.set('region', filter.region);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const r = await fetch(`${API_BASE}/vendors${suffix}`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`보수업체 목록 조회 실패 (${r.status})`);
  return r.json();
}

// GET /vendors/:id — 업체 상세 + 리뷰 목록
export async function getVendor(token: string, id: string): Promise<VendorDetail> {
  const r = await fetch(`${API_BASE}/vendors/${id}`, {
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `보수업체 상세 조회 실패 (${r.status})`);
  }
  return r.json();
}

// POST /vendors — 업체 등록(ADMIN)
export async function createVendor(
  token: string,
  input: CreateVendorInput
): Promise<VendorDto> {
  const r = await fetch(`${API_BASE}/vendors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `보수업체 등록 실패 (${r.status})`);
  }
  return r.json();
}

// POST /vendors/:id/reviews — 리뷰 작성(LANDLORD|TENANT, 1인 1리뷰 — 중복 409)
export async function addReview(
  token: string,
  vendorId: string,
  input: { rating: number; comment?: string }
): Promise<VendorReview> {
  const r = await fetch(`${API_BASE}/vendors/${vendorId}/reviews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `리뷰 작성 실패 (${r.status})`);
  }
  return r.json();
}

// 평점 표시 — 별점(★)과 소수 1자리 평균
export function formatRating(avg: number, count: number): string {
  if (count === 0) return '평점 없음';
  return `★ ${avg.toFixed(1)} (${count})`;
}
