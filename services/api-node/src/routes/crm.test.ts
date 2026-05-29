import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// ============================================================================
// 임대차 CRM 개요 통합 테스트 — buildApp 전체 앱 + dev-mock 로그인.
// 임대인은 본인 계약만, 관리자는 전체, 임차인은 접근 불가(403).
// ============================================================================

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'crm-route-test-secret-1234567890',
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

async function createProperty(app: Express, token: string, address: string): Promise<string> {
  const r = await request(app)
    .post('/properties')
    .set('Authorization', `Bearer ${token}`)
    .send({ address });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

type LeaseSetup = { leaseId: string; propertyId: string };

async function setupActiveLease(
  app: Express,
  landlord: string,
  tenant: string,
  address: string
): Promise<LeaseSetup> {
  const propertyId = await createProperty(app, landlord, address);
  const created = await request(app)
    .post('/leases')
    .set('Authorization', `Bearer ${landlord}`)
    .send({
      propertyId,
      deposit: 10_000_000,
      rent: 500_000,
      startAt: '2026-06-01T00:00:00.000Z',
      endAt: '2028-05-31T00:00:00.000Z',
    });
  expect(created.status).toBe(201);
  const accepted = await request(app)
    .post('/leases/accept')
    .set('Authorization', `Bearer ${tenant}`)
    .send({ inviteToken: created.body.inviteToken });
  expect(accepted.status).toBe(200);
  return { leaseId: created.body.id as string, propertyId };
}

describe('CRM routes (통합)', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp(TEST_ENV);
  });

  it('임대인 GET /crm/overview → 본인 계약만, summary 필드 + 행 필드 포함', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-crm1');

    const r = await request(app)
      .get('/crm/overview')
      .set('Authorization', `Bearer ${landlord}`);
    expect(r.status).toBe(200);

    // summary 필드
    const s = r.body.summary;
    expect(s).toBeTruthy();
    expect(s).toHaveProperty('totalLeases');
    expect(s).toHaveProperty('activeLeases');
    expect(s).toHaveProperty('expiringSoon');
    expect(s).toHaveProperty('rentOverdue');
    expect(s).toHaveProperty('openMaintenance');
    expect(s.totalLeases).toBe(1);
    expect(s.activeLeases).toBe(1);

    // 본인 계약만 노출
    expect(r.body.leases).toHaveLength(1);
    const row = r.body.leases[0];
    expect(row.leaseId).toBe(leaseId);
    expect(row).toHaveProperty('expiryDday');
    expect(row).toHaveProperty('rentStatus');
    expect(row).toHaveProperty('openMaintenance');
    expect(row).toHaveProperty('settlementStatus');
  });

  it('임대인은 다른 임대인의 계약을 보지 못한다 (본인 것만)', async () => {
    const landlord1 = await login(app, ROLES.LANDLORD, 'hong');
    const tenant1 = await login(app, ROLES.TENANT, 'kim');
    await setupActiveLease(app, landlord1, tenant1, '물건1');

    const landlord2 = await login(app, ROLES.LANDLORD, 'park');
    const tenant2 = await login(app, ROLES.TENANT, 'choi');
    await setupActiveLease(app, landlord2, tenant2, '물건2');

    const r1 = await request(app)
      .get('/crm/overview')
      .set('Authorization', `Bearer ${landlord1}`);
    expect(r1.status).toBe(200);
    expect(r1.body.leases).toHaveLength(1);
    expect(r1.body.summary.totalLeases).toBe(1);
  });

  it('관리자 GET /crm/overview → 전체 계약', async () => {
    const landlord1 = await login(app, ROLES.LANDLORD, 'hong');
    const tenant1 = await login(app, ROLES.TENANT, 'kim');
    await setupActiveLease(app, landlord1, tenant1, '물건1');

    const landlord2 = await login(app, ROLES.LANDLORD, 'park');
    const tenant2 = await login(app, ROLES.TENANT, 'choi');
    await setupActiveLease(app, landlord2, tenant2, '물건2');

    const admin = await login(app, ROLES.ADMIN, 'ops');
    const r = await request(app)
      .get('/crm/overview')
      .set('Authorization', `Bearer ${admin}`);
    expect(r.status).toBe(200);
    expect(r.body.leases).toHaveLength(2);
    expect(r.body.summary.totalLeases).toBe(2);
  });

  it('CRM 행에 수선요청 카운트가 반영된다', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { propertyId } = await setupActiveLease(app, landlord, tenant, '주소-crm-maint');
    await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ propertyId, category: 'PLUMBING', title: '누수', description: '누수' });

    const r = await request(app)
      .get('/crm/overview')
      .set('Authorization', `Bearer ${landlord}`);
    expect(r.status).toBe(200);
    expect(r.body.leases[0].openMaintenance).toBe(1);
    expect(r.body.summary.openMaintenance).toBe(1);
  });

  it('RBAC: 임차인 → 403', async () => {
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const r = await request(app)
      .get('/crm/overview')
      .set('Authorization', `Bearer ${tenant}`);
    expect(r.status).toBe(403);
  });
});
