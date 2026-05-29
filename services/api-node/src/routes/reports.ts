import { Router } from 'express';
import { ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth } from '../auth/rbac.js';
import type { InspectionRepository } from '../inspection/repository.js';
import type { PropertyRepository } from '../properties/repository.js';

export type ReportsDeps = {
  inspectionRepo: InspectionRepository;
  propertyRepo: PropertyRepository;
  aiBackendBaseUrl: string | null;
};

export function buildReportsRouter(env: Env, deps: ReportsDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // PDF 프록시 — inspectionId 기반. 본인 소유 물건/배정 점검자/ADMIN만 허용.
  router.get('/by-inspection/:inspectionId/pdf', auth, async (req, res) => {
    const user = req.user!;
    const inspectionId = req.params.inspectionId;
    const insp = await deps.inspectionRepo.getById(inspectionId);
    if (!insp) {
      res.status(404).json({ error: '점검을 찾을 수 없습니다' });
      return;
    }
    const prop = await deps.propertyRepo.getById(insp.propertyId);
    const isOwner = !!prop && prop.ownerId === user.sub;
    const isInspector = insp.inspectorId === user.sub;
    const isAdmin = user.role === ROLES.ADMIN;
    if (!isOwner && !isInspector && !isAdmin) {
      res.status(403).json({ error: '본인 점검 PDF만 조회 가능합니다' });
      return;
    }

    if (!deps.aiBackendBaseUrl) {
      res.status(503).json({ error: 'AI 백엔드 미설정' });
      return;
    }

    let upstream: Response;
    try {
      upstream = await fetch(
        `${deps.aiBackendBaseUrl}/reports/pdf/${inspectionId}`
      );
    } catch (err) {
      res.status(502).json({
        error: 'AI 백엔드 호출 실패',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (upstream.status === 404) {
      res
        .status(404)
        .json({
          error:
            'PDF 파일을 찾을 수 없습니다 — 점검이 제출되어야 PDF가 생성됩니다.',
        });
      return;
    }
    if (!upstream.ok) {
      res.status(502).json({
        error: 'AI 백엔드 응답 오류',
        status: upstream.status,
      });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="report-${inspectionId}.pdf"`
    );
    res.send(buf);
  });

  return router;
}
