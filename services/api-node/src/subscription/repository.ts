import type { PrismaClient } from '@prisma/client';
import type { SubscriptionStatus, SubscriptionTier } from '@butler/shared';

export type SubscriptionInput = {
  landlordId: string;
  propertyCount: number;
  tier: SubscriptionTier;
  monthlyFee: number;
  billingDate: number;
};

export type SubscriptionRecord = {
  id: string;
  landlordId: string;
  propertyCount: number;
  tier: SubscriptionTier;
  monthlyFee: number;
  status: SubscriptionStatus;
  billingDate: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface SubscriptionRepository {
  create(input: SubscriptionInput): Promise<SubscriptionRecord>;
  getActiveByLandlord(landlordId: string): Promise<SubscriptionRecord | null>;
  cancel(id: string): Promise<SubscriptionRecord>;
  listAll(): Promise<SubscriptionRecord[]>; // 관리자 콘솔용
}

function nextId(): string {
  return `sub_${Math.random().toString(36).slice(2, 11)}`;
}

export function makeInMemorySubscriptionRepository(): SubscriptionRepository {
  const byId = new Map<string, SubscriptionRecord>();

  function findActive(landlordId: string): SubscriptionRecord | null {
    for (const s of byId.values()) {
      if (s.landlordId === landlordId && s.status === 'ACTIVE') return s;
    }
    return null;
  }

  return {
    async create(input) {
      if (findActive(input.landlordId)) {
        throw new Error(`이미 활성 구독 보유: ${input.landlordId}`);
      }
      const now = new Date();
      const rec: SubscriptionRecord = {
        id: nextId(),
        landlordId: input.landlordId,
        propertyCount: input.propertyCount,
        tier: input.tier,
        monthlyFee: input.monthlyFee,
        status: 'ACTIVE',
        billingDate: input.billingDate,
        createdAt: now,
        updatedAt: now,
      };
      byId.set(rec.id, rec);
      return rec;
    },
    async getActiveByLandlord(landlordId) {
      return findActive(landlordId);
    },
    async cancel(id) {
      const rec = byId.get(id);
      if (!rec) throw new Error(`subscription 없음: ${id}`);
      const updated: SubscriptionRecord = {
        ...rec,
        status: 'CANCELED',
        updatedAt: new Date(),
      };
      byId.set(id, updated);
      return updated;
    },
    async listAll() {
      return [...byId.values()].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    },
  };
}

export function makePrismaSubscriptionRepository(
  prisma: PrismaClient
): SubscriptionRepository {
  return {
    async create(input) {
      const existing = await prisma.subscription.findFirst({
        where: { landlordId: input.landlordId, status: 'ACTIVE' },
      });
      if (existing) {
        throw new Error(`이미 활성 구독 보유: ${input.landlordId}`);
      }
      const rec = await prisma.subscription.create({
        data: {
          id: nextId(),
          landlordId: input.landlordId,
          propertyCount: input.propertyCount,
          tier: input.tier,
          monthlyFee: input.monthlyFee,
          billingDate: input.billingDate,
        },
      });
      return rec as SubscriptionRecord;
    },
    async getActiveByLandlord(landlordId) {
      const rec = await prisma.subscription.findFirst({
        where: { landlordId, status: 'ACTIVE' },
      });
      return rec as SubscriptionRecord | null;
    },
    async cancel(id) {
      const rec = await prisma.subscription.update({
        where: { id },
        data: { status: 'CANCELED' },
      });
      return rec as SubscriptionRecord;
    },
    async listAll() {
      const list = await prisma.subscription.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return list as SubscriptionRecord[];
    },
  };
}
