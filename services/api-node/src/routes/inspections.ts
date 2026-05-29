import { Router } from 'express';
import { z } from 'zod';
import { INSPECTION_GRADES, INSPECTION_TYPES, ROLES, isValidRole } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type { InspectionRepository } from '../inspection/repository.js';
import type { PropertyRepository } from '../properties/repository.js';
import type { HouseLogRepository } from '../houseLog/repository.js';
import type { UserStore } from '../auth/userStore.js';
import {
  finalizeInspection,
  type ReportPdfClient,
} from '../inspection/reportPipeline.js';

const RequestBody = z.object({
  propertyId: z.string().min(1),
  inspectorId: z.string().min(1).optional(),
  type: z.enum(INSPECTION_TYPES),
  scheduledAt: z.string().datetime(),
});

const AddItemBody = z.object({
  area: z.string().min(1),
  checklistKey: z.string().min(1),
  grade: z.enum(INSPECTION_GRADES),
  note: z.string().optional(),
  markedDefect: z.boolean().optional(),
  photoUrls: z.array(z.string()).optional(),
});

export type InspectionsDeps = {
  inspectionRepo: InspectionRepository;
  propertyRepo: PropertyRepository;
  houseLogRepo: HouseLogRepository;
  pdfClient: ReportPdfClient | null;
  userStore?: UserStore;
};

