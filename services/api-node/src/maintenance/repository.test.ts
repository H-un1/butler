import { describe, it, expect } from 'vitest';
import { makeInMemoryMaintenanceRepository } from './repository.js';

// 수선요청 이슈보드 in-memory 저장소 단위 테스트 — 생성·코멘트·상태전이·목록 필터

function baseInput(overrides: Partial<Parameters<ReturnType<typeof makeInMemoryMaintenanceRepository>['create']>[0]> = {}) {
  return {
    propertyId: 'prop_1',
    leaseId: 'lease_1',
    requesterId: 'usr_ten_1',
    category: 'PLUMBING' as const,
    title: '주방 누수',
    description: '싱크대 아래 물이 샘',
    ...overrides,
  };
}

describe('MaintenanceRepository (in-memory)', () => {
  it('create → OPEN 상태 + 기본값', async () => {
    const repo = makeInMemoryMaintenanceRepository();
    const req = await repo.create(baseInput());

    expect(req.id).toMatch(/^mnt_/);
    expect(req.status).toBe('OPEN');
    expect(req.category).toBe('PLUMBING');
    expect(req.title).toBe('주방 누수');
    expect(req.photoUrls).toEqual([]);
  });

  it('create → photoUrls 보존', async () => {
    const repo = makeInMemoryMaintenanceRepository();
    const req = await repo.create(baseInput({ photoUrls: ['s3://a.jpg', 's3://b.jpg'] }));
    expect(req.photoUrls).toEqual(['s3://a.jpg', 's3://b.jpg']);
  });

  it('addComment / listComments — 생성순(asc) 정렬', async () => {
    const repo = makeInMemoryMaintenanceRepository();
    const req = await repo.create(baseInput());

    const c1 = await repo.addComment({
      requestId: req.id,
      authorId: 'usr_ten_1',
      body: '첫 코멘트',
    });
    const c2 = await repo.addComment({
      requestId: req.id,
      authorId: 'usr_lan_1',
      body: '두번째 코멘트',
      systemEvent: true,
    });

    const comments = await repo.listComments(req.id);
    expect(comments.map((c) => c.id)).toEqual([c1.id, c2.id]);
    expect(comments[0].systemEvent).toBe(false);
    expect(comments[1].systemEvent).toBe(true);
    // 생성순 보장
    expect(comments[0].createdAt.getTime()).toBeLessThanOrEqual(comments[1].createdAt.getTime());
  });

  it('listComments — 다른 요청의 코멘트는 섞이지 않음', async () => {
    const repo = makeInMemoryMaintenanceRepository();
    const r1 = await repo.create(baseInput());
    const r2 = await repo.create(baseInput({ title: '전기 차단기' }));
    await repo.addComment({ requestId: r1.id, authorId: 'u', body: 'r1' });
    await repo.addComment({ requestId: r2.id, authorId: 'u', body: 'r2' });

    const c1 = await repo.listComments(r1.id);
    expect(c1).toHaveLength(1);
    expect(c1[0].body).toBe('r1');
  });

  it('updateStatus → 상태 갱신', async () => {
    const repo = makeInMemoryMaintenanceRepository();
    const req = await repo.create(baseInput());

    const inProg = await repo.updateStatus(req.id, 'IN_PROGRESS');
    expect(inProg.status).toBe('IN_PROGRESS');

    const resolved = await repo.updateStatus(req.id, 'RESOLVED');
    expect(resolved.status).toBe('RESOLVED');
  });

  it('listByProperty / listByProperties / listByRequester / listAll', async () => {
    const repo = makeInMemoryMaintenanceRepository();
    await repo.create(baseInput({ propertyId: 'prop_A', requesterId: 'usr_ten_1' }));
    await repo.create(baseInput({ propertyId: 'prop_B', requesterId: 'usr_ten_1' }));
    await repo.create(baseInput({ propertyId: 'prop_C', requesterId: 'usr_ten_2' }));

    const byProp = await repo.listByProperty('prop_A');
    expect(byProp).toHaveLength(1);

    const byProps = await repo.listByProperties(['prop_A', 'prop_B']);
    expect(byProps).toHaveLength(2);

    const byRequester = await repo.listByRequester('usr_ten_1');
    expect(byRequester).toHaveLength(2);

    const all = await repo.listAll();
    expect(all).toHaveLength(3);
    // listAll 최신순(desc) — createdAt 내림차순
    for (let i = 0; i < all.length - 1; i++) {
      expect(all[i].createdAt.getTime()).toBeGreaterThanOrEqual(all[i + 1].createdAt.getTime());
    }
  });
});
