import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { ROLES } from '@butler/shared';
import { buildAuthRouter } from './auth.js';
import { verifySession } from '../auth/jwt.js';
import {
  makeDevMockAdapter,
  makeDevMockPassAdapter,
  type OAuthAdapter,
} from '../auth/providers.js';
import { makeInMemoryUserStore } from '../auth/userStore.js';
import type { Env } from '../config/env.js';

const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'mysql://noop',
  REDIS_URL: 'redis://noop',
  JWT_SECRET: 'auth-route-test-secret-1234567890',
  JWT_EXPIRES_IN: '1h',
  ALLOW_DEV_AUTH_MOCK: false,
};

function appWithDevMock(): Express {
  const app = express();
  app.use(express.json());
  const oauthAdapters = new Map<string, OAuthAdapter>([
    ['dev-mock', makeDevMockAdapter()],
  ]);
  app.use(
    '/auth',
    buildAuthRouter(TEST_ENV, {
      oauthAdapters,
      passAdapter: makeDevMockPassAdapter(),
      userStore: makeInMemoryUserStore(),
    })
  );
  return app;
}

describe('POST /auth/exchange (dev-mock)', () => {
  let app: Express;
  beforeEach(() => {
    app = appWithDevMock();
  });

  it('issues a JWT for LANDLORD via dev-mock', async () => {
    const r = await request(app).post('/auth/exchange').send({
      provider: 'dev-mock',
      code: 'dev:LANDLORD:hong',
      role: ROLES.LANDLORD,
    });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user.role).toBe(ROLES.LANDLORD);
    expect(r.body.user.verified).toBe(false);

    const decoded = verifySession(r.body.token, TEST_ENV.JWT_SECRET);
    expect(decoded.role).toBe(ROLES.LANDLORD);
    expect(decoded.verified).toBe(false);
  });

  it('issues a JWT for ADMIN — same auth route, different role', async () => {
    const r = await request(app).post('/auth/exchange').send({
      provider: 'dev-mock',
      code: 'dev:ADMIN:ops',
      role: ROLES.ADMIN,
    });
    expect(r.status).toBe(200);
    const decoded = verifySession(r.body.token, TEST_ENV.JWT_SECRET);
    expect(decoded.role).toBe(ROLES.ADMIN);
  });

  it('issues a JWT for TENANT — Phase 2에서 임차인 로그인 활성화', async () => {
    const r = await request(app).post('/auth/exchange').send({
      provider: 'dev-mock',
      code: 'dev:TENANT:abc',
      role: 'TENANT',
    });
    expect(r.status).toBe(200);
    const decoded = verifySession(r.body.token, TEST_ENV.JWT_SECRET);
    expect(decoded.role).toBe('TENANT');
  });

  it('rejects an unknown role', async () => {
    const r = await request(app).post('/auth/exchange').send({
      provider: 'dev-mock',
      code: 'dev:NOPE:x',
      role: 'NOPE',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/유효하지 않은 role/);
  });

  it('rejects when adapter is not registered', async () => {
    const r = await request(app).post('/auth/exchange').send({
      provider: 'kakao',
      code: 'whatever',
      role: ROLES.LANDLORD,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/어댑터/);
  });

  it('returns 409 when same provider id tries to re-register with different role', async () => {
    await request(app).post('/auth/exchange').send({
      provider: 'dev-mock',
      code: 'dev:LANDLORD:same',
      role: ROLES.LANDLORD,
    });
    const r = await request(app).post('/auth/exchange').send({
      provider: 'dev-mock',
      code: 'dev:LANDLORD:same',
      role: ROLES.ADMIN,
    });
    expect(r.status).toBe(409);
  });
});

describe('POST /auth/pass/verify (dev-mock)', () => {
  it('returns verifiedAt without ever asking for 주민번호', async () => {
    const app = appWithDevMock();
    const r = await request(app)
      .post('/auth/pass/verify')
      .set('Authorization', 'Bearer dummy-not-checked-here')
      .send({ ci: 'dev-ci-12345' });
    expect(r.status).toBe(200);
    expect(r.body.verified).toBe(true);
    expect(typeof r.body.verifiedAt).toBe('string');
    // 응답에 주민번호류 필드가 절대 포함되지 않아야 한다
    expect(JSON.stringify(r.body)).not.toMatch(/rrn|residentRegistrationNumber|주민/);
  });

  it('blocks when no Bearer header (401)', async () => {
    const app = appWithDevMock();
    const r = await request(app)
      .post('/auth/pass/verify')
      .send({ ci: 'dev-ci-12345' });
    expect(r.status).toBe(401);
  });
});
