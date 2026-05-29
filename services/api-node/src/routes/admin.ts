// 관리자(ADMIN) 콘솔용 운영 API.
// 임대인+관리자가 같은 도메인을 공유하므로, role=ADMIN 강제 + 자기 데이터가 아닌 운영용 데이터 노출.

import { Router } from 'express';
import { ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type { PropertyRepository } from '../properties/repository.js';
import type { SubscriptionRepository } from '../subscription/repository.js';
import type { UserStore } from '../auth/userStore.js';

export type AdminDeps = {
  propertyRepo: PropertyRepository;
  subscriptionRepo: SubscriptionRepository;
  userStore?: UserStore; // 가산: landlordName 조회용 (app.ts에서 주입)
};

export function buildAdminRouter(env: Env, deps: AdminDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });
  const admin = requireRoles([ROLES.ADMIN]);

  router.get('/subscriptions', auth, admin, async (_, res) => {
    const list = await deps.subscriptionRepo.listAll();
    res.json(
      await Promise.all(
        list.map(async (s) => {
          // 가산: landlordId 대신 사람이 읽을 임대인 이름
          const landlord = deps.userStore
            ? await deps.userStore.getById(s.landlordId)
            : null;
          return {
            id: s.id,
            landlordId: s.landlordId,
            tier: s.tier,
            monthlyFee: s.monthlyFee,
            propertyCount: s.propertyCount,
            status: s.status,
            createdAt: s.createdAt.toISOString(),
            landlordName: landlord?.name ?? null,
          };
        })
      )
    );
  });

  // 운영 검수 — 모든 임대인 물건 목록(관리자만, 임대인 자기 물건은 /properties로)
  // 임대인 데이터를 들여다보는 행위는 감사 로그 대상 (M5 후속 작업).
  router.get('/properties', auth, admin, async (_, res) => {
    // 인메모리 repo에는 listAll이 없으므로 현재는 빈 배열. Prisma 운영 시는 별도 메서드 추가.
    res.json({
      note: '운영 콘솔 검수 — 본 endpoint는 Prisma 운영 환경에서 활성화됩니다',
      items: [],
    });
  });

  return router;
}
