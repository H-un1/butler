import type { PrismaClient } from '@prisma/client';
import type { LeaseStatus } from '@butler/shared';

// 임대차 계약(Lease) — 임대인이 생성하고 초대 토큰으로 임차인을 연결한다.
// tenantId는 초대 수락 전까지 null (status PENDING).

export type LeaseInput = {
  propertyId: string;
  landlordId: string;
  deposit: bigint | number;
  rent?: number | null;
  startAt: Date;
  endAt: Date;
  invitedPhone?: string | null;
};

export type LeaseRecord = {
  id: string;
  propertyId: string;
  landlordId: string;
  tenantId: string | null;
  status: LeaseStatus;
  deposit: bigint;
  rent: number | null;
  startAt: Date;
  endAt: Date;
  inviteToken: string | null;
  invitedPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface LeaseRepository {
  create(input: LeaseInput): Promise<LeaseRecord>;
  getById(id: string): Promise<LeaseRecord | null>;
  getByInviteToken(token: string): Promise<LeaseRecord | null>;
  listByLandlord(landlordId: string): Promise<LeaseRecord[]>;
  listByTenant(tenantId: string): Promise<LeaseRecord[]>;
  listByProperty(propertyId: string): Promise<LeaseRecord[]>;
  listAll(): Promise<LeaseRecord[]>; // CRM scan/관리자용
  connectTenant(id: string, tenantId: string): Promise<LeaseRecord>;
  updateStatus(id: string, status: LeaseStatus): Promise<LeaseRecord>;
}

function nextLeaseId(): string {
  return `lease_${Math.random().toString(36).slice(2, 11)}`;
}
function nextInviteToken(): string {
  // 추측 어려운 토큰 — 고유식별정보 미포함
  return `inv_${Math.random().toString(36).slice(2, 10)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// === In-memory ===

export function makeInMemoryLeaseRepository(): LeaseRepository {
  const leases = new Map<string, LeaseRecord>();

  return {
    async create(input) {
      const now = new Date();
      const rec: LeaseRecord = {
        id: nextLeaseId(),
        propertyId: input.propertyId,
        landlordId: input.landlordId,
        tenantId: null,
        status: 'PENDING',
        deposit: BigInt(input.deposit),
        rent: input.rent ?? null,
        startAt: input.startAt,
        endAt: input.endAt,
        inviteToken: nextInviteToken(),
        invitedPhone: input.invitedPhone ?? null,
        createdAt: now,
        updatedAt: now,
      };
      leases.set(rec.id, rec);
      return rec;
    },
    async getById(id) {
      return leases.get(id) ?? null;
    },
    async getByInviteToken(token) {
      return (
        [...leases.values()].find((l) => l.inviteToken === token) ?? null
      );
    },
    async listByLandlord(landlordId) {
      return [...leases.values()]
        .filter((l) => l.landlordId === landlordId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listByTenant(tenantId) {
      return [...leases.values()]
        .filter((l) => l.tenantId === tenantId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listByProperty(propertyId) {
      return [...leases.values()]
        .filter((l) => l.propertyId === propertyId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listAll() {
      return [...leases.values()].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    },
    async connectTenant(id, tenantId) {
      const rec = leases.get(id);
      if (!rec) throw new Error(`lease 없음: ${id}`);
      const updated: LeaseRecord = {
        ...rec,
        tenantId,
        status: 'ACTIVE',
        inviteToken: null, // 토큰 1회용 — 연결 후 소거
        updatedAt: new Date(),
      };
      leases.set(id, updated);
      return updated;
    },
    async updateStatus(id, status) {
      const rec = leases.get(id);
      if (!rec) throw new Error(`lease 없음: ${id}`);
      const updated: LeaseRecord = { ...rec, status, updatedAt: new Date() };
      leases.set(id, updated);
      return updated;
    },
  };
}

// === Prisma ===

function toRecord(rec: {
  id: string;
  propertyId: string;
  landlordId: string;
  tenantId: string | null;
  status: string;
  deposit: bigint;
  rent: number | null;
  startAt: Date;
  endAt: Date;
  inviteToken: string | null;
  invitedPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LeaseRecord {
  return {
    id: rec.id,
    propertyId: rec.propertyId,
    landlordId: rec.landlordId,
    tenantId: rec.tenantId,
    status: rec.status as LeaseStatus,
    deposit: rec.deposit,
    rent: rec.rent,
    startAt: rec.startAt,
    endAt: rec.endAt,
    inviteToken: rec.inviteToken,
    invitedPhone: rec.invitedPhone,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function makePrismaLeaseRepository(prisma: PrismaClient): LeaseRepository {
  return {
    async create(input) {
      const rec = await prisma.lease.create({
        data: {
          id: nextLeaseId(),
          propertyId: input.propertyId,
          landlordId: input.landlordId,
          deposit: BigInt(input.deposit),
          rent: input.rent ?? null,
          startAt: input.startAt,
          endAt: input.endAt,
          inviteToken: nextInviteToken(),
          invitedPhone: input.invitedPhone ?? null,
        },
      });
      return toRecord(rec);
    },
    async getById(id) {
      const rec = await prisma.lease.findUnique({ where: { id } });
      return rec ? toRecord(rec) : null;
    },
    async getByInviteToken(token) {
      const rec = await prisma.lease.findUnique({ where: { inviteToken: token } });
      return rec ? toRecord(rec) : null;
    },
    async listByLandlord(landlordId) {
      const list = await prisma.lease.findMany({
        where: { landlordId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async listByTenant(tenantId) {
      const list = await prisma.lease.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async listByProperty(propertyId) {
      const list = await prisma.lease.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async listAll() {
      const list = await prisma.lease.findMany({ orderBy: { createdAt: 'desc' } });
      return list.map(toRecord);
    },
    async connectTenant(id, tenantId) {
      const rec = await prisma.lease.update({
        where: { id },
        data: { tenantId, status: 'ACTIVE', inviteToken: null },
      });
      return toRecord(rec);
    },
    async updateStatus(id, status) {
      const rec = await prisma.lease.update({ where: { id }, data: { status } });
      return toRecord(rec);
    },
  };
}