export function buildInspectionsRouter(env: Env, deps: InspectionsDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // 임대인이 점검 의뢰 ============================================================
  router.post(
    '/',
    auth,
    requireRoles([ROLES.LANDLORD]),
    async (req, res) => {
      const parsed = RequestBody.safeParse(req.body);
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
        res.status(403).json({ error: '본인 소유 물건만 의뢰 가능합니다' });
        return;
      }
      let inspectorId = parsed.data.inspectorId;
      if (!inspectorId) {
        if (!deps.userStore) {
          res.status(400).json({
            error: 'inspectorId가 필요합니다 (자동 배정 미설정)',
          });
          return;
        }
        const inspectors = await deps.userStore.listByRole(ROLES.INSPECTOR);
        if (inspectors.length === 0) {
          res.status(409).json({
            error:
              '점검자가 등록되지 않았습니다. 점검자가 먼저 mock 로그인해야 합니다.',
          });
          return;
        }
        inspectorId = inspectors[0].id;
      }
      const insp = await deps.inspectionRepo.create({
        propertyId: parsed.data.propertyId,
        inspectorId,
        type: parsed.data.type,
        scheduledAt: new Date(parsed.data.scheduledAt),
      });
      res.status(201).json({
        id: insp.id,
        status: insp.status,
        type: insp.type,
        scheduledAt: insp.scheduledAt.toISOString(),
      });
    }
  );

  // 임대인(소유)·관리자: 특정 물건의 점검 목록 — 정산 연결 드롭다운 등에 사용 ====
  router.get('/', auth, async (req, res) => {
    const propertyId =
      typeof req.query.propertyId === 'string' ? req.query.propertyId : '';
    if (!propertyId) {
      res.status(400).json({ error: 'propertyId 쿼리가 필요합니다' });
      return;
    }
    const prop = await deps.propertyRepo.getById(propertyId);
    if (!prop) {
      res.status(404).json({ error: '물건을 찾을 수 없습니다' });
      return;
    }
    if (prop.ownerId !== req.user!.sub && req.user!.role !== ROLES.ADMIN) {
      res.status(403).json({ error: '본인 소유 물건만 조회 가능합니다' });
      return;
    }
    const list = await deps.inspectionRepo.listByProperty(propertyId);
    res.json(
      list.map((i) => ({
        id: i.id,
        type: i.type,
        status: i.status,
        scheduledAt: i.scheduledAt.toISOString(),
      }))
    );
  });

  // 점검자가 내 의뢰 목록 조회 ====================================================
  router.get(
    '/mine',
    auth,
    requireRoles([ROLES.INSPECTOR]),
    async (req, res) => {
      const list = await deps.inspectionRepo.listByInspector(req.user!.sub);
      // 가산: 프론트가 propertyId 대신 사람이 읽을 주소/단지명을 표시하도록 추가.
      // 목록이라 항목마다 조회 — N+1 허용(인메모리/시연 범위).
      const items = await Promise.all(
        list.map(async (i) => {
          const prop = await deps.propertyRepo.getById(i.propertyId);
          return {
            id: i.id,
            propertyId: i.propertyId,
            type: i.type,
            status: i.status,
            scheduledAt: i.scheduledAt.toISOString(),
            propertyAddress: prop?.address ?? null,
            propertyComplexName: prop?.complexName ?? null,
          };
        })
      );
      res.json(items);
    }
  );

  // 상세 조회 — 임대인(소유자) 또는 점검자(담당)만 ===============================
  router.get('/:id', auth, async (req, res) => {
    if (!isValidRole(req.user!.role)) {
      res.status(403).json({ error: '권한 없음' });
      return;
    }
    const insp = await deps.inspectionRepo.getById(req.params.id);
    if (!insp) {
      res.status(404).json({ error: 'inspection 없음' });
      return;
    }
    const prop = await deps.propertyRepo.getById(insp.propertyId);
    const isOwner = !!prop && prop.ownerId === req.user!.sub;
    const isInspector = insp.inspectorId === req.user!.sub;
    if (!isOwner && !isInspector && req.user!.role !== ROLES.ADMIN) {
      res.status(403).json({ error: '본인 점검만 조회 가능합니다' });
      return;
    }
    const items = await deps.inspectionRepo.listItems(insp.id);
    const report = await deps.inspectionRepo.getReport(insp.id);
    res.json({
      id: insp.id,
      propertyId: insp.propertyId,
      inspectorId: insp.inspectorId,
      type: insp.type,
      status: insp.status,
      scheduledAt: insp.scheduledAt.toISOString(),
      // 가산: 사람이 읽을 주소/단지명 (prop은 위에서 권한 판정용으로 이미 조회됨)
      propertyAddress: prop?.address ?? null,
      propertyComplexName: prop?.complexName ?? null,
      items: items.map((i) => ({
        id: i.id,
        area: i.area,
        checklistKey: i.checklistKey,
        grade: i.grade,
        note: i.note,
        markedDefect: i.markedDefect,
        photoUrls: i.photoUrls,
      })),
      report: report
        ? {
            id: report.id,
            pdfUrl: report.pdfUrl,
            generatedAt: report.generatedAt.toISOString(),
            status: report.status,
          }
        : null,
    });
  });

  // 점검자가 의뢰 수락 (REQUESTED → IN_PROGRESS) =================================
  router.post(
    '/:id/accept',
    auth,
    requireRoles([ROLES.INSPECTOR]),
    async (req, res) => {
      const insp = await deps.inspectionRepo.getById(req.params.id);
      if (!insp) {
        res.status(404).json({ error: 'inspection 없음' });
        return;
      }
      if (insp.inspectorId !== req.user!.sub) {
        res.status(403).json({ error: '본인 배정 점검만 수락 가능합니다' });
        return;
      }
      const updated = await deps.inspectionRepo.updateStatus(insp.id, 'IN_PROGRESS');
      res.json({ id: updated.id, status: updated.status });
    }
  );

  // 점검자가 항목 추가 ===========================================================
  router.post(
    '/:id/items',
    auth,
    requireRoles([ROLES.INSPECTOR]),
    async (req, res) => {
      const insp = await deps.inspectionRepo.getById(req.params.id);
      if (!insp) {
        res.status(404).json({ error: 'inspection 없음' });
        return;
      }
      if (insp.inspectorId !== req.user!.sub) {
        res.status(403).json({ error: '본인 배정 점검만 항목 추가 가능합니다' });
        return;
      }
      if (insp.status !== 'IN_PROGRESS') {
        res.status(409).json({
          error: `현재 상태(${insp.status})에서는 항목 추가 불가 — IN_PROGRESS 필요`,
        });
        return;
      }
      const parsed = AddItemBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
        return;
      }
      const item = await deps.inspectionRepo.appendItem({
        inspectionId: insp.id,
        ...parsed.data,
      });
      res.status(201).json({
        id: item.id,
        area: item.area,
        grade: item.grade,
        markedDefect: item.markedDefect,
      });
    }
  );

  // 점검자가 제출 → PDF + HouseLog 자동 기록 ====================================
  router.post(
    '/:id/submit',
    auth,
    requireRoles([ROLES.INSPECTOR]),
    async (req, res) => {
      const insp = await deps.inspectionRepo.getById(req.params.id);
      if (!insp) {
        res.status(404).json({ error: 'inspection 없음' });
        return;
      }
      if (insp.inspectorId !== req.user!.sub) {
        res.status(403).json({ error: '본인 배정 점검만 제출 가능합니다' });
        return;
      }
      const result = await finalizeInspection(
        insp,
        deps.inspectionRepo,
        deps.houseLogRepo,
        deps.pdfClient
      );
      if (!result.report) {
        res.status(200).json({
          status: 'submitted-no-report',
          reason: result.unavailableReason,
        });
        return;
      }
      res.json({
        status: 'done',
        pdfUrl: result.report.pdfUrl,
        generatedAt: result.report.generatedAt.toISOString(),
      });
    }
  );

  return router;
}
