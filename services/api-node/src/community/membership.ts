import { ROLES, type Role } from '@butler/shared';
import type { PropertyRepository } from '../properties/repository.js';
import type { LeaseRepository } from '../lease/repository.js';

// 단지 커뮤니티 실소유주/거주자 게이트.
// - 임대인(LANDLORD): 본인이 소유한 Property의 complexName
// - 임차인(TENANT): 본인이 ACTIVE Lease로 연결된 Property의 complexName
// - 관리자(ADMIN): 전체 접근 허용(운영)
// complexName이 없는 물건은 커뮤니티 대상이 아니다(단지 식별 불가).

export async function complexesForUser(
  userId: string,
  role: Role,
  deps: { propertyRepo: PropertyRepository; leaseRepo: LeaseRepository }
): Promise<Set<string>> {
  const set = new Set<string>();

  if (role === ROLES.LANDLORD) {
    const props = await deps.propertyRepo.listByOwner(userId);
    for (const p of props) if (p.complexName) set.add(p.complexName);
    return set;
  }

  if (role === ROLES.TENANT) {
    const leases = await deps.leaseRepo.listByTenant(userId);
    for (const lease of leases) {
      if (lease.status !== 'ACTIVE') continue;
      const prop = await deps.propertyRepo.getById(lease.propertyId);
      if (prop?.complexName) set.add(prop.complexName);
    }
    return set;
  }

  return set; // 그 외 역할은 멤버십 없음(ADMIN은 호출부에서 우회)
}

export async function canAccessComplex(
  userId: string,
  role: Role,
  complexName: string,
  deps: { propertyRepo: PropertyRepository; leaseRepo: LeaseRepository }
): Promise<boolean> {
  if (role === ROLES.ADMIN) return true;
  const set = await complexesForUser(userId, role, deps);
  return set.has(complexName);
}
