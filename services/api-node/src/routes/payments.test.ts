import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// ============================================================================
// (mock)PG 결제 통합 테스트 — buildApp 전체 앱 + dev-mock 로그인.
// ⚠️ mock 게이트웨이만 사용(실 PG 호출 0). mockChargeId가 "mock_pay_"로 시작하는지로
//    실 결제가 일어나지 않음을 검증한다. 보증금 자동공제도 없음을 확인한다.
// ============================================================================

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'payments-route-test-secret-1234567890',
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

// 임대인 물건 생성 + 임차인 ACTIVE 연결까지 셋업 (M1 흐름 재사용)
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

function computeLine(over: Record<string, unknown> = {}) {
  return {
    checklistKey: 'living.wall',
    area: '거실',
    category: 'WALLPAPER',
    grade: 'F',
    markedDefect: true,
    repairCost: 1_000_000,
    yearsUsed: 3,
    ...over,
  };
}

// 정산을 AGREED 상태까지 만든다 (임대인 compute→propose, 임차인 agree). settlementId 반환.
async function setupAgreedSettlement(
  app: Express,
  landlord: string,
  tenant: string,
  leaseId: string
): Promise<string> {
  const created = await request(app)
    .post('/settlements/compute')
    .set('Authorization', `Bearer ${landlord}`)
    .send({ leaseId, lines: [computeLine()] });
  expect(created.status).toBe(201);
  const id = created.body.id as string;

  const proposed = await request(app)
    .post(`/settlements/${id}/propose`)
    .set('Authorization', `Bearer ${landlord}`)
    .send({});
  expect(proposed.status).toBe(200);

  const agreed = await request(app)
    .post(`/settlements/${id}/agree`)
    .set('Authorization', `Bearer ${tenant}`);
  expect(agreed.status).toBe(200);
  expect(agreed.body.status).toBe('AGREED');
  return id;
}

describe('Payment routes (통합, mock PG)', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp(TEST_ENV);
  });

  // === 정산금 결제 ===========================================================
  it('AGREED 정산을 임차인이 결제 → 201, PAID, provider "mock", mockChargeId "mock_pay_" 시작', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-pay1');
    const settlementId = await setupAgreedSettlement(app, landlord, tenant, leaseId);

    const r = await request(app)
      .post(`/payments/settlement/${settlementId}`)
      .set('Authorization', `Bearer ${tenant}`);

    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PAID');
    expect(r.body.provider).toBe('mock');
    expect(r.body.type).toBe('SETTLEMENT');
    // 실 PG 호출 0 검증 — mock 표식
    expect(r.body.mockChargeId).toMatch(/^mock_pay_/);
    expect(r.body.amount).toBe(350_000); // 도배 F·100만·3년 → 임차인 35만
  });

  it('정산이 AGREED가 아닐 때 결제 시도 → 409', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-pay2');

    // compute만 한 DRAFT 상태
    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });
    expect(created.status).toBe(201);

    const r = await request(app)
      .post(`/payments/settlement/${created.body.id}`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(r.status).toBe(409);
  });

  it('중복 결제 → 409', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-pay3');
    const settlementId = await setupAgreedSettlement(app, landlord, tenant, leaseId);

    const first = await request(app)
      .post(`/payments/settlement/${settlementId}`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/payments/settlement/${settlementId}`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(second.status).toBe(409);
  });

  it('RBAC: 임대인이 정산금 결제 시도 → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-pay4');
    const settlementId = await setupAgreedSettlement(app, landlord, tenant, leaseId);

    const r = await request(app)
      .post(`/payments/settlement/${settlementId}`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(r.status).toBe(403);
  });

  it('RBAC: 타 임차인이 남의 정산금 결제 시도 → 403/404', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-pay5');
    const settlementId = await setupAgreedSettlement(app, landlord, tenant, leaseId);

    const stranger = await login(app, ROLES.TENANT, 'stranger');
    const r = await request(app)
      .post(`/payments/settlement/${settlementId}`)
      .set('Authorization', `Bearer ${stranger}`);
    expect([403, 404]).toContain(r.status);
  });

  // === 월세 결제 =============================================================
  it('월세 결제 POST /payments/rent → 201, GET /payments/mine에 반영', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-rent');

    const r = await request(app)
      .post('/payments/rent')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ leaseId, period: '2026-05' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PAID');
    expect(r.body.type).toBe('RENT');
    expect(r.body.amount).toBe(500_000);
    expect(r.body.mockChargeId).toMatch(/^mock_pay_/);

    const mine = await request(app)
      .get('/payments/mine')
      .set('Authorization', `Bearer ${tenant}`);
    expect(mine.status).toBe(200);
    expect(mine.body.some((p: { id: string }) => p.id === r.body.id)).toBe(true);
  });

  // === 보증금 자동공제 없음 ===================================================
  it('보증금 자동공제 없음: 정산금 결제 후에도 lease.deposit 불변', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-deposit');
    const settlementId = await setupAgreedSettlement(app, landlord, tenant, leaseId);

    const paid = await request(app)
      .post(`/payments/settlement/${settlementId}`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(paid.status).toBe(201);

    // 결제 후에도 계약의 보증금은 변하지 않는다 (보증금에서 자동 차감하지 않음)
    const lease = await request(app)
      .get(`/leases/${leaseId}`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(lease.status).toBe(200);
    expect(lease.body.deposit).toBe(10_000_000);
  });

  // === 구독료 결제 ===========================================================
  it('활성 구독이 없으면 구독료 결제 → 404', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const r = await request(app)
      .post('/payments/subscription')
      .set('Authorization', `Bearer ${landlord}`);
    expect(r.status).toBe(404);
  });

  it('구독 생성 후 구독료 결제 → 201, mock 표식', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    // 구독 자격: 보유 물건 1채 이상
    await createProperty(app, landlord, '구독-물건');

    const sub = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ billingDate: 5 });
    expect(sub.status).toBe(201);

    const r = await request(app)
      .post('/payments/subscription')
      .set('Authorization', `Bearer ${landlord}`);
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PAID');
    expect(r.body.type).toBe('SUBSCRIPTION');
    expect(r.body.mockChargeId).toMatch(/^mock_pay_/);
  });
});
