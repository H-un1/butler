import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { ROLES, type Role } from '@butler/shared';
import { signSession } from './jwt.js';
import { requireAuth, requireRoles, requireVerified } from './rbac.js';

const JWT_SECRET = 'test-secret-for-rbac-unit-only-1234567890';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  const auth = requireAuth({ jwtSecret: JWT_SECRET });

  app.get('/me', auth, (req, res) => res.json(req.user));

  app.get('/landlord-only', auth, requireRoles([ROLES.LANDLORD]), (_, res) =>
    res.json({ ok: true })
  );

  app.get('/admin-only', auth, requireRoles([ROLES.ADMIN]), (_, res) =>
    res.json({ ok: true })
  );

  app.get(
    '/web-shared',
    auth,
    requireRoles([ROLES.LANDLORD, ROLES.ADMIN]),
    (_, res) => res.json({ ok: true })
  );

  app.get('/inspector-only', auth, requireRoles([ROLES.INSPECTOR]), (_, res) =>
    res.json({ ok: true })
  );

  app.get(
    '/needs-verified',
    auth,
    requireVerified(),
    (_, res) => res.json({ ok: true })
  );

  return app;
}

function tokenFor(role: Role, opts: { verified?: boolean } = {}): string {
  return signSession(
    { sub: `usr_${role.toLowerCase()}`, role, verified: opts.verified ?? true },
    JWT_SECRET,
    '1h'
  );
}

describe('RBAC middleware', () => {
  let app: Express;
  beforeEach(() => {
    app = buildApp();
  });

  it('rejects requests with no Authorization header (401)', async () => {
    const r = await request(app).get('/me');
    expect(r.status).toBe(401);
  });

  it('rejects malformed or wrong-secret tokens (401)', async () => {
    const r = await request(app)
      .get('/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(r.status).toBe(401);
  });

  it('LANDLORD can access /landlord-only and /web-shared', async () => {
    const t = tokenFor(ROLES.LANDLORD);
    expect((await request(app).get('/landlord-only').set('Authorization', `Bearer ${t}`)).status).toBe(200);
    expect((await request(app).get('/web-shared').set('Authorization', `Bearer ${t}`)).status).toBe(200);
  });

  it('LANDLORD cannot access /admin-only (403) — same web app, role-gated', async () => {
    const t = tokenFor(ROLES.LANDLORD);
    const r = await request(app).get('/admin-only').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(403);
  });

  it('ADMIN can access admin and shared web routes, not inspector routes', async () => {
    const t = tokenFor(ROLES.ADMIN);
    expect((await request(app).get('/admin-only').set('Authorization', `Bearer ${t}`)).status).toBe(200);
    expect((await request(app).get('/web-shared').set('Authorization', `Bearer ${t}`)).status).toBe(200);
    expect((await request(app).get('/inspector-only').set('Authorization', `Bearer ${t}`)).status).toBe(403);
  });

  it('INSPECTOR cannot access web-only routes (403)', async () => {
    const t = tokenFor(ROLES.INSPECTOR);
    expect((await request(app).get('/landlord-only').set('Authorization', `Bearer ${t}`)).status).toBe(403);
    expect((await request(app).get('/admin-only').set('Authorization', `Bearer ${t}`)).status).toBe(403);
    expect((await request(app).get('/inspector-only').set('Authorization', `Bearer ${t}`)).status).toBe(200);
  });

  it('TENANT token is rejected as invalid role (403) — Phase 2 not yet wired', async () => {
    const bogus = signSession(
      { sub: 'usr_tenant', role: 'TENANT' as Role, verified: true },
      JWT_SECRET,
      '1h'
    );
    const r = await request(app)
      .get('/web-shared')
      .set('Authorization', `Bearer ${bogus}`);
    expect(r.status).toBe(403);
  });

  it('requireVerified blocks unverified users (403)', async () => {
    const t = tokenFor(ROLES.LANDLORD, { verified: false });
    const r = await request(app).get('/needs-verified').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(403);
  });

  it('requireVerified passes when verified=true', async () => {
    const t = tokenFor(ROLES.LANDLORD, { verified: true });
    const r = await request(app).get('/needs-verified').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
  });
});
