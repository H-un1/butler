import { describe, it, expect } from 'vitest';
import type { LeaseRecord } from '../lease/repository.js';
import {
  contractExpiryIntents,
  rentOverdueIntents,
  periodOf,
} from './rules.js';

// ============================================================================
// 자동알림 룰 단위 테스트 (순수 함수) — Date를 직접 주입해 시스템 날짜 비의존.
// "언제 무엇을 누구에게" 알릴지를 결정하는 결정론적 로직만 검증한다.
// ============================================================================

// 테스트용 LeaseRecord 생성 헬퍼 — now 기준 상대 endAt으로 안정화.
function makeLease(over: Partial<LeaseRecord> = {}): LeaseRecord {
  const now = new Date('2026-05-29T00:00:00.000Z');
  return {
    id: 'lease_test1',
    propertyId: 'prop_1',
    landlordId: 'landlord_1',
    tenantId: 'tenant_1',
    status: 'ACTIVE',
    deposit: BigInt(10_000_000),
    rent: 500_000,
    startAt: now,
    endAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    inviteToken: null,
    invitedPhone: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

// now로부터 days일 뒤의 Date
function daysFromNow(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

describe('periodOf', () => {
  it('now를 "YYYY-MM" 포맷으로 변환한다', () => {
    // periodOf는 로컬 시간 기준(getFullYear/getMonth). TZ 경계 모호성을 피하려
    // 로컬 컴포넌트로 Date를 생성해 검증한다.
    expect(periodOf(new Date(2026, 4, 29, 12, 0, 0))).toBe('2026-05'); // 5월
    // 한 자리 월은 0 패딩
    expect(periodOf(new Date(2026, 0, 1, 12, 0, 0))).toBe('2026-01'); // 1월
    expect(periodOf(new Date(2025, 11, 31, 12, 0, 0))).toBe('2025-12'); // 12월
  });
});

describe('contractExpiryIntents (계약만료 D-Day)', () => {
  const now = new Date('2026-05-29T00:00:00.000Z');

  it('endAt이 now+10일인 ACTIVE 계약 → 임대인·임차인 2건, title "계약 만료 D-10"', () => {
    const lease = makeLease({ endAt: daysFromNow(now, 10) });
    const intents = contractExpiryIntents(lease, now);

    expect(intents).toHaveLength(2);
    expect(intents.every((i) => i.title === '계약 만료 D-10')).toBe(true);
    expect(intents.every((i) => i.type === 'CONTRACT_EXPIRY')).toBe(true);
    expect(intents.every((i) => i.refId === lease.id)).toBe(true);
    // 수신자는 임대인 + 임차인
    const recipients = intents.map((i) => i.recipientId).sort();
    expect(recipients).toEqual(['landlord_1', 'tenant_1']);
  });

  it('endAt이 31일 이후(윈도우 30일 초과)면 → 0건', () => {
    const lease = makeLease({ endAt: daysFromNow(now, 31) });
    expect(contractExpiryIntents(lease, now)).toHaveLength(0);
  });

  it('이미 만료된(endAt이 과거) 계약 → 0건', () => {
    const lease = makeLease({ endAt: daysFromNow(now, -1) });
    expect(contractExpiryIntents(lease, now)).toHaveLength(0);
  });

  it('PENDING 계약 → 0건', () => {
    const lease = makeLease({ status: 'PENDING', endAt: daysFromNow(now, 10) });
    expect(contractExpiryIntents(lease, now)).toHaveLength(0);
  });

  it('ENDED 계약 → 0건', () => {
    const lease = makeLease({ status: 'ENDED', endAt: daysFromNow(now, 10) });
    expect(contractExpiryIntents(lease, now)).toHaveLength(0);
  });

  it('tenantId가 없는 계약 → 0건', () => {
    const lease = makeLease({ tenantId: null, endAt: daysFromNow(now, 10) });
    expect(contractExpiryIntents(lease, now)).toHaveLength(0);
  });
});

describe('rentOverdueIntents (월세 미납)', () => {
  // 5일 이후로 고정한 now (연체 기준일 충족)
  const afterDue = new Date('2026-05-10T00:00:00.000Z');

  it('rent>0, now.getDate()>=5, 미납 → 임대인·임차인 2건', () => {
    const lease = makeLease({ rent: 500_000 });
    const intents = rentOverdueIntents(lease, afterDue, false);

    expect(intents).toHaveLength(2);
    expect(intents.every((i) => i.type === 'RENT_OVERDUE')).toBe(true);
    // refId는 lease:period로 월별 멱등
    expect(intents.every((i) => i.refId === `${lease.id}:2026-05`)).toBe(true);
    const recipients = intents.map((i) => i.recipientId).sort();
    expect(recipients).toEqual(['landlord_1', 'tenant_1']);
  });

  it('이번 달 이미 납부됨(isRentPaidThisMonth true) → 0건', () => {
    const lease = makeLease({ rent: 500_000 });
    expect(rentOverdueIntents(lease, afterDue, true)).toHaveLength(0);
  });

  it('월세가 없는(rent 0/null) 계약 → 0건', () => {
    expect(rentOverdueIntents(makeLease({ rent: 0 }), afterDue, false)).toHaveLength(0);
    expect(rentOverdueIntents(makeLease({ rent: null }), afterDue, false)).toHaveLength(0);
  });

  it('now가 납부 기준일(5일) 미만이면 → 0건', () => {
    const beforeDue = new Date('2026-05-04T00:00:00.000Z');
    const lease = makeLease({ rent: 500_000 });
    expect(rentOverdueIntents(lease, beforeDue, false)).toHaveLength(0);
  });

  it('ACTIVE가 아니거나 tenantId 없으면 → 0건', () => {
    expect(
      rentOverdueIntents(makeLease({ status: 'ENDED' }), afterDue, false)
    ).toHaveLength(0);
    expect(
      rentOverdueIntents(makeLease({ tenantId: null }), afterDue, false)
    ).toHaveLength(0);
  });
});
