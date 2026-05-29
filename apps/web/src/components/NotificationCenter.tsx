import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  listMine,
  unreadCount,
  markRead,
  markAllRead,
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_COLORS,
  formatDateTime,
  type NotificationDto,
} from '../api/notifications';
import type { NotificationType } from '@butler/shared';

// 인앱 알림센터 — 전 역할 공통. 헤더/사이드바에 종 아이콘 + 안읽음 배지.
// 클릭하면 알림 목록 패널이 열리고, 항목을 누르면 읽음 처리된다.
// 실제 알림톡/SMS 발송은 mock이며, 인앱 목록은 항상 노출된다.
export function NotificationCenter({
  tone = 'toss',
}: {
  // 토스 톤(밝은 헤더) / 리니어 톤(어두운 콘솔)에 맞춰 색만 살짝 분기
  tone?: 'toss' | 'linear';
}) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    if (!session) return;
    try {
      setCount(await unreadCount(session.token));
    } catch {
      // 배지는 실패해도 조용히 무시(헤더 깨짐 방지)
    }
  }, [session]);

  const loadList = useCallback(async () => {
    if (!session) return;
    setErr(null);
    try {
      setItems(await listMine(session.token));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  // 최초 마운트 + 30초 폴링으로 안읽음 배지 갱신
  useEffect(() => {
    if (!session) return;
    loadCount();
    const t = window.setInterval(loadCount, 30_000);
    return () => window.clearInterval(t);
  }, [session, loadCount]);

  // 패널을 열 때 목록을 불러온다
  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!session) return null;

  const handleItemClick = async (n: NotificationDto) => {
    if (n.read) return;
    try {
      await markRead(session.token, n.id);
      setItems((prev) =>
        prev ? prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)) : prev
      );
      setCount((c) => Math.max(0, c - 1));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const handleMarkAll = async () => {
    setBusy(true);
    setErr(null);
    try {
      await markAllRead(session.token);
      setItems((prev) => (prev ? prev.map((x) => ({ ...x, read: true })) : prev));
      setCount(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const isLinear = tone === 'linear';
  const bellColor = isLinear ? 'var(--fg-muted)' : 'var(--fg-secondary)';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="알림"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          borderRadius: 999,
          color: bellColor,
          background: open ? 'var(--bg-muted)' : 'transparent',
        }}
        className="hover:text-fg transition"
      >
        <BellIcon />
        {count > 0 && (
          <span
            data-testid="notif-unread-badge"
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: 'var(--error)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '16px',
              textAlign: 'center',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="surface-card"
          style={{
            position: 'absolute',
            top: 42,
            right: 0,
            width: 360,
            maxWidth: '90vw',
            maxHeight: 480,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 'var(--card-radius)',
            border: '1px solid var(--border)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.16)',
            zIndex: 50,
            background: 'var(--bg-sub)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span className="text-fg" style={{ fontSize: 15, fontWeight: 700 }}>
              알림
            </span>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={busy || count === 0}
              className="text-fg-muted hover:text-fg transition"
              style={{ fontSize: 12, opacity: count === 0 ? 0.5 : 1 }}
            >
              모두 읽음
            </button>
          </div>

          <div style={{ overflowY: 'auto' }}>
            {err && (
              <p style={{ color: 'var(--error)', fontSize: 13, padding: 16 }}>
                {err}
              </p>
            )}
            {!items && !err && (
              <p className="text-fg-muted" style={{ fontSize: 13, padding: 16 }}>
                불러오는 중…
              </p>
            )}
            {items && items.length === 0 && (
              <p
                className="text-fg-muted"
                style={{ fontSize: 13, padding: 24, textAlign: 'center' }}
              >
                새 알림이 없습니다.
              </p>
            )}
            {items &&
              items.map((n) => {
                const palette =
                  NOTIFICATION_TYPE_COLORS[n.type as NotificationType] ?? {
                    bg: 'var(--bg-muted)',
                    fg: 'var(--fg-secondary)',
                  };
                const typeLabel =
                  NOTIFICATION_TYPE_LABEL[n.type as NotificationType] ?? n.type;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleItemClick(n)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      background: n.read ? 'transparent' : 'var(--brand-soft)',
                      cursor: n.read ? 'default' : 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
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
                        }}
                      >
                        {typeLabel}
                      </span>
                      {!n.read && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: 'var(--brand)',
                          }}
                        />
                      )}
                      <span
                        className="text-fg-muted"
                        style={{ fontSize: 11, marginLeft: 'auto' }}
                      >
                        {formatDateTime(n.createdAt)}
                      </span>
                    </div>
                    <p
                      className="text-fg"
                      style={{ fontSize: 14, fontWeight: 600 }}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p
                        className="text-fg-secondary"
                        style={{ fontSize: 13, marginTop: 2 }}
                      >
                        {n.body}
                      </p>
                    )}
                  </button>
                );
              })}
          </div>

          <div
            style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <p className="text-fg-muted" style={{ fontSize: 11 }}>
              ※ 카카오 알림톡·문자 발송은 mock(실제 발송 없음). 인앱 알림만 표시됩니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
