import { Router } from 'express';
import { ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type {
  NotificationRecord,
  NotificationRepository,
} from '../notification/repository.js';
import type { NotificationService } from '../notification/sender.js';
import {
  contractExpiryIntents,
  rentOverdueIntents,
  periodOf,
  type NotificationIntent,
} from '../notification/rules.js';
import type { LeaseRepository } from '../lease/repository.js';
import type { PaymentRepository } from '../payment/repository.js';

export type NotificationsDeps = {
  notificationRepo: NotificationRepository;
  notificationService: NotificationService;
  leaseRepo: LeaseRepository;
  paymentRepo: PaymentRepository;
};

function toDto(n: NotificationRecord) {
  return {
    id: n.id,
    type: n.type,
    channel: n.channel,
    title: n.title,
    body: n.body,
    refId: n.refId,
    read: n.readAt !== null,
    sentMock: n.sentMock,
    createdAt: n.createdAt.toISOString(),
  };
}

export function buildNotificationsRouter(
  env: Env,
  deps: NotificationsDeps
): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // 인앱 알림센터 — 내 알림 목록 ================================================
  router.get('/mine', auth, async (req, res) => {
    const list = await deps.notificationRepo.listByRecipient(req.user!.sub);
    res.json(list.map(toDto));
  });

  router.get('/unread-count', auth, async (req, res) => {
    const count = await deps.notificationRepo.countUnread(req.user!.sub);
    res.json({ count });
  });

  router.post('/:id/read', auth, async (req, res) => {
    const list = await deps.notificationRepo.listByRecipient(req.user!.sub);
    if (!list.some((n) => n.id === req.params.id)) {
      res.status(404).json({ error: '알림을 찾을 수 없습니다' });
      return;
    }
    const updated = await deps.notificationRepo.markRead(req.params.id);
    res.json(toDto(updated));
  });

  router.post('/read-all', auth, async (req, res) => {
    const n = await deps.notificationRepo.markAllRead(req.user!.sub);
    res.json({ marked: n });
  });

  // 자동알림 scan — 계약만료 D-Day / 월세미납 룰 산출 후 알림 생성(멱등) ==========
  // 임대인: 본인 계약 / 관리자: 전체. (실서비스는 크론으로 주기 실행)
  router.post(
    '/scan',
    auth,
    requireRoles([ROLES.LANDLORD, ROLES.ADMIN]),
    async (req, res) => {
      const now = new Date();
      const leases =
        req.user!.role === ROLES.ADMIN
          ? await deps.leaseRepo.listAll()
          : await deps.leaseRepo.listByLandlord(req.user!.sub);

      const intents: NotificationIntent[] = [];
      for (const lease of leases) {
        intents.push(...contractExpiryIntents(lease, now));
        // 이번 달 월세 납부 여부
        const rentPayments = await deps.paymentRepo.listByTypeRef('RENT', lease.id);
        const period = periodOf(now);
        const paidThisMonth = rentPayments.some(
          (p) => p.status === 'PAID' && p.period === period
        );
        intents.push(...rentOverdueIntents(lease, now, paidThisMonth));
      }

      let created = 0;
      for (const intent of intents) {
        // 멱등성 — 같은 수신자·타입·refId 알림이 있으면 건너뜀
        const exists = await deps.notificationRepo.existsByTypeRef(
          intent.recipientId,
          intent.type,
          intent.refId
        );
        if (exists) continue;
        await deps.notificationService.notify({
          recipientId: intent.recipientId,
          type: intent.type,
          title: intent.title,
          body: intent.body,
          refId: intent.refId,
          channel: 'IN_APP',
        });
        created += 1;
      }
      res.json({ scanned: leases.length, intents: intents.length, created });
    }
  );

  return router;
}
