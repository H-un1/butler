import { Router } from 'express';
import { z } from 'zod';
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_STATUSES,
  ROLES,
  canTransitionMaintenance,
  type MaintenanceStatus,
} from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type {
  MaintenanceRepository,
  MaintenanceRecord,
} from '../maintenance/repository.js';
import type { LeaseRepository } from '../lease/repository.js';
import type { PropertyRepository } from '../properties/repository.js';
import type { HouseLogRepository } from '../houseLog/repository.js';
import type { NotificationService } from '../notification/sender.js';
import type { UserStore } from '../auth/userStore.js';

const CreateBody = z.object({
  propertyId: z.string().min(1),
  leaseId: z.string().optional(),
  category: z.enum(MAINTENANCE_CATEGORIES),
  title: z.string().min(1),
  description: z.string().optional(),
  photoUrls: z.array(z.string()).optional(),
});

const StatusBody = z.object({
  status: z.enum(MAINTENANCE_STATUSES),
  comment: z.string().optional(),
});

const CommentBody = z.object({
  body: z.string().min(1),
});

export type MaintenanceDeps = {
  maintenanceRepo: MaintenanceRepository;
  leaseRepo: LeaseRepository;
  propertyRepo: PropertyRepository;
  houseLogRepo: HouseLogRepository;
  notificationService?: NotificationService; // M3 — 수선요청 알림(옵셔널)
  userStore?: UserStore; // 가산: authorName/requesterName 조회용 (app.ts에서 주입)
};

