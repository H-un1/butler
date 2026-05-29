import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// 보수업체 디렉토리 통합 테스트 — 등록(관리자만)·검색·리뷰(1인 1리뷰).

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'vendors-route-test-secret-1234567890',
  JWT_EXPIRES_IN: '1h',
  ALLOW_DEV_AUTH_MOCK: true,
};

async function login(app: Express, role: Role, name: string): Promise<string> {
  const r = await request(app)
    .post('/auth/exchange')
    .send({ provider: 'dev-mock', code: `dev:${role}:${name}`, role });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

function vendorBody(over: Record<string, unknown> = {}) {
  return {
    name: '한빛설비',
    category: 'PLUMBING',
    region: '서울',
    phone: '02-123-4567',
    ...over,
  };
}

describe('Vendors routes (통합)', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp(TEST_ENV);
  });

  it('관리자가 업체 등록 → 201', async () => {
    const admin = await login(app, ROLES.ADMIN, 'super');
    const r = await request(app)
      .post('/vendors')
      .set('Authorization', `Bearer ${admin}`)
      .send(vendorBody());
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('한빛설비');
    expect(r.body.avgRating).toBe(0);
    expect(r.body.reviewCount).toBe(0);
  });

  it('임차인/임대인이 업체 등록 시도 → 403', async () => {
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const tenantTry = await request(app)
      .post('/vendors')
      .set('Authorization', `Bearer ${tenant}`)
      .send(vendorBody());
    expect(tenantTry.status).toBe(403);

    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const landlordTry = await request(app)
      .post('/vendors')
      .set('Authorization', `Bearer ${landlord}`)
      .send(vendorBody());
    expect(landlordTry.status).toBe(403);
  });

  it('GET /vendors?category= 필터 + 임차인 조회 가능', async () => {
    const admin = await login(app, ROLES.ADMIN, 'super');
    await request(app)
      .post('/vendors')
      .set('Authorization', `Bearer ${admin}`)
      .send(vendorBody({ name: '한빛설비', category: 'PLUMBING' }));
    await request(app)
      .post('/vendors')
      .set('Authorization', `Bearer ${admin}`)
      .send(vendorBody({ name: '번개전기', category: 'ELECTRICAL' }));

    const tenant = await login(app, ROLES.TENANT, 'kim');
    const filtered = await request(app)
      .get('/vendors?category=PLUMBING')
      .set('Authorization', `Bearer ${tenant}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].name).toBe('한빛설비');

    // 필터 없으면 전체
    const all = await request(app)
      .get('/vendors')
      .set('Authorization', `Bearer ${tenant}`);
    expect(all.body).toHaveLength(2);
  });

  it('임차인 리뷰(별점) → avgRating 반영, 중복 리뷰 → 409', async () => {
    const admin = await login(app, ROLES.ADMIN, 'super');
    const created = await request(app)
      .post('/vendors')
      .set('Authorization', `Bearer ${admin}`)
      .send(vendorBody());
    const vendorId = created.body.id;

    const tenant = await login(app, ROLES.TENANT, 'kim');
    const review = await request(app)
      .post(`/vendors/${vendorId}/reviews`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ rating: 4, comment: '신속했습니다' });
    expect(review.status).toBe(201);

    // avgRating 반영 확인
    const detailAfterOne = await request(app)
      .get(`/vendors/${vendorId}`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(detailAfterOne.body.avgRating).toBe(4);
    expect(detailAfterOne.body.reviewCount).toBe(1);

    // 같은 임차인 중복 리뷰 → 409
    const dup = await request(app)
      .post(`/vendors/${vendorId}/reviews`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ rating: 2 });
    expect(dup.status).toBe(409);

    // 다른 임대인 리뷰는 허용 → 평균 갱신
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    await request(app)
      .post(`/vendors/${vendorId}/reviews`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({ rating: 5 });

    const detail = await request(app)
      .get(`/vendors/${vendorId}`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(detail.status).toBe(200);
    expect(detail.body.reviewCount).toBe(2);
    expect(detail.body.avgRating).toBe(4.5); // (4+5)/2
    expect(detail.body.reviews).toHaveLength(2);
  });

  it('GET /vendors/:id 상세 + reviews 배열', async () => {
    const admin = await login(app, ROLES.ADMIN, 'super');
    const created = await request(app)
      .post('/vendors')
      .set('Authorization', `Bearer ${admin}`)
      .send(vendorBody());

    const tenant = await login(app, ROLES.TENANT, 'kim');
    const detail = await request(app)
      .get(`/vendors/${created.body.id}`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(created.body.id);
    expect(detail.body.reviews).toEqual([]);

    // 없는 업체 → 404
    const missing = await request(app)
      .get('/vendors/vnd_없음')
      .set('Authorization', `Bearer ${tenant}`);
    expect(missing.status).toBe(404);
  });
});
