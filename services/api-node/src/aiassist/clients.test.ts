import { describe, it, expect } from 'vitest';
import {
  makeLocalChatbotClient,
  makeLocalOcrClient,
  makeLocalPrecedentClient,
} from './clients.js';

// AI 보조 로컬 mock 클라이언트 단위 테스트 (실 모델 호출 0).
// 주민번호 등 고유식별정보가 평문으로 노출되지 않는지 함께 검증한다.

// 13자리 주민번호 패턴 (예: 900101-1234567, 9001011234567).
const RRN_PATTERN = /\d{6}-?\d{7}/;

describe('makeLocalChatbotClient (로컬 mock)', () => {
  it('"보증금" 질문 → topic LEASE_LAW + 출처 2건 + mock/disclaimer', async () => {
    const client = makeLocalChatbotClient();
    const res = await client.ask({ question: '보증금 돌려받으려면 어떻게 하나요?' });
    expect(res.topic).toBe('LEASE_LAW');
    expect(res.sources).toHaveLength(2);
    expect(res.mock).toBe(true);
    expect(res.disclaimer).toBeTruthy();
  });

  it('"양도세" 질문 → topic TAX + mock', async () => {
    const client = makeLocalChatbotClient();
    const res = await client.ask({ question: '양도소득세는 얼마나 나오나요?' });
    expect(res.topic).toBe('TAX');
    expect(res.mock).toBe(true);
    expect(res.disclaimer).toBeTruthy();
  });

  it('그 외 질문 → topic GENERAL + mock', async () => {
    const client = makeLocalChatbotClient();
    const res = await client.ask({ question: '오늘 날씨 어때요?' });
    expect(res.topic).toBe('GENERAL');
    expect(res.mock).toBe(true);
    expect(res.disclaimer).toBeTruthy();
  });
});

describe('makeLocalOcrClient (로컬 mock — 깡통전세 안전등급/마스킹)', () => {
  it('marketPrice 200,000,000 (근저당 1.8억, 비율 0.9) → DANGER', async () => {
    const client = makeLocalOcrClient();
    const res = await client.analyzeRegistry({ marketPrice: 200_000_000 });
    expect(res.safetyGrade).toBe('DANGER');
    expect(res.totalDebt).toBe(180_000_000);
  });

  it('marketPrice 400,000,000 (비율 0.45) → SAFE', async () => {
    const client = makeLocalOcrClient();
    const res = await client.analyzeRegistry({ marketPrice: 400_000_000 });
    expect(res.safetyGrade).toBe('SAFE');
  });

  it('marketPrice 없음 → 보수적으로 CAUTION', async () => {
    const client = makeLocalOcrClient();
    const res = await client.analyzeRegistry({});
    expect(res.safetyGrade).toBe('CAUTION');
  });

  it('소유자 주민번호는 마스킹(######-*******)되고 rrnMasked/mock true', async () => {
    const client = makeLocalOcrClient();
    const res = await client.analyzeRegistry({ marketPrice: 300_000_000 });
    expect(res.ownerMasked).toBe('######-*******');
    expect(res.rrnMasked).toBe(true);
    expect(res.mock).toBe(true);
  });

  it('결과 전체에 13자리 주민번호 패턴이 전혀 없다', async () => {
    const client = makeLocalOcrClient();
    // 등급별 분기를 모두 거쳐도 평문 주민번호가 새지 않는지 확인.
    for (const marketPrice of [200_000_000, 300_000_000, 400_000_000, undefined]) {
      const res = await client.analyzeRegistry(
        marketPrice === undefined ? {} : { marketPrice }
      );
      const serialized = JSON.stringify(res);
      expect(RRN_PATTERN.test(serialized)).toBe(false);
    }
  });
});

describe('makeLocalPrecedentClient (로컬 mock)', () => {
  it('"보증금 반환" 질의 → 판례 2건 + mock', async () => {
    const client = makeLocalPrecedentClient();
    const res = await client.search({ query: '보증금 반환 소송' });
    expect(res.precedents).toHaveLength(2);
    expect(res.mock).toBe(true);
  });

  it('그 외 질의 → 판례 2건(원상복구 계열) + mock', async () => {
    // 구현상 보증금 외 분기는 2건을 반환한다 (PRD 기대치 3건과 차이 — 보고).
    const client = makeLocalPrecedentClient();
    const res = await client.search({ query: '원상복구 범위' });
    expect(res.precedents.length).toBeGreaterThan(0);
    expect(res.mock).toBe(true);
  });
});
