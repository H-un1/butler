import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  getOverview,
  RENT_STATUS_LABEL,
  RENT_STATUS_COLORS,
  formatDday,
  type CrmOverview,
  type CrmLeaseRow,
} from '../api/crm';
import { scan as scanNotifications } from '../api/notifications';
import {
  LEASE_STATUS_LABEL,
  LEASE_STATUS_COLORS,
  formatDate,
} from '../api/leases';
import {
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_COLORS,
} from '../api/settlements';
import { shortCode } from '../lib/displayId';

// 임대차 CRM 개요 — 임대인/관리자 공통.
// 요약 카드(전체/활성/만료임박/월세연체/오픈수선) + 계약 테이블.
// "알림 스캔" 버튼으로 계약만료·월세미납 알림을 생성하면 알림센터에 반영된다.
export function CrmOverviewPanel({
  // 알림 스캔 후 상위(헤더 알림 배지 등)를 갱신하고 싶을 때
  onScanned,
}: {
  onScanned?: () => void;
}) {
  const { session } = useAuth();
  const [data, setData] = useState<CrmOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setErr(null);
    try {
      setData(await getOverview(session.token));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;

  const handleScan = async () => {
    setScanning(true);
    setScanMsg(null);
    setErr(null);
    try {
      const res = await scanNotifications(session.token);
      setScanMsg(
        `스캔 완료 — 계약 ${res.scanned}건 평가, 알림 ${res.created}건 생성. 상단 종 아이콘에서 확인하세요.`
      );
      onScanned?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const summary = data?.summary;
  const leases = data?.leases ?? [];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <span className="text-fg-muted" style={{ fontSize: 12 }}>
          {summary ? `기준 ${summary.period}` : ''}
        </span>
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="brand-button"
          style={{ fontSize: 13, whiteSpace: 'nowrap' }}
        >
          {scanning ? '스캔 중…' : '알림 스캔'}
        </button>
      </div>

      {scanMsg && (
        <p
          style={{ color: 'var(--brand-hover)', fontSize: 13, marginBottom: 12, fontWeight: 600 }}
        >
          {scanMsg}
        </p>
      )}
      {err && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{err}</p>
      )}

      {/* 요약 카드 */}
      <div
        className="grid grid-cols-2 md:grid-cols-5 gap-3"
        style={{ marginBottom: 20 }}
      >
        <SummaryCard label="전체 계약" value={summary ? summary.totalLeases : '—'} />
        <SummaryCard label="활성 계약" value={summary ? summary.activeLeases : '—'} />
        <SummaryCard
          label="만료임박"
          value={summary ? summary.expiringSoon : '—'}
          tone={summary && summary.expiringSoon > 0 ? 'warn' : undefined}
        />
        <SummaryCard
          label="월세연체"
          value={summary ? summary.rentOverdue : '—'}
          tone={summary && summary.rentOverdue > 0 ? 'error' : undefined}
        />
        <SummaryCard label="오픈 수선" value={summary ? summary.openMaintenance : '—'} />
      </div>

      {/* 계약 테이블 */}
      {!data && !err && (
        <p className="text-fg-muted" style={{ fontSize: 14 }}>불러오는 중…</p>
      )}
      {data && leases.length === 0 && (
        <div
          className="surface-card text-center"
          style={{ padding: '40px 24px', borderRadius: 'var(--card-radius)' }}
        >
          <p className="text-fg" style={{ fontSize: 15, fontWeight: 500 }}>
            관리 중인 계약이 없습니다.
          </p>
        </div>
      )}
      {data && leases.length > 0 && (
        <div
          className="surface-card"
          style={{ borderRadius: 'var(--card-radius)', overflow: 'hidden' }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    textAlign: 'left',
                    color: 'var(--fg-muted)',
                    background: 'var(--bg-sub)',
                  }}
                >
                  <Th>주소</Th>
                  <Th>임차인</Th>
                  <Th>계약상태</Th>
                  <Th align="right">만료 D-day</Th>
                  <Th>월세</Th>
                  <Th align="right">오픈수선</Th>
                  <Th>정산</Th>
                </tr>
              </thead>
              <tbody>
                {leases.map((l) => (
                  <LeaseRow key={l.leaseId} l={l} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaseRow({ l }: { l: CrmLeaseRow }) {
  const { session } = useAuth();
  // 임대인은 사이드바가 유지되는 중첩 경로로, 그 외(임차인 등)는 standalone 경로로.
  const settlementBase =
    session?.user.role === 'LANDLORD' ? '/landlord/settlements' : '/settlements';
  const leasePalette = LEASE_STATUS_COLORS[l.status];
  const rentPalette = RENT_STATUS_COLORS[l.rentStatus];
  const settlePalette = l.settlementStatus
    ? SETTLEMENT_STATUS_COLORS[l.settlementStatus]
    : null;
  // 만료 60일 이내(양수)면 강조
  const ddayWarn =
    l.expiryDday != null && l.expiryDday <= 60;

  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <Td>
        <span className="text-fg" style={{ fontWeight: 600 }}>
          {l.address}
        </span>
        <br />
        <span className="text-fg-muted" style={{ fontSize: 11 }}>
          {formatDate(l.startAt)} ~ {formatDate(l.endAt)}
        </span>
      </Td>
      <Td>
        {l.tenantId ? (
          <span className="text-fg-secondary" style={{ fontSize: 12 }}>
            {l.tenantName ?? shortCode(l.tenantId)}
          </span>
        ) : (
          <span className="text-fg-muted">미연결</span>
        )}
      </Td>
      <Td>
        <Pill bg={leasePalette.bg} fg={leasePalette.fg}>
          {LEASE_STATUS_LABEL[l.status]}
        </Pill>
      </Td>
      <Td align="right">
        <span
          className="text-fg"
          style={{
            fontWeight: 600,
            color: ddayWarn ? 'var(--error)' : undefined,
          }}
        >
          {formatDday(l.expiryDday)}
        </span>
      </Td>
      <Td>
        <Pill bg={rentPalette.bg} fg={rentPalette.fg}>
          {RENT_STATUS_LABEL[l.rentStatus]}
        </Pill>
      </Td>
      <Td align="right">
        {l.openMaintenance > 0 ? (
          <span className="text-fg" style={{ fontWeight: 600 }}>
            {l.openMaintenance}건
          </span>
        ) : (
          <span className="text-fg-muted">0</span>
        )}
      </Td>
      <Td>
        {l.settlementStatus && settlePalette ? (
          l.settlementId ? (
            <Link to={`${settlementBase}/${l.settlementId}`}>
              <Pill bg={settlePalette.bg} fg={settlePalette.fg}>
                {SETTLEMENT_STATUS_LABEL[l.settlementStatus]}
              </Pill>
            </Link>
          ) : (
            <Pill bg={settlePalette.bg} fg={settlePalette.fg}>
              {SETTLEMENT_STATUS_LABEL[l.settlementStatus]}
            </Pill>
          )
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </Td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'warn' | 'error';
}) {
  const color =
    tone === 'error' ? 'var(--error)' : tone === 'warn' ? '#B7791F' : 'var(--fg)';
  return (
    <div className="surface-card" style={{ padding: 16, borderRadius: 'var(--card-radius)' }}>
      <p className="text-fg-muted" style={{ fontSize: 12 }}>
        {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginTop: 2, color }}>
        {value}
      </p>
    </div>
  );
}

function Pill({
  children,
  bg,
  fg,
}: {
  children: React.ReactNode;
  bg: string;
  fg: string;
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: bg,
        color: fg,
      }}
    >
      {children}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      style={{
        padding: '8px 12px',
        fontSize: 12,
        fontWeight: 500,
        textAlign: align ?? 'left',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td
      style={{
        padding: '10px 12px',
        textAlign: align ?? 'left',
        verticalAlign: 'top',
        whiteSpace: 'nowrap',
      }}
      className="text-fg-secondary"
    >
      {children}
    </td>
  );
}
