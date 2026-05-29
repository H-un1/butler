import type { PrismaClient } from '@prisma/client';
import type { MaintenanceCategory, MaintenanceStatus } from '@butler/shared';

// 수선요청 이슈 협업보드 — 임차인이 생성, 임대인·관리자·임차인이 공동 관리.
// 코멘트/상태전이 이력은 MaintenanceComment에 append-only로 아카이빙한다.

export type MaintenanceInput = {
  propertyId: string;
  leaseId?: string | null;
  requesterId: string;
  category: MaintenanceCategory;
  title: string;
  description?: string | null;
  photoUrls?: string[];
};

export type MaintenanceRecord = {
  id: string;
  propertyId: string;
  leaseId: string | null;
  requesterId: string;
  category: MaintenanceCategory;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  photoUrls: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type MaintenanceCommentInput = {
  requestId: string;
  authorId: string;
  body: string;
  systemEvent?: boolean;
};

export type MaintenanceCommentRecord = {
  id: string;
  requestId: string;
  authorId: string;
  body: string;
  systemEvent: boolean;
  createdAt: Date;
};

export interface MaintenanceRepository {
  create(input: MaintenanceInput): Promise<MaintenanceRecord>;
  getById(id: string): Promise<MaintenanceRecord | null>;
  listByProperty(propertyId: string): Promise<MaintenanceRecord[]>;
  listByProperties(propertyIds: string[]): Promise<MaintenanceRecord[]>;
  listByRequester(requesterId: string): Promise<MaintenanceRecord[]>;
  listAll(): Promise<MaintenanceRecord[]>; // 관리자 콘솔용

  updateStatus(id: string, status: MaintenanceStatus): Promise<MaintenanceRecord>;
  addComment(input: MaintenanceCommentInput): Promise<MaintenanceCommentRecord>;
  listComments(requestId: string): Promise<MaintenanceCommentRecord[]>;
}

function nextReqId(): string {
  return `mnt_${Math.random().toString(36).slice(2, 11)}`;
}
function nextCommentId(): string {
  return `mcm_${Math.random().toString(36).slice(2, 11)}`;
}

// === In-memory ===

export function makeInMemoryMaintenanceRepository(): MaintenanceRepository {
  const reqs = new Map<string, MaintenanceRecord>();
  const comments: MaintenanceCommentRecord[] = [];

  return {
    async create(input) {
      const now = new Date();
      const rec: MaintenanceRecord = {
        id: nextReqId(),
        propertyId: input.propertyId,
        leaseId: input.leaseId ?? null,
        requesterId: input.requesterId,
        category: input.category,
        title: input.title,
        description: input.description ?? null,
        status: 'OPEN',
        photoUrls: input.photoUrls ?? [],
        createdAt: now,
        updatedAt: now,
      };
      reqs.set(rec.id, rec);
      return rec;
    },
    async getById(id) {
      return reqs.get(id) ?? null;
    },
    async listByProperty(propertyId) {
      return [...reqs.values()]
        .filter((r) => r.propertyId === propertyId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listByProperties(propertyIds) {
      const set = new Set(propertyIds);
      return [...reqs.values()]
        .filter((r) => set.has(r.propertyId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listByRequester(requesterId) {
      return [...reqs.values()]
        .filter((r) => r.requesterId === requesterId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listAll() {
      return [...reqs.values()].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    },
    async updateStatus(id, status) {
      const rec = reqs.get(id);
      if (!rec) throw new Error(`maintenance 없음: ${id}`);
      const updated: MaintenanceRecord = { ...rec, status, updatedAt: new Date() };
      reqs.set(id, updated);
      return updated;
    },
    async addComment(input) {
      const rec: MaintenanceCommentRecord = {
        id: nextCommentId(),
        requestId: input.requestId,
        authorId: input.authorId,
        body: input.body,
        systemEvent: input.systemEvent ?? false,
        createdAt: new Date(),
      };
      comments.push(rec);
      return rec;
    },
    async listComments(requestId) {
      return comments
        .filter((c) => c.requestId === requestId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };
}

// === Prisma ===

function toRecord(rec: {
  id: string;
  propertyId: string;
  leaseId: string | null;
  requesterId: string;
  category: string;
  title: string;
  description: string | null;
  status: string;
  photoUrls: unknown;
  createdAt: Date;
  updatedAt: Date;
}): MaintenanceRecord {
  return {
    id: rec.id,
    propertyId: rec.propertyId,
    leaseId: rec.leaseId,
    requesterId: rec.requesterId,
    category: rec.category as MaintenanceCategory,
    title: rec.title,
    description: rec.description,
    status: rec.status as MaintenanceStatus,
    photoUrls: Array.isArray(rec.photoUrls) ? (rec.photoUrls as string[]) : [],
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function makePrismaMaintenanceRepository(
  prisma: PrismaClient
): MaintenanceRepository {
  return {
    async create(input) {
      const rec = await prisma.maintenanceRequest.create({
        data: {
          id: nextReqId(),
          propertyId: input.propertyId,
          leaseId: input.leaseId ?? null,
          requesterId: input.requesterId,
          category: input.category,
          title: input.title,
          description: input.description ?? null,
          photoUrls: input.photoUrls
            ? (input.photoUrls as unknown as object)
            : undefined,
        },
      });
      return toRecord(rec);
    },
    async getById(id) {
      const rec = await prisma.maintenanceRequest.findUnique({ where: { id } });
      return rec ? toRecord(rec) : null;
    },
    async listByProperty(propertyId) {
      const list = await prisma.maintenanceRequest.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async listByProperties(propertyIds) {
      const list = await prisma.maintenanceRequest.findMany({
        where: { propertyId: { in: propertyIds } },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async listByRequester(requesterId) {
      const list = await prisma.maintenanceRequest.findMany({
        where: { requesterId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async listAll() {
      const list = await prisma.maintenanceRequest.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async updateStatus(id, status) {
      const rec = await prisma.maintenanceRequest.update({
        where: { id },
        data: { status },
      });
      return toRecord(rec);
    },
    async addComment(input) {
      const rec = await prisma.maintenanceComment.create({
        data: {
          id: nextCommentId(),
          requestId: input.requestId,
          authorId: input.authorId,
          body: input.body,
          systemEvent: input.systemEvent ?? false,
        },
      });
      return {
        id: rec.id,
        requestId: rec.requestId,
        authorId: rec.authorId,
        body: rec.body,
        systemEvent: rec.systemEvent,
        createdAt: rec.createdAt,
      };
    },
    async listComments(requestId) {
      const list = await prisma.maintenanceComment.findMany({
        where: { requestId },
        orderBy: { createdAt: 'asc' },
      });
      return list.map((rec) => ({
        id: rec.id,
        requestId: rec.requestId,
        authorId: rec.authorId,
        body: rec.body,
        systemEvent: rec.systemEvent,
        createdAt: rec.createdAt,
      }));
    },
  };
}
