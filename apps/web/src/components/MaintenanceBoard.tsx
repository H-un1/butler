import { useCallback, useEffect, useState } from 'react';
import { MAINTENANCE_STATUSES, type MaintenanceStatus } from '@butler/shared';
import { useAuth } from '../auth/AuthContext';
import {
  listMaintenanceBoard,
  CATEGORY_LABEL,
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_COLORS,
  formatDateTime,
  type MaintenanceRequestDto,
} from '../api/maintenance';
import { MaintenanceDetailPanel } from './MaintenanceDetailPanel';

// 수선요청 이슈 협업보드 — 상태별 컬럼으로 카드를 나누고,
// 카드 클릭 시 상세 패널(상태전이 + 코멘트)을 인라인으로 펼친다.
// 임대인(본인 물건)·관리자(전체) 양쪽에서 재사용한다.
export function MaintenanceBoard() {
  const { session } = useAuth();
  const [items, setItems] = useState<MaintenanceRequestDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await listMaintenanceBoard(session.token);
      setItems(data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;

  if (err && !items) {
    return <p style={{ color: 'var(--error)', fontSize: 14 }}>{err}</p>;
  }
  if (!items) {
    return (
      <p className="text-fg-muted" style={{ fontSize: 14 }}>
        불러오는 중…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="surface-card text-center"
        style={{ padding: '48px 24px', borderRadius: 'var(--card-radius)' }}
      >
        <p className="text-fg" style={{ fontSize: 16, fontWeight: 500 }}>
          아직 등록된 수선요청이 없습니다
        </p>
        <p className="text-fg-muted" style={{ fontSize: 13, marginTop: 4 }}>
          임차인이 수선요청을 등록하면 여기 보드에 표시됩니다.
        </p>
      </div>
    );
  }

  // 종료 상태(CLOSED/REJECTED)는 한 컬럼으로 합쳐 4열로 보여준다.
  const columns: { key: string; label: string; statuses: MaintenanceStatus[] }[] = [
    { key: 'OPEN', label: MAINTENANCE_STATUS_LABEL.OPEN, statuses: ['OPEN'] },
    { key: 'IN_PROGRESS', label: MAINTENANCE_STATUS_LABEL.IN_PROGRESS, statuses: ['IN_PROGRESS'] },
    { key: 'RESOLVED', label: MAINTENANCE_STATUS_LABEL.RESOLVED, statuses: ['RESOLVED'] },
    { key: 'DONE', label: '종료·반려', statuses: ['CLOSED', 'REJECTED'] },
  ];
  void MAINTENANCE_STATUSES; // enum 출처 명시 (전체 상태 집합은 shared에서 단일 정의)

  return (
    <div>
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {columns.map((col) => {
          const cards = items.filter((i) => col.statuses.includes(i.status));
          return (
            <div key={col.key}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <span className="text-fg" style={{ fontSize: 14, fontWeight: 700 }}>
                  {col.label}
                </span>
                <span className="text-fg-muted" style={{ fontSize: 12 }}>
                  {cards.length}
                </span>
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cards.length === 0 && (
                  <li className="text-fg-muted" style={{ fontSize: 12 }}>
                    없음
                  </li>
                )}
                {cards.map((card) => {
                  const palette = MAINTENANCE_STATUS_COLORS[card.status];
                  return (
                    <li key={card.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedId((prev) => (prev === card.id ? null : card.id))
                        }
                        className="surface-card surface-card-hover"
                        style={{
                          padding: 14,
                          borderRadius: 'var(--card-radius)',
                          width: '100%',
                          textAlign: 'left',
                          boxShadow:
                            selectedId === card.id
                              ? 'inset 0 0 0 2px var(--brand)'
                              : undefined,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: palette.bg,
                            color: palette.fg,
                            marginBottom: 6,
                          }}
                        >
                          {CATEGORY_LABEL[card.category]}
                        </span>
                        <p
                          className="text-fg"
                          style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}
                        >
                          {card.title}
                        </p>
                        <p className="text-fg-muted" style={{ fontSize: 11, marginTop: 4 }}>
                          {formatDateTime(card.createdAt)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* 선택된 카드 상세 — 상태전이/코멘트 변경 시 보드 새로고침 */}
      {selectedId && (
        <div style={{ marginTop: 24 }}>
          <MaintenanceDetailPanel requestId={selectedId} onChanged={load} />
        </div>
      )}

      {err && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{err}</p>
      )}
    </div>
  );
}
