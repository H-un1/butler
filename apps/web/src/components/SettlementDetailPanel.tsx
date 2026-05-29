import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  agreeSettlement,
  disputeSettlement,
  getSettlement,
  proposeSettlement,
  rejectSettlement,
  SETTLEMENT_CATEGORY_LABEL,
  SETTLEMENT_STATUS_COLORS,
  SETTLEMENT_STATUS_LABEL,
  formatDateTime,
  formatKrw,
  formatRatio,
  type SettlementDetail,
  type SettlementEvent,
} from '../api/settlements';
import { paySettlement } from '../api/payments';
import {
  search as searchPrecedents,
  formatRelevance,
  type Precedent,
} from '../api/precedents';
import { MockDisclaimer } from './MockDisclaimer';
import { shortCode } from '../lib/displayId';

// 정산 상세 — 라인 테이블 + 산출 근거 + 이벤트 타임라인 + 역할별 액션 버튼.
// 임대인/임차인이 모두 재사용하며, 역할과 현재 상태에 따라 가능한 버튼만 노출한다.
// (서버가 최종 권한·전이를 검증하므로 UI는 안내 수준)

const EVENT_LABEL: Record<string, string> = {
  COMPUTED: '산출',
  PROPOSED: '제안',
  DISPUTED: '이의 제기',
  AGREED: '합의 완료',
  REJECTED: '결렬',
  COMMENT: '코멘트',
};

