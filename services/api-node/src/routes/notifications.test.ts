import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// ============================================================================
// 알림센터 + 자동알림 scan 통합 테스트 — buildApp 전체 앱 + dev-mock 로그인.
// 정산·수선·결제 흐름에 배선된 알림 emit과, scan(계약만료 D-Day) 멱등성을 검증한다.
// 날짜 의존이 큰 월세연체는 rules.test.ts에서 Date 주입으로 검증하므로,
// 여기서는 날짜가 안정적인 CONTRACT_EXPIRY 위주로 scan을 검증한다.
// ============================================================================

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'notifications-route-test-secret-1234567890',
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

// 임대인 물건 생성 + 임차인 ACTIVE 연결. endAtDaysFromNow로 만료일을 now 기준 상대 지정.
async function setupActiveLease(
  app: Express,
  landlord: string,
  tenant: string,
  address: string,
  endAtDaysFromNow = 365 * 2
): Promise<LeaseSetup> {
  const propertyId = await createProperty(app, landlord, address);
  const now = Date.now();
  const created = await request(app)
    .post('/leases')
    .set('Authorization', `Bearer ${landlord}`)
    .send({
      propertyId,
      deposit: 10_000_000,
      rent: 500_000,
      startAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      endAt: new Date(now + endAtDaysFromNow * 24 * 60 * 60 * 1000).toISOString(),
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

type Notif = { id: string; type: string; channel: string; sentMock: boolean; read: boolean };

async function myNotifications(app: Express, token: string): Promise<Notif[]> {
  const r = await request(app)
    .get('/notifications/mine')
    .set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  return r.body as Notif[];
}

describe('Notification routes (통합)', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp(TEST_ENV);
  });

  it('수선요청 생성 시 임대인에게 MAINTENANCE 알림이 생긴다', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { propertyId } = await setupActiveLease(app, landlord, tenant, '주소-ntf-maint');

    const m = await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ propertyId, category: 'PLUMBING', title: '누수', description: '싱크대 누수' });
    expect(m.status).toBe(201);

    const list = await myNotifications(app, landlord);
    expect(list.some((n) => n.type === 'MAINTENANCE')).toBe(true);
  });

  it('정산 propose 시 임차인에게 SETTLEMENT 알림이 생긴다', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-ntf-set');

    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });
    expect(created.status).toBe(201);
    const proposed = await request(app)
      .post(`/settlements/${created.body.id}/propose`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({});
    expect(proposed.status).toBe(200);

    const list = await myNotifications(app, tenant);
    expect(list.some((n) => n.type === 'SETTLEMENT')).toBe(true);
  });

  it('월세 결제 시 임대인에게 PAYMENT 알림이 생긴다', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-ntf-rent');

    const r = await request(app)
      .post('/payments/rent')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ leaseId, period: '2026-05' });
    expect(r.status).toBe(201);

    const list = await myNotifications(app, landlord);
    expect(list.some((n) => n.type === 'PAYMENT')).toBe(true);
  });

  it('정산금 결제 시 임차인·임대인에게 PAYMENT 알림이 생긴다', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-ntf-setpay');

    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });
    await request(app)
      .post(`/settlements/${created.body.id}/propose`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({});
    await request(app)
      .post(`/settlements/${created.body.id}/agree`)
      .set('Authorization', `Bearer ${tenant}`);

    const paid = await request(app)
      .post(`/payments/settlement/${created.body.id}`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(paid.status).toBe(201);

    expect((await myNotifications(app, tenant)).some((n) => n.type === 'PAYMENT')).toBe(true);
    expect((await myNotifications(app, landlord)).some((n) => n.type === 'PAYMENT')).toBe(true);
  });

  it('unread-count / :id/read / read-all 동작', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { propertyId } = await setupActiveLease(app, landlord, tenant, '주소-ntf-read');
    // 알림 2건 생성 (수선요청 2개)
    for (const t of ['누수1', '누수2']) {
      await request(app)
        .post('/maintenance')
        .set('Authorization', `Bearer ${tenant}`)
        .send({ propertyId, category: 'PLUMBING', title: t, description: t });
    }

    const before = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${landlord}`);
    expect(before.status).toBe(200);
    expect(before.body.count).toBeGreaterThanOrEqual(2);

    // 한 건 읽음 처리
    const list = await myNotifications(app, landlord);
    const readOne = await request(app)
      .post(`/notifications/${list[0].id}/read`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(readOne.status).toBe(200);
    expect(readOne.body.read).toBe(true);

    const afterOne = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${landlord}`);
    expect(afterOne.body.count).toBe(before.body.count - 1);

    // 전체 읽음
    const all = await request(app)
      .post('/notifications/read-all')
      .set('Authorization', `Bearer ${landlord}`);
    expect(all.status).toBe(200);
    const afterAll = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${landlord}`);
    expect(afterAll.body.count).toBe(0);
  });

  it('남의 알림 읽음 처리 시도 → 404', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { propertyId } = await setupActiveLease(app, landlord, tenant, '주소-ntf-other');
    await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ propertyId, category: 'PLUMBING', title: 'x', description: 'x' });

    const landlordList = await myNotifications(app, landlord);
    // 임차인이 임대인의 알림 id로 읽음 시도 → 본인 것이 아니므로 404
    const r = await request(app)
      .post(`/notifications/${landlordList[0].id}/read`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(r.status).toBe(404);
  });

  it('POST /notifications/scan: 만료 임박 계약 → CONTRACT_EXPIRY created>0, 재scan 멱등(0)', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    // 만료 10일 전 계약
    await setupActiveLease(app, landlord, tenant, '주소-ntf-scan', 10);

    const scan1 = await request(app)
      .post('/notifications/scan')
      .set('Authorization', `Bearer ${landlord}`);
    expect(scan1.status).toBe(200);
    expect(scan1.body.created).toBeGreaterThan(0);

    // 임대인에게 CONTRACT_EXPIRY 알림이 적재됨
    const list = await myNotifications(app, landlord);
    expect(list.some((n) => n.type === 'CONTRACT_EXPIRY')).toBe(true);

    // 재scan 시 동일 type+refId는 건너뛰어 멱등 (created 0)
    const scan2 = await request(app)
      .post('/notifications/scan')
      .set('Authorization', `Bearer ${landlord}`);
    expect(scan2.status).toBe(200);
    expect(scan2.body.created).toBe(0);
  });

  it('RBAC: 임차인이 scan 시도 → 403', async () => {
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const r = await request(app)
      .post('/notifications/scan')
      .set('Authorization', `Bearer ${tenant}`);
    expect(r.status).toBe(403);
  });

  it('알림 sentMock: IN_APP 알림은 실 발송이 아니므로 sentMock=false', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { propertyId } = await setupActiveLease(app, landlord, tenant, '주소-ntf-mock');
    await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ propertyId, category: 'PLUMBING', title: 'x', description: 'x' });

    const list = await myNotifications(app, landlord);
    expect(list.length).toBeGreaterThan(0);
    // IN_APP 채널이며 sentMock은 false (실 카카오/SMS 발송 아님)
    expect(list.every((n) => n.channel === 'IN_APP')).toBe(true);
    expect(list.every((n) => n.sentMock === false)).toBe(true);
  });
});
