import { describe, it, expect } from 'vitest';
import { ROLES } from '@butler/shared';
import { makeInMemoryPropertyRepository } from '../properties/repository.js';
import { makeInMemoryLeaseRepository } from '../lease/repository.js';
import { complexesForUser, canAccessComplex } from './membership.js';

// 단지 커뮤니티 실소유주/거주자 게이트 단위 테스트.
// buildApp 없이 in-memory propertyRepo/leaseRepo를 직접 구성한다.

function makeGate() {
  return {
    propertyRepo: makeInMemoryPropertyRepository(),
    leaseRepo: makeInMemoryLeaseRepository(),
  };
}

describe('complexesForUser (멤버십 산출)', () => {
  it('임대인이 complexName "A" 물건 소유 → 멤버십에 "A" 포함', async () => {
    const gate = makeGate();
    await gate.propertyRepo.create({
      ownerId: 'landlord_1',
      address: '서울시 A로 1',
      complexName: 'A',
    });
    // complexName 없는 물건은 단지 식별 불가 → 미포함
    await gate.propertyRepo.create({
      ownerId: 'landlord_1',
      address: '서울시 B로 2',
    });

    const set = await complexesForUser('landlord_1', ROLES.LANDLORD, gate);
    expect(set.has('A')).toBe(true);
    expect(set.size).toBe(1);

    // 다른 임대인은 멤버십 없음
    const other = await complexesForUser('landlord_2', ROLES.LANDLORD, gate);
    expect(other.size).toBe(0);
  });

  it('임차인이 complexName "A" 물건의 ACTIVE 임대차 → "A" 포함, PENDING이면 미포함', async () => {
    const gate = makeGate();
    const prop = await gate.propertyRepo.create({
      ownerId: 'landlord_1',
      address: '서울시 A로 1',
      complexName: 'A',
    });

    // PENDING(아직 미수락) 임대차 — tenantId 미연결이므로 listByTenant에 안 잡힘
    const lease = await gate.leaseRepo.create({
      propertyId: prop.id,
      landlordId: 'landlord_1',
      deposit: 10_000_000,
      startAt: new Date('2026-06-01'),
      endAt: new Date('2028-05-31'),
    });

    // 수락 전: 임차인 멤버십 없음
    const before = await complexesForUser('tenant_1', ROLES.TENANT, gate);
    expect(before.has('A')).toBe(false);

    // 수락 → ACTIVE + tenantId 연결
    await gate.leaseRepo.connectTenant(lease.id, 'tenant_1');
    const after = await complexesForUser('tenant_1', ROLES.TENANT, gate);
    expect(after.has('A')).toBe(true);
  });

  it('ENDED 임대차는 멤버십에서 제외(ACTIVE만 인정)', async () => {
    const gate = makeGate();
    const prop = await gate.propertyRepo.create({
      ownerId: 'landlord_1',
      address: '서울시 A로 1',
      complexName: 'A',
    });
    const lease = await gate.leaseRepo.create({
      propertyId: prop.id,
      landlordId: 'landlord_1',
      deposit: 10_000_000,
      startAt: new Date('2026-06-01'),
      endAt: new Date('2028-05-31'),
    });
    await gate.leaseRepo.connectTenant(lease.id, 'tenant_1');
    await gate.leaseRepo.updateStatus(lease.id, 'ENDED');

    const set = await complexesForUser('tenant_1', ROLES.TENANT, gate);
    expect(set.has('A')).toBe(false);
  });
});

describe('canAccessComplex (접근 게이트)', () => {
  it('관리자는 항상 true', async () => {
    const gate = makeGate();
    expect(await canAccessComplex('admin_1', ROLES.ADMIN, '아무단지', gate)).toBe(
      true
    );
  });

  it('멤버는 true, 비멤버는 false', async () => {
    const gate = makeGate();
    await gate.propertyRepo.create({
      ownerId: 'landlord_1',
      address: '서울시 A로 1',
      complexName: 'A',
    });
    expect(await canAccessComplex('landlord_1', ROLES.LANDLORD, 'A', gate)).toBe(
      true
    );
    // 본인이 속하지 않은 단지 → false
    expect(await canAccessComplex('landlord_1', ROLES.LANDLORD, 'B', gate)).toBe(
      false
    );
    // 아무 물건도 없는 임차인 → false
    expect(await canAccessComplex('tenant_x', ROLES.TENANT, 'A', gate)).toBe(
      false
    );
  });
});
