import { describe, it, expect } from 'vitest';
import {
  makeInMemoryVendorRepository,
  DUPLICATE_REVIEW_ERROR,
} from './repository.js';
import { computeRating } from './rating.js';

// 보수업체 디렉토리 + 평점 리뷰 in-memory 단위 테스트.

describe('VendorRepository (in-memory)', () => {
  it('createVendor + getVendor 정상 동작', async () => {
    const repo = makeInMemoryVendorRepository();
    const v = await repo.createVendor({
      name: '한빛설비',
      category: 'PLUMBING',
      region: '서울',
      phone: '02-123-4567',
    });
    expect(v.id).toMatch(/^vnd_/);
    expect(v.phone).toBe('02-123-4567');
    expect(v.description).toBeNull(); // 미지정 → null

    const found = await repo.getVendor(v.id);
    expect(found?.name).toBe('한빛설비');
    expect(await repo.getVendor('vnd_없음')).toBeNull();
  });

  it('listVendors — 필터 없으면 전체, 최신순', async () => {
    const repo = makeInMemoryVendorRepository();
    const a = await repo.createVendor({
      name: 'A',
      category: 'PLUMBING',
      region: '서울',
    });
    // createdAt 차이를 보장하기 위해 시간 간격을 둔다
    await new Promise((r) => setTimeout(r, 2));
    const b = await repo.createVendor({
      name: 'B',
      category: 'ELECTRICAL',
      region: '부산',
    });

    const all = await repo.listVendors();
    expect(all).toHaveLength(2);
    // 최신순(나중에 만든 B가 먼저)
    expect(all[0].id).toBe(b.id);
    expect(all[1].id).toBe(a.id);
  });

  it('listVendors — category 필터', async () => {
    const repo = makeInMemoryVendorRepository();
    await repo.createVendor({ name: 'A', category: 'PLUMBING', region: '서울' });
    await repo.createVendor({ name: 'B', category: 'ELECTRICAL', region: '서울' });

    const plumbing = await repo.listVendors({ category: 'PLUMBING' });
    expect(plumbing).toHaveLength(1);
    expect(plumbing[0].name).toBe('A');
  });

  it('listVendors — region 필터 및 category+region 동시 필터', async () => {
    const repo = makeInMemoryVendorRepository();
    await repo.createVendor({ name: 'A', category: 'PLUMBING', region: '서울' });
    await repo.createVendor({ name: 'B', category: 'PLUMBING', region: '부산' });
    await repo.createVendor({ name: 'C', category: 'ELECTRICAL', region: '서울' });

    const seoul = await repo.listVendors({ region: '서울' });
    expect(seoul.map((v) => v.name).sort()).toEqual(['A', 'C']);

    const seoulPlumbing = await repo.listVendors({
      category: 'PLUMBING',
      region: '서울',
    });
    expect(seoulPlumbing).toHaveLength(1);
    expect(seoulPlumbing[0].name).toBe('A');
  });

  it('addReview + listReviews 정상 동작', async () => {
    const repo = makeInMemoryVendorRepository();
    const v = await repo.createVendor({
      name: 'A',
      category: 'PLUMBING',
      region: '서울',
    });
    const r1 = await repo.addReview({
      vendorId: v.id,
      authorId: 'user_1',
      rating: 5,
      comment: '친절',
    });
    expect(r1.id).toMatch(/^vrv_/);
    await repo.addReview({ vendorId: v.id, authorId: 'user_2', rating: 3 });

    const reviews = await repo.listReviews(v.id);
    expect(reviews).toHaveLength(2);
    // 다른 vendor의 리뷰는 격리
    expect(await repo.listReviews('vnd_other')).toHaveLength(0);
  });

  it('addReview — 같은 authorId 중복 리뷰는 throw (1인 1리뷰)', async () => {
    const repo = makeInMemoryVendorRepository();
    const v = await repo.createVendor({
      name: 'A',
      category: 'PLUMBING',
      region: '서울',
    });
    await repo.addReview({ vendorId: v.id, authorId: 'user_1', rating: 4 });
    await expect(
      repo.addReview({ vendorId: v.id, authorId: 'user_1', rating: 2 })
    ).rejects.toThrow(DUPLICATE_REVIEW_ERROR);

    // 같은 author라도 다른 vendor면 허용
    const v2 = await repo.createVendor({
      name: 'B',
      category: 'ETC',
      region: '서울',
    });
    await expect(
      repo.addReview({ vendorId: v2.id, authorId: 'user_1', rating: 5 })
    ).resolves.toBeDefined();
  });
});

describe('computeRating (평점 집계 순수 함수)', () => {
  it('빈 배열 → avgRating 0, reviewCount 0', () => {
    expect(computeRating([])).toEqual({ avgRating: 0, reviewCount: 0 });
  });

  it('[4,5,3] → avg 4.0, count 3', () => {
    expect(computeRating([{ rating: 4 }, { rating: 5 }, { rating: 3 }])).toEqual({
      avgRating: 4.0,
      reviewCount: 3,
    });
  });

  it('소수 1자리 반올림 — [5,4] → 4.5, [5,4,4] → 4.3', () => {
    expect(computeRating([{ rating: 5 }, { rating: 4 }]).avgRating).toBe(4.5);
    // (5+4+4)/3 = 4.333... → 4.3
    expect(
      computeRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }]).avgRating
    ).toBe(4.3);
  });
});
