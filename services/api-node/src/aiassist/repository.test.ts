import { describe, it, expect } from 'vitest';
import {
  makeInMemoryChatbotLogRepository,
  makeInMemoryOcrDocumentRepository,
} from './repository.js';

// AI 보조 기록 저장소 (in-memory) 단위 테스트.
// 핵심: OcrDocument에는 주민번호 평문을 절대 저장하지 않는다(마스킹만).

const RRN_PATTERN = /\d{6}-?\d{7}/;

describe('ChatbotLogRepository (in-memory)', () => {
  it('log 후 listByUser로 조회되고 mock 플래그가 true', async () => {
    const repo = makeInMemoryChatbotLogRepository();
    const rec = await repo.log({
      userId: 'u1',
      question: '보증금?',
      answer: '답변',
      topic: 'LEASE_LAW',
    });
    expect(rec.mock).toBe(true);
    const list = await repo.listByUser('u1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(rec.id);
  });

  it('listByUser는 최신순(createdAt desc) 정렬', async () => {
    const repo = makeInMemoryChatbotLogRepository();
    const first = await repo.log({
      userId: 'u1',
      question: 'Q1',
      answer: 'A1',
      topic: 'GENERAL',
    });
    // createdAt 동률을 피하기 위해 시간을 강제로 벌린다.
    first.createdAt = new Date(Date.now() - 10_000);
    const second = await repo.log({
      userId: 'u1',
      question: 'Q2',
      answer: 'A2',
      topic: 'GENERAL',
    });
    const list = await repo.listByUser('u1');
    expect(list[0].id).toBe(second.id);
    expect(list[1].id).toBe(first.id);
  });

  it('사용자별 격리 — 다른 userId의 기록은 보이지 않는다', async () => {
    const repo = makeInMemoryChatbotLogRepository();
    await repo.log({ userId: 'u1', question: 'Q', answer: 'A', topic: 'GENERAL' });
    await repo.log({ userId: 'u2', question: 'Q', answer: 'A', topic: 'GENERAL' });
    expect(await repo.listByUser('u1')).toHaveLength(1);
    expect(await repo.listByUser('u2')).toHaveLength(1);
    expect(await repo.listByUser('u3')).toHaveLength(0);
  });
});

describe('OcrDocumentRepository (in-memory)', () => {
  it('save 후 listByUser로 조회되고 mock 플래그가 true', async () => {
    const repo = makeInMemoryOcrDocumentRepository();
    const rec = await repo.save({
      userId: 'u1',
      address: '서울시 OO구',
      ownerMasked: '######-*******',
      safetyGrade: 'SAFE',
      safetyReason: '안전',
      totalDebt: 180_000_000,
      marketPrice: 400_000_000,
      result: { rights: [], rrnMasked: true },
    });
    expect(rec.mock).toBe(true);
    const list = await repo.listByUser('u1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(rec.id);
  });

  it('사용자별 격리 + 최신순 정렬', async () => {
    const repo = makeInMemoryOcrDocumentRepository();
    const a = await repo.save({
      userId: 'u1',
      address: 'A',
      ownerMasked: '######-*******',
      safetyGrade: 'SAFE',
      safetyReason: 'r',
      totalDebt: 1,
      result: {},
    });
    a.createdAt = new Date(Date.now() - 10_000);
    const b = await repo.save({
      userId: 'u1',
      address: 'B',
      ownerMasked: '######-*******',
      safetyGrade: 'SAFE',
      safetyReason: 'r',
      totalDebt: 1,
      result: {},
    });
    await repo.save({
      userId: 'u2',
      address: 'C',
      ownerMasked: '######-*******',
      safetyGrade: 'SAFE',
      safetyReason: 'r',
      totalDebt: 1,
      result: {},
    });
    const list = await repo.listByUser('u1');
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
    expect(await repo.listByUser('u2')).toHaveLength(1);
  });

  it('저장 레코드에 주민번호 평문이 없고 ownerMasked만 보존된다', async () => {
    const repo = makeInMemoryOcrDocumentRepository();
    await repo.save({
      userId: 'u1',
      address: '서울시 OO구',
      ownerMasked: '######-*******',
      safetyGrade: 'CAUTION',
      safetyReason: '주의',
      totalDebt: 180_000_000,
      result: { rights: [{ type: '소유권', holderMasked: '######-*******' }], rrnMasked: true },
    });
    const [stored] = await repo.listByUser('u1');
    expect(stored.ownerMasked).toBe('######-*******');
    expect(RRN_PATTERN.test(JSON.stringify(stored))).toBe(false);
  });
});
