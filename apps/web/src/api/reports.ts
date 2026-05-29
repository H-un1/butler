const API_BASE = '/api';

/**
 * api-node 의 RBAC 프록시 (`GET /reports/by-inspection/:inspectionId/pdf`)를 통해
 * ai-python 에 저장된 PDF 를 가져와 새 탭에 연다.
 *
 * 응답을 blob 으로 받아 object URL 로 변환 → window.open. 5초 뒤 revoke.
 */
export async function viewReportPdf(
  token: string,
  inspectionId: string
): Promise<void> {
  const r = await fetch(
    `${API_BASE}/reports/by-inspection/${inspectionId}/pdf`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!r.ok) {
    throw new Error(`PDF 다운로드 실패 (${r.status})`);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // blob URL 누수 방지 — 새 탭이 로드한 뒤 정리.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
