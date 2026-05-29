import type { ChatbotTopic, OcrSafetyGrade } from '@butler/shared';

// AI 보조 클라이언트 — 챗봇/OCR/판례. ⚠️ 전부 mock(외부 모델 호출 0).
// - HTTP: ai-python(butler_ai/chatbot|ocr|precedents)의 mock 엔드포인트 호출 (정식 호스트)
// - Local: ai-python 미기동 시 동일 규칙의 로컬 mock. 둘 다 mock이며 실 모델 미사용.
// 주민번호 등 고유식별정보는 항상 마스킹된 형태로만 다룬다.

const RRN_MASK = '######-*******';

export type ChatAnswer = {
  answer: string;
  topic: ChatbotTopic;
  sources: { title: string; snippet: string }[];
  mock: boolean;
  disclaimer: string;
};

export type OcrRegistryResult = {
  ownerMasked: string;
  address: string;
  rights: { type: string; holderMasked: string; amount: number }[];
  totalDebt: number;
  safetyGrade: OcrSafetyGrade;
  safetyReason: string;
  rrnMasked: boolean;
  mock: boolean;
  disclaimer: string;
};

export type PrecedentResult = {
  precedents: { caseNo: string; court: string; summary: string; relevance: number }[];
  mock: boolean;
  disclaimer: string;
};

export interface ChatbotClient {
  ask(input: { question: string; topic?: ChatbotTopic }): Promise<ChatAnswer>;
}
export interface OcrClient {
  analyzeRegistry(input: {
    documentRef?: string;
    rawText?: string;
    marketPrice?: number;
  }): Promise<OcrRegistryResult>;
}
export interface PrecedentClient {
  search(input: { query: string; category?: string }): Promise<PrecedentResult>;
}

// ====================== 로컬 mock (실 모델 미사용) ======================

const CHAT_DISCLAIMER = '본 답변은 mock 데모이며 법률 자문이 아닙니다.';
const OCR_DISCLAIMER = '본 분석은 mock 데모이며 실제 등기부 판독이 아닙니다.';
const PREC_DISCLAIMER = '본 판례는 mock 데모이며 실제 판례가 아닙니다.';

function classifyTopic(question: string, explicit?: ChatbotTopic): ChatbotTopic {
  if (explicit) return explicit;
  if (/보증금|전세|임대차|월세|계약|갱신/.test(question)) return 'LEASE_LAW';
  if (/세금|종부세|양도|취득세|재산세/.test(question)) return 'TAX';
  return 'GENERAL';
}

export function makeLocalChatbotClient(): ChatbotClient {
  return {
    async ask({ question, topic }) {
      const t = classifyTopic(question, topic);
      if (t === 'LEASE_LAW') {
        return {
          answer:
            '주택임대차보호법상 보증금 반환·대항력·우선변제 등은 전입신고와 확정일자로 보호됩니다. (mock 데모 답변)',
          topic: t,
          sources: [
            { title: '주택임대차보호법 제3조', snippet: '대항력 요건(인도+전입신고)' },
            { title: '주택임대차보호법 제8조', snippet: '보증금 중 일정액 우선변제' },
          ],
          mock: true,
          disclaimer: CHAT_DISCLAIMER,
        };
      }
      if (t === 'TAX') {
        return {
          answer:
            '임대소득·양도소득·종합부동산세는 보유수와 보유기간에 따라 달라집니다. 세무사 상담을 권장합니다. (mock 데모 답변)',
          topic: t,
          sources: [
            { title: '소득세법(양도소득)', snippet: '1세대1주택 비과세 요건' },
            { title: '종합부동산세법', snippet: '과세표준·세율' },
          ],
          mock: true,
          disclaimer: CHAT_DISCLAIMER,
        };
      }
      return {
        answer: '일반 임대 관리 관련 안내입니다. 구체적 사안은 전문가 상담을 권장합니다. (mock 데모 답변)',
        topic: t,
        sources: [],
        mock: true,
        disclaimer: CHAT_DISCLAIMER,
      };
    },
  };
}

