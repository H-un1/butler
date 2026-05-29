// AI 상담 챗봇 api-node 클라이언트 (Phase 3 M5 — 전부 mock).
// Vite dev 프록시(/api → api-node)를 거치는 동일 origin 호출 + Bearer 토큰.
// ⚠️ 모든 응답은 mock 데모입니다. 실제 법률/세무 자문이 아닙니다.

import type { ChatbotTopic } from '@butler/shared';

const API_BASE = '/api';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// 답변 근거로 함께 내려오는 출처(mock)
export type ChatbotSource = {
  title: string;
  snippet: string;
};

// POST /chatbot/ask 응답
export type ChatbotAnswer = {
  answer: string;
  topic: ChatbotTopic;
  sources: ChatbotSource[];
  mock: true;
  disclaimer: string;
};

// GET /chatbot/history 항목
export type ChatbotHistoryItem = {
  id: string;
  question: string;
  answer: string;
  topic: ChatbotTopic;
  mock: boolean;
  createdAt: string;
};

export type AskInput = {
  question: string;
  topic?: ChatbotTopic;
};

// POST /chatbot/ask — 질문을 보내고 mock 답변 + 출처를 받는다.
export async function ask(
  token: string,
  input: AskInput
): Promise<ChatbotAnswer> {
  const r = await fetch(`${API_BASE}/chatbot/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `상담 요청 실패 (${r.status})`);
  }
  return r.json();
}

// GET /chatbot/history — 내 상담 이력
export async function history(token: string): Promise<ChatbotHistoryItem[]> {
  const r = await fetch(`${API_BASE}/chatbot/history`, {
    headers: authHeader(token),
  });
  if (!r.ok) throw new Error(`상담 이력 조회 실패 (${r.status})`);
  return r.json();
}

// === 표시용 라벨 ===========================================================
export const CHATBOT_TOPIC_LABEL: Record<ChatbotTopic, string> = {
  LEASE_LAW: '임대차법',
  TAX: '세무',
  GENERAL: '일반',
};

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
