import type { PrismaClient } from '@prisma/client';
import type { PaymentStatus, PaymentType } from '@butler/shared';

export type PaymentInput = {
  payerId: string;
  type: PaymentType;
  refId: string;
  amount: number;
  period?: string | null;
  provider?: string;
};

export type PaymentRecord = {
  id: string;
  payerId: string;
  type: PaymentType;
  refId: string;
  amount: number;
  status: PaymentStatus;
  provider: string;
  mockChargeId: string | null;
  period: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface PaymentRepository {
  create(input: PaymentInput): Promise<PaymentRecord>;
  getById(id: string): Promise<PaymentRecord | null>;
  listByPayer(payerId: string): Promise<PaymentRecord[]>;
  listByTypeRef(type: PaymentType, refId: string): Promise<PaymentRecord[]>;
  markPaid(id: string, mockChargeId: string): Promise<PaymentRecord>;
  markFailed(id: string): Promise<PaymentRecord>;
}

function nextId(): string {
  return `pay_${Math.random().toString(36).slice(2, 11)}`;
}

// === In-memory ===

export function makeInMemoryPaymentRepository(): PaymentRepository {
  const items = new Map<string, PaymentRecord>();
  return {
    async create(input) {
      const now = new Date();
      const rec: PaymentRecord = {
        id: nextId(),
        payerId: input.payerId,
        type: input.type,
        refId: input.refId,
        amount: input.amount,
        status: 'REQUESTED',
        provider: input.provider ?? 'mock',
        mockChargeId: null,
        period: input.period ?? null,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      };
      items.set(rec.id, rec);
      return rec;
    },
    async getById(id) {
      return items.get(id) ?? null;
    },
    async listByPayer(payerId) {
      return [...items.values()]
        .filter((p) => p.payerId === payerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listByTypeRef(type, refId) {
      return [...items.values()]
        .filter((p) => p.type === type && p.refId === refId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async markPaid(id, mockChargeId) {
      const rec = items.get(id);
      if (!rec) throw new Error(`payment 없음: ${id}`);
      const updated: PaymentRecord = {
        ...rec,
        status: 'PAID',
        mockChargeId,
        paidAt: new Date(),
        updatedAt: new Date(),
      };
      items.set(id, updated);
      return updated;
    },
    async markFailed(id) {
      const rec = items.get(id);
      if (!rec) throw new Error(`payment 없음: ${id}`);
      const updated: PaymentRecord = {
        ...rec,
        status: 'FAILED',
        updatedAt: new Date(),
      };
      items.set(id, updated);
      return updated;
    },
  };
}

// === Prisma ===

function toRecord(rec: {
  id: string;
  payerId: string;
  type: string;
  refId: string;
  amount: number;
  status: string;
  provider: string;
  mockChargeId: string | null;
  period: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PaymentRecord {
  return {
    id: rec.id,
    payerId: rec.payerId,
    type: rec.type as PaymentType,
    refId: rec.refId,
    amount: rec.amount,
    status: rec.status as PaymentStatus,
    provider: rec.provider,
    mockChargeId: rec.mockChargeId,
    period: rec.period,
    paidAt: rec.paidAt,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function makePrismaPaymentRepository(prisma: PrismaClient): PaymentRepository {
  return {
    async create(input) {
      const rec = await prisma.payment.create({
        data: {
          id: nextId(),
          payerId: input.payerId,
          type: input.type,
          refId: input.refId,
          amount: input.amount,
          period: input.period ?? null,
          provider: input.provider ?? 'mock',
        },
      });
      return toRecord(rec);
    },
    async getById(id) {
      const rec = await prisma.payment.findUnique({ where: { id } });
      return rec ? toRecord(rec) : null;
    },
    async listByPayer(payerId) {
      const list = await prisma.payment.findMany({
        where: { payerId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async listByTypeRef(type, refId) {
      const list = await prisma.payment.findMany({
        where: { type, refId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async markPaid(id, mockChargeId) {
      const rec = await prisma.payment.update({
        where: { id },
        data: { status: 'PAID', mockChargeId, paidAt: new Date() },
      });
      return toRecord(rec);
    },
    async markFailed(id) {
      const rec = await prisma.payment.update({
        where: { id },
        data: { status: 'FAILED' },
      });
      return toRecord(rec);
    },
  };
}
