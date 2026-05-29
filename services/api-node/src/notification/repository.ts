import type { PrismaClient } from '@prisma/client';
import type {
  NotificationChannel,
  NotificationType,
} from '@butler/shared';

export type NotificationInput = {
  recipientId: string;
  type: NotificationType;
  channel?: NotificationChannel;
  title: string;
  body?: string | null;
  refId?: string | null;
  sentMock?: boolean;
};

export type NotificationRecord = {
  id: string;
  recipientId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string | null;
  refId: string | null;
  readAt: Date | null;
  sentMock: boolean;
  createdAt: Date;
};

export interface NotificationRepository {
  create(input: NotificationInput): Promise<NotificationRecord>;
  listByRecipient(recipientId: string): Promise<NotificationRecord[]>;
  countUnread(recipientId: string): Promise<number>;
  markRead(id: string): Promise<NotificationRecord>;
  markAllRead(recipientId: string): Promise<number>;
  // 중복 알림 방지용 — 같은 type+refId가 이미 있는지 (scan 멱등성)
  existsByTypeRef(
    recipientId: string,
    type: NotificationType,
    refId: string
  ): Promise<boolean>;
}

function nextId(): string {
  return `ntf_${Math.random().toString(36).slice(2, 11)}`;
}

// === In-memory ===

export function makeInMemoryNotificationRepository(): NotificationRepository {
  const items = new Map<string, NotificationRecord>();
  return {
    async create(input) {
      const rec: NotificationRecord = {
        id: nextId(),
        recipientId: input.recipientId,
        type: input.type,
        channel: input.channel ?? 'IN_APP',
        title: input.title,
        body: input.body ?? null,
        refId: input.refId ?? null,
        readAt: null,
        sentMock: input.sentMock ?? false,
        createdAt: new Date(),
      };
      items.set(rec.id, rec);
      return rec;
    },
    async listByRecipient(recipientId) {
      return [...items.values()]
        .filter((n) => n.recipientId === recipientId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async countUnread(recipientId) {
      return [...items.values()].filter(
        (n) => n.recipientId === recipientId && n.readAt === null
      ).length;
    },
    async markRead(id) {
      const rec = items.get(id);
      if (!rec) throw new Error(`notification 없음: ${id}`);
      const updated = { ...rec, readAt: new Date() };
      items.set(id, updated);
      return updated;
    },
    async markAllRead(recipientId) {
      let n = 0;
      for (const [id, rec] of items) {
        if (rec.recipientId === recipientId && rec.readAt === null) {
          items.set(id, { ...rec, readAt: new Date() });
          n += 1;
        }
      }
      return n;
    },
    async existsByTypeRef(recipientId, type, refId) {
      return [...items.values()].some(
        (n) => n.recipientId === recipientId && n.type === type && n.refId === refId
      );
    },
  };
}

// === Prisma ===

function toRecord(rec: {
  id: string;
  recipientId: string;
  type: string;
  channel: string;
  title: string;
  body: string | null;
  refId: string | null;
  readAt: Date | null;
  sentMock: boolean;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: rec.id,
    recipientId: rec.recipientId,
    type: rec.type as NotificationType,
    channel: rec.channel as NotificationChannel,
    title: rec.title,
    body: rec.body,
    refId: rec.refId,
    readAt: rec.readAt,
    sentMock: rec.sentMock,
    createdAt: rec.createdAt,
  };
}

export function makePrismaNotificationRepository(
  prisma: PrismaClient
): NotificationRepository {
  return {
    async create(input) {
      const rec = await prisma.notification.create({
        data: {
          id: nextId(),
          recipientId: input.recipientId,
          type: input.type,
          channel: input.channel ?? 'IN_APP',
          title: input.title,
          body: input.body ?? null,
          refId: input.refId ?? null,
          sentMock: input.sentMock ?? false,
        },
      });
      return toRecord(rec);
    },
    async listByRecipient(recipientId) {
      const list = await prisma.notification.findMany({
        where: { recipientId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toRecord);
    },
    async countUnread(recipientId) {
      return prisma.notification.count({
        where: { recipientId, readAt: null },
      });
    },
    async markRead(id) {
      const rec = await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
      return toRecord(rec);
    },
    async markAllRead(recipientId) {
      const r = await prisma.notification.updateMany({
        where: { recipientId, readAt: null },
        data: { readAt: new Date() },
      });
      return r.count;
    },
    async existsByTypeRef(recipientId, type, refId) {
      const n = await prisma.notification.count({
        where: { recipientId, type, refId },
      });
      return n > 0;
    },
  };
}
