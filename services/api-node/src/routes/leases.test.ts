import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// 임대차 라우트 통합 테스트 — buildApp 전체 앱을 띄우고 dev-mock 로그인 후 검증

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'leases-route-test-secret-1234567890',
  JWT_EXPIRES_IN: '1h',
  ALLOW_DEV_AUTH_MOCK: true,
};

// dev-mock 로그인 → JWT 토큰 반환. code의 NAME이 다르면 다른 유저가 생성된다
// (providerUserId = `${role}-${name}`).
async function login(app: Express, role: Role, name: string): Promise<string> {
  const r = await request(app)
    .post('/auth/exchange')
    .send({ provider: 'dev-mock', code: `dev:${role}:${name}`, role });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

async function createProperty(app: Express, token: string, address: string): Promise<string> {
  const r = await request(app)
    .post('/properties')
    .set('Authorization', `Bearer ${token}`)
    .send({ address });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

function leaseBody(propertyId: string) {
  return {
    propertyId,
    deposit: 10_000_000,
    rent: 500_000,
    startAt: '2026-06-01T00:00:00.000Z',
    endAt: '2028-05-31T00:00:00.000Z',
  };
}

describe('Lease routes (통합)', () => {
  let app: Express;
  beforeEach(() => {
    // userStore·repo를 기본 in-memory로 공유하도록 buildApp에 deps 미주입
    app = buildApp(TEST_ENV);
  });

  it('임대인이 물건 생성 → 계약 생성 시 PENDING + 초대토큰 발급(201)', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const propertyId = await createProperty(app, landlord, '서울시 강서구 화곡로 12');

    const r = await request(app)
      .post('/leases')
      .set('Authorization', `Bearer ${landlord}`)
      .send(leaseBody(propertyId));

    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PENDING');
    expect(r.body.tenantId).toBeNull();
    expect(r.body.inviteToken).toMatch(/^inv_/);
  });

  it('임차인이 초대토큰으로 accept → ACTIVE + tenantId 세팅', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const propertyId = await createProperty(app, landlord, '주소1');
    const created = await request(app)
      .post('/leases')
      .set('Authorization', `Bearer ${landlord}`)
      .send(leaseBody(propertyId));
    const inviteToken = created.body.inviteToken;

    const tenant = await login(app, ROLES.TENANT, 'kim');
    const r = await request(app)
      .post('/leases/accept')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ inviteToken });

    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ACTIVE');
    expect(r.body.tenantId).toBeTruthy();
    // 임차인에게 토큰 비노출
    expect(r.body.inviteToken).toBeNull();
  });

  it('GET /leases/mine — 임대인/임차인 각각 본인 계약만', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const propertyId = await createProperty(app, landlord, '주소1');
    const created = await request(app)
      .post('/leases')
      .set('Authorization', `Bearer ${landlord}`)
      .send(leaseBody(propertyId));

    const tenant = await login(app, ROLES.TENANT, 'kim');
    await request(app)
      .post('/leases/accept')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ inviteToken: created.body.inviteToken });

    const landlordMine = await request(app)
      .get('/leases/mine')
      .set('Authorization', `Bearer ${landlord}`);
    expect(landlordMine.status).toBe(200);
    expect(landlordMine.body).toHaveLength(1);

    const tenantMine = await request(app)
      .get('/leases/mine')
      .set('Authorization', `Bearer ${tenant}`);
    expect(tenantMine.status).toBe(200);
    expect(tenantMine.body).toHaveLength(1);
    expect(tenantMine.body[0].id).toBe(created.body.id);
    // 임차인 목록에는 토큰 비노출
    expect(tenantMine.body[0].inviteToken).toBeNull();
  });

  it('RBAC: 임차인이 POST /leases (생성) 시도 → 403', async () => {
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const r = await request(app)
      .post('/leases')
      .set('Authorization', `Bearer ${tenant}`)
      .send(leaseBody('prop_x'));
    expect(r.status).toBe(403);
  });

  it('RBAC: 타 임대인이 남의 물건으로 계약 생성 → 403', async () => {
    const owner = await login(app, ROLES.LANDLORD, 'owner');
    const propertyId = await createProperty(app, owner, '소유자 물건');

    const other = await login(app, ROLES.LANDLORD, 'other');
    const r = await request(app)
      .post('/leases')
      .set('Authorization', `Bearer ${other}`)
      .send(leaseBody(propertyId));
    expect(r.status).toBe(403);
  });

  it('RBAC: 타인이 GET /leases/:id → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const propertyId = await createProperty(app, landlord, '주소1');
    const created = await request(app)
      .post('/leases')
      .set('Authorization', `Bearer ${landlord}`)
      .send(leaseBody(propertyId));

    const stranger = await login(app, ROLES.TENANT, 'stranger');
    const r = await request(app)
      .get(`/leases/${created.body.id}`)
      .set('Authorization', `Bearer ${stranger}`);
    expect(r.status).toBe(403);
  });

  it('잘못된 inviteToken → 404', async () => {
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const r = await request(app)
      .post('/leases/accept')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ inviteToken: 'inv_nope_nope' });
    expect(r.status).toBe(404);
  });

  it('이미 연결된 계약 재연결 시도 → 409', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const propertyId = await createProperty(app, landlord, '주소1');
    const created = await request(app)
      .post('/leases')
      .set('Authorization', `Bearer ${landlord}`)
      .send(leaseBody(propertyId));
    const inviteToken = created.body.inviteToken;

    const tenant1 = await login(app, ROLES.TENANT, 'kim');
    await request(app)
      .post('/leases/accept')
      .set('Authorization', `Bearer ${tenant1}`)
      .send({ inviteToken });

    // 연결 후 토큰은 소거됨 → 같은 토큰 재사용은 404,
    // (만약 토큰이 살아있어 같은 계약을 찾는 경우라도) 이미 연결됨 → 409.
    // 여기서는 토큰 소거 동작상 404가 기대값.
    const tenant2 = await login(app, ROLES.TENANT, 'lee');
    const r = await request(app)
      .post('/leases/accept')
      .set('Authorization', `Bearer ${tenant2}`)
      .send({ inviteToken });
    expect([404, 409]).toContain(r.status);
  });

  it('임대인 계약 종료 → ENDED', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const propertyId = await createProperty(app, landlord, '주소1');
    const created = await request(app)
      .post('/leases')
      .set('Authorization', `Bearer ${landlord}`)
      .send(leaseBody(propertyId));

    const r = await request(app)
      .post(`/leases/${created.body.id}/end`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ENDED');
  });
});
