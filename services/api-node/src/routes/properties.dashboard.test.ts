import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildPropertiesRouter } from './properties.js';
import {
  makeInMemoryPropertyRepository,
  type PropertyRepository,
} from '../properties/repository.js';
import type { EnrichClient } from '../properties/enrich.js';
import { signSession } from '../auth/jwt.js';
import type { Env } from '../config/env.js';

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'mysql://noop',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'dashboard-test-secret-1234567890',
  JWT_EXPIRES_IN: '1h',
  ALLOW_DEV_AUTH_MOCK: false,
};

function tokenFor(sub: string, role: Role): string {
  return signSession({ sub, role, verified: true }, TEST_ENV.JWT_SECRET, '1h');
}

function buildApp(repo: PropertyRepository, enrichClient: EnrichClient | null): Express {
  const app = express();
  app.use(express.json());
  app.use('/properties', buildPropertiesRouter(TEST_ENV, { repo, enrichClient }));
  return app;
}

describe('GET /properties/:id/dashboard', () => {
  let repo: PropertyRepository;
  beforeEach(() => {
    repo = makeInMemoryPropertyRepository();
  });

  it('정상 enrich 응답을 받아 ami_score 포함해 반환', async () => {
    const t = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const enrichClient: EnrichClient = {
      async enrich(addr) {
        return {
          status: 'ok',
          enrichment: {
            address: addr,
            market_price: { latest_price: 920_000_000, avg_last_12m: 900_000_000, sample_count: 12 },
            building: { built_year: 2015, area_m2: 84.9, parking_per_household: 1.2 },
            complex: { households: 600, mgmt_fee_monthly: 230_000, brand: '항공' },
          },
          ami_score: 78,
        };
      },
    };
    const app = buildApp(repo, enrichClient);
    const created = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${t}`)
      .send({ address: '서울시 강서구 화곡로 12' });
    const id = created.body.id;

    const r = await request(app)
      .get(`/properties/${id}/dashboard`)
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
    expect(r.body.ami_score).toBe(78);
    expect(r.body.enrichment.building.built_year).toBe(2015);
  });

  it('ETL 키 미설정 시 unavailable 상태로 안내 (200, 더미 데이터 금지)', async () => {
    const t = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const enrichClient: EnrichClient = {
      async enrich() {
        return { status: 'unavailable', reason: '공공데이터 API 키 미설정' };
      },
    };
    const app = buildApp(repo, enrichClient);
    const created = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${t}`)
      .send({ address: '주소' });
    const id = created.body.id;

    const r = await request(app)
      .get(`/properties/${id}/dashboard`)
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('unavailable');
    expect(r.body.enrichment).toBeNull();
    expect(r.body.ami_score).toBeNull();
    expect(r.body.reason).toMatch(/공공데이터/);
  });

  it('타 임대인의 dashboard 접근 403', async () => {
    const ta = tokenFor('usr_lan_A', ROLES.LANDLORD);
    const tb = tokenFor('usr_lan_B', ROLES.LANDLORD);
    const app = buildApp(repo, null);
    const created = await request(app)
      .post('/properties')
      .set('Authorization', `Bearer ${ta}`)
      .send({ address: 'A주소' });
    const r = await request(app)
      .get(`/properties/${created.body.id}/dashboard`)
      .set('Authorization', `Bearer ${tb}`);
    expect(r.status).toBe(403);
  });
});
