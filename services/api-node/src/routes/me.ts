import { Router } from 'express';
import type { Env } from '../config/env.js';
import { requireAuth } from '../auth/rbac.js';

export function buildMeRouter(env: Env): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  router.get('/', auth, (req, res) => {
    res.json({
      id: req.user!.sub,
      role: req.user!.role,
      verified: req.user!.verified,
    });
  });

  return router;
}
