import { describe, it, expect } from 'vitest';
import { makeInMemoryLeaseRepository } from './repository.js';

// 임대차(Lease) in-memory 저장소 단위 테스트 — PENDING 생성 → 초대 토큰 → 임차인 연결(ACTIVE) 흐름

function baseInput(overrides: Partial<Parameters<ReturnType<typeof makeInMemoryLeaseRepository>['create']>[0]> = {}) {
  return {
    propertyId: 'prop_1',
    landlordId: 'usr_lan_1',
    deposit: 10_000_000,
    rent: 500_000,
    startAt: new Date('2026-06-01'),
    endAt: new Date('2028-05-31'),
    ...overrides,
  };
}

describe('LeaseRepository (in-memory)', () => {
  it('create → PENDING + inviteToken 발급 + tenantId는 null', async () => {
    const repo = makeInMemoryLeaseRepository();
    const lease = await repo.create(baseInput());

    expect(lease.id).toMatch(/^lease_/);
    expect(lease.status).toBe('PENDING');
    expect(lease.tenantId).toBeNull();
    expect(lease.inviteToken).toBeTruthy();
    expect(lease.inviteToken).toMatch(/^inv_/);
    expect(lease.deposit).toBe(10_000_000n);
    expect(lease.rent).toBe(500_000);
  });

  it('create → rent 미지정 시 null로 저장', async () => {
    const repo = makeInMemoryLeaseRepository();
    const lease = await repo.create(baseInput({ rent: null }));
    expect(lease.rent).toBeNull();
  });

  it('getByInviteToken 으로 발급된 토큰으로 계약 조회', async () => {
    const repo = makeInMemoryLeaseRepository();
    const lease = await repo.create(baseInput());

    const found = await repo.getByInviteToken(lease.inviteToken!);
    expect(found?.id).toBe(lease.id);

    // 존재하지 않는 토큰은 null
    const none = await repo.getByInviteToken('inv_does_not_exist');
    expect(none).toBeNull();
  });

  it('connectTenant → ACTIVE + tenantId 세팅 + inviteToken 소거(null)', async () => {
    const repo = makeInMemoryLeaseRepository();
    const lease = await repo.create(baseInput());

    const connected = await repo.connectTenant(lease.id, 'usr_ten_1');
    expect(connected.status).toBe('ACTIVE');
    expect(connected.tenantId).toBe('usr_ten_1');
    expect(connected.inviteToken).toBeNull();

    // 토큰 소거 후에는 더이상 토큰으로 조회되지 않아야 한다 (1회용)
    const byToken = await repo.getByInviteToken(lease.inviteToken!);
    expect(byToken).toBeNull();
  });

  it('listByLandlord / listByTenant / listByProperty — 각 기준으로 필터링', async () => {
    const repo = makeInMemoryLeaseRepository();
    const a = await repo.create(baseInput({ propertyId: 'prop_A', landlordId: 'usr_lan_1' }));
    const b = await repo.create(baseInput({ propertyId: 'prop_B', landlordId: 'usr_lan_1' }));
    await repo.create(baseInput({ propertyId: 'prop_C', landlordId: 'usr_lan_2' }));

    // 임차인 연결: a계약에만 usr_ten_1 연결
    await repo.connectTenant(a.id, 'usr_ten_1');

    const byLandlord1 = await repo.listByLandlord('usr_lan_1');
    expect(byLandlord1).toHaveLength(2);

    const byLandlord2 = await repo.listByLandlord('usr_lan_2');
    expect(byLandlord2).toHaveLength(1);

    const byTenant = await repo.listByTenant('usr_ten_1');
    expect(byTenant).toHaveLength(1);
    expect(byTenant[0].id).toBe(a.id);

    const byPropertyB = await repo.listByProperty('prop_B');
    expect(byPropertyB).toHaveLength(1);
    expect(byPropertyB[0].id).toBe(b.id);
  });

  it('updateStatus → ENDED 로 전이', async () => {
    const repo = makeInMemoryLeaseRepository();
    const lease = await repo.create(baseInput());
    await repo.connectTenant(lease.id, 'usr_ten_1');

    const ended = await repo.updateStatus(lease.id, 'ENDED');
    expect(ended.status).toBe('ENDED');
    // 종료해도 tenantId는 유지 (이력)
    expect(ended.tenantId).toBe('usr_ten_1');
  });
});
