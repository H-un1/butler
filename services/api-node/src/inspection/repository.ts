import type { PrismaClient } from '@prisma/client';
import type {
  InspectionGrade,
  InspectionStatus,
  InspectionType,
  ReportStatus,
} from '@butler/shared';

export type InspectionInput = {
  propertyId: string;
  inspectorId: string;
  type: InspectionType;
  scheduledAt: Date;
};

export type InspectionRecord = {
  id: string;
  propertyId: string;
  inspectorId: string;
  type: InspectionType;
  status: InspectionStatus;
  scheduledAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type InspectionItemInput = {
  inspectionId: string;
  area: string;
  checklistKey: string;
  grade: InspectionGrade;
  photoUrls?: string[];
  note?: string | null;
  markedDefect?: boolean;
};

export type InspectionItemRecord = {
  id: string;
  inspectionId: string;
  area: string;
  checklistKey: string;
  grade: InspectionGrade;
  photoUrls: string[];
  note: string | null;
  markedDefect: boolean;
  createdAt: Date;
};

export type ReportRecord = {
  id: string;
  inspectionId: string;
  pdfUrl: string;
  generatedAt: Date;
  sharedWith: string[];
  status: ReportStatus;
};

export interface InspectionRepository {
  create(input: InspectionInput): Promise<InspectionRecord>;
  getById(id: string): Promise<InspectionRecord | null>;
  listByProperty(propertyId: string): Promise<InspectionRecord[]>;
  listByInspector(inspectorId: string): Promise<InspectionRecord[]>;
  updateStatus(id: string, status: InspectionStatus): Promise<InspectionRecord>;

  appendItem(input: InspectionItemInput): Promise<InspectionItemRecord>;
  listItems(inspectionId: string): Promise<InspectionItemRecord[]>;

  createReport(input: {
    inspectionId: string;
    pdfUrl: string;
    generatedAt: Date;
    sharedWith?: string[];
  }): Promise<ReportRecord>;
  getReport(inspectionId: string): Promise<ReportRecord | null>;
}

function nextInspectionId(): string {
  return `insp_${Math.random().toString(36).slice(2, 11)}`;
}
function nextItemId(): string {
  return `item_${Math.random().toString(36).slice(2, 11)}`;
}
function nextReportId(): string {
  return `rpt_${Math.random().toString(36).slice(2, 11)}`;
}

// === In-memory ===

export function makeInMemoryInspectionRepository(): InspectionRepository {
  const inspections = new Map<string, InspectionRecord>();
  const items = new Map<string, InspectionItemRecord>();
  const reports = new Map<string, ReportRecord>(); // key = inspectionId

  return {
    async create(input) {
      const now = new Date();
      const rec: InspectionRecord = {
        id: nextInspectionId(),
        propertyId: input.propertyId,
        inspectorId: input.inspectorId,
        type: input.type,
        status: 'REQUESTED',
        scheduledAt: input.scheduledAt,
        createdAt: now,
        updatedAt: now,
      };
      inspections.set(rec.id, rec);
      return rec;
    },
    async getById(id) {
      return inspections.get(id) ?? null;
    },
    async listByProperty(propertyId) {
      return [...inspections.values()].filter((i) => i.propertyId === propertyId);
    },
    async listByInspector(inspectorId) {
      return [...inspections.values()]
        .filter((i) => i.inspectorId === inspectorId)
        .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
    },
    async updateStatus(id, status) {
      const rec = inspections.get(id);
      if (!rec) throw new Error(`inspection 없음: ${id}`);
      const updated: InspectionRecord = { ...rec, status, updatedAt: new Date() };
      inspections.set(id, updated);
      return updated;
    },
    async appendItem(input) {
      const rec: InspectionItemRecord = {
        id: nextItemId(),
        inspectionId: input.inspectionId,
        area: input.area,
        checklistKey: input.checklistKey,
        grade: input.grade,
        photoUrls: input.photoUrls ?? [],
        note: input.note ?? null,
        markedDefect: input.markedDefect ?? false,
        createdAt: new Date(),
      };
      items.set(rec.id, rec);
      return rec;
    },
    async listItems(inspectionId) {
      return [...items.values()].filter((i) => i.inspectionId === inspectionId);
    },
    async createReport(input) {
      if (reports.has(input.inspectionId)) {
        throw new Error(`Report 이미 존재: ${input.inspectionId}`);
      }
      const rec: ReportRecord = {
        id: nextReportId(),
        inspectionId: input.inspectionId,
        pdfUrl: input.pdfUrl,
        generatedAt: input.generatedAt,
        sharedWith: input.sharedWith ?? [],
        status: 'GENERATED',
      };
      reports.set(input.inspectionId, rec);
      return rec;
    },
    async getReport(inspectionId) {
      return reports.get(inspectionId) ?? null;
    },
  };
}

// === Prisma ===

export function makePrismaInspectionRepository(prisma: PrismaClient): InspectionRepository {
  return {
    async create(input) {
      const rec = await prisma.inspection.create({
        data: {
          id: nextInspectionId(),
          propertyId: input.propertyId,
          inspectorId: input.inspectorId,
          type: input.type,
          scheduledAt: input.scheduledAt,
        },
      });
      return rec as InspectionRecord;
    },
    async getById(id) {
      const rec = await prisma.inspection.findUnique({ where: { id } });
      return rec as InspectionRecord | null;
    },
    async listByProperty(propertyId) {
      const list = await prisma.inspection.findMany({ where: { propertyId } });
      return list as InspectionRecord[];
    },
    async listByInspector(inspectorId) {
      const list = await prisma.inspection.findMany({
        where: { inspectorId },
        orderBy: { scheduledAt: 'desc' },
      });
      return list as InspectionRecord[];
    },
    async updateStatus(id, status) {
      const rec = await prisma.inspection.update({ where: { id }, data: { status } });
      return rec as InspectionRecord;
    },
    async appendItem(input) {
      const rec = await prisma.inspectionItem.create({
        data: {
          id: nextItemId(),
          inspectionId: input.inspectionId,
          area: input.area,
          checklistKey: input.checklistKey,
          grade: input.grade,
          photoUrls: input.photoUrls
            ? (input.photoUrls as unknown as object)
            : undefined,
          note: input.note ?? null,
          markedDefect: input.markedDefect ?? false,
        },
      });
      return {
        id: rec.id,
        inspectionId: rec.inspectionId,
        area: rec.area,
        checklistKey: rec.checklistKey,
        grade: rec.grade as InspectionGrade,
        photoUrls: Array.isArray(rec.photoUrls) ? (rec.photoUrls as string[]) : [],
        note: rec.note,
        markedDefect: rec.markedDefect,
        createdAt: rec.createdAt,
      };
    },
    async listItems(inspectionId) {
      const list = await prisma.inspectionItem.findMany({ where: { inspectionId } });
      return list.map((rec) => ({
        id: rec.id,
        inspectionId: rec.inspectionId,
        area: rec.area,
        checklistKey: rec.checklistKey,
        grade: rec.grade as InspectionGrade,
        photoUrls: Array.isArray(rec.photoUrls) ? (rec.photoUrls as string[]) : [],
        note: rec.note,
        markedDefect: rec.markedDefect,
        createdAt: rec.createdAt,
      }));
    },
    async createReport(input) {
      const rec = await prisma.report.create({
        data: {
          id: nextReportId(),
          inspectionId: input.inspectionId,
          pdfUrl: input.pdfUrl,
          generatedAt: input.generatedAt,
          sharedWith: input.sharedWith
            ? (input.sharedWith as unknown as object)
            : undefined,
        },
      });
      return {
        id: rec.id,
        inspectionId: rec.inspectionId,
        pdfUrl: rec.pdfUrl,
        generatedAt: rec.generatedAt,
        sharedWith: Array.isArray(rec.sharedWith) ? (rec.sharedWith as string[]) : [],
        status: rec.status as ReportStatus,
      };
    },
    async getReport(inspectionId) {
      const rec = await prisma.report.findUnique({ where: { inspectionId } });
      if (!rec) return null;
      return {
        id: rec.id,
        inspectionId: rec.inspectionId,
        pdfUrl: rec.pdfUrl,
        generatedAt: rec.generatedAt,
        sharedWith: Array.isArray(rec.sharedWith) ? (rec.sharedWith as string[]) : [],
        status: rec.status as ReportStatus,
      };
    },
  };
}
