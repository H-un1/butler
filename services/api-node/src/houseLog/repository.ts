import type { PrismaClient } from '@prisma/client';
import type { HouseLogType } from '@butler/shared';

// HouseLogEntry는 append-only. update/delete 메서드를 인터페이스 자체에 두지 않는다.
// DB에는 0001_houselog_append_only_trigger.sql 트리거로 SQL 레벨도 차단.

export type HouseLogEntryInput = {
  propertyId: string;
  type: HouseLogType;
  title: string;
  occurredAt: Date;
  refId?: string | null;
  attachmentUrls?: string[];
};

export type HouseLogEntryRecord = {
  id: string;
  propertyId: string;
  type: HouseLogType;
  title: string;
  occurredAt: Date;
  refId: string | null;
  attachmentUrls: string[];
  createdAt: Date;
};

export interface HouseLogRepository {
  append(input: HouseLogEntryInput): Promise<HouseLogEntryRecord>;
  listByProperty(propertyId: string): Promise<HouseLogEntryRecord[]>;
}

function nextId(): string {
  return `log_${Math.random().toString(36).slice(2, 11)}`;
}

export function makePrismaHouseLogRepository(prisma: PrismaClient): HouseLogRepository {
  return {
    async append(input) {
      const rec = await prisma.houseLogEntry.create({
        data: {
          id: nextId(),
          propertyId: input.propertyId,
          type: input.type,
          title: input.title,
          occurredAt: input.occurredAt,
          refId: input.refId ?? null,
          attachmentUrls: input.attachmentUrls
            ? (input.attachmentUrls as unknown as object)
            : undefined,
        },
      });
      return {
        id: rec.id,
        propertyId: rec.propertyId,
        type: rec.type as HouseLogType,
        title: rec.title,
        occurredAt: rec.occurredAt,
        refId: rec.refId,
        attachmentUrls: Array.isArray(rec.attachmentUrls)
          ? (rec.attachmentUrls as string[])
          : [],
        createdAt: rec.createdAt,
      };
    },
    async listByProperty(propertyId) {
      const list = await prisma.houseLogEntry.findMany({
        where: { propertyId },
        orderBy: { occurredAt: 'desc' },
      });
      return list.map((rec) => ({
        id: rec.id,
        propertyId: rec.propertyId,
        type: rec.type as HouseLogType,
        title: rec.title,
        occurredAt: rec.occurredAt,
        refId: rec.refId,
        attachmentUrls: Array.isArray(rec.attachmentUrls)
          ? (rec.attachmentUrls as string[])
          : [],
        createdAt: rec.createdAt,
      }));
    },
  };
}

// 인메모리 — append만 노출, update/delete는 존재 자체가 없음.
export function makeInMemoryHouseLogRepository(): HouseLogRepository {
  const entries: HouseLogEntryRecord[] = [];
  return {
    async append(input) {
      const rec: HouseLogEntryRecord = {
        id: nextId(),
        propertyId: input.propertyId,
        type: input.type,
        title: input.title,
        occurredAt: input.occurredAt,
        refId: input.refId ?? null,
        attachmentUrls: input.attachmentUrls ?? [],
        createdAt: new Date(),
      };
      entries.push(rec);
      return rec;
    },
    async listByProperty(propertyId) {
      return entries
        .filter((e) => e.propertyId === propertyId)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    },
  };
}
