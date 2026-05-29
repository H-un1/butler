import { Router } from 'express';
import { ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type { HouseLogRepository } from '../houseLog/repository.js';
import type { PropertyRepository } from '../properties/repository.js';

export type HouseLogRouterDeps = {
  houseLogRepo: HouseLogRepository;
  propertyRepo: PropertyRepository;
};

// 마운트 위치: /properties/:propertyId/house-log
// (Property RBAC를 재사용하기 위해 별도 mount + middleware로 소유 확인)
export function buildHouseLogRouter(env: Env, deps: HouseLogRouterDeps): Router {
  const router = Router({ mergeParams: true });
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  router.get(
    '/',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const propertyId = req.params.propertyId;
      const prop = await deps.propertyRepo.getById(propertyId);
      if (!prop) {
        res.status(404).json({ error: '물건을 찾을 수 없습니다' });
        return;
      }
      if (prop.ownerId !== req.user!.sub) {
        res.status(403).json({ error: '본인 소유 물건이 아닙니다' });
        return;
      }
      const entries = await deps.houseLogRepo.listByProperty(propertyId);
      res.json(
        entries.map((e) => ({
          id: e.id,
          type: e.type,
          title: e.title,
          occurredAt: e.occurredAt.toISOString(),
          refId: e.refId,
          attachmentUrls: e.attachmentUrls,
        }))
      );
    }
  );

  return router;
}
