import { Router } from 'express';
import { ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type { LeaseRepository } from '../lease/repository.js';
import type { PropertyRepository } from '../properties/repository.js';
import type { PaymentRepository } from '../payment/repository.js';
import type { MaintenanceRepository } from '../maintenance/repository.js';
import type { SettlementRepository } from '../settlement/repository.js';
import type { UserStore } from '../auth/userStore.js';
import { periodOf, RENT_OVERDUE_DAY_OF_MONTH } from '../notification/rules.js';

export type CrmDeps = {
  leaseRepo: LeaseRepository;
  propertyRepo: PropertyRepository;
  paymentRepo: PaymentRepository;
  maintenanceRepo: MaintenanceRepository;
  settlementRepo: SettlementRepository;
  userStore?: UserStore; // 가산: tenantName 조회용 (app.ts에서 주입)
};

type RentStatus = 'PAID' | 'OVERDUE' | 'DUE' | 'NONE';

function rentStatus(
  rent: number | null,
  paidThisMonth: boolean,
  now: Date
): RentStatus {
  if (!rent || rent <= 0) return 'NONE';
  if (paidThisMonth) return 'PAID';
  return now.getDate() >= RENT_OVERDUE_DAY_OF_MONTH ? 'OVERDUE' : 'DUE';
}

function ddayTo(end: Date, now: Date): number {
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildCrmRouter(env: Env, deps: CrmDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // 임대차 CRM 개요 — 임대인(본인) / 관리자(전체) =============================
  router.get(
    '/overview',
    auth,
    requireRoles([ROLES.LANDLORD, ROLES.ADMIN]),
    async (req, res) => {
      const now = new Date();
      const period = periodOf(now);
      const leases =
        req.user!.role === ROLES.ADMIN
          ? await deps.leaseRepo.listAll()
          : await deps.leaseRepo.listByLandlord(req.user!.sub);

      const rows = [];
      for (const lease of leases) {
        const prop = await deps.propertyRepo.getById(lease.propertyId);
        const rentPayments = await deps.paymentRepo.listByTypeRef('RENT', lease.id);
        const paidThisMonth = rentPayments.some(
          (p) => p.status === 'PAID' && p.period === period
        );
        const maint = await deps.maintenanceRepo.listByProperty(lease.propertyId);
        const openMaintenance = maint.filter(
          (m) => m.status === 'OPEN' || m.status === 'IN_PROGRESS'
        ).length;
        const settlements = await deps.settlementRepo.listByLease(lease.id);
        const latestSettlement = settlements[0] ?? null;
        // 가산: tenantId 대신 사람이 읽을 임차인 이름
        const tenant =
          lease.tenantId && deps.userStore
            ? await deps.userStore.getById(lease.tenantId)
            : null;

        rows.push({
          leaseId: lease.id,
          propertyId: lease.propertyId,
          address: prop?.address ?? null,
          status: lease.status,
          tenantId: lease.tenantId,
          tenantName: tenant?.name ?? null,
          deposit: Number(lease.deposit),
          rent: lease.rent,
          startAt: lease.startAt.toISOString(),
          endAt: lease.endAt.toISOString(),
          expiryDday: lease.status === 'ACTIVE' ? ddayTo(lease.endAt, now) : null,
          rentStatus: rentStatus(lease.rent, paidThisMonth, now),
          openMaintenance,
          settlementStatus: latestSettlement?.status ?? null,
          settlementId: latestSettlement?.id ?? null,
        });
      }

      const summary = {
        period,
        totalLeases: rows.length,
        activeLeases: rows.filter((r) => r.status === 'ACTIVE').length,
        expiringSoon: rows.filter(
          (r) => r.expiryDday !== null && r.expiryDday >= 0 && r.expiryDday <= 30
        ).length,
        rentOverdue: rows.filter((r) => r.rentStatus === 'OVERDUE').length,
        openMaintenance: rows.reduce((s, r) => s + r.openMaintenance, 0),
      };

      res.json({ summary, leases: rows });
    }
  );

  return router;
}
