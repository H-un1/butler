import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { listProperties, type PropertyListItem } from '../api/properties';
import {
  previewSubscription,
  getMySubscription,
  createSubscription,
  cancelSubscription,
  type SubscriptionPreview,
  type SubscriptionRecord,
} from '../api/subscriptions';
import {
  listMyLeases,
  type LeaseDto,
  LEASE_STATUS_LABEL,
  formatDate,
} from '../api/leases';
import {
  listMySettlements,
  type SettlementDto,
  SETTLEMENT_STATUS_LABEL,
  formatKrw as formatSettlementKrw,
} from '../api/settlements';
import { MaintenanceBoard } from '../components/MaintenanceBoard';
import { CrmOverviewPanel } from '../components/CrmOverviewPanel';
import { CommunityPanel } from '../components/CommunityPanel';
import { MyPaymentsPanel, type MyPaymentsHandle } from '../components/MyPaymentsPanel';
import { Modal } from '../components/Modal';
import { paySubscription, formatKrw as formatPayKrw } from '../api/payments';

// 임대인 대시보드의 각 섹션을 개별 라우트 컴포넌트로 추출했다.
// 사이드바는 LandlordLayout(DashboardLayout)이 상시 유지하고,
// 여기 컴포넌트들은 .admin-main__inner 안에서 콘텐츠만 렌더한다.
// 각 컴포넌트는 자신에게 필요한 데이터를 직접 fetch 한다(과거 LandlordHome의 fetch 로직 재사용).

const TIER_LABEL: Record<string, string> = {
  TIER_1: '소규모 (1~3채)',
  TIER_2: '중규모 (4~10채)',
  TIER_3: '대규모 (11채+)',
};

/* ─────────────────── 대시보드 (요약) ─────────────────── */

export function LandlordDashboard() {
  const { session } = useAuth();

  const [items, setItems] = useState<PropertyListItem[] | null>(null);
  const [leases, setLeases] = useState<LeaseDto[] | null>(null);
  const [settlements, setSettlements] = useState<SettlementDto[] | null>(null);

  const [preview, setPreview] = useState<SubscriptionPreview | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);

  useEffect(() => {
    if (!session) return;
    listProperties(session.token).then(setItems).catch(() => undefined);
    listMyLeases(session.token).then(setLeases).catch(() => undefined);
    listMySettlements(session.token).then(setSettlements).catch(() => undefined);
    getMySubscription(session.token).then(setSubscription).catch(() => undefined);
    previewSubscription(session.token)
      .then(setPreview)
      .catch(() => undefined);
  }, [session]);

  if (!session) return null;

  const count = items?.length ?? 0;
  const activeLeases = (leases ?? []).filter((l) => l.status === 'ACTIVE');
  const now = Date.now();
  const soonMs = 60 * 24 * 60 * 60 * 1000;
  const expiringSoon = activeLeases.filter((l) => {
    const end = new Date(l.endAt).getTime();
    return !Number.isNaN(end) && end - now <= soonMs && end - now >= 0;
  }).length;
  const openSettlements = (settlements ?? []).filter(
    (s) => s.status !== 'AGREED' && s.status !== 'REJECTED'
  ).length;

  const displayMonthly: number | null = subscription
    ? subscription.monthlyFee
    : preview && preview.eligible
      ? preview.monthlyFee
      : null;
  const displayTier: string | null = subscription
    ? subscription.tier
    : preview && preview.eligible
      ? preview.tier
      : null;

  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">대시보드</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <h1 className="admin-h1">안녕하세요, {session.user.name}님</h1>
        <p className="admin-sub">보유 물건과 임대차·정산 현황을 한눈에 확인하세요.</p>
      </div>

      {/* 요약 메트릭 */}
      <div className="admin-metrics">
        <Metric label="보유 물건" value={`${count}채`} delta="등록 즉시 공공데이터 자동 연동" />
        <Metric label="활성 임대차" value={`${activeLeases.length}건`} delta="계약 중인 임대차" />
        <Metric label="만료 임박" value={`${expiringSoon}건`} delta="60일 이내 종료 예정" />
      </div>
      <div className="admin-metrics" style={{ marginTop: 12 }}>
        <Metric label="진행 중 정산" value={`${openSettlements}건`} delta="합의·결렬 전 단계" />
        <Metric
          label={subscription ? '월 구독료' : '예상 월 구독료'}
          value={displayMonthly == null ? '—' : `₩ ${displayMonthly.toLocaleString()}`}
          delta={displayTier ? (TIER_LABEL[displayTier] ?? '구독 정보') : '물건 1채 이상부터'}
        />
        <Metric
          label="구독 상태"
          value={subscription ? (subscription.status === 'ACTIVE' ? '활성' : subscription.status) : '미가입'}
          delta={subscription ? `매월 ${subscription.billingDate}일 결제` : '구독·결제 탭에서 가입'}
        />
      </div>

      {/* 빠른 진입 — 사이드바에 없는 "동작"만 (섹션 이동은 사이드바로) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginTop: 28,
        }}
      >
        <QuickAction
          title="물건 등록"
          desc="주소만 입력하면 시세·AMI 자동 채움"
          to="/landlord/properties/new"
        />
        <QuickAction
          title="정산 산출"
          desc="퇴거 점검 데이터 기반 분담액 산출"
          to="/landlord/settlements/new"
        />
      </div>

      {/* 임대차 CRM 개요 */}
      <div style={{ marginTop: 40 }}>
        <h2 className="text-fg" style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          임대차 CRM 개요
        </h2>
        <CrmOverviewPanel />
      </div>
    </>
  );
}

