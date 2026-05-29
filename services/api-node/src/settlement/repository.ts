import type { PrismaClient } from '@prisma/client';
import type { SettlementEventType, SettlementStatus } from '@butler/shared';
import type {
  SettlementComputation,
  SettlementLineResult,
} from './rules.js';

export type SettlementInput = {
  leaseId: string;
  inspectionId?: string | null;
  landlordId: string;
  tenantId?: string | null;
  computation: SettlementComputation;
};

export type SettlementRecord = {
  id: string;
  leaseId: string;
  inspectionId: string | null;
  landlordId: string;
  tenantId: string | null;
  status: SettlementStatus;
  ruleVersion: string;
  totalCost: number;
  tenantTotal: number;
  landlordTotal: number;
  lines: SettlementLineResult[];
  basis: SettlementComputation['basis'];
  createdAt: Date;
  updatedAt: Date;
};

export type SettlementEventInput = {
  settlementId: string;
  actorId: string;
  type: SettlementEventType;
  note?: string | null;
};

export type SettlementEventRecord = {
  id: string;
  settlementId: string;
  actorId: string;
  type: SettlementEventType;
  note: string | null;
  createdAt: Date;
};

export interface SettlementRepository {
  create(input: SettlementInput): Promise<SettlementRecord>;
  getById(id: string): Promise<SettlementRecord | null>;
  listByLease(leaseId: string): Promise<SettlementRecord[]>;
  listByLandlord(landlordId: string): Promise<SettlementRecord[]>;
  listByTenant(tenantId: string): Promise<SettlementRecord[]>;
  updateStatus(id: string, status: SettlementStatus): Promise<SettlementRecord>;
  addEvent(input: SettlementEventInput): Promise<SettlementEventRecord>;
  listEvents(settlementId: string): Promise<SettlementEventRecord[]>;
}

function nextId(): string {
  return `stl_${Math.random().toString(36).slice(2, 11)}`;
}
function nextEventId(): string {
  return `sev_${Math.random().toString(36).slice(2, 11)}`;
}

function fromComputation(input: SettlementInput): Omit<
  SettlementRecord,
  'id' | 'createdAt' | 'updatedAt' | 'status'
> {
  return {
    leaseId: input.leaseId,
    inspectionId: input.inspectionId ?? null,
    landlordId: input.landlordId,
    tenantId: input.tenantId ?? null,
    ruleVersion: input.computation.ruleVersion,
    totalCost: input.computation.totalCost,
    tenantTotal: input.computation.tenantTotal,
    landlordTotal: input.computation.landlordTotal,
    lines: input.computation.lines,
    basis: input.computation.basis,
  };
}

// === In-memory ===

export function makeInMemorySettlementRepository(): SettlementRepository {
  const settlements = new Map<string, SettlementRecord>();
  const events: SettlementEventRecord[] = [];

  return {
    async create(input) {
      const now = new Date();
      const rec: SettlementRecord = {
        id: nextId(),
        status: 'DRAFT',
        createdAt: now,
        updatedAt: now,
        ...fromComputation(input),
      };
      settlements.set(rec.id, rec);
      return rec;
    },
    async getById(id) {
      return settlements.get(id) ?? null;
    },
    async listByLease(leaseId) {
      return [...settlements.values()]
        .filter((s) => s.leaseId === leaseId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listByLandlord(landlordId) {
      return [...settlements.values()]
        .filter((s) => s.landlordId === landlordId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listByTenant(tenantId) {
      return [...settlements.values()]
        .filter((s) => s.tenantId === tenantId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async updateStatus(id, status) {
      const rec = settlements.get(id);
      if (!rec) throw new Error(`settlement 없음: ${id}`);
      const updated: SettlementRecord = { ...rec, status, updatedAt: new Date() };
      settlements.set(id, updated);
      return updated;
    },
    async addEvent(input) {
      const rec: SettlementEventRecord = {
        id: nextEventId(),
        settlementId: input.settlementId,
        actorId: input.actorId,
        type: input.type,
        note: input.note ?? null,
        createdAt: new Date(),
      };
      events.push(rec);
      return rec;
    },
    async listEvents(settlementId) {
      return events
        .filter((e) => e.settlementId === settlementId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };
}

// === Prisma ===

function toRecord(rec: {
  id: string;
  leaseId: string;
  inspectionId: string | null;
  landlordId: string;
  tenantId: string | null;
  status: string;
  ruleVersion: string;
  totalCost: number;
  tenantTotal: number;
  landlordTotal: number;
  lines: unknown;
  basis: unknown;
  createdAt: Date;
  updatedAt: Date;
}): SettlementRecord {
  return {
    id: rec.id,
    leaseId: rec.leaseId,
    inspectionId: rec.inspectionId,
    landlordId: rec.landlordId,
    tenantId: rec.tenantId,
    status: rec.status as SettlementStatus,
    ruleVersion: rec.ruleVersion,
    totalCost: rec.totalCost,
    tenantTotal: rec.tenantTotal,
    landlordTotal: rec.landlordTotal,
    lines: (rec.lines as SettlementLineResult[]) ?? [],
    basis: rec.basis as SettlementComputation['basis'],
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function makePrismaSettlementRepository(
  prisma: PrismaClient
): SettlementRepository {
  return {
    async create(input) {
      const data = fromComputation(input);
      const rec = await prisma.settlement.create({
        data: {
          id: nextId(),
          leaseId: data.leaseId,
          inspectionId: data.inspectionId,
          landlordId: data.landlordId,
          tenantId: data.tenantId,
          ruleVersion: data.ruleVersion,
          totalCost: data.totalCost,
          tenantTotal: data.tenantTotal,
          landlordTotal: data.landlordTotal,
          lines: data.lines as unknown as object,
          basis: data.basis as unknown as object,
        },
      });
      return toRecord(rec);
    },
    async getById(id) {
      const rec = await prisma.settlement.findUnique({ where: { id } });
      return rec ? toRecord(rec) : null;
    },
    async listByLease(leaseId) {
      const list = await prisma.settlement.findMany({
        where: { leaseId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async listByLandlord(landlordId) {
      const list = await prisma.settlement.findMany({
        where: { landlordId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async listByTenant(tenantId) {
      const list = await prisma.settlement.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async updateStatus(id, status) {
      const rec = await prisma.settlement.update({
        where: { id },
        data: { status },
      });
      return toRecord(rec);
    },
    async addEvent(input) {
      const rec = await prisma.settlementEvent.create({
        data: {
          id: nextEventId(),
          settlementId: input.settlementId,
          actorId: input.actorId,
          type: input.type,
          note: input.note ?? null,
        },
      });
      return {
        id: rec.id,
        settlementId: rec.settlementId,
        actorId: rec.actorId,
        type: rec.type as SettlementEventType,
        note: rec.note,
        createdAt: rec.createdAt,
      };
    },
    async listEvents(settlementId) {
      const list = await prisma.settlementEvent.findMany({
        where: { settlementId },
        orderBy: { createdAt: 'asc' },
      });
      return list.map((rec) => ({
        id: rec.id,
        settlementId: rec.settlementId,
        actorId: rec.actorId,
        type: rec.type as SettlementEventType,
        note: rec.note,
        createdAt: rec.createdAt,
      }));
    },
  };
}
