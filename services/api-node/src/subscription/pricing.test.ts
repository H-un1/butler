import { describe, it, expect } from 'vitest';
import { monthlyFeeFor, tierFor } from './pricing.js';

describe('구독 구간 요금 (잠정 가중치)', () => {
  it('1채는 TIER_1', () => {
    const t = tierFor(1);
    expect(t.tier).toBe('TIER_1');
  });

  it('3채까지 TIER_1', () => {
    expect(tierFor(3).tier).toBe('TIER_1');
  });

  it('4채부터 TIER_2', () => {
    expect(tierFor(4).tier).toBe('TIER_2');
    expect(tierFor(10).tier).toBe('TIER_2');
  });

  it('11채부터 TIER_3 (상한 없음)', () => {
    expect(tierFor(11).tier).toBe('TIER_3');
    expect(tierFor(100).tier).toBe('TIER_3');
  });

  it('0채는 거절 (구독 자격 없음)', () => {
    expect(() => tierFor(0)).toThrow();
  });

  it('월 청구액 = 보유 물건수 × 구간 단가', () => {
    const a = monthlyFeeFor(2);
    expect(a.monthlyFee).toBe(2 * 22_000);
    expect(a.tier).toBe('TIER_1');

    const b = monthlyFeeFor(5);
    expect(b.monthlyFee).toBe(5 * 18_000);
    expect(b.tier).toBe('TIER_2');

    const c = monthlyFeeFor(20);
    expect(c.monthlyFee).toBe(20 * 15_000);
    expect(c.tier).toBe('TIER_3');
  });
});