/* ─────────────────── 내 물건 ─────────────────── */

export function LandlordProperties() {
  const { session } = useAuth();
  const [items, setItems] = useState<PropertyListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listProperties(session.token)
      .then(setItems)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session]);

  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">내 물건</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          marginTop: 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 className="admin-h1">내 물건</h1>
          <p className="admin-sub">
            보유 물건을 등록하고, 클릭하면 물건별 대시보드로 이동합니다.
          </p>
        </div>
        <div className="admin-page-actions">
          <Link to="/landlord/properties/new" className="brand-button" style={{ fontSize: 14 }}>
            + 새 물건 등록
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {err && (
          <p style={{ color: 'var(--error)', fontSize: 14 }} className="mb-4">
            {err}
          </p>
        )}
        {!items && !err && (
          <p className="text-fg-muted" style={{ fontSize: 14 }}>
            불러오는 중…
          </p>
        )}

        {items && items.length === 0 && (
          <div
            className="surface-card text-center"
            style={{ padding: '56px 24px', borderRadius: 'var(--card-radius)' }}
          >
            <p className="text-fg mb-2" style={{ fontSize: 17, fontWeight: 500 }}>
              아직 등록된 물건이 없습니다
            </p>
            <p className="text-fg-muted mb-6" style={{ fontSize: 14 }}>
              주소만 입력하면 시세·단지정보·AMI 점수가 자동으로 채워집니다.
            </p>
            <Link to="/landlord/properties/new" className="brand-button">
              지금 첫 물건 등록하기
            </Link>
          </div>
        )}

        {items && items.length > 0 && (
          <ul className="space-y-3">
            {items.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/landlord/properties/${p.id}`}
                  className="surface-card surface-card-hover block"
                  style={{ padding: 20, borderRadius: 'var(--card-radius)' }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-fg truncate" style={{ fontSize: 16, fontWeight: 600 }}>
                        {p.address}
                      </p>
                      {p.complexName && (
                        <p className="text-fg-muted mt-1" style={{ fontSize: 13 }}>
                          {p.complexName}
                          {p.dong && ` · ${p.dong}동`}
                          {p.ho && ` ${p.ho}호`}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-fg-muted" style={{ fontSize: 12 }}>
                        AMI 점수
                      </p>
                      <p
                        className="text-fg"
                        style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}
                      >
                        {p.amiScore ?? '—'}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/* ─────────────────── 임대차 ─────────────────── */

export function LandlordLeases() {
  const { session } = useAuth();
  const [leases, setLeases] = useState<LeaseDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listMyLeases(session.token)
      .then(setLeases)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session]);

  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">임대차</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <h1 className="admin-h1">임대차</h1>
        <p className="admin-sub">
          내 임대차 계약을 확인하세요. 계약 생성은 물건 대시보드에서 진행합니다.
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        {err && (
          <p style={{ color: 'var(--error)', fontSize: 14 }} className="mb-4">
            {err}
          </p>
        )}
        {!leases && !err && (
          <p className="text-fg-muted" style={{ fontSize: 14 }}>
            불러오는 중…
          </p>
        )}

        {leases && leases.length === 0 && (
          <div
            className="surface-card text-center"
            style={{ padding: '56px 24px', borderRadius: 'var(--card-radius)' }}
          >
            <p className="text-fg mb-2" style={{ fontSize: 17, fontWeight: 500 }}>
              아직 등록된 임대차 계약이 없습니다
            </p>
            <p className="text-fg-muted" style={{ fontSize: 14 }}>
              내 물건 → 물건 대시보드에서 계약을 생성하고 임차인을 초대하세요.
            </p>
          </div>
        )}

        {leases && leases.length > 0 && (
          <ul className="space-y-3">
            {leases.map((l) => (
              <li key={l.id}>
                <Link
                  to={`/landlord/properties/${l.propertyId}`}
                  className="surface-card surface-card-hover block"
                  style={{ padding: 20, borderRadius: 'var(--card-radius)' }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-fg" style={{ fontSize: 15, fontWeight: 600 }}>
                        보증금 {l.deposit.toLocaleString()}원
                        {l.rent != null && l.rent > 0 && ` · 월세 ${l.rent.toLocaleString()}원`}
                      </p>
                      <p className="text-fg-muted mt-1" style={{ fontSize: 13 }}>
                        {formatDate(l.startAt)} ~ {formatDate(l.endAt)}
                      </p>
                    </div>
                    <span className="label-pill shrink-0">{LEASE_STATUS_LABEL[l.status]}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/* ─────────────────── 수선요청 ─────────────────── */

export function LandlordMaintenance() {
  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">수선요청</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <h1 className="admin-h1">수선요청 이슈보드</h1>
        <p className="admin-sub">
          임차인이 등록한 수선요청을 상태별로 확인하고, 카드를 눌러 상태전이·코멘트를 남기세요.
        </p>
      </div>
      <div style={{ marginTop: 24 }}>
        <MaintenanceBoard />
      </div>
    </>
  );
}

/* ─────────────────── 정산 ─────────────────── */

export function LandlordSettlements() {
  const { session } = useAuth();
  const [settlements, setSettlements] = useState<SettlementDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listMySettlements(session.token)
      .then(setSettlements)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session]);

  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">정산</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          marginTop: 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 className="admin-h1">수선비 정산</h1>
          <p className="admin-sub">
            퇴거 점검 데이터를 근거로 항목별 분담액을 산출하고 임차인에게 제안하세요.
          </p>
        </div>
        <div className="admin-page-actions">
          <Link
            to="/landlord/settlements/new"
            className="brand-button"
            style={{ fontSize: 14, whiteSpace: 'nowrap' }}
          >
            정산 산출하기 →
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {err && (
          <p style={{ color: 'var(--error)', fontSize: 14 }} className="mb-4">
            {err}
          </p>
        )}
        {!settlements && !err && (
          <p className="text-fg-muted" style={{ fontSize: 14 }}>
            불러오는 중…
          </p>
        )}

        {settlements && settlements.length === 0 && (
          <div
            className="surface-card text-center"
            style={{ padding: '56px 24px', borderRadius: 'var(--card-radius)' }}
          >
            <p className="text-fg mb-2" style={{ fontSize: 17, fontWeight: 500 }}>
              아직 산출된 정산이 없습니다
            </p>
            <p className="text-fg-muted mb-6" style={{ fontSize: 14 }}>
              퇴거 점검 데이터를 근거로 첫 정산을 산출해보세요.
            </p>
            <Link to="/landlord/settlements/new" className="brand-button">
              정산 산출하기
            </Link>
          </div>
        )}

        {settlements && settlements.length > 0 && (
          <ul className="space-y-3">
            {settlements.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/landlord/settlements/${s.id}`}
                  className="surface-card surface-card-hover block"
                  style={{ padding: 20, borderRadius: 'var(--card-radius)' }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-fg" style={{ fontSize: 15, fontWeight: 600 }}>
                        총 {formatSettlementKrw(s.totalCost)} · 임차인 분담{' '}
                        {formatSettlementKrw(s.tenantTotal)}
                      </p>
                      <p className="text-fg-muted mt-1" style={{ fontSize: 13 }}>
                        {new Date(s.createdAt).toISOString().slice(0, 10)} · 항목 {s.lines.length}개
                      </p>
                    </div>
                    <span className="label-pill shrink-0">
                      {SETTLEMENT_STATUS_LABEL[s.status]}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/* ─────────────────── 구독·결제 ─────────────────── */

export function LandlordBilling() {
  const { session } = useAuth();

  const [items, setItems] = useState<PropertyListItem[] | null>(null);
  const [preview, setPreview] = useState<SubscriptionPreview | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subErr, setSubErr] = useState<string | null>(null);

  const [billingDate, setBillingDate] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [cancelArmed, setCancelArmed] = useState(false);
  const [canceling, setCanceling] = useState(false);

  // 구독료 (mock)결제
  const [payingSub, setPayingSub] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);
  const paymentsRef = useRef<MyPaymentsHandle>(null);

  const refreshSubscription = async () => {
    if (!session) return;
    setSubLoading(true);
    setSubErr(null);
    try {
      const [sub, pv] = await Promise.all([
        getMySubscription(session.token),
        previewSubscription(session.token).catch(() => null),
      ]);
      setSubscription(sub);
      if (pv) setPreview(pv);
    } catch (e) {
      setSubErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    listProperties(session.token).then(setItems).catch(() => undefined);
    refreshSubscription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!session) return null;

  const count = items?.length ?? 0;

  const handleSubscribe = async () => {
    if (!session) return;
    setSubmitting(true);
    setSubErr(null);
    setSuccessMsg(null);
    try {
      const created = await createSubscription(session.token, { billingDate });
      setSubscription(created);
      setSuccessMsg('구독이 시작되었습니다.');
      await refreshSubscription();
    } catch (e) {
      setSubErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!session || !subscription) return;
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }
    setCanceling(true);
    setSubErr(null);
    try {
      await cancelSubscription(session.token, subscription.id);
      setSubscription(null);
      setCancelArmed(false);
      setSuccessMsg('구독이 해지되었습니다.');
      await refreshSubscription();
    } catch (e) {
      setSubErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCanceling(false);
    }
  };

  // 구독료 (mock)결제 — 활성 구독의 월 구독료를 mock으로 결제
  const handlePaySubscription = async () => {
    if (!session) return;
    setPayingSub(true);
    setPayMsg(null);
    setPayErr(null);
    try {
      const p = await paySubscription(session.token);
      setPayMsg(`구독료 ${formatPayKrw(p.amount)} 결제 완료 (mock 결제, 실제 청구 없음)`);
      paymentsRef.current?.reload();
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPayingSub(false);
    }
  };

  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">구독·결제</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <h1 className="admin-h1">구독·결제</h1>
        <p className="admin-sub">보유 물건 수에 맞춰 구독하고, 구독료를 결제(mock)하세요.</p>
      </div>

      <div style={{ marginTop: 24 }}>
        {subLoading && !subscription && !preview && (
          <p className="text-fg-muted" style={{ fontSize: 14 }}>
            구독 정보를 불러오는 중…
          </p>
        )}

        {!subLoading && subscription && (
          <ActiveSubscriptionCard
            subscription={subscription}
            cancelArmed={cancelArmed}
            canceling={canceling}
            onCancel={handleCancel}
            onCancelReset={() => setCancelArmed(false)}
            error={subErr}
            successMsg={successMsg}
            payingSub={payingSub}
            payMsg={payMsg}
            payErr={payErr}
            onPaySubscription={handlePaySubscription}
          />
        )}

        {!subLoading && !subscription && (
          <SubscribeCard
            preview={preview}
            propertyCount={count}
            billingDate={billingDate}
            onBillingDateChange={setBillingDate}
            submitting={submitting}
            onSubmit={handleSubscribe}
            error={subErr}
            successMsg={successMsg}
          />
        )}
      </div>

      {/* 내 결제 내역 — 구독료 (mock)결제 기록 */}
      <div style={{ marginTop: 40 }}>
        <h2 className="text-fg" style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          내 결제 내역
        </h2>
        <MyPaymentsPanel ref={paymentsRef} />
      </div>
    </>
  );
}

