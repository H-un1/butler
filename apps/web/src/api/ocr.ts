// 등기부 안전진단(OCR) api-node 클라이언트 (Phase 3 M5 — 전부 mock).
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.
// ⚠️ 실제 OCR 판독/등기부 분석이 아니라 mock 데모입니다.
// 주민등록번호 등 민감정보는 서버에서 마스킹되며 저장되지 않습니다.

import type { OcrSafetyGrade } from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// 등기부상 권리관계 한 줄(mock) — 근저당/가압류 등
export type RegistryRight = {
  type: string; // 예: '근저당권', '가압류'
  holderMasked: string; // 권리자(마스킹)
  amount: number; // 채권최고액/금액(원)
};

// POST /ocr/registry 응답
export type OcrRegistryResult = {
  id: string;
  ownerMasked: string; // 소유자(주민번호 마스킹 포함)
  address: string;
  rights: RegistryRight[];
  totalDebt: number; // 근저당 등 총 채무(원)
  safetyGrade: OcrSafetyGrade; // SAFE | CAUTION | DANGER
  safetyReason: string;
  rrnMasked: true; // 주민번호 마스킹 처리됨
  mock: true;
  disclaimer: string;
};

// GET /ocr/history 항목
export type OcrHistoryItem = {
  id: string;
  address: string;
  ownerMasked: string;
  safetyGrade: OcrSafetyGrade;
  safetyReason: string;
  totalDebt: number;
  marketPrice: number | null;
  mock: boolean;
  createdAt: string;
};

export type AnalyzeRegistryInput = {
  documentRef?: string; // 업로드 문서 참조(mock)
  rawText?: string; // 등기부 텍스트 직접 입력(mock)
  marketPrice?: number; // 시세(원) — 안전등급 산정에 사용
};

// POST /ocr/registry — 등기부 mock 분석 → 안전등급/권리관계/총 채무
export async function analyzeRegistry(
  token: string,
  input: AnalyzeRegistryInput
): Promise<OcrRegistryResult> {
  const r = await fetch(`${API_BASE}/ocr/registry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `등기부 진단 실패 (${r.status})`);
  }
  return r.json();
}

// GET /ocr/history — 내 진단 이력
export async function history(token: string): Promise<OcrHistoryItem[]> {
  const r = await fetch(`${API_BASE}/ocr/history`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`진단 이력 조회 실패 (${r.status})`);
  return r.json();
}

// === 표시용 라벨/색상 ======================================================
export const OCR_SAFETY_LABEL: Record<OcrSafetyGrade, string> = {
  SAFE: '안전',
  CAUTION: '주의',
  DANGER: '위험',
};

// 안전등급 배지 색상 — SAFE 녹색 / CAUTION 주황 / DANGER 빨강
export const OCR_SAFETY_COLORS: Record<
  OcrSafetyGrade,
  { bg: string; fg: string }
> = {
  SAFE: { bg: '#E6F4EA', fg: '#1B7F3A' },
  CAUTION: { bg: '#FFF4E5', fg: '#B7791F' },
  DANGER: { bg: '#FDECEC', fg: '#C0392B' },
};

export function formatKrw(n: number): string {
  return `${n.toLocaleString()}원`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}
