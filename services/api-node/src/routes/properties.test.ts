import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildPropertiesRouter } from './properties.js';
import { makeInMemoryPropertyRepository } from '../properties/repository.js';
import { signSession } from '../auth/jwt.js';
import type { Env } from '../config/env.js';

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'mysql://noop',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'properties-test-secret-1234567890',
  JWT_EXPIRES_IN: '1h',
  ALLOW_DEV_AUTH_MOCK: false,
};

function tokenFor(sub: string, role: Role): string {
  return signSession({ sub, role, verified: true }, TEST_ENV.JWT_SECRET, '1h');
}

function build(): Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/properties',
    buildPropertiesRouter(TEST_ENV, { repo: makeInMemoryPropertyRepository() })
  );
  return app;
}

describe('POST /properties', () => {
  let app: Express;
  beforeEach(() => {
    app = build();
  });

  it('LANDLORD 등록 성공', async () => {
    const r = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tokenFor('usr_lan_1', ROLES.LANDLORD)}`)
      .send({
        address: '서울시 강서구 화곡로 12',
        complexName: '항공아파트',
        dong: '101',
        ho: '1203',
      });
    expect(r.status).toBe(201);
    expect(r.body.id).toMatch(/^prop_/);
    expect(r.body.address).toBe('서울시 강서구 화곡로 12');
  });

  it('주소 누락 시 400', async () => {
    const r = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tokenFor('usr_lan_1', ROLES.LANDLORD)}`)
      .send({ complexName: '항공' });
    expect(r.status).toBe(400);
  });

  it('ADMIN role 403 — 임대인 전용 endpoint', async () => {
    const r = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tokenFor('usr_adm', ROLES.ADMIN)}`)
      .send({ address: '주소' });
    expect(r.status).toBe(403);
  });

  it('INSPECTOR role 403', async () => {
    const r = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${tokenFor('usr_ins', ROLES.INSPECTOR)}`)
      .send({ address: '주소' });
    expect(r.status).toBe(403);
  });

  it('인증 없음 401', async () => {
    const r = await request(app).post('/properties').send({ address: '주소' });
    expect(r.status).toBe(401);
  });
});

describe('GET /properties', () => {
  it('본인 물건만 목록에 반환', async () => {
    const app = build();
    const t1 = tokenFor('usr_lan_A', ROLES.LANDLORD);
    const t2 = tokenFor('usr_lan_B', ROLES.LANDLORD);

    await request(app).post('/properties').set('Authorization', `Bearer ${t1}`).send({ address: 'A주소' });
    await request(app).post('/properties').set('Authorization', `Bearer ${t1}`).send({ address: 'A주소2' });
    await request(app).post('/properties').set('Authorization', `Bearer ${t2}`).send({ address: 'B주소' });

    const r1 = await request(app).get('/properties').set('Authorization', `Bearer ${t1}`);
    expect(r1.status).toBe(200);
    expect(r1.body).toHaveLength(2);
    expect(r1.body.every((p: { address: string }) => p.address.startsWith('A'))).toBe(true);

    const r2 = await request(app).get('/properties').set('Authorization', `Bearer ${t2}`);
    expect(r2.body).toHaveLength(1);
    expect(r2.body[0].address).toBe('B주소');
  });
});

describe('GET /properties/:id — 타인 물건 접근 차단', () => {
  it('다른 임대인이 GET 시 403 (RBAC 위반 방어)', async () => {
    const app = build();
    const t1 = tokenFor('usr_lan_A', ROLES.LANDLORD);
    const t2 = tokenFor('usr_lan_B', ROLES.LANDLORD);

    const created = await request(app).post('/properties').set('Authorization', `Bearer ${t1}`).send({ address: 'A주소' });
    const id = created.body.id;

    const r = await request(app).get(`/properties/${id}`).set('Authorization', `Bearer ${t2}`);
    expect(r.status).toBe(403);
  });
});
