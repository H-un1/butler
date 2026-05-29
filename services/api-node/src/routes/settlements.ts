import { Router } from 'express';
import { z } from 'zod';
import {
  ROLES,
  SETTLEMENT_CATEGORIES,
  INSPECTION_GRADES,
  canTransitionSettlement,
  type SettlementStatus,
} from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type {
  SettlementRepository,
  SettlementRecord,
} from '../settlement/repository.js';
import type { SettlementEngine } from '../settlement/engineClient.js';
import type { SettlementLineInput } from '../settlement/rules.js';
import type { LeaseRepository } from '../lease/repository.js';
import type { InspectionRepository } from '../inspection/repository.js';
import type { HouseLogRepository } from '../houseLog/repository.js';
import type { NotificationService } from '../notification/sender.js';
import type { UserStore } from '../auth/userStore.js';

const LineBody = z.object({
  checklistKey: z.string().min(1),
  area: z.string().min(1),
  category: z.enum(SETTLEMENT_CATEGORIES),
  grade: z.enum(INSPECTION_GRADES),
  markedDefect: z.boolean(),
  repairCost: z.number().int().nonnegative(),
  yearsUsed: z.number().nonnegative(),
});

const ComputeBody = z.object({
  leaseId: z.string().min(1),
  inspectionId: z.string().optional(),
  lines: z.array(LineBody).min(1),
});

const ProposeBody = z.object({
  lines: z.array(LineBody).optional(), // 재산출 후 제안 (이의 대응)
  note: z.string().optional(),
});

const NoteBody = z.object({ note: z.string().optional() });
const DisputeBody = z.object({ note: z.string().min(1) });

export type SettlementsDeps = {
  settlementRepo: SettlementRepository;
  leaseRepo: LeaseRepository;
  inspectionRepo: InspectionRepository;
  houseLogRepo: HouseLogRepository;
  engine: SettlementEngine;
  notificationService?: NotificationService; // M3 — 합의 흐름 알림(옵셔널)
  userStore?: UserStore; // 가산: actorName 조회용 (app.ts에서 주입)
};

