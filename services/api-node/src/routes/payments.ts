import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type { PaymentRecord, PaymentRepository } from '../payment/repository.js';
import type { PaymentGateway } from '../payment/gateway.js';
import type { SettlementRepository } from '../settlement/repository.js';
import type { SubscriptionRepository } from '../subscription/repository.js';
import type { LeaseRepository } from '../lease/repository.js';
import type { HouseLogRepository } from '../houseLog/repository.js';
import type { NotificationService } from '../notification/sender.js';
import { periodOf } from '../notification/rules.js';

export type PaymentsDeps = {
  paymentRepo: PaymentRepository;
  gateway: PaymentGateway;
  settlementRepo: SettlementRepository;
  subscriptionRepo: SubscriptionRepository;
  leaseRepo: LeaseRepository;
  houseLogRepo: HouseLogRepository;
  notificationService: NotificationService;
};

function toDto(p: PaymentRecord) {
  return {
    id: p.id,
    payerId: p.payerId,
    type: p.type,
    refId: p.refId,
    amount: p.amount,
    status: p.status,
    provider: p.provider,
    mockChargeId: p.mockChargeId,
    period: p.period,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  };
}

const RentBody = z.object({
  leaseId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export function buildPaymentsRouter(env: Env, deps: PaymentsDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // 공통 — 결제 생성 → mock 게이트웨이 charge → PAID/FAILED 기록
  async function runCharge(payment: PaymentRecord) {
    const result = await deps.gateway.charge({
      payerId: payment.payerId,
      type: payment.type,
      refId: payment.refId,
      amount: payment.amount,
      period: payment.period,
    });
    if (result.status === 'unavailable') {
      await deps.paymentRepo.markFailed(payment.id);
      return { ok: false as const, reason: result.reason };
    }
    const paid = await deps.paymentRepo.markPaid(payment.id, result.chargeId);
    return { ok: true as const, paid };
  }

  // 정산금 결제 (임차인) — 합의(AGREED)된 정산만. 보증금 자동공제 아님. ==========
  router.post(
    '/settlement/:settlementId',
    auth,
    requireRoles([ROLES.TENANT]),
    async (req, res) => {
      const s = await deps.settlementRepo.getById(req.params.settlementId);
      if (!s) {
        res.status(404).json({ error: 'settlement 없음' });
        return;
      }
      if (s.tenantId !== req.user!.sub) {
        res.status(403).json({ error: '본인 정산만 결제 가능합니다' });
        return;
      }
      if (s.status !== 'AGREED') {
        res.status(409).json({
          error: `합의(AGREED) 완료된 정산만 결제할 수 있습니다 (현재 ${s.status})`,
        });
        return;
      }
      const already = await deps.paymentRepo.listByTypeRef('SETTLEMENT', s.id);
      if (already.some((p) => p.status === 'PAID')) {
        res.status(409).json({ error: '이미 결제 완료된 정산입니다' });
        return;
      }
      const payment = await deps.paymentRepo.create({
        payerId: req.user!.sub,
        type: 'SETTLEMENT',
        refId: s.id,
        amount: s.tenantTotal,
        provider: deps.gateway.providerName,
      });
      const charged = await runCharge(payment);
      if (!charged.ok) {
        res.status(503).json({ error: 'mock PG 결제 실패', detail: charged.reason });
        return;
      }
      // 결제 완료 알림 + House Log (보증금은 건드리지 않는다)
      const lease = await deps.leaseRepo.getById(s.leaseId);
      if (lease) {
        await deps.houseLogRepo.append({
          propertyId: lease.propertyId,
          type: 'REPAIR',
          title: `수선비 정산금 결제 완료 (${s.tenantTotal.toLocaleString()}원, mock)`,
          occurredAt: new Date(),
          refId: s.id,
        });
      }
      for (const uid of [s.tenantId, s.landlordId].filter(Boolean) as string[]) {
        await deps.notificationService.notify({
          recipientId: uid,
          type: 'PAYMENT',
          title: '정산금 결제 완료',
          body: `수선비 정산금 ${s.tenantTotal.toLocaleString()}원이 결제되었습니다 (mock).`,
          refId: s.id,
        });
      }
      res.status(201).json(toDto(charged.paid));
    }
  );

  // 구독료 결제 (임대인) — 본인 활성 구독 ======================================
  router.post(
    '/subscription',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const sub = await deps.subscriptionRepo.getActiveByLandlord(req.user!.sub);
      if (!sub) {
        res.status(404).json({ error: '활성 구독이 없습니다' });
        return;
      }
      const period = periodOf(new Date());
      const existing = await deps.paymentRepo.listByTypeRef('SUBSCRIPTION', sub.id);
      if (existing.some((p) => p.status === 'PAID' && p.period === period)) {
        res.status(409).json({ error: `${period} 구독료가 이미 결제되었습니다` });
        return;
      }
      const payment = await deps.paymentRepo.create({
        payerId: req.user!.sub,
        type: 'SUBSCRIPTION',
        refId: sub.id,
        amount: sub.monthlyFee,
        period,
        provider: deps.gateway.providerName,
      });
      const charged = await runCharge(payment);
      if (!charged.ok) {
        res.status(503).json({ error: 'mock PG 결제 실패', detail: charged.reason });
        return;
      }
      await deps.notificationService.notify({
        recipientId: req.user!.sub,
        type: 'PAYMENT',
        title: '구독료 결제 완료',
        body: `${period} 구독료 ${sub.monthlyFee.toLocaleString()}원이 결제되었습니다 (mock).`,
        refId: sub.id,
      });
      res.status(201).json(toDto(charged.paid));
    }
  );

  // 월세 결제 (임차인) — 본인 ACTIVE 계약 ======================================
  router.post('/rent', auth, requireRoles([ROLES.TENANT]), async (req, res) => {
    const parsed = RentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const lease = await deps.leaseRepo.getById(parsed.data.leaseId);
    if (!lease) {
      res.status(404).json({ error: 'lease 없음' });
      return;
    }
    if (lease.tenantId !== req.user!.sub) {
      res.status(403).json({ error: '본인 계약의 월세만 납부 가능합니다' });
      return;
    }
    if (!lease.rent || lease.rent <= 0) {
      res.status(400).json({ error: '월세가 설정되지 않은 계약입니다' });
      return;
    }
    const period = parsed.data.period ?? periodOf(new Date());
    const existing = await deps.paymentRepo.listByTypeRef('RENT', lease.id);
    if (existing.some((p) => p.status === 'PAID' && p.period === period)) {
      res.status(409).json({ error: `${period} 월세가 이미 납부되었습니다` });
      return;
    }
    const payment = await deps.paymentRepo.create({
      payerId: req.user!.sub,
      type: 'RENT',
      refId: lease.id,
      amount: lease.rent,
      period,
      provider: deps.gateway.providerName,
    });
    const charged = await runCharge(payment);
    if (!charged.ok) {
      res.status(503).json({ error: 'mock PG 결제 실패', detail: charged.reason });
      return;
    }
    await deps.notificationService.notify({
      recipientId: lease.landlordId,
      type: 'PAYMENT',
      title: '월세 납부 완료',
      body: `${period} 월세 ${lease.rent.toLocaleString()}원이 납부되었습니다 (mock).`,
      refId: lease.id,
    });
    res.status(201).json(toDto(charged.paid));
  });

  // 내 결제 내역 ===============================================================
  router.get('/mine', auth, async (req, res) => {
    const list = await deps.paymentRepo.listByPayer(req.user!.sub);
    res.json(list.map(toDto));
  });

  return router;
}
