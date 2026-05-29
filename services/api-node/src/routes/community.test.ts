import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// 단지 커뮤니티 통합 테스트 — buildApp 전체 앱 + dev-mock 로그인.
// 핵심: complexName 있는 물건/ACTIVE 임대차로만 멤버십이 생기는 실소유주 게이트.

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'community-route-test-secret-1234567890',
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

// complexName이 있는 물건을 등록해야 임대인 커뮤니티 멤버십이 생긴다.
async function createProperty(
  app: Express,
  token: string,
  address: string,
  complexName?: string
): Promise<string> {
  const r = await request(app)
    .post('/properties')
    .set('Authorization', `Bearer ${token}`)
    .send({ address, ...(complexName ? { complexName } : {}) });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

describe('Community routes (통합)', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp(TEST_ENV);
  });

  it('임대인이 complexName 물건 등록 → GET /community/my-complexes에 노출', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    await createProperty(app, landlord, '서울시 강서구 화곡로 12', '햇살아파트');

    const r = await request(app)
      .get('/community/my-complexes')
      .set('Authorization', `Bearer ${landlord}`);
    expect(r.status).toBe(200);
    expect(r.body.complexes).toEqual(['햇살아파트']);
  });

  it('멤버가 게시글 작성 → 201, 목록 반영, 상세 + 댓글 작성', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    await createProperty(app, landlord, '서울시 A로 1', '햇살아파트');

    // 게시글 작성
    const created = await request(app)
      .post('/community/햇살아파트/posts')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ title: '엘리베이터 점검 공지', body: '내일 오전 점검 예정입니다' });
    expect(created.status).toBe(201);
    expect(created.body.complexName).toBe('햇살아파트');
    const postId = created.body.id as string;

    // 목록에 반영
    const list = await request(app)
      .get('/community/햇살아파트/posts')
      .set('Authorization', `Bearer ${landlord}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(postId);

    // 댓글 작성
    const comment = await request(app)
      .post(`/community/posts/${postId}/comments`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({ body: '확인했습니다' });
    expect(comment.status).toBe(201);

    // 상세 + 댓글 노출
    const detail = await request(app)
      .get(`/community/posts/${postId}`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(detail.status).toBe(200);
    expect(detail.body.body).toBe('내일 오전 점검 예정입니다');
    expect(detail.body.comments).toHaveLength(1);
    expect(detail.body.comments[0].body).toBe('확인했습니다');
  });

  it('임차인이 ACTIVE 임대차로 단지에 합류 → 게시판 접근 가능', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const propertyId = await createProperty(app, landlord, '서울시 A로 1', '햇살아파트');

    // 임대차 생성 + 임차인 수락 → ACTIVE
    const lease = await request(app)
      .post('/leases')
      .set('Authorization', `Bearer ${landlord}`)
      .send({
        propertyId,
        deposit: 10_000_000,
        rent: 500_000,
        startAt: '2026-06-01T00:00:00.000Z',
        endAt: '2028-05-31T00:00:00.000Z',
      });
    expect(lease.status).toBe(201);

    const tenant = await login(app, ROLES.TENANT, 'kim');
    const accept = await request(app)
      .post('/leases/accept')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ inviteToken: lease.body.inviteToken });
    expect(accept.status).toBe(200);

    // 임차인이 단지 게시판 접근 가능
    const mine = await request(app)
      .get('/community/my-complexes')
      .set('Authorization', `Bearer ${tenant}`);
    expect(mine.body.complexes).toEqual(['햇살아파트']);

    const post = await request(app)
      .post('/community/햇살아파트/posts')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ title: '주차 문의', body: '방문차량 등록 방법?' });
    expect(post.status).toBe(201);
  });

  it('비멤버(해당 단지에 물건/임대차 없는 임차인) 접근 → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    await createProperty(app, landlord, '서울시 A로 1', '햇살아파트');

    // 단지에 아무 연고 없는 임차인
    const stranger = await login(app, ROLES.TENANT, 'stranger');

    const listAttempt = await request(app)
      .get('/community/햇살아파트/posts')
      .set('Authorization', `Bearer ${stranger}`);
    expect(listAttempt.status).toBe(403);

    const postAttempt = await request(app)
      .post('/community/햇살아파트/posts')
      .set('Authorization', `Bearer ${stranger}`)
      .send({ title: '침입', body: '글' });
    expect(postAttempt.status).toBe(403);
  });

  it('관리자는 임의 단지에 접근 가능', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    await createProperty(app, landlord, '서울시 A로 1', '햇살아파트');
    await request(app)
      .post('/community/햇살아파트/posts')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ title: '공지', body: '내용' });

    const admin = await login(app, ROLES.ADMIN, 'super');
    const r = await request(app)
      .get('/community/햇살아파트/posts')
      .set('Authorization', `Bearer ${admin}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });
});