function toDto(s: SettlementRecord) {
  return {
    id: s.id,
    leaseId: s.leaseId,
    inspectionId: s.inspectionId,
    landlordId: s.landlordId,
    tenantId: s.tenantId,
    status: s.status,
    ruleVersion: s.ruleVersion,
    totalCost: s.totalCost,
    tenantTotal: s.tenantTotal,
    landlordTotal: s.landlordTotal,
    lines: s.lines,
    basis: s.basis,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function buildSettlementsRouter(env: Env, deps: SettlementsDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // 점검 데이터(InspectionItem 등급·결함)를 권위 있는 값으로 덮어써서
  // 정산이 실제 점검 데이터를 참조하도록 강제한다 (임대인 자가신고 방지).
  async function reconcileWithInspection(
    inspectionId: string | undefined,
    leasePropertyId: string,
    lines: SettlementLineInput[]
  ): Promise<{ ok: true; lines: SettlementLineInput[] } | { ok: false; error: string }> {
    if (!inspectionId) return { ok: true, lines };
    const insp = await deps.inspectionRepo.getById(inspectionId);
    if (!insp) return { ok: false, error: '점검을 찾을 수 없습니다' };
    if (insp.propertyId !== leasePropertyId) {
      return { ok: false, error: '점검과 계약의 물건이 일치하지 않습니다' };
    }
    const items = await deps.inspectionRepo.listItems(inspectionId);
    const byKey = new Map(items.map((i) => [i.checklistKey, i]));
    const reconciled = lines.map((l) => {
      const item = byKey.get(l.checklistKey);
      if (!item) return l;
      // 등급·결함마킹은 점검 데이터가 권위 — 덮어쓴다
      return { ...l, grade: item.grade, markedDefect: item.markedDefect };
    });
    return { ok: true, lines: reconciled };
  }

  // 임대인이 정산 산출 (DRAFT 생성, 근거 스냅샷 동결) ============================
  router.post('/compute', auth, requireRoles([ROLES.LANDLORD]), async (req, res) => {
    const parsed = ComputeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const lease = await deps.leaseRepo.getById(parsed.data.leaseId);
    if (!lease) {
      res.status(404).json({ error: 'lease 없음' });
      return;
    }
    if (lease.landlordId !== req.user!.sub) {
      res.status(403).json({ error: '본인 계약만 정산 산출 가능합니다' });
      return;
    }
    const recon = await reconcileWithInspection(
      parsed.data.inspectionId,
      lease.propertyId,
      parsed.data.lines
    );
    if (!recon.ok) {
      res.status(400).json({ error: recon.error });
      return;
    }
    let computation;
    try {
      computation = await deps.engine.compute(recon.lines);
    } catch (err) {
      res.status(502).json({
        error: '정산 엔진 호출 실패 (ai-python 미가용)',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    const settlement = await deps.settlementRepo.create({
      leaseId: lease.id,
      inspectionId: parsed.data.inspectionId ?? null,
      landlordId: lease.landlordId,
      tenantId: lease.tenantId,
      computation,
    });
    await deps.settlementRepo.addEvent({
      settlementId: settlement.id,
      actorId: req.user!.sub,
      type: 'COMPUTED',
      note: `룰 산출 (${computation.ruleVersion}) — 임차인 ${computation.tenantTotal.toLocaleString()}원 / 임대인 ${computation.landlordTotal.toLocaleString()}원`,
    });
    res.status(201).json(toDto(settlement));
  });

  // 내 정산 목록 — 임대인/임차인 ================================================
  router.get('/mine', auth, async (req, res) => {
    const role = req.user!.role;
    if (role === ROLES.LANDLORD) {
      res.json((await deps.settlementRepo.listByLandlord(req.user!.sub)).map(toDto));
      return;
    }
    if (role === ROLES.TENANT) {
      res.json((await deps.settlementRepo.listByTenant(req.user!.sub)).map(toDto));
      return;
    }
    res.status(403).json({ error: '임대인 또는 임차인만 조회 가능합니다' });
  });

  // 상세 + 이벤트 이력 =========================================================
  router.get('/:id', auth, async (req, res) => {
    const s = await deps.settlementRepo.getById(req.params.id);
    if (!s) {
      res.status(404).json({ error: 'settlement 없음' });
      return;
    }
    const isLandlord = s.landlordId === req.user!.sub;
    const isTenant = s.tenantId === req.user!.sub;
    if (!isLandlord && !isTenant && req.user!.role !== ROLES.ADMIN) {
      res.status(403).json({ error: '본인 정산만 조회 가능합니다' });
      return;
    }
    const events = await deps.settlementRepo.listEvents(s.id);
    res.json({
      ...toDto(s),
      // 가산: 각 이벤트에 actorId 대신 사람이 읽을 행위자 이름
      events: await Promise.all(
        events.map(async (e) => {
          const actor = deps.userStore
            ? await deps.userStore.getById(e.actorId)
            : null;
          return {
            id: e.id,
            actorId: e.actorId,
            type: e.type,
            note: e.note,
            createdAt: e.createdAt.toISOString(),
            actorName: actor?.name ?? null,
          };
        })
      ),
    });
  });

  async function guardTransition(
    s: SettlementRecord,
    next: SettlementStatus,
    res: import('express').Response
  ): Promise<boolean> {
    if (!canTransitionSettlement(s.status, next)) {
      res.status(409).json({
        error: `${s.status} → ${next} 전이는 허용되지 않습니다`,
      });
      return false;
    }
    return true;
  }

  // 임대인이 제안 (DRAFT|DISPUTED → PROPOSED), 선택적으로 재산출 ================
  router.post('/:id/propose', auth, requireRoles([ROLES.LANDLORD]), async (req, res) => {
    const parsed = ProposeBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    let s = await deps.settlementRepo.getById(req.params.id);
    if (!s) {
      res.status(404).json({ error: 'settlement 없음' });
      return;
    }
    if (s.landlordId !== req.user!.sub) {
      res.status(403).json({ error: '본인 정산만 제안 가능합니다' });
      return;
    }
    if (!(await guardTransition(s, 'PROPOSED', res))) return;

    // 이의(DISPUTED) 대응으로 라인을 다시 받으면 재산출 → 스냅샷 갱신
    if (parsed.data.lines && parsed.data.lines.length > 0) {
      const lease = await deps.leaseRepo.getById(s.leaseId);
      const recon = await reconcileWithInspection(
        s.inspectionId ?? undefined,
        lease?.propertyId ?? '',
        parsed.data.lines
      );
      if (!recon.ok) {
        res.status(400).json({ error: recon.error });
        return;
      }
      let computation;
      try {
        computation = await deps.engine.compute(recon.lines);
      } catch (err) {
        res.status(502).json({
          error: '정산 엔진 호출 실패 (ai-python 미가용)',
          detail: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      // 같은 settlement에 갱신 산출을 새 레코드로 두지 않고, 이벤트로 재산출 이력만 남기고
      // 상태만 전이한다. (스냅샷 갱신이 필요하면 신규 compute로 별도 정산을 만든다)
      await deps.settlementRepo.addEvent({
        settlementId: s.id,
        actorId: req.user!.sub,
        type: 'COMPUTED',
        note: `재산출 — 임차인 ${computation.tenantTotal.toLocaleString()}원 / 임대인 ${computation.landlordTotal.toLocaleString()}원`,
      });
    }

    s = await deps.settlementRepo.updateStatus(s.id, 'PROPOSED');
    await deps.settlementRepo.addEvent({
      settlementId: s.id,
      actorId: req.user!.sub,
      type: 'PROPOSED',
      note: parsed.data.note ?? null,
    });
    if (s.tenantId) {
      await deps.notificationService?.notify({
        recipientId: s.tenantId,
        type: 'SETTLEMENT',
        title: '수선비 정산 제안 도착',
        body: `임차인 부담 ${s.tenantTotal.toLocaleString()}원으로 정산이 제안되었습니다. 합의 또는 이의를 선택하세요.`,
        refId: s.id,
      });
    }
    res.json(toDto(s));
  });

  // 임차인이 이의 (PROPOSED → DISPUTED) =========================================
  router.post('/:id/dispute', auth, requireRoles([ROLES.TENANT]), async (req, res) => {
    const parsed = DisputeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '이의 사유(note)가 필요합니다', detail: parsed.error.issues });
      return;
    }
    let s = await deps.settlementRepo.getById(req.params.id);
    if (!s) {
      res.status(404).json({ error: 'settlement 없음' });
      return;
    }
    if (s.tenantId !== req.user!.sub) {
      res.status(403).json({ error: '본인 정산만 이의 가능합니다' });
      return;
    }
    if (!(await guardTransition(s, 'DISPUTED', res))) return;
    s = await deps.settlementRepo.updateStatus(s.id, 'DISPUTED');
    await deps.settlementRepo.addEvent({
      settlementId: s.id,
      actorId: req.user!.sub,
      type: 'DISPUTED',
      note: parsed.data.note,
    });
    await deps.notificationService?.notify({
      recipientId: s.landlordId,
      type: 'SETTLEMENT',
      title: '정산 이의 제기',
      body: `임차인이 정산에 이의를 제기했습니다: ${parsed.data.note}`,
      refId: s.id,
    });
    res.json(toDto(s));
  });

  // 임차인이 합의 (PROPOSED → AGREED) ===========================================
  router.post('/:id/agree', auth, requireRoles([ROLES.TENANT]), async (req, res) => {
    let s = await deps.settlementRepo.getById(req.params.id);
    if (!s) {
      res.status(404).json({ error: 'settlement 없음' });
      return;
    }
    if (s.tenantId !== req.user!.sub) {
      res.status(403).json({ error: '본인 정산만 합의 가능합니다' });
      return;
    }
    if (!(await guardTransition(s, 'AGREED', res))) return;
    s = await deps.settlementRepo.updateStatus(s.id, 'AGREED');
    await deps.settlementRepo.addEvent({
      settlementId: s.id,
      actorId: req.user!.sub,
      type: 'AGREED',
      note: `정산 합의 완료 — 임차인 부담 ${s.tenantTotal.toLocaleString()}원 (결제는 M3 mock PG)`,
    });
    // House Log에 합의 기록 (append-only). 보증금 자동공제는 하지 않는다.
    const lease = await deps.leaseRepo.getById(s.leaseId);
    if (lease) {
      await deps.houseLogRepo.append({
        propertyId: lease.propertyId,
        type: 'CONTRACT',
        title: `수선비 정산 합의 (임차인 ${s.tenantTotal.toLocaleString()}원)`,
        occurredAt: new Date(),
        refId: s.id,
      });
    }
    // 합의 완료 알림 — 임대인에게(임차인은 본인 액션). 결제 안내 포함.
    await deps.notificationService?.notify({
      recipientId: s.landlordId,
      type: 'SETTLEMENT',
      title: '정산 합의 완료',
      body: `임차인이 정산에 합의했습니다 (임차인 부담 ${s.tenantTotal.toLocaleString()}원). 정산금 결제는 임차인이 진행합니다 (mock).`,
      refId: s.id,
    });
    res.json(toDto(s));
  });

  // 결렬 (→ REJECTED) — 임대인/임차인 양측 ======================================
  router.post('/:id/reject', auth, async (req, res) => {
    const parsed = NoteBody.safeParse(req.body ?? {});
    const s0 = await deps.settlementRepo.getById(req.params.id);
    if (!s0) {
      res.status(404).json({ error: 'settlement 없음' });
      return;
    }
    const isLandlord = s0.landlordId === req.user!.sub;
    const isTenant = s0.tenantId === req.user!.sub;
    if (!isLandlord && !isTenant) {
      res.status(403).json({ error: '본인 정산만 결렬 처리 가능합니다' });
      return;
    }
    if (!(await guardTransition(s0, 'REJECTED', res))) return;
    const s = await deps.settlementRepo.updateStatus(s0.id, 'REJECTED');
    await deps.settlementRepo.addEvent({
      settlementId: s.id,
      actorId: req.user!.sub,
      type: 'REJECTED',
      note: parsed.success ? parsed.data.note ?? null : null,
    });
    res.json(toDto(s));
  });

  return router;
}
