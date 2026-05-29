import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { buildSubscriptionsRouter } from './subscriptions.js';
import { buildPropertiesRouter } from './properties.js';
import {
  makeInMemoryPropertyRepository,
  type PropertyRepository,
} from '../properties/repository.js';
import {
  makeInMemorySubscriptionRepository,
  type SubscriptionRepository,
} from '../subscription/repository.js';
import { makeDevMockPgAdapter } from '../subscription/pg.js';
import { signSession } from '../auth/jwt.js';
import type { Env } from '../config/env.js';

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'mysql://noop',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'sub-test-secret-1234567890',
  JWT_EXPIRES_IN: '1h',
  ALLOW_DEV_AUTH_MOCK: false,
};

function tokenFor(sub: string, role: Role): string {
  return signSession({ sub, role, verified: true }, TEST_ENV.JWT_SECRET, '1h');
}

function build(
  propertyRepo: PropertyRepository,
  subscriptionRepo: SubscriptionRepository,
  withPg = true
): Express {
  const app = express();
  app.use(express.json());
  app.use('/properties', buildPropertiesRouter(TEST_ENV, { repo: propertyRepo }));
  app.use(
    '/subscriptions',
    buildSubscriptionsRouter(TEST_ENV, {
      propertyRepo,
      subscriptionRepo,
      pgAdapter: withPg ? makeDevMockPgAdapter() : null,
    })
  );
  return app;
}

describe('Subscription routes', () => {
  let propertyRepo: PropertyRepository;
  let subscriptionRepo: SubscriptionRepository;
  beforeEach(() => {
    propertyRepo = makeInMemoryPropertyRepository();
    subscriptionRepo = makeInMemorySubscriptionRepository();
  });

  async function addProperties(token: string, app: Express, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await request(app)
        .post('/properties')
        .set('Authorization', `Bearer ${token}`)
        .send({ address: `주소 ${i}` });
    }
  }

  it('2채 보유 → TIER_1 구간으로 가입 + dev-mock PG 청구', async () => {
    const t = tokenFor('usr_lan_1', ROLES.LANDLORD);
    const app = build(propertyRepo, subscriptionRepo);
    await addProperties(t, app, 2);

    const r = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${t}`)
      .send({ billingDate: 1 });
    expect(r.status).toBe(201);
    expect(r.body.tier).toBe('TIER_1');
    expect(r.body.monthlyFee).toBe(2 * 22_000);
    expect(r.body.firstChargeId).toMatch(/^mock_chg_/);
  });

  it('11채 보유 → TIER_3', async () => {
    const t = tokenFor('usr_lan_2', ROLES.LANDLORD);
    const app = build(propertyRepo, subscriptionRepo);
    await addProperties(t, app, 11);
    const r = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${t}`)
      .send({ billingDate: 15 });
    expect(r.status).toBe(201);
    expect(r.body.tier).toBe('TIER_3');
    expect(r.body.monthlyFee).toBe(11 * 15_000);
  });

  it('보유 물건 0채 → 409', async () => {
    const t = tokenFor('usr_lan_3', ROLES.LANDLORD);
    const app = build(propertyRepo, subscriptionRepo);
    const r = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${t}`)
      .send({ billingDate: 1 });
    expect(r.status).toBe(409);
  });

  it('PG 어댑터 미설정 → 503', async () => {
    const t = tokenFor('usr_lan_4', ROLES.LANDLORD);
    const app = build(propertyRepo, subscriptionRepo, false);
    await addProperties(t, app, 1);
    const r = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${t}`)
      .send({ billingDate: 1 });
    expect(r.status).toBe(503);
  });

  it('이미 활성 구독 → 두 번째 가입 409', async () => {
    const t = tokenFor('usr_lan_5', ROLES.LANDLORD);
    const app = build(propertyRepo, subscriptionRepo);
    await addProperties(t, app, 1);
    await request(app).post('/subscriptions').set('Authorization', `Bearer ${t}`).send({ billingDate: 1 });
    const r = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${t}`)
      .send({ billingDate: 5 });
    expect(r.status).toBe(409);
  });

  it('GET /me → 활성 구독 반환', async () => {
    const t = tokenFor('usr_lan_6', ROLES.LANDLORD);
    const app = build(propertyRepo, subscriptionRepo);
    await addProperties(t, app, 2);
    await request(app).post('/subscriptions').set('Authorization', `Bearer ${t}`).send({ billingDate: 1 });

    const r = await request(app).get('/subscriptions/me').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ACTIVE');
  });

  it('GET /preview → 청구 미리보기', async () => {
    const t = tokenFor('usr_lan_7', ROLES.LANDLORD);
    const app = build(propertyRepo, subscriptionRepo);
    await addProperties(t, app, 5);
    const r = await request(app)
      .get('/subscriptions/preview')
      .set('Authorization', `Bearer ${t}`);
    expect(r.body.eligible).toBe(true);
    expect(r.body.tier).toBe('TIER_2');
    expect(r.body.monthlyFee).toBe(5 * 18_000);
  });

  it('해지 후 status=CANCELED', async () => {
    const t = tokenFor('usr_lan_8', ROLES.LANDLORD);
    const app = build(propertyRepo, subscriptionRepo);
    await addProperties(t, app, 1);
    const created = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${t}`)
      .send({ billingDate: 1 });
    const id = created.body.id;
    const r = await request(app)
      .post(`/subscriptions/${id}/cancel`)
      .set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CANCELED');
  });

  it('ADMIN role 403 — 구독 가입은 임대인 전용', async () => {
    const t = tokenFor('usr_adm', ROLES.ADMIN);
    const app = build(propertyRepo, subscriptionRepo);
    const r = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${t}`)
      .send({ billingDate: 1 });
    expect(r.status).toBe(403);
  });
});
