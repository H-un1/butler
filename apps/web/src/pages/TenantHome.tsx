import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MAINTENANCE_CATEGORIES,
  type MaintenanceCategory,
} from '@butler/shared';
import { useAuth } from '../auth/AuthContext';
import {
  acceptLease,
  listMyLeases,
  LEASE_STATUS_LABEL,
  LEASE_STATUS_COLORS,
  formatDate,
  type LeaseDto,
} from '../api/leases';
import {
  createMaintenance,
  listMyMaintenance,
  CATEGORY_LABEL,
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_COLORS,
  formatDateTime,
  type MaintenanceRequestDto,
} from '../api/maintenance';
import {
  listMySettlements,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_COLORS,
  formatKrw,
  type SettlementDto,
} from '../api/settlements';
import { MaintenanceDetailPanel } from '../components/MaintenanceDetailPanel';
import { SettlementDetailPanel } from '../components/SettlementDetailPanel';
import { NotificationCenter } from '../components/NotificationCenter';
import { MyPaymentsPanel, type MyPaymentsHandle } from '../components/MyPaymentsPanel';
import { payRent, formatKrw as formatPayKrw } from '../api/payments';
import { shortCode } from '../lib/displayId';

// 임차인 홈 — 임대인·관리자와 같은 웹앱을 공유하고 role로 분기한 화면.
// 흐름: 초대 토큰으로 계약 연결 → ACTIVE 계약의 물건에 수선요청 등록 →
//       상세에서 코멘트/완료확인/재오픈.
export function TenantHome() {
  const { session, logout } = useAuth();
  const [leases, setLeases] = useState<LeaseDto[] | null>(null);
  const [requests, setRequests] = useState<MaintenanceRequestDto[] | null>(null);
  const [settlements, setSettlements] = useState<SettlementDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);

  // 초대 토큰 연결 폼
  const [inviteToken, setInviteToken] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [acceptMsg, setAcceptMsg] = useState<string | null>(null);

  // 내 결제 내역 패널 — 월세/정산금 (mock)결제 성공 시 새로고침
  const paymentsRef = useRef<MyPaymentsHandle>(null);

  const loadLeases = useCallback(async () => {
    if (!session) return;
    const data = await listMyLeases(session.token);
    setLeases(data);
  }, [session]);

  const loadRequests = useCallback(async () => {
    if (!session) return;
    const data = await listMyMaintenance(session.token);
    setRequests(data);
  }, [session]);

  const loadSettlements = useCallback(async () => {
    if (!session) return;
    const data = await listMySettlements(session.token);
    setSettlements(data);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadLeases().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    loadRequests().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    loadSettlements().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session, loadLeases, loadRequests, loadSettlements]);

  if (!session) return null;

  const activeLeases = (leases ?? []).filter((l) => l.status === 'ACTIVE');

  const handleAccept = async () => {
    const t = inviteToken.trim();
    if (!t) return;
    setAccepting(true);
    setErr(null);
    setAcceptMsg(null);
    try {
      const lease = await acceptLease(session.token, t);
      setAcceptMsg(`계약이 연결되었습니다. (상태: ${LEASE_STATUS_LABEL[lease.status]})`);
      setInviteToken('');
      await loadLeases();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Nav onLogout={logout} userName={session.user.name} />

      <main
        className="max-w-[840px] mx-auto px-6"
        style={{ paddingTop: 56, paddingBottom: 100 }}
      >
        {/* Hero */}
        <section style={{ marginBottom: 36 }}>
          <p className="text-fg-secondary mb-2" style={{ fontSize: 14 }}>
            안녕하세요, {session.user.name}님
          </p>
          <h1
            className="text-fg"
            style={{ fontSize: 32, lineHeight: 1.25, fontWeight: 700, letterSpacing: 0 }}
          >
            우리 집 수선,
            <br />
            여기서 바로 요청하세요.
          </h1>
        </section>

        {err && (
          <p style={{ color: 'var(--error)', fontSize: 14, marginBottom: 16 }}>{err}</p>
        )}

        {/* 내 임대차 계약 */}
        <section style={{ marginBottom: 48 }}>
          <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            내 임대차 계약
          </h2>

          {/* 초대 토큰 연결 */}
          <div
            className="surface-card"
            style={{ padding: 20, borderRadius: 'var(--card-radius)', marginBottom: 16 }}
          >
            <span className="field-label">초대 토큰으로 계약 연결</span>
            <p className="text-fg-muted" style={{ fontSize: 13, marginBottom: 10 }}>
              임대인에게 받은 초대 토큰을 입력하면 계약이 연결됩니다.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="field-input"
                aria-label="초대 토큰"
                placeholder="초대 토큰 붙여넣기"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting || !inviteToken.trim()}
                className="brand-button"
              >
                {accepting ? '연결 중…' : '연결하기'}
              </button>
            </div>
            {acceptMsg && (
              <p style={{ color: 'var(--brand-hover)', fontSize: 13, marginTop: 10, fontWeight: 600 }}>
                {acceptMsg}
              </p>
            )}
          </div>

          {!leases && <p className="text-fg-muted" style={{ fontSize: 14 }}>불러오는 중…</p>}
          {leases && leases.length === 0 && (
            <p className="text-fg-muted" style={{ fontSize: 14 }}>
              아직 연결된 계약이 없습니다. 위에서 초대 토큰을 입력해주세요.
            </p>
          )}
          {leases && leases.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {leases.map((l) => {
                const palette = LEASE_STATUS_COLORS[l.status];
                return (
                  <li
                    key={l.id}
                    className="surface-card"
                    style={{ padding: 18, borderRadius: 'var(--card-radius)' }}
                  >
                    <div className="flex items-start justify-between" style={{ gap: 12 }}>
                      <div className="flex-1 min-w-0">
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: palette.bg,
                            color: palette.fg,
                            marginBottom: 8,
                          }}
                        >
                          {LEASE_STATUS_LABEL[l.status]}
                        </span>
                        <p className="text-fg" style={{ fontSize: 14 }}>
                          {l.propertyAddress ?? `물건 ${shortCode(l.propertyId)}`}
                        </p>
                        <p className="text-fg-muted" style={{ fontSize: 13, marginTop: 4 }}>
                          {formatDate(l.startAt)} ~ {formatDate(l.endAt)} · 보증금{' '}
                          {l.deposit.toLocaleString()}원
                          {l.rent != null && ` · 월세 ${l.rent.toLocaleString()}원`}
                        </p>
                        {/* 월세 (mock)납부 — ACTIVE 계약 + 월세 있는 경우만 */}
                        {l.status === 'ACTIVE' && l.rent != null && l.rent > 0 && (
                          <RentPayButton
                            leaseId={l.id}
                            rent={l.rent}
                            onPaid={() => paymentsRef.current?.reload()}
                          />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 새 수선요청 */}
        <section style={{ marginBottom: 48 }}>
          <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            수선요청 등록
          </h2>
          <NewMaintenanceForm
            activeLeases={activeLeases}
            onCreated={() => {
              loadRequests().catch(() => undefined);
            }}
          />
        </section>

        {/* 내 수선요청 목록 */}
        <section>
          <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            내 수선요청
          </h2>
          {!requests && <p className="text-fg-muted" style={{ fontSize: 14 }}>불러오는 중…</p>}
          {requests && requests.length === 0 && (
            <p className="text-fg-muted" style={{ fontSize: 14 }}>
              아직 등록한 수선요청이 없습니다.
            </p>
          )}
          {requests && requests.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {requests.map((r) => {
                const palette = MAINTENANCE_STATUS_COLORS[r.status];
                const open = selectedId === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId((prev) => (prev === r.id ? null : r.id))}
                      className="surface-card surface-card-hover"
                      style={{
                        padding: 18,
                        borderRadius: 'var(--card-radius)',
                        width: '100%',
                        textAlign: 'left',
                        boxShadow: open ? 'inset 0 0 0 2px var(--brand)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: palette.bg,
                            color: palette.fg,
                          }}
                        >
                          {MAINTENANCE_STATUS_LABEL[r.status]}
                        </span>
                        <span className="text-fg-muted" style={{ fontSize: 13 }}>
                          {CATEGORY_LABEL[r.category]}
                        </span>
                      </div>
                      <p className="text-fg" style={{ fontSize: 15, fontWeight: 600 }}>
                        {r.title}
                      </p>
                      <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {formatDateTime(r.createdAt)}
                      </p>
                    </button>
                    {open && (
                      <div style={{ marginTop: 12 }}>
                        <MaintenanceDetailPanel
                          requestId={r.id}
                          onChanged={() => loadRequests().catch(() => undefined)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 수선비 정산 — 임대인이 제안한 정산에 합의/이의 */}
        <section style={{ marginTop: 48 }}>
          <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            수선비 정산
          </h2>
          <p className="text-fg-muted mb-4" style={{ fontSize: 13 }}>
            퇴거 시 임대인이 점검 데이터를 근거로 산출한 정산입니다. 제안된 정산은 합의하거나 이의를 제기할 수 있습니다.
          </p>

          {!settlements && (
            <p className="text-fg-muted" style={{ fontSize: 14 }}>불러오는 중…</p>
          )}
          {settlements && settlements.length === 0 && (
            <p className="text-fg-muted" style={{ fontSize: 14 }}>
              아직 받은 정산이 없습니다.
            </p>
          )}
          {settlements && settlements.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {settlements.map((s) => {
                const palette = SETTLEMENT_STATUS_COLORS[s.status];
                const open = selectedSettlementId === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSettlementId((p) => (p === s.id ? null : s.id))
                      }
                      className="surface-card surface-card-hover"
                      style={{
                        padding: 18,
                        borderRadius: 'var(--card-radius)',
                        width: '100%',
                        textAlign: 'left',
                        boxShadow: open ? 'inset 0 0 0 2px var(--brand)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: palette.bg,
                            color: palette.fg,
                          }}
                        >
                          {SETTLEMENT_STATUS_LABEL[s.status]}
                        </span>
                        <span className="text-fg-muted" style={{ fontSize: 13 }}>
                          내 부담 {formatKrw(s.tenantTotal)} / 총 {formatKrw(s.totalCost)}
                        </span>
                      </div>
                      <p className="text-fg" style={{ fontSize: 14, fontWeight: 600 }}>
                        {s.status === 'PROPOSED'
                          ? '정산이 제안되었습니다. 확인 후 합의 또는 이의를 선택하세요.'
                          : s.status === 'AGREED'
                            ? '합의 완료된 정산입니다.'
                            : s.status === 'DISPUTED'
                              ? '이의를 제기한 정산입니다. 임대인의 재제안을 기다리세요.'
                              : '정산 상세'}
                      </p>
                    </button>
                    {open && (
                      <div style={{ marginTop: 12 }}>
                        <SettlementDetailPanel
                          settlementId={s.id}
                          onChanged={() => loadSettlements().catch(() => undefined)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 단지 커뮤니티 + 전자투표 + 보수업체 매칭 진입 (Phase 3 M4) */}
        <section style={{ marginTop: 48 }}>
          <div
            className="surface-card surface-card-hover"
            style={{ padding: 24, borderRadius: 'var(--card-radius)' }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                  단지 커뮤니티
                </h2>
                <p className="text-fg-muted" style={{ fontSize: 14 }}>
                  우리 단지 이웃과 소식을 나누고, 전자투표에 참여하고, 보수업체를 찾아보세요.
                </p>
              </div>
              <Link
                to="/community"
                className="brand-button"
                style={{ fontSize: 14, whiteSpace: 'nowrap' }}
              >
                바로가기 →
              </Link>
            </div>
          </div>
        </section>

        {/* AI 보조 (Phase 3 M5 — 전부 mock) — AI 상담·등기부 안전진단 진입 */}
        <section style={{ marginTop: 48 }}>
          <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            AI 보조
          </h2>
          <p className="text-fg-muted mb-4" style={{ fontSize: 14 }}>
            임대차 궁금증 상담과 등기부 안전진단을 AI가 도와드립니다. (mock 데모 — 실제 자문/판독 아님)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              to="/assistant"
              className="surface-card surface-card-hover block"
              style={{ padding: 20, borderRadius: 'var(--card-radius)' }}
            >
              <p className="text-fg" style={{ fontSize: 16, fontWeight: 600 }}>
                AI 상담 챗봇 →
              </p>
              <p className="text-fg-muted mt-1" style={{ fontSize: 13 }}>
                보증금·계약 갱신 등 궁금증을 바로 물어보세요. (mock)
              </p>
            </Link>
            <Link
              to="/assistant"
              className="surface-card surface-card-hover block"
              style={{ padding: 20, borderRadius: 'var(--card-radius)' }}
            >
              <p className="text-fg" style={{ fontSize: 16, fontWeight: 600 }}>
                등기부 안전진단 →
              </p>
              <p className="text-fg-muted mt-1" style={{ fontSize: 13 }}>
                전세 계약 전 근저당·권리관계를 확인하세요. (mock)
              </p>
            </Link>
          </div>
        </section>

        {/* 내 결제 내역 — 월세·정산금 (mock)결제 기록 */}
        <section style={{ marginTop: 48 }}>
          <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            내 결제 내역
          </h2>
          <MyPaymentsPanel ref={paymentsRef} />
        </section>
      </main>
    </div>
  );
}

// 월세 (mock)납부 버튼 — ACTIVE 계약 카드 내에 인라인 노출
function RentPayButton({
  leaseId,
  rent,
  onPaid,
}: {
  leaseId: string;
  rent: number;
  onPaid: () => void;
}) {
  const { session } = useAuth();
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!session) return null;

  const handlePay = async () => {
    setPaying(true);
    setMsg(null);
    setErr(null);
    try {
      const p = await payRent(session.token, { leaseId });
      setMsg(
        `월세 ${formatPayKrw(p.amount)} 납부 완료 (mock 결제, 실제 청구 없음)`
      );
      onPaid();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={handlePay}
        disabled={paying}
        className="brand-button"
        style={{ fontSize: 13 }}
      >
        {paying ? '납부 중…' : `월세 납부 (mock) · ${formatPayKrw(rent)}`}
      </button>
      {msg && (
        <p style={{ color: 'var(--brand-hover)', fontSize: 12, marginTop: 6, fontWeight: 600 }}>
          ✓ {msg}
        </p>
      )}
      {err && (
        <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 6 }}>{err}</p>
      )}
    </div>
  );
}

function NewMaintenanceForm({
  activeLeases,
  onCreated,
}: {
  activeLeases: LeaseDto[];
  onCreated: () => void;
}) {
  const { session } = useAuth();
  const [propertyId, setPropertyId] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('PLUMBING');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ACTIVE 계약의 물건만 선택 가능 — 서버가 ACTIVE 임대차를 요구하므로.
  // 기본 선택값을 첫 ACTIVE 계약으로 맞춰둔다.
  useEffect(() => {
    if (!propertyId && activeLeases.length > 0) {
      setPropertyId(activeLeases[0].propertyId);
    }
  }, [activeLeases, propertyId]);

  if (!session) return null;

  const hasActive = activeLeases.length > 0;

  const handleSubmit = async () => {
    if (!propertyId || !title.trim()) return;
    setSubmitting(true);
    setMsg(null);
    setError(null);
    try {
      const lease = activeLeases.find((l) => l.propertyId === propertyId);
      await createMaintenance(session.token, {
        propertyId,
        leaseId: lease?.id,
        category,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setMsg('수선요청이 등록되었습니다.');
      setTitle('');
      setDescription('');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="surface-card"
      style={{ padding: 24, borderRadius: 'var(--card-radius)' }}
    >
      {!hasActive ? (
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          계약 중(ACTIVE)인 임대차가 있어야 수선요청을 등록할 수 있습니다. 먼저 초대 토큰으로 계약을 연결해주세요.
        </p>
      ) : (
        <>
          <label className="field-label" htmlFor="tenant-maint-property">대상 물건</label>
          <select
            id="tenant-maint-property"
            className="field-input mb-4"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            {activeLeases.map((l) => (
              <option key={l.id} value={l.propertyId}>
                {l.propertyAddress ?? `물건 ${shortCode(l.propertyId)}`}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="tenant-maint-category">카테고리</label>
          <select
            id="tenant-maint-category"
            className="field-input mb-4"
            value={category}
            onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
          >
            {MAINTENANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="tenant-maint-title">제목</label>
          <input
            id="tenant-maint-title"
            className="field-input mb-4"
            placeholder="예) 화장실 천장 누수"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label className="field-label" htmlFor="tenant-maint-description">상세 설명 (선택)</label>
          <textarea
            id="tenant-maint-description"
            className="field-input mb-4"
            placeholder="증상, 발생 시점 등을 적어주세요."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ resize: 'vertical' }}
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !propertyId || !title.trim()}
            className="brand-button brand-button-large"
            style={{ width: '100%' }}
          >
            {submitting ? '등록 중…' : '수선요청 등록'}
          </button>

          {msg && (
            <p style={{ color: 'var(--brand-hover)', fontSize: 13, marginTop: 12, fontWeight: 600 }}>
              {msg}
            </p>
          )}
          {error && (
            <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{error}</p>
          )}
        </>
      )}
    </div>
  );
}

function Nav({ onLogout, userName }: { onLogout: () => void; userName: string }) {
  return (
    <header
      className="sticky top-0 z-10"
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="max-w-[840px] mx-auto px-6 h-[64px] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-fg" style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0 }}>
            버틀러
          </span>
          <span className="text-fg-muted" style={{ fontSize: 13 }}>
            임차인
          </span>
        </div>
        <div className="flex items-center gap-4">
          <NotificationCenter tone="toss" />
          <span className="text-fg-secondary" style={{ fontSize: 13 }}>
            {userName}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="text-fg-muted hover:text-fg transition"
            style={{ fontSize: 13 }}
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
