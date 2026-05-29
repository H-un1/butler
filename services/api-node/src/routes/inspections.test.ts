import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildInspectionsRouter } from './inspections.js';
import { buildPropertiesRouter } from './properties.js';
import {
  makeInMemoryInspectionRepository,
  type InspectionRepository,
} from '../inspection/repository.js';
import {
  makeInMemoryPropertyRepository,
  type PropertyRepository,
} from '../properties/repository.js';
import {
  makeInMemoryHouseLogRepository,
  type HouseLogRepository,
} from '../houseLog/repository.js';
import { makeMockReportPdfClient } from '../inspection/reportPipeline.js';
import { signSession } from '../auth/jwt.js';
import {
  makeInMemoryUserStore,
  type UserStore,
} from '../auth/userStore.js';
import type { Env } from '../config/env.js';

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'mysql://noop',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'inspections-test-secret-1234567890',
  JWT_EXPIRES_IN: '1h',
  ALLOW_DEV_AUTH_MOCK: false,
};

function tokenFor(sub: string, role: Role): string {
  return signSession({ sub, role, verified: true }, TEST_ENV.JWT_SECRET, '1h');
}

function build(
  propertyRepo: PropertyRepository,
  inspectionRepo: InspectionRepository,
  houseLogRepo: HouseLogRepository
): Express {
  const app = express();
  app.use(express.json());
  app.use('/properties', buildPropertiesRouter(TEST_ENV, { repo: propertyRepo }));
  app.use(
    '/inspections',
    buildInspectionsRouter(TEST_ENV, {
      inspectionRepo,
      propertyRepo,
      houseLogRepo,
      pdfClient: makeMockReportPdfClient(),
    })
  );
  return app;
}

