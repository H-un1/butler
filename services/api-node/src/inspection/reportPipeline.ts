// ai-python PDF 생성 클라이언트 + HouseLog 자동 기록 파이프라인.
// 키 누락 시 ai-python이 503 → 라우터에서 503 그대로 통과.

import type { HouseLogRepository } from '../houseLog/repository.js';
import type {
  InspectionItemRecord,
  InspectionRecord,
  InspectionRepository,
} from './repository.js';

export type ReportPdfResult =
  | { status: 'ok'; pdfUrl: string; generatedAt: Date }
  | { status: 'unavailable'; reason: string };

export interface ReportPdfClient {
  generate(payload: {
    inspectionId: string;
    propertyId: string;
    items: InspectionItemRecord[];
  }): Promise<ReportPdfResult>;
}

export function makeHttpReportPdfClient(baseUrl: string): ReportPdfClient {
  return {
    async generate(payload) {
      const r = await fetch(`${baseUrl}/reports/pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inspection_id: payload.inspectionId,
          property_id: payload.propertyId,
          items: payload.items.map((i) => ({
            area: i.area,
            checklist_key: i.checklistKey,
            grade: i.grade,
            note: i.note,
            marked_defect: i.markedDefect,
            photo_urls: i.photoUrls,
          })),
        }),
      });
      if (r.status === 503) {
        const body = (await r.json().catch(() => ({}))) as { detail?: string };
        return { status: 'unavailable', reason: body.detail ?? 'PDF 어댑터 미설정' };
      }
      if (!r.ok) throw new Error(`PDF 생성 실패 ${r.status}`);
      const body = (await r.json()) as { pdf_url: string; generated_at: string };
      return {
        status: 'ok',
        pdfUrl: body.pdf_url,
        generatedAt: new Date(body.generated_at),
      };
    },
  };
}

// dev-mock — 키 없이도 흐름 검증 가능. production에서는 사용 금지.
export function makeMockReportPdfClient(): ReportPdfClient {
  return {
    async generate(payload) {
      return {
        status: 'ok',
        pdfUrl: `mock://reports/${payload.inspectionId}.pdf`,
        generatedAt: new Date(),
      };
    },
  };
}

export async function finalizeInspection(
  inspection: InspectionRecord,
  inspectionRepo: InspectionRepository,
  houseLogRepo: HouseLogRepository,
  pdfClient: ReportPdfClient | null
): Promise<{
  report: { pdfUrl: string; generatedAt: Date } | null;
  unavailableReason: string | null;
}> {
  const items = await inspectionRepo.listItems(inspection.id);

  if (!pdfClient) {
    await inspectionRepo.updateStatus(inspection.id, 'DONE');
    return { report: null, unavailableReason: 'PDF 클라이언트 미주입' };
  }

  const pdfResult = await pdfClient.generate({
    inspectionId: inspection.id,
    propertyId: inspection.propertyId,
    items,
  });

  if (pdfResult.status === 'unavailable') {
    await inspectionRepo.updateStatus(inspection.id, 'DONE');
    return { report: null, unavailableReason: pdfResult.reason };
  }

  const report = await inspectionRepo.createReport({
    inspectionId: inspection.id,
    pdfUrl: pdfResult.pdfUrl,
    generatedAt: pdfResult.generatedAt,
  });

  // House Log 자동 기록 (append-only)
  await houseLogRepo.append({
    propertyId: inspection.propertyId,
    type: 'INSPECTION',
    title: `${inspection.type} 점검 완료`,
    occurredAt: pdfResult.generatedAt,
    refId: report.id,
    attachmentUrls: [pdfResult.pdfUrl],
  });

  await inspectionRepo.updateStatus(inspection.id, 'DONE');

  return {
    report: { pdfUrl: report.pdfUrl, generatedAt: report.generatedAt },
    unavailableReason: null,
  };
}
