import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type { PropertyRepository } from '../properties/repository.js';
import type { EnrichClient } from '../properties/enrich.js';

const CreateBody = z.object({
  address: z.string().min(2),
  complexName: z.string().optional(),
  dong: z.string().optional(),
  ho: z.string().optional(),
});

export type PropertiesDeps = {
  repo: PropertyRepository;
  enrichClient?: EnrichClient | null;
};

export function buildPropertiesRouter(env: Env, deps: PropertiesDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  router.post(
    '/',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const parsed = CreateBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
        return;
      }
      const ownerId = req.user!.sub;
      const rec = await deps.repo.create({
        ownerId,
        address: parsed.data.address,
        complexName: parsed.data.complexName ?? null,
        dong: parsed.data.dong ?? null,
        ho: parsed.data.ho ?? null,
      });
      res.status(201).json({
        id: rec.id,
        address: rec.address,
        complexName: rec.complexName,
        dong: rec.dong,
        ho: rec.ho,
      });
    }
  );

  router.get(
    '/',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const list = await deps.repo.listByOwner(req.user!.sub);
      res.json(
        list.map((p) => ({
          id: p.id,
          address: p.address,
          complexName: p.complexName,
          dong: p.dong,
          ho: p.ho,
          builtYear: p.builtYear,
          marketPrice: p.marketPrice?.toString() ?? null,
          amiScore: p.amiScore,
        }))
      );
    }
  );

  router.get(
    '/:id',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const rec = await deps.repo.getById(req.params.id);
      if (!rec) {
        res.status(404).json({ error: '물건을 찾을 수 없습니다' });
        return;
      }
      if (rec.ownerId !== req.user!.sub) {
        res.status(403).json({ error: '본인 소유 물건이 아닙니다' });
        return;
      }
      res.json({
        id: rec.id,
        address: rec.address,
        complexName: rec.complexName,
        dong: rec.dong,
        ho: rec.ho,
        builtYear: rec.builtYear,
        parking: rec.parking,
        mgmtFee: rec.mgmtFee,
        marketPrice: rec.marketPrice?.toString() ?? null,
        amiScore: rec.amiScore,
      });
    }
  );

  // 자산 대시보드 — 공공데이터 ETL 호출. 키 없으면 unavailable 정보로 클라가 안내.
  router.get(
    '/:id/dashboard',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const rec = await deps.repo.getById(req.params.id);
      if (!rec) {
        res.status(404).json({ error: '물건을 찾을 수 없습니다' });
        return;
      }
      if (rec.ownerId !== req.user!.sub) {
        res.status(403).json({ error: '본인 소유 물건이 아닙니다' });
        return;
      }

      if (!deps.enrichClient) {
        res.status(200).json({
          property: rec,
          enrichment: null,
          ami_score: null,
          status: 'unavailable',
          reason: 'ETL 클라이언트 미주입',
        });
        return;
      }

      try {
        const enriched = await deps.enrichClient.enrich(rec.address);
        if (enriched.status === 'unavailable') {
          res.status(200).json({
            property: {
              id: rec.id,
              address: rec.address,
              complexName: rec.complexName,
              dong: rec.dong,
              ho: rec.ho,
            },
            enrichment: null,
            ami_score: null,
            status: 'unavailable',
            reason: enriched.reason,
          });
          return;
        }
        res.json({
          property: {
            id: rec.id,
            address: rec.address,
            complexName: rec.complexName,
            dong: rec.dong,
            ho: rec.ho,
          },
          enrichment: enriched.enrichment,
          ami_score: enriched.ami_score,
          status: 'ok',
        });
      } catch (err) {
        res.status(502).json({
          error: 'ETL 호출 실패',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  return router;
}
