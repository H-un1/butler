import type { PrismaClient } from '@prisma/client';
import type { MaintenanceCategory } from '@butler/shared';

// 보수업체(Vendor) 디렉토리 + 평점 리뷰 저장소.
// 업체는 관리자가 등록하고, 임대인·임차인이 리뷰(1인 1리뷰)를 남긴다.
// 기존 repository 패턴(인터페이스 + in-memory + Prisma 팩토리)을 그대로 따른다.

export type VendorInput = {
  name: string;
  category: MaintenanceCategory;
  region: string;
  phone?: string | null;
  description?: string | null;
};

export type VendorRecord = {
  id: string;
  name: string;
  category: MaintenanceCategory;
  region: string;
  phone: string | null;
  description: string | null;
  createdAt: Date;
};

export type VendorReviewInput = {
  vendorId: string;
  authorId: string;
  rating: number; // 1~5
  comment?: string | null;
};

export type VendorReviewRecord = {
  id: string;
  vendorId: string;
  authorId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
};

export type VendorFilter = {
  category?: MaintenanceCategory;
  region?: string;
};

export interface VendorRepository {
  createVendor(input: VendorInput): Promise<VendorRecord>;
  getVendor(id: string): Promise<VendorRecord | null>;
  // 필터 없으면 전체, 최신순(createdAt desc)
  listVendors(filter?: VendorFilter): Promise<VendorRecord[]>;
  // 이미 같은 authorId 리뷰가 있으면 에러 throw (1인 1리뷰)
  addReview(input: VendorReviewInput): Promise<VendorReviewRecord>;
  listReviews(vendorId: string): Promise<VendorReviewRecord[]>;
}

// id 생성 — 기존 패턴(prefix + Math.random base36 slice)
function nextVendorId(): string {
  return `vnd_${Math.random().toString(36).slice(2, 11)}`;
}
function nextReviewId(): string {
  return `vrv_${Math.random().toString(36).slice(2, 11)}`;
}

// 중복 리뷰 식별을 위한 공통 에러 메시지 (라우트에서 409로 매핑)
export const DUPLICATE_REVIEW_ERROR = '이미 이 업체에 작성한 리뷰가 있습니다';

// === In-memory ===

export function makeInMemoryVendorRepository(): VendorRepository {
  const vendors = new Map<string, VendorRecord>();
  const reviews: VendorReviewRecord[] = [];

  return {
    async createVendor(input) {
      const rec: VendorRecord = {
        id: nextVendorId(),
        name: input.name,
        category: input.category,
        region: input.region,
        phone: input.phone ?? null,
        description: input.description ?? null,
        createdAt: new Date(),
      };
      vendors.set(rec.id, rec);
      return rec;
    },
    async getVendor(id) {
      return vendors.get(id) ?? null;
    },
    async listVendors(filter) {
      return [...vendors.values()]
        .filter((v) => {
          if (filter?.category && v.category !== filter.category) return false;
          if (filter?.region && v.region !== filter.region) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async addReview(input) {
      // @@unique([vendorId, authorId]) — in-memory에선 수동으로 중복 체크
      const exists = reviews.some(
        (r) => r.vendorId === input.vendorId && r.authorId === input.authorId
      );
      if (exists) {
        throw new Error(DUPLICATE_REVIEW_ERROR);
      }
      const rec: VendorReviewRecord = {
        id: nextReviewId(),
        vendorId: input.vendorId,
        authorId: input.authorId,
        rating: input.rating,
        comment: input.comment ?? null,
        createdAt: new Date(),
      };
      reviews.push(rec);
      return rec;
    },
    async listReviews(vendorId) {
      return reviews
        .filter((r) => r.vendorId === vendorId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  };
}

// === Prisma ===

function toVendorRecord(rec: {
  id: string;
  name: string;
  category: string;
  region: string;
  phone: string | null;
  description: string | null;
  createdAt: Date;
}): VendorRecord {
  return {
    id: rec.id,
    name: rec.name,
    category: rec.category as MaintenanceCategory,
    region: rec.region,
    phone: rec.phone,
    description: rec.description,
    createdAt: rec.createdAt,
  };
}

function toReviewRecord(rec: {
  id: string;
  vendorId: string;
  authorId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}): VendorReviewRecord {
  return {
    id: rec.id,
    vendorId: rec.vendorId,
    authorId: rec.authorId,
    rating: rec.rating,
    comment: rec.comment,
    createdAt: rec.createdAt,
  };
}

export function makePrismaVendorRepository(prisma: PrismaClient): VendorRepository {
  return {
    async createVendor(input) {
      const rec = await prisma.vendor.create({
        data: {
          id: nextVendorId(),
          name: input.name,
          category: input.category,
          region: input.region,
          phone: input.phone ?? null,
          description: input.description ?? null,
        },
      });
      return toVendorRecord(rec);
    },
    async getVendor(id) {
      const rec = await prisma.vendor.findUnique({ where: { id } });
      return rec ? toVendorRecord(rec) : null;
    },
    async listVendors(filter) {
      const list = await prisma.vendor.findMany({
        where: {
          ...(filter?.category ? { category: filter.category } : {}),
          ...(filter?.region ? { region: filter.region } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toVendorRecord);
    },
    async addReview(input) {
      // @@unique([vendorId, authorId]) — DB 제약으로 중복이면 Prisma가 throw하지만,
      // 명확한 에러 메시지를 위해 사전 조회 후 throw한다.
      const existing = await prisma.vendorReview.findUnique({
        where: {
          vendorId_authorId: {
            vendorId: input.vendorId,
            authorId: input.authorId,
          },
        },
      });
      if (existing) {
        throw new Error(DUPLICATE_REVIEW_ERROR);
      }
      const rec = await prisma.vendorReview.create({
        data: {
          id: nextReviewId(),
          vendorId: input.vendorId,
          authorId: input.authorId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
      });
      return toReviewRecord(rec);
    },
    async listReviews(vendorId) {
      const list = await prisma.vendorReview.findMany({
        where: { vendorId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toReviewRecord);
    },
  };
}
