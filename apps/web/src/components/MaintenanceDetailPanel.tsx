import { useCallback, useEffect, useState } from 'react';
import {
  MAINTENANCE_TRANSITIONS,
  type MaintenanceStatus,
  type Role,
} from '@butler/shared';
import { useAuth } from '../auth/AuthContext';
import {
  addMaintenanceComment,
  getMaintenance,
  updateMaintenanceStatus,
  CATEGORY_LABEL,
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_COLORS,
  formatDateTime,
  type MaintenanceDetail,
} from '../api/maintenance';
import { shortCode } from '../lib/displayId';

// 수선요청 상세 — 코멘트 타임라인 + 상태전이 버튼을 한 곳에 묶은 재사용 패널.
// 임대인/관리자(소유 관리자)는 전체 전이가 가능하고, 임차인 요청자는
// RESOLVED에서 CLOSED(완료확인) 또는 IN_PROGRESS(재오픈)만 가능하다.
// 서버가 최종 권한을 검증하므로 UI는 가능한 버튼만 노출한다.

// 역할/소유 여부에 따라 화면에 보여줄 상태전이 버튼 목록을 계산한다.
function allowedTransitions(
  current: MaintenanceStatus,
  role: Role,
  isRequester: boolean
): MaintenanceStatus[] {
  if (role === 'LANDLORD' || role === 'ADMIN') {
    return [...MAINTENANCE_TRANSITIONS[current]];
  }
  // 임차인 요청자: RESOLVED → CLOSED | IN_PROGRESS 만
  if (role === 'TENANT' && isRequester && current === 'RESOLVED') {
    return ['CLOSED', 'IN_PROGRESS'];
  }
  return [];
}

// 상태전이 버튼에 붙일 한글 동작 라벨 (현재→다음 전이의 의미를 명확히)
function transitionActionLabel(
  to: MaintenanceStatus,
  role: Role,
  current: MaintenanceStatus
): string {
  if (role === 'TENANT') {
    if (to === 'CLOSED') return '완료 확인';
    if (to === 'IN_PROGRESS') return '재오픈 요청';
  }
  switch (to) {
    case 'IN_PROGRESS':
      return current === 'RESOLVED' ? '재오픈' : '처리 시작';
    case 'RESOLVED':
      return '해결 처리';
    case 'CLOSED':
      return '종료';
    case 'REJECTED':
      return '반려';
    default:
      return MAINTENANCE_STATUS_LABEL[to];
  }
}

export function MaintenanceDetailPanel({
  requestId,
  onChanged,
}: {
  requestId: string;
  onChanged?: () => void;
}) {
  const { session } = useAuth();
  const [detail, setDetail] = useState<MaintenanceDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const d = await getMaintenance(session.token, requestId);
      setDetail(d);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session, requestId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;

  if (err && !detail) {
    return <p style={{ color: 'var(--error)', fontSize: 14 }}>{err}</p>;
  }
  if (!detail) {
    return (
      <p className="text-fg-muted" style={{ fontSize: 14 }}>
        불러오는 중…
      </p>
    );
  }

  const role = session.user.role;
  const isRequester = detail.requesterId === session.user.id;
  const transitions = allowedTransitions(detail.status, role, isRequester);
  const palette = MAINTENANCE_STATUS_COLORS[detail.status];

  const handleTransition = async (to: MaintenanceStatus) => {
    setBusy(true);
    setErr(null);
    try {
      // 코멘트 입력칸에 내용이 있으면 상태전이 시스템 코멘트와 함께 첨부
      const c = comment.trim();
      await updateMaintenanceStatus(session.token, requestId, to, c || undefined);
      setComment('');
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleComment = async () => {
    const c = comment.trim();
    if (!c) return;
    setBusy(true);
    setErr(null);
    try {
      await addMaintenanceComment(session.token, requestId, c);
      setComment('');
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="surface-card"
      style={{ padding: 24, borderRadius: 'var(--card-radius)' }}
    >
      {/* 헤더 — 상태 배지 + 카테고리 + 제목 */}
      <div className="flex items-start justify-between" style={{ gap: 16 }}>
        <div className="flex-1 min-w-0">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: palette.bg,
                color: palette.fg,
              }}
            >
              {MAINTENANCE_STATUS_LABEL[detail.status]}
            </span>
            <span className="text-fg-muted" style={{ fontSize: 13 }}>
              {CATEGORY_LABEL[detail.category]}
            </span>
          </div>
          <h3 className="text-fg" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3 }}>
            {detail.title}
          </h3>
          {detail.description && (
            <p className="text-fg-secondary" style={{ fontSize: 14, marginTop: 8, whiteSpace: 'pre-wrap' }}>
              {detail.description}
            </p>
          )}
          <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 8 }}>
            등록 {formatDateTime(detail.createdAt)}
          </p>
        </div>
      </div>

      {/* 상태전이 버튼 */}
      {transitions.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <span className="field-label">상태 변경</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {transitions.map((to) => (
              <button
                key={to}
                type="button"
                disabled={busy}
                onClick={() => handleTransition(to)}
                className="brand-button"
                style={{
                  fontSize: 13,
                  ...(to === 'REJECTED'
                    ? { background: 'var(--error, #f04438)' }
                    : {}),
                }}
              >
                {transitionActionLabel(to, role, detail.status)}
              </button>
            ))}
          </div>
          {role !== 'LANDLORD' && role !== 'ADMIN' && detail.status === 'RESOLVED' && (
            <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 8 }}>
              해결된 수선요청입니다. 마무리되었다면 완료 확인, 아직 문제가 남아있다면 재오픈을 눌러주세요.
            </p>
          )}
        </div>
      )}

      {/* 코멘트 타임라인 */}
      <div style={{ marginTop: 24 }}>
        <span className="field-label">코멘트</span>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {detail.comments.length === 0 && (
            <li className="text-fg-muted" style={{ fontSize: 13 }}>
              아직 코멘트가 없습니다.
            </li>
          )}
          {detail.comments.map((c) => (
            <li
              key={c.id}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--control-radius)',
                background: c.systemEvent ? 'var(--bg-muted)' : 'var(--brand-soft)',
              }}
            >
              {c.systemEvent ? (
                <p className="text-fg-muted" style={{ fontSize: 13, fontStyle: 'italic' }}>
                  {c.body || c.systemEvent}
                </p>
              ) : (
                <p className="text-fg" style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                  {c.body}
                </p>
              )}
              <p className="text-fg-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {c.authorId === session.user.id
                  ? '나'
                  : c.authorName ?? shortCode(c.authorId)}{' '}
                · {formatDateTime(c.createdAt)}
              </p>
            </li>
          ))}
        </ul>

        {/* 코멘트 작성 */}
        <div style={{ marginTop: 12 }}>
          <textarea
            aria-label="코멘트 입력"
            className="field-input"
            placeholder="코멘트를 입력하세요. (상태 변경 시 함께 첨부됩니다)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={handleComment}
              disabled={busy || !comment.trim()}
              className="brand-button"
              style={{ fontSize: 13 }}
            >
              {busy ? '처리 중…' : '코멘트 작성'}
            </button>
          </div>
        </div>
      </div>

      {err && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{err}</p>
      )}
    </div>
  );
}
