import type { PrismaClient } from '@prisma/client';

export type PropertyInput = {
  ownerId: string;
  address: string;
  complexName?: string | null;
  dong?: string | null;
  ho?: string | null;
};

export type PropertyRecord = {
  id: string;
  ownerId: string;
  address: string;
  complexName: string | null;
  dong: string | null;
  ho: string | null;
  builtYear: number | null;
  parking: string | null;
  mgmtFee: number | null;
  marketPrice: bigint | null;
  amiScore: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface PropertyRepository {
  create(input: PropertyInput): Promise<PropertyRecord>;
  listByOwner(ownerId: string): Promise<PropertyRecord[]>;
  getById(id: string): Promise<PropertyRecord | null>;
}

function nextPropertyId(): string {
  // 짧은 prefix + 9자리 random suffix. 충돌 가능성 극히 낮음.
  return `prop_${Math.random().toString(36).slice(2, 11)}`;
}

export function makePrismaPropertyRepository(prisma: PrismaClient): PropertyRepository {
  return {
    async create(input) {
      const rec = await prisma.property.create({
        data: {
          id: nextPropertyId(),
          ownerId: input.ownerId,
          address: input.address,
          complexName: input.complexName ?? null,
          dong: input.dong ?? null,
          ho: input.ho ?? null,
        },
      });
      return rec as PropertyRecord;
    },
    async listByOwner(ownerId) {
      const list = await prisma.property.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
      });
      return list as PropertyRecord[];
    },
    async getById(id) {
      const rec = await prisma.property.findUnique({ where: { id } });
      return rec as PropertyRecord | null;
    },
  };
}

// 단위 테스트용 인메모리 구현. production에는 Prisma 사용.
export function makeInMemoryPropertyRepository(): PropertyRepository {
  const byId = new Map<string, PropertyRecord>();
  return {
    async create(input) {
      const id = nextPropertyId();
      const now = new Date();
      const rec: PropertyRecord = {
        id,
        ownerId: input.ownerId,
        address: input.address,
        complexName: input.complexName ?? null,
        dong: input.dong ?? null,
        ho: input.ho ?? null,
        builtYear: null,
        parking: null,
        mgmtFee: null,
        marketPrice: null,
        amiScore: null,
        createdAt: now,
        updatedAt: now,
      };
      byId.set(id, rec);
      return rec;
    },
    async listByOwner(ownerId) {
      return [...byId.values()]
        .filter((p) => p.ownerId === ownerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async getById(id) {
      return byId.get(id) ?? null;
    },
  };
}
