import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildHouseLogRouter } from './houseLog.js';
import { buildPropertiesRouter } from './properties.js';
import {
  makeInMemoryHouseLogRepository,
  type HouseLogRepository,
} from '../houseLog/repository.js';
import {
  makeInMemoryPropertyRepository,
  type PropertyRepository,
} from '../properties/repository.js';
import { signSession } from '../auth/jwt.js';
import type { Env } from '../config/env.js';

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'mysql://noop',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'houselog-test-secret-1234567890',
  JWT_EXPIRES_IN: '1h',
  ALLOW_DEV_AUTH_MOCK: false,
};

function tokenFor(sub: string, role: Role): string {
  return signSession({ sub, role, verified: true }, TEST_ENV.JWT_SECRET, '1h');
}

function buildApp(propertyRepo: PropertyRepository, houseLogRepo: HouseLogRepository): Express {
  const app = express();
  app.use(express.json());
  app.use('/properties', buildPropertiesRouter(TEST_ENV, { repo: propertyRepo }));
  app.use(
    '/properties/:propertyId/house-log',
    buildHouseLogRouter(TEST_ENV, { houseLogRepo, propertyRepo })
  );
  return app;
}

describe('GET /properties/:propertyId/house-log', () => {
  let propertyRepo: PropertyRepository;
  let houseLogRepo: HouseLogRepository;
  beforeEach(() => {
    propertyRepo = makeInMemoryPropertyRepository();
    houseLogRepo = makeInMemoryHouseLogRepository();
  });

  it('소유자만 본인 물건의 타임라인을 조회 — 최신순', async () => {
    const t = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const app = buildApp(propertyRepo, houseLogRepo);
    const created = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${t}`)
      .send({ address: '서울시 강서구' });
    const propertyId = created.body.id;

    await houseLogRepo.append({
      propertyId,
      type: 'INSPECTION',
      title: '정기점검 1',
      occurredAt: new Date('2026-05-01'),
    });
    await houseLogRepo.append({
      propertyId,
      type: 'REPAIR',
      title: '욕실 수리',
      occurredAt: new Date('2026-05-15'),
    });

    const r = await request(app)
      .get(`/properties/${propertyId}/house-log`)
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(r.body[0].title).toBe('욕실 수리');
    expect(r.body[1].title).toBe('정기점검 1');
  });

  it('다른 임대인이 타임라인을 조회하면 403', async () => {
    const ta = tokenFor('usr_lan_A', ROLES.LANDLORD);
    const tb = tokenFor('usr_lan_B', ROLES.LANDLORD);
    const app = buildApp(propertyRepo, houseLogRepo);
    const created = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${ta}`)
      .send({ address: 'A주소' });
    const r = await request(app)
      .get(`/properties/${created.body.id}/house-log`)
      .set('Authorization', `Bearer ${tb}`);
    expect(r.status).toBe(403);
  });

  it('존재하지 않는 물건은 404', async () => {
    const t = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const app = buildApp(propertyRepo, houseLogRepo);
    const r = await request(app)
      .get('/properties/prop_nope/house-log')
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(404);
  });

  it('INSPECTOR는 타임라인 접근 불가 (403)', async () => {
    const tl = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const ti = tokenFor('usr_ins_1', ROLES.INSPECTOR);
    const app = buildApp(propertyRepo, houseLogRepo);
    const created = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tl}`)
      .send({ address: '주소' });
    const r = await request(app)
      .get(`/properties/${created.body.id}/house-log`)
      .set('Authorization', `Bearer ${ti}`);
    expect(r.status).toBe(403);
  });
});
