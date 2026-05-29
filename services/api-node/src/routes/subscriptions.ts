import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type { PropertyRepository } from '../properties/repository.js';
import type { SubscriptionRepository } from '../subscription/repository.js';
import { monthlyFeeFor } from '../subscription/pricing.js';
import type { PgAdapter } from '../subscription/pg.js';

const SubscribeBody = z.object({
  billingDate: z.number().int().min(1).max(28),
});

export type SubscriptionsDeps = {
  subscriptionRepo: SubscriptionRepository;
  propertyRepo: PropertyRepository;
  pgAdapter: PgAdapter | null;
};

export function buildSubscriptionsRouter(env: Env, deps: SubscriptionsDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // 구독 가입 — 임대인이 본인 보유 물건수 기반 구간에 가입
  router.post(
    '/',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const parsed = SubscribeBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
        return;
      }
      const landlordId = req.user!.sub;
      const properties = await deps.propertyRepo.listByOwner(landlordId);
      if (properties.length === 0) {
        res.status(409).json({
          error: '구독 자격 없음 — 보유 물건이 1채 이상이어야 합니다',
        });
        return;
      }
      const pricing = monthlyFeeFor(properties.length);

      if (!deps.pgAdapter) {
        res.status(503).json({
          error: 'PG 어댑터 미설정 — PG_SECRET_KEY 또는 dev-mock 활성화 확인',
        });
        return;
      }
      const charge = await deps.pgAdapter.charge({
        landlordId,
        monthlyFee: pricing.monthlyFee,
        billingDate: parsed.data.billingDate,
      });
      if (charge.status === 'unavailable') {
        res.status(503).json({ error: 'PG 결제 미지원', reason: charge.reason });
        return;
      }

      try {
        const sub = await deps.subscriptionRepo.create({
          landlordId,
          propertyCount: properties.length,
          tier: pricing.tier,
          monthlyFee: pricing.monthlyFee,
          billingDate: parsed.data.billingDate,
        });
        res.status(201).json({
          id: sub.id,
          propertyCount: sub.propertyCount,
          tier: sub.tier,
          monthlyFee: sub.monthlyFee,
          billingDate: sub.billingDate,
          status: sub.status,
          firstChargeId: charge.chargeId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(409).json({ error: msg });
      }
    }
  );

  // 본인 활성 구독 조회
  router.get(
    '/me',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const sub = await deps.subscriptionRepo.getActiveByLandlord(req.user!.sub);
      if (!sub) {
        res.status(404).json({ error: '활성 구독이 없습니다' });
        return;
      }
      res.json({
        id: sub.id,
        propertyCount: sub.propertyCount,
        tier: sub.tier,
        monthlyFee: sub.monthlyFee,
        billingDate: sub.billingDate,
        status: sub.status,
      });
    }
  );

  // 구독 해지
  router.post(
    '/:id/cancel',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const sub = await deps.subscriptionRepo.getActiveByLandlord(req.user!.sub);
      if (!sub || sub.id !== req.params.id) {
        res.status(403).json({ error: '본인 구독만 해지 가능합니다' });
        return;
      }
      const updated = await deps.subscriptionRepo.cancel(sub.id);
      res.json({ id: updated.id, status: updated.status });
    }
  );

  // 가격 미리보기 — 결제 전 보유 물건수 기반 구간 안내
  router.get('/preview', auth, requireRoles([ROLES.LANDLORD]), async (req, res) => {
    const properties = await deps.propertyRepo.listByOwner(req.user!.sub);
    if (properties.length === 0) {
      res.json({ eligible: false, reason: '보유 물건 없음' });
      return;
    }
    const pricing = monthlyFeeFor(properties.length);
    res.json({
      eligible: true,
      propertyCount: properties.length,
      tier: pricing.tier,
      perPropertyKrw: pricing.perPropertyKrw,
      monthlyFee: pricing.monthlyFee,
    });
  });

  return router;
}
