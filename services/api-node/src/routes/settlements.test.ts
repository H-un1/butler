import { describe, it, expect, beforeEach } from 'vitest';
import { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildApp } from '../app.js';
import type { Env } from '../config/env.js';

// ============================================================================
// 수선비 정산 + 양측 합의 통합 테스트 — buildApp 전체 앱 + dev-mock 로그인
// M1 흐름(물건→계약→accept) + 점검(MOVE_OUT) 셋업을 재사용한다.
// 정산 엔진은 미설정 시 로컬 룰 엔진(실제 계산)으로 동작.
// ============================================================================

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: '',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'settlements-route-test-secret-1234567890',
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

// MOVE_OUT 점검 생성 → 점검자 수락 → 항목 추가 → 제출. inspectionId 반환.
// items: 점검자가 기록한 권위 있는 등급·결함마킹.
async function setupInspection(
  app: Express,
  landlordToken: string,
  inspectorToken: string,
  inspectorId: string,
  propertyId: string,
  items: Array<{ area: string; checklistKey: string; grade: string; markedDefect?: boolean }>
): Promise<string> {
  const req1 = await request(app)
    .post('/inspections')
    .set('Authorization', `Bearer ${landlordToken}`)
    .send({
      propertyId,
      inspectorId,
      type: 'MOVE_OUT',
      scheduledAt: '2026-05-30T14:00:00.000Z',
    });
  expect(req1.status).toBe(201);
  const inspectionId = req1.body.id as string;

  const accept = await request(app)
    .post(`/inspections/${inspectionId}/accept`)
    .set('Authorization', `Bearer ${inspectorToken}`);
  expect(accept.status).toBe(200);

  for (const item of items) {
    const r = await request(app)
      .post(`/inspections/${inspectionId}/items`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send(item);
    expect(r.status).toBe(201);
  }

  const submit = await request(app)
    .post(`/inspections/${inspectionId}/submit`)
    .set('Authorization', `Bearer ${inspectorToken}`);
  expect(submit.status).toBe(200);
  return inspectionId;
}

// dev-mock 점검자의 user id를 얻는다 (자동배정/inspectorId 지정용).
async function inspectorUserId(app: Express, token: string): Promise<string> {
  const me = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
  expect(me.status).toBe(200);
  return me.body.id as string;
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

describe('Settlement routes (통합)', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp(TEST_ENV);
  });

  it('POST /settlements/compute (임대인) → 201 DRAFT + 룰 계산 + COMPUTED 이벤트', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소1');

    const r = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });

    expect(r.status).toBe(201);
    expect(r.body.status).toBe('DRAFT');
    expect(r.body.leaseId).toBe(leaseId);
    expect(r.body.tenantId).toBeTruthy();
    // 도배 F·100만·3년 → 임차인 35만 / 임대인 65만
    expect(r.body.tenantTotal).toBe(350_000);
    expect(r.body.landlordTotal).toBe(650_000);
    expect(r.body.totalCost).toBe(1_000_000);
    expect(r.body.lines).toHaveLength(1);
    expect(r.body.ruleVersion).toBeTruthy();
    expect(r.body.basis).toBeTruthy();

    // COMPUTED 이벤트가 이력에 기록됨
    const detail = await request(app)
      .get(`/settlements/${r.body.id}`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(detail.status).toBe(200);
    expect(detail.body.events.some((e: { type: string }) => e.type === 'COMPUTED')).toBe(true);
  });

  it('InspectionItem 참조: 점검 항목 등급·결함이 compute에 반영(임대인 입력을 덮어쓰기)', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const inspector = await login(app, ROLES.INSPECTOR, 'ins');
    const inspId = await inspectorUserId(app, inspector);
    const { leaseId, propertyId } = await setupActiveLease(app, landlord, tenant, '주소-inspref');

    // 점검자는 도배 항목을 A등급·결함없음(통상마모)으로 기록
    const inspectionId = await setupInspection(app, landlord, inspector, inspId, propertyId, [
      { area: '거실', checklistKey: 'living.wall', grade: 'A', markedDefect: false },
    ]);

    // 임대인은 같은 checklistKey를 F·결함마킹으로 보내 임차인 부담을 부풀리려 시도
    const r = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({
        leaseId,
        inspectionId,
        lines: [computeLine({ grade: 'F', markedDefect: true, repairCost: 1_000_000, yearsUsed: 0 })],
      });

    expect(r.status).toBe(201);
    // 점검 데이터(A·결함없음)가 권위 → 통상마모로 임차인 부담 0
    expect(r.body.lines[0].grade).toBe('A');
    expect(r.body.lines[0].markedDefect).toBe(false);
    expect(r.body.lines[0].eligible).toBe(false);
    expect(r.body.tenantTotal).toBe(0);
    expect(r.body.landlordTotal).toBe(1_000_000);
    expect(r.body.inspectionId).toBe(inspectionId);
  });

  it('합의 플로우: propose → dispute → 재propose → agree, AGREED 시 House Log CONTRACT append', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId, propertyId } = await setupActiveLease(app, landlord, tenant, '주소-flow');

    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });
    const id = created.body.id as string;

    // 임대인 제안 DRAFT → PROPOSED
    const p1 = await request(app)
      .post(`/settlements/${id}/propose`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({ note: '정산안 제안드립니다' });
    expect(p1.status).toBe(200);
    expect(p1.body.status).toBe('PROPOSED');

    // 임차인 이의 PROPOSED → DISPUTED (note 필수)
    const d1 = await request(app)
      .post(`/settlements/${id}/dispute`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ note: '도배는 통상마모로 봅니다' });
    expect(d1.status).toBe(200);
    expect(d1.body.status).toBe('DISPUTED');

    // 임대인 재제안 DISPUTED → PROPOSED
    const p2 = await request(app)
      .post(`/settlements/${id}/propose`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({ note: '재조정안입니다' });
    expect(p2.status).toBe(200);
    expect(p2.body.status).toBe('PROPOSED');

    // 임차인 합의 PROPOSED → AGREED
    const a1 = await request(app)
      .post(`/settlements/${id}/agree`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(a1.status).toBe(200);
    expect(a1.body.status).toBe('AGREED');

    // AGREED 시 House Log에 CONTRACT가 append (refId = settlementId)
    const log = await request(app)
      .get(`/properties/${propertyId}/house-log`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(log.status).toBe(200);
    const contract = log.body.find(
      (e: { type: string; refId: string }) => e.type === 'CONTRACT' && e.refId === id
    );
    expect(contract).toBeTruthy();

    // 이벤트 이력에 합의 흐름이 순서대로 남는다
    const detail = await request(app)
      .get(`/settlements/${id}`)
      .set('Authorization', `Bearer ${tenant}`);
    const types = detail.body.events.map((e: { type: string }) => e.type);
    expect(types).toContain('PROPOSED');
    expect(types).toContain('DISPUTED');
    expect(types).toContain('AGREED');
  });

  it('reject 경로: PROPOSED 상태에서 임차인 결렬 → REJECTED', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-reject');
    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });
    const id = created.body.id as string;

    await request(app)
      .post(`/settlements/${id}/propose`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({});

    const r = await request(app)
      .post(`/settlements/${id}/reject`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({ note: '합의 결렬' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('REJECTED');
  });

  it('잘못된 전이: DRAFT에서 agree → 409', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-bad1');
    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });

    const r = await request(app)
      .post(`/settlements/${created.body.id}/agree`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(r.status).toBe(409);
  });

  it('잘못된 전이: AGREED에서 propose → 409 (종결 상태)', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-bad2');
    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });
    const id = created.body.id as string;

    await request(app)
      .post(`/settlements/${id}/propose`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({});
    await request(app)
      .post(`/settlements/${id}/agree`)
      .set('Authorization', `Bearer ${tenant}`);

    // AGREED 종결 후 재제안 시도
    const r = await request(app)
      .post(`/settlements/${id}/propose`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({});
    expect(r.status).toBe(409);
  });

  it('RBAC: 임차인이 compute 시도 → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-rbac1');

    const r = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${tenant}`)
      .send({ leaseId, lines: [computeLine()] });
    expect(r.status).toBe(403);
  });

  it('RBAC: 타 임대인이 남의 계약 정산 산출 → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-rbac2');

    const other = await login(app, ROLES.LANDLORD, 'other');
    const r = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${other}`)
      .send({ leaseId, lines: [computeLine()] });
    expect([403, 404]).toContain(r.status);
  });

  it('RBAC: 무관한 유저가 GET /settlements/:id → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-rbac3');
    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });

    const stranger = await login(app, ROLES.TENANT, 'stranger');
    const r = await request(app)
      .get(`/settlements/${created.body.id}`)
      .set('Authorization', `Bearer ${stranger}`);
    expect(r.status).toBe(403);
  });

  it('RBAC: 임차인이 propose 시도 → 403', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-rbac4');
    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });

    const r = await request(app)
      .post(`/settlements/${created.body.id}/propose`)
      .set('Authorization', `Bearer ${tenant}`)
      .send({});
    expect(r.status).toBe(403);
  });

  it('보증금 자동공제 없음: 합의해도 lease.deposit 불변 + 응답에 보증금 차감 필드 없음', async () => {
    const landlord = await login(app, ROLES.LANDLORD, 'hong');
    const tenant = await login(app, ROLES.TENANT, 'kim');
    const { leaseId } = await setupActiveLease(app, landlord, tenant, '주소-deposit');

    const created = await request(app)
      .post('/settlements/compute')
      .set('Authorization', `Bearer ${landlord}`)
      .send({ leaseId, lines: [computeLine()] });
    const id = created.body.id as string;

    // 정산 응답에는 보증금 차감 관련 필드가 없어야 한다
    expect(created.body).not.toHaveProperty('depositDeduction');
    expect(created.body).not.toHaveProperty('deposit');

    await request(app)
      .post(`/settlements/${id}/propose`)
      .set('Authorization', `Bearer ${landlord}`)
      .send({});
    const agreed = await request(app)
      .post(`/settlements/${id}/agree`)
      .set('Authorization', `Bearer ${tenant}`);
    expect(agreed.status).toBe(200);

    // 합의 완료 후에도 계약의 보증금은 변하지 않는다
    const lease = await request(app)
      .get(`/leases/${leaseId}`)
      .set('Authorization', `Bearer ${landlord}`);
    expect(lease.status).toBe(200);
    expect(lease.body.deposit).toBe(10_000_000);
  });
});
