import type { SubscriptionTier } from '@butler/shared';

// 보유 물건수 기반 구간 요금.
// ⚠️ 구간 경계와 단가는 NEEDS CLARIFICATION (PRD 01 §7). 잠정값 사용 — 확정 시 본 상수만 교체.
// 매월 구독료 = 보유 물건수 × 채당 단가 (해당 구간)

export type PricingTier = {
  tier: SubscriptionTier;
  minProperties: number;
  maxProperties: number | null; // null = 무한대
  perPropertyKrw: number;
  description: string;
};

// 잠정 구간 — 1~3채 22,000원/채, 4~10채 18,000원/채, 11채+ 15,000원/채
export const PRICING_TABLE: readonly PricingTier[] = [
  {
    tier: 'TIER_1',
    minProperties: 1,
    maxProperties: 3,
    perPropertyKrw: 22_000,
    description: '소규모 (1~3채)',
  },
  {
    tier: 'TIER_2',
    minProperties: 4,
    maxProperties: 10,
    perPropertyKrw: 18_000,
    description: '중규모 (4~10채)',
  },
  {
    tier: 'TIER_3',
    minProperties: 11,
    maxProperties: null,
    perPropertyKrw: 15_000,
    description: '대규모 (11채+)',
  },
];

export function tierFor(propertyCount: number): PricingTier {
  if (propertyCount < 1) {
    throw new Error('보유 물건수는 1 이상이어야 구독 가능합니다');
  }
  for (const t of PRICING_TABLE) {
    const maxOk = t.maxProperties === null || propertyCount <= t.maxProperties;
    if (propertyCount >= t.minProperties && maxOk) return t;
  }
  throw new Error(`구간을 찾을 수 없습니다: count=${propertyCount}`);
}

export function monthlyFeeFor(propertyCount: number): {
  tier: SubscriptionTier;
  monthlyFee: number;
  perPropertyKrw: number;
} {
  const t = tierFor(propertyCount);
  return {
    tier: t.tier,
    monthlyFee: propertyCount * t.perPropertyKrw,
    perPropertyKrw: t.perPropertyKrw,
  };
}
