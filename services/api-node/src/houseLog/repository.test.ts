import { describe, it, expect } from 'vitest';
import { makeInMemoryHouseLogRepository } from './repository.js';

describe('HouseLogRepository (append-only)', () => {
  it('append + list 정상 동작', async () => {
    const repo = makeInMemoryHouseLogRepository();
    const e1 = await repo.append({
      propertyId: 'prop_1',
      type: 'INSPECTION',
      title: '2026 정기점검',
      occurredAt: new Date('2026-05-24'),
    });
    expect(e1.id).toMatch(/^log_/);

    const e2 = await repo.append({
      propertyId: 'prop_1',
      type: 'REPAIR',
      title: '욕실 실리콘 보수',
      occurredAt: new Date('2026-05-25'),
    });
    expect(e2.id).not.toBe(e1.id);

    const list = await repo.listByProperty('prop_1');
    expect(list).toHaveLength(2);
    // 최신순
    expect(list[0].title).toBe('욕실 실리콘 보수');
    expect(list[1].title).toBe('2026 정기점검');
  });

  it('다른 property의 entry는 격리', async () => {
    const repo = makeInMemoryHouseLogRepository();
    await repo.append({
      propertyId: 'prop_A',
      type: 'INSPECTION',
      title: 'A 점검',
      occurredAt: new Date(),
    });
    await repo.append({
      propertyId: 'prop_B',
      type: 'INSPECTION',
      title: 'B 점검',
      occurredAt: new Date(),
    });
    const a = await repo.listByProperty('prop_A');
    const b = await repo.listByProperty('prop_B');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].title).toBe('A 점검');
  });

  it('인터페이스에 update/delete 메서드가 존재하지 않는다 (compile-time 강제)', () => {
    const repo = makeInMemoryHouseLogRepository();
    // typeof로 메서드 부재 확인 — TypeScript가 코드 자체에서 호출을 차단하지만,
    // 런타임에서도 객체 표면에 없음을 확인한다.
    expect(Object.keys(repo).sort()).toEqual(['append', 'listByProperty']);
    expect((repo as unknown as { update?: unknown }).update).toBeUndefined();
    expect((repo as unknown as { delete?: unknown }).delete).toBeUndefined();
  });
});
