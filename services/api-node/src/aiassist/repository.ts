import type { PrismaClient } from '@prisma/client';
import type { ChatbotTopic, OcrSafetyGrade } from '@butler/shared';

// AI 보조 기록 저장소. ⚠️ OcrDocument에는 주민번호 평문을 절대 저장하지 않는다(마스킹만).

export type ChatbotLogRecord = {
  id: string;
  userId: string;
  question: string;
  answer: string;
  topic: ChatbotTopic;
  mock: boolean;
  createdAt: Date;
};

export type OcrDocumentRecord = {
  id: string;
  userId: string;
  address: string;
  ownerMasked: string;
  safetyGrade: OcrSafetyGrade;
  safetyReason: string;
  totalDebt: number;
  marketPrice: number | null;
  result: unknown;
  mock: boolean;
  createdAt: Date;
};

export interface ChatbotLogRepository {
  log(input: {
    userId: string;
    question: string;
    answer: string;
    topic: ChatbotTopic;
  }): Promise<ChatbotLogRecord>;
  listByUser(userId: string): Promise<ChatbotLogRecord[]>;
}

export interface OcrDocumentRepository {
  save(input: {
    userId: string;
    address: string;
    ownerMasked: string;
    safetyGrade: OcrSafetyGrade;
    safetyReason: string;
    totalDebt: number;
    marketPrice?: number | null;
    result: unknown;
  }): Promise<OcrDocumentRecord>;
  listByUser(userId: string): Promise<OcrDocumentRecord[]>;
}

function nextChatId(): string {
  return `chat_${Math.random().toString(36).slice(2, 11)}`;
}
function nextOcrId(): string {
  return `ocr_${Math.random().toString(36).slice(2, 11)}`;
}

// === In-memory ===

export function makeInMemoryChatbotLogRepository(): ChatbotLogRepository {
  const items: ChatbotLogRecord[] = [];
  return {
    async log(input) {
      const rec: ChatbotLogRecord = {
        id: nextChatId(),
        userId: input.userId,
        question: input.question,
        answer: input.answer,
        topic: input.topic,
        mock: true,
        createdAt: new Date(),
      };
      items.push(rec);
      return rec;
    },
    async listByUser(userId) {
      return items
        .filter((c) => c.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  };
}

export function makeInMemoryOcrDocumentRepository(): OcrDocumentRepository {
  const items: OcrDocumentRecord[] = [];
  return {
    async save(input) {
      const rec: OcrDocumentRecord = {
        id: nextOcrId(),
        userId: input.userId,
        address: input.address,
        ownerMasked: input.ownerMasked,
        safetyGrade: input.safetyGrade,
        safetyReason: input.safetyReason,
        totalDebt: input.totalDebt,
        marketPrice: input.marketPrice ?? null,
        result: input.result,
        mock: true,
        createdAt: new Date(),
      };
      items.push(rec);
      return rec;
    },
    async listByUser(userId) {
      return items
        .filter((o) => o.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  };
}

// === Prisma ===

export function makePrismaChatbotLogRepository(
  prisma: PrismaClient
): ChatbotLogRepository {
  return {
    async log(input) {
      const rec = await prisma.chatbotLog.create({
        data: {
          id: nextChatId(),
          userId: input.userId,
          question: input.question,
          answer: input.answer,
          topic: input.topic,
        },
      });
      return rec as ChatbotLogRecord;
    },
    async listByUser(userId) {
      const list = await prisma.chatbotLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      return list as ChatbotLogRecord[];
    },
  };
}

export function makePrismaOcrDocumentRepository(
  prisma: PrismaClient
): OcrDocumentRepository {
  return {
    async save(input) {
      const rec = await prisma.ocrDocument.create({
        data: {
          id: nextOcrId(),
          userId: input.userId,
          address: input.address,
          ownerMasked: input.ownerMasked,
          safetyGrade: input.safetyGrade,
          safetyReason: input.safetyReason,
          totalDebt: input.totalDebt,
          marketPrice: input.marketPrice ?? null,
          result: input.result as object,
        },
      });
      return {
        id: rec.id,
        userId: rec.userId,
        address: rec.address,
        ownerMasked: rec.ownerMasked,
        safetyGrade: rec.safetyGrade as OcrSafetyGrade,
        safetyReason: rec.safetyReason,
        totalDebt: rec.totalDebt,
        marketPrice: rec.marketPrice,
        result: rec.result,
        mock: rec.mock,
        createdAt: rec.createdAt,
      };
    },
    async listByUser(userId) {
      const list = await prisma.ocrDocument.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      return list.map((rec) => ({
        id: rec.id,
        userId: rec.userId,
        address: rec.address,
        ownerMasked: rec.ownerMasked,
        safetyGrade: rec.safetyGrade as OcrSafetyGrade,
        safetyReason: rec.safetyReason,
        totalDebt: rec.totalDebt,
        marketPrice: rec.marketPrice,
        result: rec.result,
        mock: rec.mock,
        createdAt: rec.createdAt,
      }));
    },
  };
}
