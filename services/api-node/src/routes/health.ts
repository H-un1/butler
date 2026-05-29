import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { pingDb } from '../db/client.js';

export function buildHealthRouter(prisma: PrismaClient | null): Router {
  const router = Router();

  router.get('/', (_, res) => {
    res.json({
      status: 'ok',
      service: 'butler/api-node',
      ts: new Date().toISOString(),
    });
  });

  router.get('/db', async (_, res) => {
    if (!prisma) {
      res.status(503).json({ status: 'unavailable', reason: 'prisma 미초기화' });
      return;
    }
    const ok = await pingDb(prisma);
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'down',
      ts: new Date().toISOString(),
    });
  });

  return router;
}

// 하위 호환 (기존 import — 점진 교체)
export const healthRouter = buildHealthRouter(null);
