// 단지 커뮤니티(게시판) api-node 클라이언트.
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.
// 실소유주/거주자(해당 단지 소유 임대인·ACTIVE 임차인·관리자)만 접근 가능 — 비멤버는 403.

import { shortCode } from '../lib/displayId';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// 목록용 게시글(본문 제외)
export type PostListItem = {
  id: string;
  complexName: string;
  authorId: string;
  title: string;
  createdAt: string;
};

export type PostComment = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
};

// 상세 게시글(본문 + 댓글)
export type PostDetail = {
  id: string;
  complexName: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: string;
  comments: PostComment[];
};

// GET /community/my-complexes — 내가 접근 가능한 단지 이름 목록
export async function myComplexes(token: string): Promise<string[]> {
  const r = await fetch(`${API_BASE}/community/my-complexes`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`내 단지 조회 실패 (${r.status})`);
  const body = (await r.json()) as { complexes: string[] };
  return body.complexes;
}

// GET /community/:complexName/posts — 단지 게시글 목록
export async function listPosts(
  token: string,
  complexName: string
): Promise<PostListItem[]> {
  const r = await fetch(
    `${API_BASE}/community/${encodeURIComponent(complexName)}/posts`,
    { headers: authHeader(token) }
  );
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `게시글 목록 조회 실패 (${r.status})`);
  }
  return r.json();
}

// GET /community/posts/:id — 게시글 상세 + 댓글
export async function getPost(token: string, id: string): Promise<PostDetail> {
  const r = await fetch(`${API_BASE}/community/posts/${id}`, {
    headers: authHeader(token),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `게시글 상세 조회 실패 (${r.status})`);
  }
  return r.json();
}

// POST /community/:complexName/posts — 게시글 작성
export async function createPost(
  token: string,
  complexName: string,
  input: { title: string; body: string }
): Promise<PostDetail> {
  const r = await fetch(
    `${API_BASE}/community/${encodeURIComponent(complexName)}/posts`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeader(token) },
      body: JSON.stringify(input),
    }
  );
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `게시글 작성 실패 (${r.status})`);
  }
  return r.json();
}

// POST /community/posts/:id/comments — 댓글 작성
export async function addComment(
  token: string,
  postId: string,
  body: string
): Promise<PostComment> {
  const r = await fetch(`${API_BASE}/community/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ body }),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `댓글 작성 실패 (${r.status})`);
  }
  return r.json();
}

// 작성자 표시 — 본인이면 '나', 아니면 사용자용 짧은 코드
export function shortAuthor(authorId: string, myId: string): string {
  return authorId === myId ? '나' : shortCode(authorId);
}