function toDto(r: MaintenanceRecord) {
  return {
    id: r.id,
    propertyId: r.propertyId,
    leaseId: r.leaseId,
    requesterId: r.requesterId,
    category: r.category,
    title: r.title,
    description: r.description,
    status: r.status,
    photoUrls: r.photoUrls,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// 임차인이 RESOLVED 상태에서만 직접 전이 가능 (완료 확인/재오픈)
const TENANT_ALLOWED_TRANSITIONS: Record<string, readonly MaintenanceStatus[]> = {
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
};

export function buildMaintenanceRouter(env: Env, deps: MaintenanceDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // 권한 판정 헬퍼 — 이 수선요청에 접근 가능한가
  async function access(
    r: MaintenanceRecord,
    userId: string,
    role: string
  ): Promise<{ isRequester: boolean; isOwner: boolean; isAdmin: boolean }> {
    const prop = await deps.propertyRepo.getById(r.propertyId);
    return {
      isRequester: r.requesterId === userId,
      isOwner: !!prop && prop.ownerId === userId,
      isAdmin: role === ROLES.ADMIN,
    };
  }

  // 임차인이 수선요청 생성 =====================================================
  router.post('/', auth, requireRoles([ROLES.TENANT]), async (req, res) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    // 임차인이 해당 물건에 ACTIVE 임대차로 연결돼 있어야 한다
    const myLeases = await deps.leaseRepo.listByTenant(req.user!.sub);
    const activeLease = myLeases.find(
      (l) => l.propertyId === parsed.data.propertyId && l.status === 'ACTIVE'
    );
    if (!activeLease) {
      res.status(403).json({
        error: '이 물건에 연결된 활성 임대차 계약이 없습니다',
      });
      return;
    }
    const created = await deps.maintenanceRepo.create({
      propertyId: parsed.data.propertyId,
      leaseId: parsed.data.leaseId ?? activeLease.id,
      requesterId: req.user!.sub,
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      photoUrls: parsed.data.photoUrls,
    });
    // 최초 생성 이력 시스템 코멘트
    await deps.maintenanceRepo.addComment({
      requestId: created.id,
      authorId: req.user!.sub,
      body: `수선요청 접수 (${created.category})`,
      systemEvent: true,
    });
    // House Log REPAIR append (append-only)
    await deps.houseLogRepo.append({
      propertyId: created.propertyId,
      type: 'REPAIR',
      title: `수선요청: ${created.title}`,
      occurredAt: new Date(),
      refId: created.id,
      attachmentUrls: created.photoUrls,
    });
    // 임대인(소유자)에게 알림
    const prop = await deps.propertyRepo.getById(created.propertyId);
    if (prop) {
      await deps.notificationService?.notify({
        recipientId: prop.ownerId,
        type: 'MAINTENANCE',
        title: '새 수선요청 접수',
        body: `[${created.category}] ${created.title}`,
        refId: created.id,
      });
    }
    res.status(201).json(toDto(created));
  });

  // 임차인 — 내 수선요청 목록 ===================================================
  router.get('/mine', auth, requireRoles([ROLES.TENANT]), async (req, res) => {
    const list = await deps.maintenanceRepo.listByRequester(req.user!.sub);
    res.json(list.map(toDto));
  });

  // 임대인/관리자 — 이슈 보드 ===================================================
  router.get(
    '/board',
    auth,
    requireRoles([ROLES.LANDLORD, ROLES.ADMIN]),
    async (req, res) => {
      if (req.user!.role === ROLES.ADMIN) {
        const all = await deps.maintenanceRepo.listAll();
        res.json(all.map(toDto));
        return;
      }
      const props = await deps.propertyRepo.listByOwner(req.user!.sub);
      const list = await deps.maintenanceRepo.listByProperties(
        props.map((p) => p.id)
      );
      res.json(list.map(toDto));
    }
  );

  // 상세 조회 + 코멘트 이력 =====================================================
  router.get('/:id', auth, async (req, res) => {
    const r = await deps.maintenanceRepo.getById(req.params.id);
    if (!r) {
      res.status(404).json({ error: 'maintenance 없음' });
      return;
    }
    const { isRequester, isOwner, isAdmin } = await access(
      r,
      req.user!.sub,
      req.user!.role
    );
    if (!isRequester && !isOwner && !isAdmin) {
      res.status(403).json({ error: '접근 권한이 없습니다' });
      return;
    }
    const comments = await deps.maintenanceRepo.listComments(r.id);
    // 가산: requesterId 대신 사람이 읽을 요청자 이름
    const requester = deps.userStore
      ? await deps.userStore.getById(r.requesterId)
      : null;
    res.json({
      ...toDto(r),
      requesterName: requester?.name ?? null,
      // 가산: 각 코멘트에 authorId 대신 사람이 읽을 작성자 이름
      comments: await Promise.all(
        comments.map(async (c) => {
          const author = deps.userStore
            ? await deps.userStore.getById(c.authorId)
            : null;
          return {
            id: c.id,
            authorId: c.authorId,
            body: c.body,
            systemEvent: c.systemEvent,
            createdAt: c.createdAt.toISOString(),
            authorName: author?.name ?? null,
          };
        })
      ),
    });
  });

  // 상태전이 — 임대인/관리자(전체) · 임차인(RESOLVED에서만) =====================
  router.post('/:id/status', auth, async (req, res) => {
    const parsed = StatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const r = await deps.maintenanceRepo.getById(req.params.id);
    if (!r) {
      res.status(404).json({ error: 'maintenance 없음' });
      return;
    }
    const { isRequester, isOwner, isAdmin } = await access(
      r,
      req.user!.sub,
      req.user!.role
    );
    const next = parsed.data.status;

    // 권한별 전이 허용 판정
    let permitted = false;
    if (isOwner || isAdmin) {
      permitted = canTransitionMaintenance(r.status, next);
    } else if (isRequester) {
      permitted = (TENANT_ALLOWED_TRANSITIONS[r.status] ?? []).includes(next);
    } else {
      res.status(403).json({ error: '상태 변경 권한이 없습니다' });
      return;
    }
    if (!permitted) {
      res.status(409).json({
        error: `${r.status} → ${next} 전이는 현재 권한/상태에서 허용되지 않습니다`,
      });
      return;
    }

    const updated = await deps.maintenanceRepo.updateStatus(r.id, next);
    // 상태전이 이력을 시스템 코멘트로 아카이빙
    await deps.maintenanceRepo.addComment({
      requestId: r.id,
      authorId: req.user!.sub,
      body: `상태 변경: ${r.status} → ${next}${
        parsed.data.comment ? ` — ${parsed.data.comment}` : ''
      }`,
      systemEvent: true,
    });
    // 상태 변경 알림 — 임대인/관리자가 바꾸면 요청자(임차인)에게, 요청자가 바꾸면 소유 임대인에게
    if (isOwner || isAdmin) {
      await deps.notificationService?.notify({
        recipientId: r.requesterId,
        type: 'MAINTENANCE',
        title: `수선요청 상태: ${next}`,
        body: `"${r.title}" 요청이 ${next} 상태로 변경되었습니다.`,
        refId: r.id,
      });
    } else if (isRequester) {
      const prop = await deps.propertyRepo.getById(r.propertyId);
      if (prop) {
        await deps.notificationService?.notify({
          recipientId: prop.ownerId,
          type: 'MAINTENANCE',
          title: `수선요청 상태: ${next}`,
          body: `임차인이 "${r.title}" 요청을 ${next} 상태로 변경했습니다.`,
          refId: r.id,
        });
      }
    }
    res.json(toDto(updated));
  });

  // 코멘트 추가 — 요청자·소유 임대인·관리자 =====================================
  router.post('/:id/comments', auth, async (req, res) => {
    const parsed = CommentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const r = await deps.maintenanceRepo.getById(req.params.id);
    if (!r) {
      res.status(404).json({ error: 'maintenance 없음' });
      return;
    }
    const { isRequester, isOwner, isAdmin } = await access(
      r,
      req.user!.sub,
      req.user!.role
    );
    if (!isRequester && !isOwner && !isAdmin) {
      res.status(403).json({ error: '코멘트 권한이 없습니다' });
      return;
    }
    const c = await deps.maintenanceRepo.addComment({
      requestId: r.id,
      authorId: req.user!.sub,
      body: parsed.data.body,
      systemEvent: false,
    });
    res.status(201).json({
      id: c.id,
      authorId: c.authorId,
      body: c.body,
      systemEvent: c.systemEvent,
      createdAt: c.createdAt.toISOString(),
    });
  });

  return router;
}