/* ─────────────────── 커뮤니티 ─────────────────── */

export function LandlordCommunity() {
  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">커뮤니티</span>
      </div>
      <div style={{ marginTop: 6, marginBottom: 24 }}>
        <h1 className="admin-h1">단지 커뮤니티</h1>
        <p className="admin-sub">
          내 단지 이웃과 소식을 나누고, 전자투표로 의견을 모으고, 검증된 보수업체를 찾아보세요.
        </p>
      </div>
      <CommunityPanel />
    </>
  );
}

/* ─────────────────── 공용 셀 ─────────────────── */

function Metric({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="admin-metric">
      <span className="admin-metric__label mono">{label}</span>
      <span className="admin-metric__value">{value}</span>
      {delta && <span className="admin-metric__delta">{delta}</span>}
    </div>
  );
}

function QuickAction({ title, desc, to }: { title: string; desc: string; to: string }) {
  return (
    <Link
      to={to}
      className="surface-card surface-card-hover block"
      style={{ padding: 18, borderRadius: 'var(--card-radius)' }}
    >
      <p className="text-fg" style={{ fontSize: 15, fontWeight: 600 }}>
        {title} →
      </p>
      <p className="text-fg-muted mt-1" style={{ fontSize: 13 }}>
        {desc}
      </p>
    </Link>
  );
}

