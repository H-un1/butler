import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type { LeaseRepository, LeaseRecord } from '../lease/repository.js';
import type { PropertyRepository } from '../properties/repository.js';
import type { HouseLogRepository } from '../houseLog/repository.js';

const CreateBody = z.object({
  propertyId: z.string().min(1),
  deposit: z.number().int().nonnegative(),
  rent: z.number().int().nonnegative().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  invitedPhone: z.string().optional(),
});

const AcceptBody = z.object({
  inviteToken: z.string().min(1),
});

export type LeasesDeps = {
  leaseRepo: LeaseRepository;
  propertyRepo: PropertyRepository;
  houseLogRepo: HouseLogRepository;
};

// propertyAddress는 가산 필드. 라우트에서 propertyRepo로 조회한 주소를 넘긴다(없으면 null).
function toDto(l: LeaseRecord, propertyAddress: string | null = null) {
  return {
    id: l.id,
    propertyId: l.propertyId,
    landlordId: l.landlordId,
    tenantId: l.tenantId,
    status: l.status,
    deposit: Number(l.deposit),
    rent: l.rent,
    startAt: l.startAt.toISOString(),
    endAt: l.endAt.toISOString(),
    inviteToken: l.inviteToken,
    invitedPhone: l.invitedPhone,
    // 가산: 사람이 읽을 물건 주소
    propertyAddress,
  };
}

// 단일 lease의 주소를 조회해 DTO로 변환 (propertyRepo로 propertyId 조회)
async function toDtoWithAddress(
  l: LeaseRecord,
  propertyRepo: PropertyRepository
) {
  const prop = await propertyRepo.getById(l.propertyId);
  return toDto(l, prop?.address ?? null);
}

export function buildLeasesRouter(env: Env, deps: LeasesDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // 임대인이 임대차 계약 생성 + 임차인 초대 토큰 발급 =============================
  router.post('/', auth, requireRoles([ROLES.LANDLORD]), async (req, res) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const prop = await deps.propertyRepo.getById(parsed.data.propertyId);
    if (!prop) {
      res.status(404).json({ error: '물건을 찾을 수 없습니다' });
      return;
    }
    if (prop.ownerId !== req.user!.sub) {
      res.status(403).json({ error: '본인 소유 물건만 계약 등록 가능합니다' });
      return;
    }
    const lease = await deps.leaseRepo.create({
      propertyId: parsed.data.propertyId,
      landlordId: req.user!.sub,
      deposit: parsed.data.deposit,
      rent: parsed.data.rent ?? null,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      invitedPhone: parsed.data.invitedPhone ?? null,
    });
    // House Log에 계약 생애주기 기록 (append-only)
    await deps.houseLogRepo.append({
      propertyId: prop.id,
      type: 'CONTRACT',
      title: '임대차 계약 등록 (임차인 초대 발급)',
      occurredAt: new Date(),
      refId: lease.id,
    });
    res.status(201).json(toDto(lease, prop.address));
  });

  // 내 계약 목록 — 임대인/임차인 역할별 분기 ====================================
  router.get('/mine', auth, async (req, res) => {
    const role = req.user!.role;
    if (role === ROLES.LANDLORD) {
      const list = await deps.leaseRepo.listByLandlord(req.user!.sub);
      // 가산: 항목마다 주소 조회 — N+1 허용(인메모리/시연 범위)
      res.json(
        await Promise.all(list.map((l) => toDtoWithAddress(l, deps.propertyRepo)))
      );
      return;
    }
    if (role === ROLES.TENANT) {
      const list = await deps.leaseRepo.listByTenant(req.user!.sub);
      // 임차인에게는 inviteToken을 노출하지 않는다 (이미 연결된 계약)
      res.json(
        await Promise.all(
          list.map(async (l) => ({
            ...(await toDtoWithAddress(l, deps.propertyRepo)),
            inviteToken: null,
          }))
        )
      );
      return;
    }
    res.status(403).json({ error: '임대인 또는 임차인만 조회 가능합니다' });
  });

  // 임차인이 초대 토큰으로 계약 연결 (PENDING → ACTIVE) ==========================
  router.post('/accept', auth, requireRoles([ROLES.TENANT]), async (req, res) => {
    const parsed = AcceptBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const lease = await deps.leaseRepo.getByInviteToken(parsed.data.inviteToken);
    if (!lease) {
      res.status(404).json({ error: '유효하지 않은 초대 토큰입니다' });
      return;
    }
    if (lease.tenantId) {
      res.status(409).json({ error: '이미 임차인이 연결된 계약입니다' });
      return;
    }
    const updated = await deps.leaseRepo.connectTenant(lease.id, req.user!.sub);
    await deps.houseLogRepo.append({
      propertyId: updated.propertyId,
      type: 'CONTRACT',
      title: '임차인 계약 연결 완료',
      occurredAt: new Date(),
      refId: updated.id,
    });
    res.json({
      ...(await toDtoWithAddress(updated, deps.propertyRepo)),
      inviteToken: null,
    });
  });

  // 상세 조회 — 임대인(소유)·임차인(연결)·관리자만 =============================
  router.get('/:id', auth, async (req, res) => {
    const lease = await deps.leaseRepo.getById(req.params.id);
    if (!lease) {
      res.status(404).json({ error: 'lease 없음' });
      return;
    }
    const role = req.user!.role;
    const isLandlord = lease.landlordId === req.user!.sub;
    const isTenant = lease.tenantId === req.user!.sub;
    if (!isLandlord && !isTenant && role !== ROLES.ADMIN) {
      res.status(403).json({ error: '본인 계약만 조회 가능합니다' });
      return;
    }
    const dto = await toDtoWithAddress(lease, deps.propertyRepo);
    // 임차인·관리자에게는 토큰 비노출
    if (!isLandlord) dto.inviteToken = null;
    res.json(dto);
  });

  // 임대인이 계약 종료 (ACTIVE → ENDED) ========================================
  router.post('/:id/end', auth, requireRoles([ROLES.LANDLORD]), async (req, res) => {
    const lease = await deps.leaseRepo.getById(req.params.id);
    if (!lease) {
      res.status(404).json({ error: 'lease 없음' });
      return;
    }
    if (lease.landlordId !== req.user!.sub) {
      res.status(403).json({ error: '본인 계약만 종료 가능합니다' });
      return;
    }
    const updated = await deps.leaseRepo.updateStatus(lease.id, 'ENDED');
    res.json(await toDtoWithAddress(updated, deps.propertyRepo));
  });

  return router;
}
