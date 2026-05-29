import { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  listMyPayments,
  PAYMENT_TYPE_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_COLORS,
  formatKrw,
  formatDateTime,
  type PaymentDto,
} from '../api/payments';
import type { PaymentType, PaymentStatus } from '@butler/shared';

// 내 결제 내역 — 임차인(정산금/월세)·임대인(구독료) 공통.
// ⚠️ 전부 mock 결제(실제 청구 없음).
export type MyPaymentsHandle = { reload: () => void };

export const MyPaymentsPanel = forwardRef<MyPaymentsHandle, object>(
  function MyPaymentsPanel(_props, ref) {
    const { session } = useAuth();
    const [items, setItems] = useState<PaymentDto[] | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const load = useCallback(async () => {
      if (!session) return;
      setErr(null);
      try {
        setItems(await listMyPayments(session.token));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }, [session]);

    useEffect(() => {
      load();
    }, [load]);

    useImperativeHandle(ref, () => ({ reload: load }), [load]);

    if (!session) return null;

    return (
      <div>
        <p className="text-fg-muted mb-3" style={{ fontSize: 13 }}>
          ※ 모든 결제는 mock(실제 청구 없음)입니다.
        </p>
        {err && (
          <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 8 }}>{err}</p>
        )}
        {!items && !err && (
          <p className="text-fg-muted" style={{ fontSize: 14 }}>불러오는 중…</p>
        )}
        {items && items.length === 0 && (
          <p className="text-fg-muted" style={{ fontSize: 14 }}>
            아직 결제 내역이 없습니다.
          </p>
        )}
        {items && items.length > 0 && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((p) => {
              const palette =
                PAYMENT_STATUS_COLORS[p.status as PaymentStatus] ?? {
                  bg: 'var(--bg-muted)',
                  fg: 'var(--fg-secondary)',
                };
              return (
                <li
                  key={p.id}
                  className="surface-card"
                  style={{
                    padding: 14,
                    borderRadius: 'var(--card-radius)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                      <span className="text-fg" style={{ fontSize: 14, fontWeight: 600 }}>
                        {PAYMENT_TYPE_LABEL[p.type as PaymentType] ?? p.type}
                        {p.period ? ` · ${p.period}` : ''}
                      </span>
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
                        {PAYMENT_STATUS_LABEL[p.status as PaymentStatus] ?? p.status}
                      </span>
                    </div>
                    <p className="text-fg-muted" style={{ fontSize: 12 }}>
                      {formatDateTime(p.paidAt ?? p.createdAt)}
                      {p.mockChargeId ? ` · mock #${p.mockChargeId.slice(0, 10)}` : ''}
                    </p>
                  </div>
                  <span className="text-fg" style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {formatKrw(p.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
);
