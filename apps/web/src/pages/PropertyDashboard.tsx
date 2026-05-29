import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getDashboard, type DashboardResponse } from '../api/properties';
import {
  requestInspection,
  type InspectionType,
} from '../api/inspections';
import {
  createLease,
  listMyLeases,
  LEASE_STATUS_LABEL,
  LEASE_STATUS_COLORS,
  formatDate,
  type LeaseDto,
} from '../api/leases';
import { HouseLogTimeline } from './HouseLogTimeline';

function defaultScheduledAtLocal(): string {
  // 내일 14:00 — datetime-local 포맷 (YYYY-MM-DDTHH:mm)
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(14, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function PropertyDashboard() {
  const { session } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // 점검 의뢰 폼 상태
  const initialScheduledAt = useMemo(() => defaultScheduledAtLocal(), []);
  const [inspType, setInspType] = useState<InspectionType>('REGULAR');
  const [scheduledAt, setScheduledAt] = useState<string>(initialScheduledAt);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [logReloadKey, setLogReloadKey] = useState<number>(0);

  useEffect(() => {
    if (!session || !id) return;
    const started = performance.now();
    getDashboard(session.token, id)
      .then((res) => {
        setData(res);
        setElapsedMs(performance.now() - started);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session, id]);

  async function handleRequestInspection() {
    if (!session || !id) return;
    setSubmitting(true);
    setRequestNotice(null);
    setRequestError(null);
    try {
      await requestInspection(session.token, {
        propertyId: id,
        type: inspType,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      setRequestNotice(
        '점검자에게 의뢰가 전달되었습니다. 점검 완료 시 PDF 리포트와 함께 House Log에 자동 기록됩니다.'
      );
      // 폼 reset (유형은 REGULAR로, 일자는 다시 기본값)
      setInspType('REGULAR');
      setScheduledAt(defaultScheduledAtLocal());
      // House Log 영역 강제 reload
      setLogReloadKey((k) => k + 1);
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === 409) {
        setRequestError(
          '점검자가 아직 등록되지 않았습니다. 점검자 mock 로그인을 먼저 해주세요.'
        );
      } else {
        setRequestError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!session || !id) return null;
  if (err) {
    return <p style={{ color: 'var(--error)', fontSize: 14 }}>{err}</p>;
  }
  if (!data) {
    return (
      <p className="text-fg-muted" style={{ fontSize: 14 }}>
        불러오는 중…
      </p>
    );
  }

  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span>내 물건</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">물건 상세</span>
      </div>
      <div>
        <h1
          className="text-fg mt-2"
          style={{ fontSize: 28, lineHeight: 1.3, fontWeight: 700 }}
        >
          {data.property.address}
        </h1>
        {data.property.complexName && (
          <p className="text-fg-secondary mt-1" style={{ fontSize: 14 }}>
            {data.property.complexName}
            {data.property.dong && ` · ${data.property.dong}동`}
            {data.property.ho && ` ${data.property.ho}호`}
          </p>
        )}
        {elapsedMs !== null && (
          <p className="text-fg-muted mt-2" style={{ fontSize: 12 }}>
            대시보드 로드 {Math.round(elapsedMs)}ms · 목표 30,000ms 이내
          </p>
        )}

        {data.status === 'unavailable' ? (
          <div
            className="surface-card mt-8"
            style={{
              padding: 24,
              borderRadius: 'var(--card-radius)',
              background: 'var(--brand-soft)',
              boxShadow: 'inset 0 0 0 1px rgba(49,130,246,0.18)',
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-hover)' }}>
              공공데이터 연동은 아직 활성화되지 않았어요
            </p>
            <p className="text-fg-secondary mt-2" style={{ fontSize: 13 }}>
              {data.reason}
            </p>
            <p className="text-fg-muted mt-2" style={{ fontSize: 12 }}>
              운영팀이 국토부·건축물대장·K-APT API 키를 .env에 설정하면 30초 안에 자동으로 채워집니다.
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <Stat
              title="AMI 점수 (잠정)"
              value={data.ami_score?.toString() ?? '—'}
              hint="가중치 확정 후 자동 갱신"
              emphasis
            />
            <Stat
              title="최근 실거래가"
              value={
                data.enrichment.market_price.latest_price
                  ? `${(data.enrichment.market_price.latest_price / 100_000_000).toFixed(2)}억원`
                  : '—'
              }
              hint={`샘플 ${data.enrichment.market_price.sample_count}건`}
            />
            <Stat
              title="준공연도"
              value={data.enrichment.building.built_year?.toString() ?? '—'}
              hint={
                data.enrichment.building.area_m2
                  ? `전용 ${data.enrichment.building.area_m2}㎡`
                  : '건축물대장 데이터'
              }
            />
            <Stat
              title="세대수"
              value={data.enrichment.complex.households?.toString() ?? '—'}
              hint={
                data.enrichment.complex.mgmt_fee_monthly
                  ? `월 관리비 ${data.enrichment.complex.mgmt_fee_monthly.toLocaleString()}원`
                  : 'K-APT 단지정보'
              }
            />
          </section>
        )}

        <section style={{ marginTop: 64 }}>
          <h2
            className="text-fg"
            style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}
          >
            점검 의뢰
          </h2>
          <p className="text-fg-muted mb-5" style={{ fontSize: 13 }}>
            정기 점검·수리 전후·퇴거 점검을 요청하세요. 등록된 점검자 중 한 분께 자동 배정됩니다.
          </p>
          <div
            className="surface-card"
            style={{ padding: 24, borderRadius: 'var(--card-radius)' }}
          >
            <div>
              <span className="field-label">점검 유형</span>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginTop: 4,
                }}
              >
                {(
                  [
                    { value: 'REGULAR' as const, label: '정기 점검' },
                    { value: 'REPAIR' as const, label: '수리 전후' },
                    { value: 'MOVE_OUT' as const, label: '퇴거 점검' },
                  ]
                ).map((opt) => {
                  const checked = inspType === opt.value;
                  return (
                    <label
                      key={opt.value}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '12px 16px',
                        minHeight: 48,
                        borderRadius: 'var(--control-radius)',
                        cursor: 'pointer',
                        background: checked
                          ? 'var(--brand-soft)'
                          : 'var(--bg-muted)',
                        boxShadow: checked
                          ? 'inset 0 0 0 2px var(--brand)'
                          : 'inset 0 0 0 1px var(--border)',
                        color: checked
                          ? 'var(--brand-hover)'
                          : 'var(--fg)',
                        fontSize: 15,
                        fontWeight: checked ? 600 : 500,
                      }}
                    >
                      <input
                        type="radio"
                        name="inspection-type"
                        value={opt.value}
                        checked={checked}
                        onChange={() => setInspType(opt.value)}
                        style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <label className="field-label" htmlFor="scheduled-at">
                점검 일자
              </label>
              <input
                id="scheduled-at"
                className="field-input"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                style={{ minHeight: 48 }}
              />
            </div>

            <div style={{ marginTop: 24 }}>
              <button
                type="button"
                className="brand-button brand-button-large"
                onClick={handleRequestInspection}
                disabled={submitting || !scheduledAt}
                style={{ width: '100%' }}
              >
                {submitting ? '의뢰 중…' : '의뢰 보내기'}
              </button>
            </div>

            {requestNotice && (
              <p
                style={{
                  marginTop: 16,
                  fontSize: 13,
                  color: 'var(--brand-hover)',
                  background: 'var(--brand-soft)',
                  padding: '12px 14px',
                  borderRadius: 'var(--control-radius)',
                }}
              >
                {requestNotice}
              </p>
            )}
            {requestError && (
              <p
                style={{
                  marginTop: 16,
                  fontSize: 13,
                  color: 'var(--error)',
                }}
              >
                {requestError}
              </p>
            )}
          </div>
        </section>

        <section style={{ marginTop: 64 }}>
          <h2
            className="text-fg"
            style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}
          >
            임대차 계약
          </h2>
          <p className="text-fg-muted mb-5" style={{ fontSize: 13 }}>
            계약을 생성하면 임차인에게 전달할 초대 토큰이 발급됩니다. 임차인이 토큰을 입력하면 계약이 연결됩니다.
          </p>
          <LeaseSection propertyId={id} />
        </section>

        <section style={{ marginTop: 64 }}>
          <h2
            className="text-fg"
            style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}
          >
            House Log
          </h2>
          <p className="text-fg-muted mb-5" style={{ fontSize: 13 }}>
            점검·수리·계약·소유주 변경 사건이 추가만 되고 수정·삭제되지 않는 원장입니다.
          </p>
          <HouseLogTimeline key={logReloadKey} propertyId={id} />
        </section>
      </div>
    </>
  );
}

function Stat({
  title,
  value,
  hint,
  emphasis,
}: {
  title: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className="surface-card"
      style={{
        padding: 24,
        borderRadius: 'var(--card-radius)',
        background: emphasis ? 'var(--brand-soft)' : undefined,
      }}
    >
      <p
        style={{
          fontSize: 12,
          color: emphasis ? 'var(--brand-hover)' : 'var(--fg-muted)',
          fontWeight: 500,
        }}
      >
        {title}
      </p>
      <p
        className="text-fg"
        style={{
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1.2,
          marginTop: 6,
          color: emphasis ? 'var(--brand)' : undefined,
        }}
      >
        {value}
      </p>
      {hint && (
        <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 6 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function defaultLeaseDates(): { start: string; end: string } {
  // 오늘 ~ 1년 뒤 (date input 포맷 YYYY-MM-DD)
  const today = new Date();
  const next = new Date(today);
  next.setFullYear(next.getFullYear() + 1);
  const fmt = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  return { start: fmt(today), end: fmt(next) };
}

// 물건별 임대차 계약 생성 + 이 물건의 계약 목록(+발급된 inviteToken 노출).
function LeaseSection({ propertyId }: { propertyId: string }) {
  const { session } = useAuth();
  const dates = useMemo(() => defaultLeaseDates(), []);
  const [leases, setLeases] = useState<LeaseDto[] | null>(null);
  const [deposit, setDeposit] = useState('');
  const [rent, setRent] = useState('');
  const [invitedPhone, setInvitedPhone] = useState('');
  const [startAt, setStartAt] = useState(dates.start);
  const [endAt, setEndAt] = useState(dates.end);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const all = await listMyLeases(session.token);
    setLeases(all.filter((l) => l.propertyId === propertyId));
  }, [session, propertyId]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  if (!session) return null;

  const handleCreate = async () => {
    const depositNum = Number(deposit);
    if (!depositNum || Number.isNaN(depositNum)) {
      setError('보증금을 숫자로 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setIssuedToken(null);
    setCopied(false);
    try {
      const created = await createLease(session.token, {
        propertyId,
        deposit: depositNum,
        rent: rent.trim() ? Number(rent) : undefined,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        invitedPhone: invitedPhone.trim() || undefined,
      });
      setIssuedToken(created.inviteToken);
      setDeposit('');
      setRent('');
      setInvitedPhone('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface-card" style={{ padding: 24, borderRadius: 'var(--card-radius)' }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="field-label" htmlFor="lease-deposit">보증금 (원)</label>
          <input
            id="lease-deposit"
            className="field-input"
            inputMode="numeric"
            placeholder="예) 100,000,000"
            value={deposit ? Number(deposit).toLocaleString() : ''}
            onChange={(e) => setDeposit(e.target.value.replace(/[^\d]/g, ''))}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="lease-rent">월세 (원, 선택)</label>
          <input
            id="lease-rent"
            className="field-input"
            inputMode="numeric"
            placeholder="예) 500,000"
            value={rent ? Number(rent).toLocaleString() : ''}
            onChange={(e) => setRent(e.target.value.replace(/[^\d]/g, ''))}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="lease-start">계약 시작일</label>
          <input
            id="lease-start"
            className="field-input"
            type="date"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="lease-end">계약 종료일</label>
          <input
            id="lease-end"
            className="field-input"
            type="date"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label className="field-label" htmlFor="lease-phone">임차인 연락처 (선택)</label>
          <input
            id="lease-phone"
            className="field-input"
            placeholder="예) 010-1234-5678"
            value={invitedPhone}
            onChange={(e) => setInvitedPhone(e.target.value)}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={submitting}
        className="brand-button brand-button-large"
        style={{ width: '100%', marginTop: 16 }}
      >
        {submitting ? '생성 중…' : '계약 생성 + 초대 토큰 발급'}
      </button>

      {error && <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      {issuedToken && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 'var(--control-radius)',
            background: 'var(--brand-soft)',
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-hover)' }}>
            초대 토큰이 발급되었습니다. 임차인에게 전달하세요.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <code
              style={{
                flex: 1,
                fontSize: 13,
                wordBreak: 'break-all',
                background: 'rgba(255,255,255,0.7)',
                padding: '8px 10px',
                borderRadius: 6,
              }}
            >
              {issuedToken}
            </code>
            <button
              type="button"
              className="brand-button"
              style={{ fontSize: 13, whiteSpace: 'nowrap' }}
              onClick={() => {
                if (issuedToken) {
                  navigator.clipboard?.writeText(issuedToken).then(
                    () => setCopied(true),
                    () => undefined
                  );
                }
              }}
            >
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        </div>
      )}

      {/* 이 물건의 계약 목록 */}
      <div style={{ marginTop: 24 }}>
        <span className="field-label">이 물건의 계약</span>
        {!leases && <p className="text-fg-muted" style={{ fontSize: 13 }}>불러오는 중…</p>}
        {leases && leases.length === 0 && (
          <p className="text-fg-muted" style={{ fontSize: 13 }}>아직 계약이 없습니다.</p>
        )}
        {leases && leases.length > 0 && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {leases.map((l) => {
              const palette = LEASE_STATUS_COLORS[l.status];
              return (
                <li
                  key={l.id}
                  style={{
                    padding: 14,
                    borderRadius: 'var(--control-radius)',
                    background: 'var(--bg-muted)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: palette.bg,
                        color: palette.fg,
                      }}
                    >
                      {LEASE_STATUS_LABEL[l.status]}
                    </span>
                    <span className="text-fg-muted" style={{ fontSize: 12 }}>
                      {formatDate(l.startAt)} ~ {formatDate(l.endAt)}
                    </span>
                  </div>
                  <p className="text-fg" style={{ fontSize: 13 }}>
                    보증금 {l.deposit.toLocaleString()}원
                    {l.rent != null && ` · 월세 ${l.rent.toLocaleString()}원`}
                  </p>
                  {l.status === 'PENDING' && l.inviteToken && (
                    <p className="text-fg-muted" style={{ fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
                      초대 토큰: <span style={{ fontFamily: 'monospace' }}>{l.inviteToken}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
