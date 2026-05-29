import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listHouseLog, type HouseLogEntry } from '../api/houseLog';
import { viewReportPdf } from '../api/reports';

const TYPE_LABEL: Record<HouseLogEntry['type'], string> = {
  INSPECTION: '점검',
  REPAIR: '수리',
  CONTRACT: '계약',
  OWNER_CHANGE: '소유주 변경',
};

const TYPE_STYLE: Record<HouseLogEntry['type'], { bg: string; fg: string }> = {
  INSPECTION: { bg: '#E8F3FF', fg: '#1B64DA' },
  REPAIR: { bg: '#FFF1E5', fg: '#C25D00' },
  CONTRACT: { bg: '#E8F8EF', fg: '#1F7A45' },
  OWNER_CHANGE: { bg: '#F2F4F6', fg: '#4E5968' },
};

/**
 * attachmentUrls[0] 에서 inspectionId 를 뽑아낸다.
 * LocalDevStorage 는 `file://C:/.../butler-reports/<inspection_id>.pdf` 형태.
 * 1) `insp_[a-z0-9]+` 패턴 우선 매칭
 * 2) 실패 시 마지막 `/` 이후 `.pdf` 제거한 segment 사용
 */
function extractInspectionId(url: string): string | null {
  const m = url.match(/insp_[a-z0-9]+/i);
  if (m) return m[0];
  const last = url.split(/[/\\]/).pop();
  if (last && last.toLowerCase().endsWith('.pdf')) {
    return last.slice(0, -4);
  }
  return null;
}

export function HouseLogTimeline({ propertyId }: { propertyId: string }) {
  const { session } = useAuth();
  const [entries, setEntries] = useState<HouseLogEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listHouseLog(session.token, propertyId)
      .then(setEntries)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session, propertyId]);

  if (!session) return null;
  if (err) return <p style={{ color: 'var(--error)', fontSize: 14 }}>{err}</p>;
  if (!entries)
    return (
      <p className="text-fg-muted" style={{ fontSize: 13 }}>
        불러오는 중…
      </p>
    );

  if (entries.length === 0) {
    return (
      <div
        className="surface-card text-center"
        style={{ padding: '40px 24px', borderRadius: 'var(--card-radius)' }}
      >
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          아직 기록된 사건이 없습니다.
        </p>
        <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 4 }}>
          점검·수리·계약 등이 발생하면 자동으로 누적됩니다.
        </p>
      </div>
    );
  }

  const handleViewPdf = async (entry: HouseLogEntry) => {
    const src = entry.attachmentUrls[0];
    if (!src) {
      alert('PDF 정보를 찾을 수 없습니다');
      return;
    }
    const inspectionId = extractInspectionId(src);
    if (!inspectionId) {
      alert('PDF 정보를 찾을 수 없습니다');
      return;
    }
    try {
      await viewReportPdf(session.token, inspectionId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        const style = TYPE_STYLE[e.type];
        const canViewPdf =
          e.type === 'INSPECTION' && e.attachmentUrls.length > 0;
        return (
          <li
            key={e.id}
            className="surface-card flex items-start gap-4"
            style={{ padding: 18, borderRadius: 'var(--card-radius)' }}
          >
            <span
              style={{
                background: style.bg,
                color: style.fg,
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {TYPE_LABEL[e.type]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-fg" style={{ fontSize: 15, fontWeight: 500 }}>
                {e.title}
              </p>
              <p className="text-fg-muted mt-1" style={{ fontSize: 12 }}>
                {new Date(e.occurredAt).toLocaleString('ko-KR')}
              </p>
              {e.attachmentUrls.length > 0 && (
                <p className="text-fg-muted mt-1" style={{ fontSize: 12 }}>
                  첨부 {e.attachmentUrls.length}건 · 본 메타로 PDF 리포트 연결됨
                </p>
              )}
              {canViewPdf && (
                <button
                  type="button"
                  className="brand-button-weak"
                  onClick={() => handleViewPdf(e)}
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    padding: '6px 12px',
                  }}
                >
                  PDF 보기
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
