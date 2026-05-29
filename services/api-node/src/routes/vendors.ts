import { Router } from 'express';
import { z } from 'zod';
import { MAINTENANCE_CATEGORIES, ROLES } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth, requireRoles } from '../auth/rbac.js';
import type {
  VendorRepository,
  VendorRecord,
} from '../vendor/repository.js';
import { DUPLICATE_REVIEW_ERROR } from '../vendor/repository.js';
import { computeRating } from '../vendor/rating.js';

// 보수업체 매칭 — 디렉토리(등록·검색) + 평점 리뷰.
// 등록은 관리자(ADMIN), 리뷰는 임대인(LANDLORD)·임차인(TENANT)이 작성한다.

const CreateVendorBody = z.object({
  name: z.string().min(1),
  category: z.enum(MAINTENANCE_CATEGORIES),
  region: z.string().min(1),
  phone: z.string().optional(),
  description: z.string().optional(),
});

const ReviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export type VendorsDeps = {
  vendorRepo: VendorRepository;
};

// 업체 DTO — 평점 집계(avgRating/reviewCount)를 포함한다.
function toVendorDto(
  v: VendorRecord,
  summary: { avgRating: number; reviewCount: number }
) {
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    region: v.region,
    phone: v.phone,
    description: v.description,
    avgRating: summary.avgRating,
    reviewCount: summary.reviewCount,
    createdAt: v.createdAt.toISOString(),
  };
}

export function buildVendorsRouter(env: Env, deps: VendorsDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  // 업체 등록 — 관리자만 ========================================================
  router.post('/', auth, requireRoles([ROLES.ADMIN]), async (req, res) => {
    const parsed = CreateVendorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const created = await deps.vendorRepo.createVendor({
      name: parsed.data.name,
      category: parsed.data.category,
      region: parsed.data.region,
      phone: parsed.data.phone ?? null,
      description: parsed.data.description ?? null,
    });
    // 신규 등록 업체는 아직 리뷰가 없으므로 빈 집계
    res.status(201).json(toVendorDto(created, computeRating([])));
  });

  // 업체 목록 + 검색(category·region 필터) — 인증된 사용자 ======================
  router.get('/', auth, async (req, res) => {
    const category = req.query.category;
    const region = req.query.region;
    const filter: { category?: (typeof MAINTENANCE_CATEGORIES)[number]; region?: string } =
      {};
    // category는 유효한 enum일 때만 필터로 적용한다(오타·미지원 값은 무시).
    if (
      typeof category === 'string' &&
      (MAINTENANCE_CATEGORIES as readonly string[]).includes(category)
    ) {
      filter.category = category as (typeof MAINTENANCE_CATEGORIES)[number];
    }
    if (typeof region === 'string' && region.length > 0) {
      filter.region = region;
    }
    const list = await deps.vendorRepo.listVendors(filter);
    // 각 업체별 리뷰 집계 — listReviews로 평점/리뷰 수 산출
    const dtos = await Promise.all(
      list.map(async (v) => {
        const reviews = await deps.vendorRepo.listReviews(v.id);
        return toVendorDto(v, computeRating(reviews));
      })
    );
    res.json(dtos);
  });

  // 업체 상세 — 리뷰 배열 + 집계 ================================================
  router.get('/:id', auth, async (req, res) => {
    const v = await deps.vendorRepo.getVendor(req.params.id);
    if (!v) {
      res.status(404).json({ error: 'vendor 없음' });
      return;
    }
    const reviews = await deps.vendorRepo.listReviews(v.id);
    res.json({
      ...toVendorDto(v, computeRating(reviews)),
      reviews: reviews.map((r) => ({
        id: r.id,
        authorId: r.authorId,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  // 리뷰 작성 — 임대인·임차인(1인 1리뷰) =======================================
  router.post(
    '/:id/reviews',
    auth,
    requireRoles([ROLES.LANDLORD, ROLES.TENANT]),
    async (req, res) => {
      const parsed = ReviewBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
        return;
      }
      const v = await deps.vendorRepo.getVendor(req.params.id);
      if (!v) {
        res.status(404).json({ error: 'vendor 없음' });
        return;
      }
      try {
        const review = await deps.vendorRepo.addReview({
          vendorId: v.id,
          authorId: req.user!.sub,
          rating: parsed.data.rating,
          comment: parsed.data.comment ?? null,
        });
        res.status(201).json({
          id: review.id,
          vendorId: review.vendorId,
          authorId: review.authorId,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt.toISOString(),
        });
      } catch (err) {
        // 중복 리뷰(1인 1리뷰 위반)는 409로 매핑
        if (err instanceof Error && err.message === DUPLICATE_REVIEW_ERROR) {
          res.status(409).json({ error: DUPLICATE_REVIEW_ERROR });
          return;
        }
        throw err;
      }
    }
  );

  return router;
}