function SubscribeCard({
  preview,
  propertyCount,
  billingDate,
  onBillingDateChange,
  submitting,
  onSubmit,
  error,
  successMsg,
}: {
  preview: SubscriptionPreview | null;
  propertyCount: number;
  billingDate: number;
  onBillingDateChange: (n: number) => void;
  submitting: boolean;
  onSubmit: () => void;
  error: string | null;
  successMsg: string | null;
}) {
  // 물건이 1채 이상이면 구독 가능(서버가 최종 검증). preview는 금액 표시에만 사용.
  const canSubscribe = propertyCount >= 1;
  const eligiblePreview = preview && preview.eligible ? preview : null;

  return (
    <div className="surface-card" style={{ padding: 28, borderRadius: 'var(--card-radius)' }}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700 }}>
          구독 가입하기
        </h2>
        {eligiblePreview && (
          <span className="text-fg-muted" style={{ fontSize: 12 }}>
            {TIER_LABEL[eligiblePreview.tier]}
          </span>
        )}
      </div>

      {canSubscribe ? (
        <>
          {eligiblePreview ? (
            <>
              <p className="text-fg-secondary mb-2" style={{ fontSize: 14 }}>
                보유 {eligiblePreview.propertyCount}채 · {eligiblePreview.tier} · 채당{' '}
                {eligiblePreview.perPropertyKrw.toLocaleString()}원
              </p>
              <p
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: 'var(--brand)',
                  lineHeight: 1.15,
                  marginTop: 4,
                  marginBottom: 24,
                }}
              >
                월 {eligiblePreview.monthlyFee.toLocaleString()}원
              </p>
            </>
          ) : (
            <p className="text-fg-muted mb-4" style={{ fontSize: 14 }}>
              구독료를 계산하는 중…
            </p>
          )}

          <div className="mb-2">
            <label
              htmlFor="billing-date"
              className="field-label"
              style={{ display: 'block', marginBottom: 8 }}
            >
              매월 결제일
            </label>
            <select
              id="billing-date"
              className="field-input"
              value={billingDate}
              onChange={(e) => onBillingDateChange(Number(e.target.value))}
              disabled={submitting}
              style={{ width: '100%', maxWidth: 240 }}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  매월 {d}일
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <p className="text-fg-secondary mb-2" style={{ fontSize: 14 }}>
          물건을 1채 이상 등록해야 구독할 수 있어요.
        </p>
      )}

      {successMsg && (
        <p style={{ color: 'var(--brand)', fontSize: 14, marginTop: 16, fontWeight: 600 }}>
          {successMsg}
        </p>
      )}
      {error && <p style={{ color: 'var(--error)', fontSize: 14, marginTop: 16 }}>{error}</p>}

      {/* 액션 — 카드 좌측 하단 (구독료 결제와 동일 위치) */}
      <div className="flex justify-start" style={{ marginTop: 20 }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !canSubscribe}
          className="brand-button brand-button-large"
          style={!canSubscribe ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          {submitting ? '가입 처리 중…' : '구독 시작하기'}
        </button>
      </div>
    </div>
  );
}

