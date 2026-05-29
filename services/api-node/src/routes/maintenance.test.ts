import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// 수선요청 이슈보드 라우트 통합 테스트 — buildApp 전체 앱 + dev-mock 로그인

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'maintenance-route-test-secret-1234567890',
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

// 임대인 물건 생성 + 임차인 ACTIVE 임대차 연결까지 한번에 셋업
async function setupActiveLease(
  app: Express,
  landlord: string,
  tenant: string,
  address: string
): Promise<string> {
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
  return propertyId;
}

function reqBody(propertyId: string) {
  return {
    propertyId,
    category: 'PLUMBING' as const,
    title: '주방 누수',
    description: '싱크대 아래 물이 샘',
  };
}

describe('Maintenance routes (통합)', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp(TEST_ENV);
  });

  it('ACTIVE 임대차 임차인이 수선요청 생성 → 201 + House Log REPAIR append', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const propertyId = await setupActiveLease(app, landlord, tenant, '서울시 강서구 화곡로 12');

    const r = await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send(reqBody(propertyId));
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('OPEN');
    expect(r.body.requesterId).toBeTruthy();

    // House Log에 REPAIR 항목이 기록되었는지 임대인이 확인
    const log = await request(app)
      .get(`/properties/${propertyId}/house-log`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(log.status).toBe(200);
    const repair = log.body.find((e: { type: string; refId: string }) => e.type === 'REPAIR');
    expect(repair).toBeTruthy();
    expect(repair.refId).toBe(r.body.id);
  });

  it('ACTIVE 임대차 없는 임차인이 수선요청 → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const propertyId = await createProperty(app, landlord, '주소1');
    // 임차인은 연결된 계약이 없음
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const r = await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send(reqBody(propertyId));
    expect(r.status).toBe(403);
  });

  it('GET /maintenance/mine — 임차인 본인 요청만', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const propertyId = await setupActiveLease(app, landlord, tenant, '주소1');
    await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send(reqBody(propertyId));

    const r = await request(app)
      .get('/maintenance/mine')
      .set('Authorization', `Bearer ${tenant}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });

  it('GET /maintenance/board — 임대인은 본인 물건만, 관리자는 전체', async () => {
    // 임대인1 + 임차인1
    const landlord1 = await login(app, ROLES.LANDLORD, 'hong');
    const tenant1 = await login(app, ROLES.TENANT, 'kim');
    const prop1 = await setupActiveLease(app, landlord1, tenant1, '물건1');
    await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant1}`)
      .send(reqBody(prop1));

    // 임대인2 + 임차인2
    const landlord2 = await login(app, ROLES.LANDLORD, 'park');
    const tenant2 = await login(app, ROLES.TENANT, 'choi');
    const prop2 = await setupActiveLease(app, landlord2, tenant2, '물건2');
    await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant2}`)
      .send(reqBody(prop2));

    // 임대인1 보드 → 본인 물건 요청 1개
    const board1 = await request(app)
      .get('/maintenance/board')
      .set('Authorization', `Bearer ${landlord1}`);
    expect(board1.status).toBe(200);
    expect(board1.body).toHaveLength(1);
    expect(board1.body[0].propertyId).toBe(prop1);

    // 관리자 보드 → 전체 2개
    const admin = await login(app, ROLES.ADMIN, 'ops');
    const adminBoard = await request(app)
      .get('/maintenance/board')
      .set('Authorization', `Bearer ${admin}`);
    expect(adminBoard.status).toBe(200);
    expect(adminBoard.body).toHaveLength(2);
  });

  it('GET /maintenance/:id — 코멘트 포함, 권한 없는 타인 → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const propertyId = await setupActiveLease(app, landlord, tenant, '주소1');
    const created = await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send(reqBody(propertyId));
    const id = created.body.id;

    // 요청자(임차인)는 상세 + 코멘트(최초 접수 시스템 코멘트) 확인
    const detail = await request(app)
      .get(`/maintenance/${id}`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.comments)).toBe(true);
    expect(detail.body.comments.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.comments.some((c: { systemEvent: boolean }) => c.systemEvent)).toBe(true);

    // 무관한 타인 → 403
    const stranger = await login(app, ROLES.LANDLORD, 'stranger');
    const forbidden = await request(app)
      .get(`/maintenance/${id}`)
      .set('Authorization', `Bearer ${stranger}`);
    expect(forbidden.status).toBe(403);
  });

  it('상태전이: 임대인(소유) OPEN→IN_PROGRESS→RESOLVED, 임차인 요청자 RESOLVED→CLOSED', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const propertyId = await setupActiveLease(app, landlord, tenant, '주소1');
    const created = await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send(reqBody(propertyId));
    const id = created.body.id;

    const s1 = await request(app)
      .post(`/maintenance/${id}/status`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({ status: 'IN_PROGRESS' });
    expect(s1.status).toBe(200);
    expect(s1.body.status).toBe('IN_PROGRESS');

    const s2 = await request(app)
      .post(`/maintenance/${id}/status`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({ status: 'RESOLVED' });
    expect(s2.status).toBe(200);
    expect(s2.body.status).toBe('RESOLVED');

    // 임차인 요청자: RESOLVED → CLOSED
    const s3 = await request(app)
      .post(`/maintenance/${id}/status`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ status: 'CLOSED' });
    expect(s3.status).toBe(200);
    expect(s3.body.status).toBe('CLOSED');
  });

  it('상태전이: 임차인이 OPEN→IN_PROGRESS 시도 → 409/403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const propertyId = await setupActiveLease(app, landlord, tenant, '주소1');
    const created = await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send(reqBody(propertyId));

    // OPEN 상태에서 임차인은 전이 권한 없음 (TENANT_ALLOWED는 RESOLVED에서만)
    const r = await request(app)
      .post(`/maintenance/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ status: 'IN_PROGRESS' });
    expect([403, 409]).toContain(r.status);
  });

  it('상태전이: 잘못된 전이(OPEN→RESOLVED) → 409', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const propertyId = await setupActiveLease(app, landlord, tenant, '주소1');
    const created = await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send(reqBody(propertyId));

    // 소유 임대인이라도 OPEN→RESOLVED는 전이표상 불가
    const r = await request(app)
      .post(`/maintenance/${created.body.id}/status`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({ status: 'RESOLVED' });
    expect(r.status).toBe(409);
  });

  it('코멘트: 요청자/소유 임대인/관리자 작성 가능, 무관한 타인 → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const propertyId = await setupActiveLease(app, landlord, tenant, '주소1');
    const created = await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send(reqBody(propertyId));
    const id = created.body.id;

    // 요청자(임차인)
    const c1 = await request(app)
      .post(`/maintenance/${id}/comments`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ body: '임차인 코멘트' });
    expect(c1.status).toBe(201);

    // 소유 임대인
    const c2 = await request(app)
      .post(`/maintenance/${id}/comments`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({ body: '임대인 코멘트' });
    expect(c2.status).toBe(201);

    // 관리자
    const admin = await login(app, ROLES.ADMIN, 'ops');
    const c3 = await request(app)
      .post(`/maintenance/${id}/comments`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ body: '관리자 코멘트' });
    expect(c3.status).toBe(201);

    // 무관한 타인
    const stranger = await login(app, ROLES.LANDLORD, 'stranger');
    const c4 = await request(app)
      .post(`/maintenance/${id}/comments`)
      .set('Authorization', `Bearer ${stranger}`)
      .send({ body: '훼방' });
    expect(c4.status).toBe(403);
  });

  it('상태전이 시 시스템 코멘트가 이력으로 남는다', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const propertyId = await setupActiveLease(app, landlord, tenant, '주소1');
    const created = await request(app)
      .post('/maintenance')
      .set('Authorization', `Bearer ${tenant}`)
      .send(reqBody(propertyId));
    const id = created.body.id;

    await request(app)
      .post(`/maintenance/${id}/status`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({ status: 'IN_PROGRESS', comment: '기사 배정 완료' });

    const detail = await request(app)
      .get(`/maintenance/${id}`)
      .set('Authorization', `Bearer ${landlord}`);
    // 최초 접수 시스템 코멘트 + 상태변경 시스템 코멘트
    const systemComments = detail.body.comments.filter(
      (c: { systemEvent: boolean }) => c.systemEvent
    );
    expect(systemComments.length).toBeGreaterThanOrEqual(2);
    expect(
      systemComments.some((c: { body: string }) => c.body.includes('OPEN → IN_PROGRESS'))
    ).toBe(true);
  });
});