describe('Inspection 의뢰 → 수락 → 제출 → 리포트 → HouseLog', () => {
  let propertyRepo: PropertyRepository;
  let inspectionRepo: InspectionRepository;
  let houseLogRepo: HouseLogRepository;

  beforeEach(() => {
    propertyRepo = makeInMemoryPropertyRepository();
    inspectionRepo = makeInMemoryInspectionRepository();
    houseLogRepo = makeInMemoryHouseLogRepository();
  });

  it('전체 흐름: 임대인 의뢰 → 점검자 수락·항목 추가·제출 → PDF → HouseLog 자동 기록', async () => {
    const tLan = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const tIns = tokenFor('usr_ins_1', ROLES.INSPECTOR);
    const app = build(propertyRepo, inspectionRepo, houseLogRepo);

    // 1. 임대인 물건 등록
    const created = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tLan}`)
      .send({ address: '서울시 강서구 화곡로 12' });
    const propertyId = created.body.id;

    // 2. 임대인 점검 의뢰
    const req1 = await request(app)
      .post('/inspections')
      .set('Authorization', `Bearer ${tLan}`)
      .send({
        propertyId,
        inspectorId: 'usr_ins_1',
        type: 'REGULAR',
        scheduledAt: '2026-05-30T14:00:00.000Z',
      });
    expect(req1.status).toBe(201);
    const inspectionId = req1.body.id;

    // 3. 점검자가 본인 의뢰 목록에서 확인
    const mine = await request(app)
      .get('/inspections/mine')
      .set('Authorization', `Bearer ${tIns}`);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].id).toBe(inspectionId);

    // 4. 점검자 수락
    const accept = await request(app)
      .post(`/inspections/${inspectionId}/accept`)
      .set('Authorization', `Bearer ${tIns}`);
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe('IN_PROGRESS');

    // 5. 항목 2개 추가
    await request(app)
      .post(`/inspections/${inspectionId}/items`)
      .set('Authorization', `Bearer ${tIns}`)
      .send({ area: '욕실', checklistKey: 'bathroom.leak', grade: 'B', markedDefect: true });
    await request(app)
      .post(`/inspections/${inspectionId}/items`)
      .set('Authorization', `Bearer ${tIns}`)
      .send({ area: '거실', checklistKey: 'living.floor', grade: 'A' });

    // 6. 제출 — PDF 생성 + HouseLog 자동 기록
    const submit = await request(app)
      .post(`/inspections/${inspectionId}/submit`)
      .set('Authorization', `Bearer ${tIns}`);
    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe('done');
    expect(submit.body.pdfUrl).toMatch(/^mock:\/\/reports\//);

    // 7. House Log에 자동 기록되어야 함
    const logs = await houseLogRepo.listByProperty(propertyId);
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('INSPECTION');
    expect(logs[0].refId).toMatch(/^rpt_/);

    // 8. 점검 상세에서 report 확인
    const detail = await request(app)
      .get(`/inspections/${inspectionId}`)
      .set('Authorization', `Bearer ${tIns}`);
    expect(detail.body.status).toBe('DONE');
    expect(detail.body.report.pdfUrl).toMatch(/^mock:\/\/reports\//);
    expect(detail.body.items).toHaveLength(2);
  });

  it('점검 의뢰 RBAC: INSPECTOR가 의뢰하면 403', async () => {
    const tIns = tokenFor('usr_ins_1', ROLES.INSPECTOR);
    const app = build(propertyRepo, inspectionRepo, houseLogRepo);
    const r = await request(app)
      .post('/inspections')
      .set('Authorization', `Bearer ${tIns}`)
      .send({
        propertyId: 'prop_x',
        inspectorId: 'usr_ins_1',
        type: 'REGULAR',
        scheduledAt: '2026-05-30T14:00:00.000Z',
      });
    expect(r.status).toBe(403);
  });

  it('다른 점검자가 수락 시도하면 403', async () => {
    const tLan = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const tOther = tokenFor('usr_ins_other', ROLES.INSPECTOR);
    const app = build(propertyRepo, inspectionRepo, houseLogRepo);
    const prop = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tLan}`)
      .send({ address: '주소' });
    const created = await request(app)
      .post('/inspections')
      .set('Authorization', `Bearer ${tLan}`)
      .send({
        propertyId: prop.body.id,
        inspectorId: 'usr_ins_1',
        type: 'REGULAR',
        scheduledAt: '2026-05-30T14:00:00.000Z',
      });

    const r = await request(app)
      .post(`/inspections/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${tOther}`);
    expect(r.status).toBe(403);
  });

  it('IN_PROGRESS 아닐 때 항목 추가 시도 409', async () => {
    const tLan = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const tIns = tokenFor('usr_ins_1', ROLES.INSPECTOR);
    const app = build(propertyRepo, inspectionRepo, houseLogRepo);
    const prop = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tLan}`)
      .send({ address: '주소' });
    const insp = await request(app)
      .post('/inspections')
      .set('Authorization', `Bearer ${tLan}`)
      .send({
        propertyId: prop.body.id,
        inspectorId: 'usr_ins_1',
        type: 'REGULAR',
        scheduledAt: '2026-05-30T14:00:00.000Z',
      });

    // 아직 REQUESTED 상태 — 수락 안 함
    const r = await request(app)
      .post(`/inspections/${insp.body.id}/items`)
      .set('Authorization', `Bearer ${tIns}`)
      .send({ area: 'X', checklistKey: 'x.y', grade: 'A' });
    expect(r.status).toBe(409);
  });

  it('임대인이 inspectorId 없이 의뢰하면 자동 배정 (등록된 INSPECTOR 1명일 때)', async () => {
    const tLan = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const userStore: UserStore = makeInMemoryUserStore();
    // INSPECTOR 1명 미리 등록
    const inspector = await userStore.createWithRole({
      role: ROLES.INSPECTOR,
      name: '김점검',
      phone: null,
      email: null,
      authProvider: 'dev-mock',
      providerUserId: 'mock-ins-1',
    });

    const app = express();
    app.use(express.json());
    app.use('/properties', buildPropertiesRouter(TEST_ENV, { repo: propertyRepo }));
    app.use(
      '/inspections',
      buildInspectionsRouter(TEST_ENV, {
        inspectionRepo,
        propertyRepo,
        houseLogRepo,
        pdfClient: makeMockReportPdfClient(),
        userStore,
      })
    );

    const prop = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tLan}`)
      .send({ address: '서울시 강서구 화곡로 100' });

    const r = await request(app)
      .post('/inspections')
      .set('Authorization', `Bearer ${tLan}`)
      .send({
        propertyId: prop.body.id,
        // inspectorId 의도적으로 생략 → 자동 배정 기대
        type: 'REGULAR',
        scheduledAt: '2026-05-30T14:00:00.000Z',
      });
    expect(r.status).toBe(201);
    const created = await inspectionRepo.getById(r.body.id);
    expect(created?.inspectorId).toBe(inspector.id);
  });

  it('INSPECTOR 0명일 때 자동 배정 시도 → 409', async () => {
    const tLan = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const userStore: UserStore = makeInMemoryUserStore();
    // INSPECTOR 0명 — 아무도 등록 안 함

    const app = express();
    app.use(express.json());
    app.use('/properties', buildPropertiesRouter(TEST_ENV, { repo: propertyRepo }));
    app.use(
      '/inspections',
      buildInspectionsRouter(TEST_ENV, {
        inspectionRepo,
        propertyRepo,
        houseLogRepo,
        pdfClient: makeMockReportPdfClient(),
        userStore,
      })
    );

    const prop = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tLan}`)
      .send({ address: '서울시 강서구 화곡로 200' });

    const r = await request(app)
      .post('/inspections')
      .set('Authorization', `Bearer ${tLan}`)
      .send({
        propertyId: prop.body.id,
        type: 'REGULAR',
        scheduledAt: '2026-05-30T14:00:00.000Z',
      });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('점검자가 등록되지 않았습니다');
  });
});