export function makeLocalOcrClient(): OcrClient {
  return {
    async analyzeRegistry({ marketPrice }) {
      // mock 근저당 합 (고정) — 실제 OCR 아님
      const totalDebt = 180_000_000;
      let safetyGrade: OcrSafetyGrade = 'CAUTION';
      let safetyReason = '시세 정보가 없어 보수적으로 CAUTION으로 평가했습니다.';
      if (marketPrice && marketPrice > 0) {
        const ratio = totalDebt / marketPrice;
        if (ratio >= 0.8) {
          safetyGrade = 'DANGER';
          safetyReason = `근저당 합(${totalDebt.toLocaleString()}원)이 시세의 ${Math.round(
            ratio * 100
          )}%로 깡통전세 위험이 높습니다.`;
        } else if (ratio >= 0.6) {
          safetyGrade = 'CAUTION';
          safetyReason = `근저당 비율 ${Math.round(ratio * 100)}% — 주의가 필요합니다.`;
        } else {
          safetyGrade = 'SAFE';
          safetyReason = `근저당 비율 ${Math.round(ratio * 100)}% — 비교적 안전합니다.`;
        }
      }
      return {
        ownerMasked: RRN_MASK,
        address: '서울시 OO구 OO로 (mock)',
        rights: [
          { type: '소유권', holderMasked: RRN_MASK, amount: 0 },
          { type: '근저당권', holderMasked: '○○은행', amount: totalDebt },
        ],
        totalDebt,
        safetyGrade,
        safetyReason,
        rrnMasked: true,
        mock: true,
        disclaimer: OCR_DISCLAIMER,
      };
    },
  };
}

export function makeLocalPrecedentClient(): PrecedentClient {
  return {
    async search({ query }) {
      const isDeposit = /보증금|반환|임차권/.test(query);
      const precedents = isDeposit
        ? [
            {
              caseNo: '2021다123456',
              court: '대법원',
              summary: '보증금 반환과 동시이행 항변 (mock)',
              relevance: 0.92,
            },
            {
              caseNo: '2019가합7890',
              court: '서울중앙지법',
              summary: '임차권등기명령과 보증금 우선변제 (mock)',
              relevance: 0.81,
            },
          ]
        : [
            {
              caseNo: '2020다55555',
              court: '대법원',
              summary: '원상복구 범위와 통상손모 (mock)',
              relevance: 0.88,
            },
            {
              caseNo: '2018나33333',
              court: '서울고법',
              summary: '수선비 분담과 감가상각 (mock)',
              relevance: 0.79,
            },
          ];
      return { precedents, mock: true, disclaimer: PREC_DISCLAIMER };
    },
  };
}

// ====================== HTTP (ai-python) ======================

export function makeHttpChatbotClient(baseUrl: string): ChatbotClient {
  return {
    async ask(input) {
      const r = await fetch(`${baseUrl}/chatbot/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: input.question, topic: input.topic ?? null }),
      });
      if (!r.ok) throw new Error(`챗봇 호출 실패 ${r.status}`);
      const b = (await r.json()) as {
        answer: string;
        topic: ChatbotTopic;
        sources: { title: string; snippet: string }[];
        mock: boolean;
        disclaimer: string;
      };
      return b;
    },
  };
}

export function makeHttpOcrClient(baseUrl: string): OcrClient {
  return {
    async analyzeRegistry(input) {
      const r = await fetch(`${baseUrl}/ocr/registry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          document_ref: input.documentRef ?? null,
          raw_text: input.rawText ?? null,
          market_price: input.marketPrice ?? null,
        }),
      });
      if (!r.ok) throw new Error(`OCR 호출 실패 ${r.status}`);
      const b = (await r.json()) as Record<string, unknown>;
      return {
        ownerMasked: b.owner_masked as string,
        address: b.address as string,
        rights: ((b.rights as Array<Record<string, unknown>>) ?? []).map((x) => ({
          type: x.type as string,
          holderMasked: x.holder_masked as string,
          amount: x.amount as number,
        })),
        totalDebt: b.total_debt as number,
        safetyGrade: b.safety_grade as OcrSafetyGrade,
        safetyReason: b.safety_reason as string,
        rrnMasked: b.rrn_masked as boolean,
        mock: b.mock as boolean,
        disclaimer: b.disclaimer as string,
      };
    },
  };
}

export function makeHttpPrecedentClient(baseUrl: string): PrecedentClient {
  return {
    async search(input) {
      const r = await fetch(`${baseUrl}/precedents/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: input.query, category: input.category ?? null }),
      });
      if (!r.ok) throw new Error(`판례 호출 실패 ${r.status}`);
      const b = (await r.json()) as Record<string, unknown>;
      return {
        precedents: ((b.precedents as Array<Record<string, unknown>>) ?? []).map((x) => ({
          caseNo: x.case_no as string,
          court: x.court as string,
          summary: x.summary as string,
          relevance: x.relevance as number,
        })),
        mock: b.mock as boolean,
        disclaimer: b.disclaimer as string,
      };
    },
  };
}
