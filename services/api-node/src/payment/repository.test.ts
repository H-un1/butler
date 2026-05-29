import { describe, it, expect } from 'vitest';
import { makeInMemoryPaymentRepository } from './repository.js';

// ============================================================================
// 결제 저장소 단위 테스트 (in-memory) — 결제 상태 전이 및 조회.
// ============================================================================

describe('PaymentRepository (in-memory)', () => {
  it('create → REQUESTED 상태로 생성된다', async () => {
    const repo = makeInMemoryPaymentRepository();
    const rec = await repo.create({
      payerId: 'tenant_1',
      type: 'RENT',
      refId: 'lease_1',
      amount: 500_000,
      period: '2026-05',
    });

    expect(rec.id).toMatch(/^pay_/);
    expect(rec.status).toBe('REQUESTED');
    expect(rec.provider).toBe('mock'); // provider 미지정 시 기본 mock
    expect(rec.mockChargeId).toBeNull();
    expect(rec.paidAt).toBeNull();
    expect(rec.amount).toBe(500_000);
    expect(rec.period).toBe('2026-05');
  });

  it('markPaid → PAID + mockChargeId + paidAt 기록', async () => {
    const repo = makeInMemoryPaymentRepository();
    const rec = await repo.create({
      payerId: 'tenant_1',
      type: 'SETTLEMENT',
      refId: 'set_1',
      amount: 350_000,
    });

    const paid = await repo.markPaid(rec.id, 'mock_pay_abc123');
    expect(paid.status).toBe('PAID');
    expect(paid.mockChargeId).toBe('mock_pay_abc123');
    expect(paid.paidAt).toBeInstanceOf(Date);
    // 조회해도 영속화되어 있다
    const fetched = await repo.getById(rec.id);
    expect(fetched?.status).toBe('PAID');
  });

  it('markFailed → FAILED 상태로 전이', async () => {
    const repo = makeInMemoryPaymentRepository();
    const rec = await repo.create({
      payerId: 'landlord_1',
      type: 'SUBSCRIPTION',
      refId: 'sub_1',
      amount: 9_900,
    });

    const failed = await repo.markFailed(rec.id);
    expect(failed.status).toBe('FAILED');
    expect(failed.mockChargeId).toBeNull();
    expect(failed.paidAt).toBeNull();
  });

  it('listByPayer → 결제자 본인 내역만, 최신순', async () => {
    const repo = makeInMemoryPaymentRepository();
    await repo.create({ payerId: 'tenant_1', type: 'RENT', refId: 'l1', amount: 1 });
    await repo.create({ payerId: 'tenant_1', type: 'RENT', refId: 'l1', amount: 2 });
    await repo.create({ payerId: 'tenant_2', type: 'RENT', refId: 'l2', amount: 3 });

    const mine = await repo.listByPayer('tenant_1');
    expect(mine).toHaveLength(2);
    expect(mine.every((p) => p.payerId === 'tenant_1')).toBe(true);
  });

  it('listByTypeRef → type+refId로 필터링', async () => {
    const repo = makeInMemoryPaymentRepository();
    await repo.create({ payerId: 'tenant_1', type: 'RENT', refId: 'lease_X', amount: 1 });
    await repo.create({ payerId: 'tenant_1', type: 'SETTLEMENT', refId: 'lease_X', amount: 2 });
    await repo.create({ payerId: 'tenant_1', type: 'RENT', refId: 'lease_Y', amount: 3 });

    const rent = await repo.listByTypeRef('RENT', 'lease_X');
    expect(rent).toHaveLength(1);
    expect(rent[0].type).toBe('RENT');
    expect(rent[0].refId).toBe('lease_X');
  });
});