function ActiveSubscriptionCard({
  subscription,
  cancelArmed,
  canceling,
  onCancel,
  onCancelReset,
  error,
  successMsg,
  payingSub,
  payMsg,
  payErr,
  onPaySubscription,
}: {
  subscription: SubscriptionRecord;
  cancelArmed: boolean;
  canceling: boolean;
  onCancel: () => void;
  onCancelReset: () => void;
  error: string | null;
  successMsg: string | null;
  payingSub: boolean;
  payMsg: string | null;
  payErr: string | null;
  onPaySubscription: () => void;
}) {
  const [showPay, setShowPay] = useState(false);

  const confirmPay = () => {
    onPaySubscription();
    setShowPay(false);
  };

  return (
    <div className="surface-card" style={{ padding: 28, borderRadius: 'var(--card-radius)' }}>
      {/* 헤더 — 좌: 제목/구간 · 우상단: 구독 해지 */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-fg mb-1" style={{ fontSize: 20, fontWeight: 700 }}>
            내 구독
          </h2>
          <p className="text-fg-muted" style={{ fontSize: 13 }}>
            {TIER_LABEL[subscription.tier] ?? subscription.tier}
          </p>
        </div>
        <div className="shrink-0">
          {!cancelArmed ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-fg-muted hover:text-fg transition"
              style={{ fontSize: 13 }}
              disabled={canceling}
            >
              구독 해지
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCancelReset}
                className="text-fg-muted"
                style={{ fontSize: 13 }}
                disabled={canceling}
              >
                취소
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={canceling}
                style={{ fontSize: 13, color: 'var(--error, #f04438)', fontWeight: 600 }}
              >
                {canceling ? '해지 중…' : '정말 해지'}
              </button>
            </div>
          )}
        </div>
      </div>

      <p
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: 'var(--brand)',
          lineHeight: 1.15,
          marginBottom: 20,
        }}
      >
        월 {subscription.monthlyFee.toLocaleString()}원
      </p>

      <div
        className="grid grid-cols-2 md:grid-cols-3 gap-4"
        style={{
          padding: 16,
          borderRadius: 'var(--control-radius)',
          background: 'var(--bg-muted)',
        }}
      >
        <InfoCell label="보유 물건" value={`${subscription.propertyCount}채`} />
        <InfoCell label="다음 결제일" value={`매월 ${subscription.billingDate}일`} />
        <InfoCell label="상태" value={subscription.status === 'ACTIVE' ? '활성' : subscription.status} />
      </div>

      <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 12 }}>
        구독료 결제는 mock입니다. 실제 청구는 발생하지 않습니다.
      </p>
      {payMsg && (
        <p style={{ color: 'var(--brand-hover)', fontSize: 13, marginTop: 8, fontWeight: 600 }}>
          ✓ {payMsg}
        </p>
      )}
      {payErr && <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 8 }}>{payErr}</p>}
      {successMsg && (
        <p style={{ color: 'var(--brand)', fontSize: 14, marginTop: 12, fontWeight: 600 }}>
          {successMsg}
        </p>
      )}
      {error && <p style={{ color: 'var(--error)', fontSize: 14, marginTop: 12 }}>{error}</p>}

      {/* 액션 — 좌측 하단: 구독료 결제(mock) → 모달 */}
      <div className="flex justify-start" style={{ marginTop: 20 }}>
        <button
          type="button"
          onClick={() => setShowPay(true)}
          disabled={payingSub}
          className="brand-button"
          style={{ fontSize: 13 }}
        >
          {payingSub
            ? '결제 중…'
            : `구독료 결제 (mock) · ${formatPayKrw(subscription.monthlyFee)}`}
        </button>
      </div>

      {/* 구독료 결제 확인 모달 */}
      <Modal
        open={showPay}
        onClose={() => setShowPay(false)}
        title="구독료 결제"
        footer={
          <>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setShowPay(false)}
              disabled={payingSub}
            >
              취소
            </button>
            <button
              type="button"
              className="brand-button"
              onClick={confirmPay}
              disabled={payingSub}
              style={{ fontSize: 14 }}
            >
              {payingSub ? '결제 중…' : '결제하기'}
            </button>
          </>
        }
      >
        <p className="text-fg" style={{ fontSize: 14, marginBottom: 16 }}>
          이번 달 구독료를 결제합니다.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: 'var(--control-radius)',
            background: 'var(--bg-muted)',
          }}
        >
          <span className="text-fg-secondary" style={{ fontSize: 13 }}>
            {TIER_LABEL[subscription.tier] ?? subscription.tier} · 매월{' '}
            {subscription.billingDate}일
          </span>
          <span className="text-fg" style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>
            {formatPayKrw(subscription.monthlyFee)}
          </span>
        </div>
        <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 12 }}>
          🔒 mock 결제입니다. 실제 청구는 발생하지 않습니다.
        </p>
      </Modal>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-fg-muted" style={{ fontSize: 12 }}>
        {label}
      </p>
      <p className="text-fg mt-1" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>
        {value}
      </p>
    </div>
  );
}
