import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// 전자투표 통합 테스트 — 단지 멤버십 게이트 + 1인 1표 + 마감.

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'votes-route-test-secret-1234567890',
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

// complexName 물건 + 임차인 ACTIVE 임대차까지 세팅해 두 명의 단지 멤버를 만든다.
async function setupComplex(app: Express) {
  const landlord = await login(app, ROLES.LANDLORD, 'hong');
  const propRes = await request(app)
    .post('/properties')
    .set('Authorization', `Bearer ${landlord}`)
    .send({ address: '서울시 A로 1', complexName: '햇살아파트' });
  expect(propRes.status).toBe(201);

  const lease = await request(app)
    .post('/leases')
    .set('Authorization', `Bearer ${landlord}`)
    .send({
      propertyId: propRes.body.id,
      deposit: 10_000_000,
      rent: 500_000,
      startAt: '2026-06-01T00:00:00.000Z',
      endAt: '2028-05-31T00:00:00.000Z',
    });
  const tenant = await login(app, ROLES.TENANT, 'kim');
  await request(app)
    .post('/leases/accept')
    .set('Authorization', `Bearer ${tenant}`)
    .send({ inviteToken: lease.body.inviteToken });

  return { landlord, tenant };
}

describe('Votes routes (통합)', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp(TEST_ENV);
  });

  it('멤버가 투표 생성 → 201, options/tally 포함', async () => {
    const { landlord } = await setupComplex(app);
    const r = await request(app)
      .post('/votes/햇살아파트')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ title: '도색 안건', options: ['찬성', '반대'] });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('OPEN');
    expect(r.body.options).toEqual(['찬성', '반대']);
    expect(r.body.tally).toHaveLength(2);
    expect(r.body.totalBallots).toBe(0);
  });

  it('멤버 투표 → tally count 증가 + myOptionIndex 반영', async () => {
    const { landlord, tenant } = await setupComplex(app);
    const created = await request(app)
      .post('/votes/햇살아파트')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ title: '도색 안건', options: ['찬성', '반대'] });
    const voteId = created.body.id;

    const cast = await request(app)
      .post(`/votes/v/${voteId}/cast`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ optionIndex: 0 });
    expect(cast.status).toBe(201);
    expect(cast.body.totalBallots).toBe(1);
    expect(cast.body.tally[0].count).toBe(1);
    expect(cast.body.myOptionIndex).toBe(0);
  });

  it('중복 투표 → 409', async () => {
    const { landlord, tenant } = await setupComplex(app);
    const created = await request(app)
      .post('/votes/햇살아파트')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ title: '안건', options: ['A', 'B'] });
    const voteId = created.body.id;

    await request(app)
      .post(`/votes/v/${voteId}/cast`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ optionIndex: 0 });
    const dup = await request(app)
      .post(`/votes/v/${voteId}/cast`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ optionIndex: 1 });
    expect(dup.status).toBe(409);
  });

  it('옵션 범위 밖 → 400', async () => {
    const { landlord, tenant } = await setupComplex(app);
    const created = await request(app)
      .post('/votes/햇살아파트')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ title: '안건', options: ['A', 'B'] });

    const r = await request(app)
      .post(`/votes/v/${created.body.id}/cast`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ optionIndex: 5 });
    expect(r.status).toBe(400);
  });

  it('생성자가 마감 → CLOSED, 마감 후 투표 → 409', async () => {
    const { landlord, tenant } = await setupComplex(app);
    const created = await request(app)
      .post('/votes/햇살아파트')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ title: '안건', options: ['A', 'B'] });
    const voteId = created.body.id;

    const closed = await request(app)
      .post(`/votes/v/${voteId}/close`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('CLOSED');

    // 마감 후 투표 시도 → 409
    const cast = await request(app)
      .post(`/votes/v/${voteId}/cast`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ optionIndex: 0 });
    expect(cast.status).toBe(409);
  });

  it('비멤버 접근 → 403 (생성/목록/투표)', async () => {
    const { landlord } = await setupComplex(app);
    const created = await request(app)
      .post('/votes/햇살아파트')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ title: '안건', options: ['A', 'B'] });

    const stranger = await login(app, ROLES.TENANT, 'stranger');

    const listAttempt = await request(app)
      .get('/votes/햇살아파트')
      .set('Authorization', `Bearer ${stranger}`);
    expect(listAttempt.status).toBe(403);

    const createAttempt = await request(app)
      .post('/votes/햇살아파트')
      .set('Authorization', `Bearer ${stranger}`)
      .send({ title: '침입', options: ['A', 'B'] });
    expect(createAttempt.status).toBe(403);

    const castAttempt = await request(app)
      .post(`/votes/v/${created.body.id}/cast`)
      .set('Authorization', `Bearer ${stranger}`)
      .send({ optionIndex: 0 });
    expect(castAttempt.status).toBe(403);
  });
});