export function SettlementDetailPanel({
  settlementId,
  onChanged,
}: {
  settlementId: string;
  onChanged?: () => void;
}) {
  const { session } = useAuth();
  const [detail, setDetail] = useState<SettlementDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [showDispute, setShowDispute] = useState(false);
  // 정산금 (mock)결제 — 성공 시 결제 완료 표시
  const [paying, setPaying] = useState(false);
  const [paidMsg, setPaidMsg] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const d = await getSettlement(session.token, settlementId);
      setDetail(d);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session, settlementId]);

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
  const isLandlord = role === 'LANDLORD';
  const isTenant = role === 'TENANT';
  const palette = SETTLEMENT_STATUS_COLORS[detail.status];

  // 역할/상태별 액션 가능 여부
  const canPropose = isLandlord && (detail.status === 'DRAFT' || detail.status === 'DISPUTED');
  const canAgree = isTenant && detail.status === 'PROPOSED';
  const canDispute = isTenant && detail.status === 'PROPOSED';

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const handlePropose = () =>
    run(() => proposeSettlement(session.token, settlementId));
  const handleAgree = () =>
    run(() => agreeSettlement(session.token, settlementId));
  const handleReject = () =>
    run(() => rejectSettlement(session.token, settlementId));
  const handleDispute = async () => {
    const note = disputeNote.trim();
    if (!note) return;
    await run(() => disputeSettlement(session.token, settlementId, note));
    setDisputeNote('');
    setShowDispute(false);
  };

  // 정산금 (mock)결제 — 임차인이 합의완료(AGREED) 상태에서 진행
  const handlePaySettlement = async () => {
    setPaying(true);
    setPayErr(null);
    setPaidMsg(null);
    try {
      const payment = await paySettlement(session.token, settlementId);
      setPaidMsg(
        `정산금 ${formatKrw(payment.amount)} 결제 완료 (mock 결제, 실제 청구 없음)`
      );
      onChanged?.();
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div
      className="surface-card"
      style={{ padding: 24, borderRadius: 'var(--card-radius)' }}
    >
      {/* 헤더 — 상태 배지 + 총액 요약 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
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
          {SETTLEMENT_STATUS_LABEL[detail.status]}
        </span>
        <span className="text-fg-muted" style={{ fontSize: 12 }}>
          룰 버전 {detail.ruleVersion}
        </span>
      </div>

      {/* 총액 카드 — 임차인/임대인 분담 */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
        style={{
          padding: 16,
          borderRadius: 'var(--control-radius)',
          background: 'var(--bg-muted)',
          marginBottom: 20,
        }}
      >
        <TotalCell label="총 수선비" value={formatKrw(detail.totalCost)} />
        <TotalCell label="임차인 부담" value={formatKrw(detail.tenantTotal)} emphasis />
        <TotalCell label="임대인 부담" value={formatKrw(detail.landlordTotal)} />
      </div>

      {/* 라인 테이블 — 항목별 분담액 + 근거 */}
      <span className="field-label">정산 라인</span>
      <div style={{ overflowX: 'auto', marginTop: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--fg-muted)' }}>
              <Th>항목</Th>
              <Th>등급</Th>
              <Th>결함</Th>
              <Th align="right">수선비</Th>
              <Th align="right">내구연수</Th>
              <Th align="right">부담비율</Th>
              <Th align="right">잔존(감가)</Th>
              <Th align="right">임차인</Th>
              <Th align="right">임대인</Th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((l, i) => (
              <tr
                key={`${l.checklistKey}-${i}`}
                style={{
                  borderTop: '1px solid var(--border)',
                  opacity: l.eligible ? 1 : 0.55,
                }}
              >
                <Td>
                  <span className="text-fg" style={{ fontWeight: 600 }}>
                    {SETTLEMENT_CATEGORY_LABEL[l.category]}
                  </span>
                  <br />
                  <span className="text-fg-muted" style={{ fontSize: 11 }}>
                    {l.area}
                  </span>
                </Td>
                <Td>{l.grade}</Td>
                <Td>{l.markedDefect ? '예' : '아니오'}</Td>
                <Td align="right">{l.repairCost.toLocaleString()}</Td>
                <Td align="right">{l.durabilityYears}년</Td>
                <Td align="right">{formatRatio(l.tenantFaultRatio)}</Td>
                <Td align="right">{formatRatio(l.residualRatio)}</Td>
                <Td align="right">
                  <span className="text-fg" style={{ fontWeight: 600 }}>
                    {l.tenantShare.toLocaleString()}
                  </span>
                </Td>
                <Td align="right">{l.landlordShare.toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 산출 근거 */}
      <details style={{ marginTop: 16 }}>
        <summary
          className="text-fg-secondary"
          style={{ fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >
          산출 근거 (내구연수·부담비율·감가상각)
        </summary>
        <div
          style={{
            marginTop: 10,
            padding: 14,
            borderRadius: 'var(--control-radius)',
            background: 'var(--bg-muted)',
          }}
        >
          <p className="text-fg-secondary" style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>공식</strong> {detail.basis.formula}
          </p>
          <p className="text-fg-muted" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {detail.basis.computedNote}
          </p>
        </div>
      </details>

      {/* 역할별 액션 */}
      <div style={{ marginTop: 20 }}>
        {/* 임대인: 제안 / 재제안 */}
        {canPropose && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                disabled={busy}
                onClick={handlePropose}
                className="brand-button"
                style={{ fontSize: 13 }}
              >
                {busy
                  ? '처리 중…'
                  : detail.status === 'DISPUTED'
                    ? '임차인에게 재제안'
                    : '임차인에게 제안'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleReject}
                className="brand-button"
                style={{ fontSize: 13, background: 'var(--error, #f04438)' }}
              >
                결렬 처리
              </button>
            </div>
            {detail.status === 'DISPUTED' && (
              <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 8 }}>
                임차인이 이의를 제기했습니다. 라인을 수정해 다시 산출하거나, 현재 산출로 재제안할 수 있습니다.
              </p>
            )}
          </div>
        )}

        {/* 임차인: 합의 / 이의 */}
        {(canAgree || canDispute) && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {canAgree && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleAgree}
                  className="brand-button"
                  style={{ fontSize: 13 }}
                >
                  {busy ? '처리 중…' : '합의하기'}
                </button>
              )}
              {canDispute && !showDispute && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowDispute(true)}
                  className="brand-button"
                  style={{ fontSize: 13, background: 'var(--bg-muted)', color: 'var(--fg)' }}
                >
                  이의 제기
                </button>
              )}
            </div>
            {showDispute && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  aria-label="이의 사유"
                  className="field-input"
                  placeholder="이의 사유를 적어주세요. (예: 도배는 통상 손상으로 임차인 부담이 아닙니다)"
                  value={disputeNote}
                  onChange={(e) => setDisputeNote(e.target.value)}
                  rows={3}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDispute(false);
                      setDisputeNote('');
                    }}
                    className="text-fg-muted"
                    style={{ fontSize: 13 }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={busy || !disputeNote.trim()}
                    onClick={handleDispute}
                    className="brand-button"
                    style={{ fontSize: 13, background: 'var(--error, #f04438)' }}
                  >
                    {busy ? '처리 중…' : '이의 제기 제출'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 합의 완료 — 정산금 (mock)결제 */}
        {detail.status === 'AGREED' && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--control-radius)',
              background: 'var(--brand-soft)',
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-hover)' }}>
              양측이 합의했습니다. 임차인 부담 {formatKrw(detail.tenantTotal)}.
            </p>

            {/* 임차인에게만 결제 버튼 노출 */}
            {isTenant && !paidMsg && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={handlePaySettlement}
                  disabled={paying}
                  className="brand-button"
                  style={{ fontSize: 13 }}
                >
                  {paying
                    ? '결제 중…'
                    : `정산금 결제 (mock) · ${formatKrw(detail.tenantTotal)}`}
                </button>
                <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  mock 결제입니다. 실제 청구는 발생하지 않습니다.
                </p>
              </div>
            )}

            {paidMsg && (
              <p
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-hover)', marginTop: 10 }}
              >
                ✓ {paidMsg}
              </p>
            )}
            {payErr && (
              <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 10 }}>{payErr}</p>
            )}

            {!isTenant && (
              <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 4 }}>
                임차인이 정산금을 (mock)결제할 수 있습니다.
              </p>
            )}
          </div>
        )}

        {detail.status === 'REJECTED' && (
          <p className="text-fg-muted" style={{ fontSize: 13 }}>
            정산이 결렬되었습니다. 필요하면 새 정산을 산출해 다시 제안하세요.
          </p>
        )}
      </div>

      {/* 판례 보조 (Phase 3 M5 — mock) — 유사 판례 검색 */}
      <PrecedentSection detail={detail} />

      {/* 이벤트 타임라인 */}
      <div style={{ marginTop: 24 }}>
        <span className="field-label">합의 이력</span>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {detail.events.length === 0 && (
            <li className="text-fg-muted" style={{ fontSize: 13 }}>
              아직 이력이 없습니다.
            </li>
          )}
          {detail.events.map((ev) => (
            <EventRow key={ev.id} ev={ev} meId={session.user.id} />
          ))}
        </ul>
      </div>

      {err && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{err}</p>
      )}
    </div>
  );
}

