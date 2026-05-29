// 단지 전자투표 api-node 클라이언트.
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.
// 실소유주/거주자만 조회·투표 가능(비멤버 403), 마감은 생성자만.

import type { VoteStatus } from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// 선택지별 집계
export type VoteTallyEntry = {
  option: string;
  index: number;
  count: number;
};

export type VoteDto = {
  id: string;
  complexName: string;
  creatorId: string;
  title: string;
  description: string | null;
  options: string[];
  status: VoteStatus;
  closesAt: string | null;
  createdAt: string;
  totalBallots: number;
  tally: VoteTallyEntry[];
  // null이면 내가 아직 투표하지 않은 상태
  myOptionIndex: number | null;
};

export type CreateVoteInput = {
  title: string;
  description?: string;
  options: string[]; // 2개 이상
  closesAt?: string; // ISO
};

// GET /votes/:complexName — 단지 투표 목록
export async function listVotes(
  token: string,
  complexName: string
): Promise<VoteDto[]> {
  const r = await fetch(
    `${API_BASE}/votes/${encodeURIComponent(complexName)}`,
    { headers: authHeader(token) }
  );
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `투표 목록 조회 실패 (${r.status})`);
  }
  return r.json();
}

// GET /votes/v/:id — 투표 상세 + 집계
export async function getVote(token: string, id: string): Promise<VoteDto> {
  const r = await fetch(`${API_BASE}/votes/v/${id}`, {
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `투표 상세 조회 실패 (${r.status})`);
  }
  return r.json();
}

// POST /votes/:complexName — 투표 생성
export async function createVote(
  token: string,
  complexName: string,
  input: CreateVoteInput
): Promise<VoteDto> {
  const r = await fetch(
    `${API_BASE}/votes/${encodeURIComponent(complexName)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeader(token) },
      body: JSON.stringify(input),
    }
  );
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `투표 생성 실패 (${r.status})`);
  }
  return r.json();
}

// POST /votes/v/:id/cast — 투표 참여(1인 1표, 중복/마감 409)
export async function castBallot(
  token: string,
  id: string,
  optionIndex: number
): Promise<VoteDto> {
  const r = await fetch(`${API_BASE}/votes/v/${id}/cast`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ optionIndex }),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `투표 참여 실패 (${r.status})`);
  }
  return r.json();
}

// POST /votes/v/:id/close — 투표 마감(생성자만)
export async function closeVote(token: string, id: string): Promise<VoteDto> {
  const r = await fetch(`${API_BASE}/votes/v/${id}/close`, {
    method: 'POST',
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `투표 마감 실패 (${r.status})`);
  }
  return r.json();
}

export const VOTE_STATUS_LABEL: Record<VoteStatus, string> = {
  OPEN: '진행중',
  CLOSED: '마감',
};

export const VOTE_STATUS_COLORS: Record<VoteStatus, { bg: string; fg: string }> = {
  OPEN: { bg: 'var(--brand-soft)', fg: 'var(--brand-hover)' },
  CLOSED: { bg: '#EEF0F3', fg: '#4E5968' },
};