// 판례 보조(mock) — 정산 제목·카테고리를 질의로 POST /precedents/search.
// 결과: 사건번호/법원/요지/관련도. 면책 문구를 함께 표시한다.
function PrecedentSection({ detail }: { detail: SettlementDetail }) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [precedents, setPrecedents] = useState<Precedent[] | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!session) return null;

  // 정산 라인의 첫 카테고리를 보조 분류로 사용(없으면 생략).
  const firstCategory = detail.lines[0]?.category;
  const categoryLabel = firstCategory
    ? SETTLEMENT_CATEGORY_LABEL[firstCategory]
    : undefined;
  // 질의 = 정산 성격을 담은 제목 문자열
  const query = `퇴거 수선비 정산${categoryLabel ? ` ${categoryLabel}` : ''} 임차인 원상복구 책임`;

  const handleSearch = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await searchPrecedents(session.token, {
        query,
        category: firstCategory,
      });
      setPrecedents(res.precedents);
      setDisclaimer(res.disclaimer);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <span className="field-label">판례 보조 (mock)</span>
      <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 8 }}>
        이 정산과 유사한 분쟁 판례를 AI가 찾아드립니다. (실제 판례 검색·법률 자문이 아닌 mock 데모)
      </p>

      <button
        type="button"
        onClick={handleSearch}
        disabled={loading}
        className="brand-button"
        style={{ fontSize: 13, background: 'var(--bg-muted)', color: 'var(--fg)' }}
      >
        {loading ? '검색 중…' : '유사 판례 보기 (mock)'}
      </button>

      {err && <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 8 }}>{err}</p>}

      {precedents && (
        <div style={{ marginTop: 12 }}>
          {precedents.length === 0 ? (
            <p className="text-fg-muted" style={{ fontSize: 13 }}>
              유사 판례를 찾지 못했습니다.
            </p>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {precedents.map((p, i) => (
                <li
                  key={`${p.caseNo}-${i}`}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--control-radius)',
                    background: 'var(--bg-muted)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span className="text-fg" style={{ fontSize: 13, fontWeight: 700 }}>
                      {p.caseNo}
                    </span>
                    <span className="text-fg-muted" style={{ fontSize: 12 }}>
                      {p.court}
                    </span>
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--brand-hover)',
                      }}
                    >
                      관련도 {formatRelevance(p.relevance)}
                    </span>
                  </div>
                  <p className="text-fg-secondary" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {p.summary}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 10 }}>
            <MockDisclaimer
              text={
                disclaimer ??
                'mock 데모입니다. 실제 판례 검색·법률 자문이 아니며, 의사결정의 근거로 사용할 수 없습니다.'
              }
              compact
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ ev, meId }: { ev: SettlementEvent; meId: string }) {
  return (
    <li
      style={{
        padding: '10px 14px',
        borderRadius: 'var(--control-radius)',
        background: 'var(--bg-muted)',
      }}
    >
      <p className="text-fg" style={{ fontSize: 13, fontWeight: 600 }}>
        {EVENT_LABEL[ev.type] ?? ev.type}
      </p>
      {ev.note && (
        <p className="text-fg-secondary" style={{ fontSize: 13, marginTop: 2, whiteSpace: 'pre-wrap' }}>
          {ev.note}
        </p>
      )}
      <p className="text-fg-muted" style={{ fontSize: 11, marginTop: 4 }}>
        {ev.actorId === meId ? '나' : ev.actorName ?? shortCode(ev.actorId)} ·{' '}
        {formatDateTime(ev.createdAt)}
      </p>
    </li>
  );
}

function TotalCell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-fg-muted" style={{ fontSize: 12 }}>
        {label}
      </p>
      <p
        style={{
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.3,
          marginTop: 2,
          color: emphasis ? 'var(--brand)' : 'var(--fg)',
        }}
      >
        {value}
      </p>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <th
      style={{
        padding: '6px 8px',
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

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <td
      style={{
        padding: '8px',
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
