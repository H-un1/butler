import { useCallback, useEffect, useState } from 'react';
import {
  SETTLEMENT_CATEGORIES,
  type SettlementCategory,
} from '@butler/shared';
import { useAuth } from '../auth/AuthContext';
import {
  listMyLeases,
  LEASE_STATUS_LABEL,
  formatDate,
  type LeaseDto,
} from '../api/leases';
import {
  computeSettlement,
  listMySettlements,
  SETTLEMENT_CATEGORY_LABEL,
  SETTLEMENT_GRADES,
  SETTLEMENT_GRADE_HINT,
  SETTLEMENT_STATUS_COLORS,
  SETTLEMENT_STATUS_LABEL,
  formatDateTime,
  formatKrw,
  type SettlementDto,
  type SettlementGrade,
  type SettlementLineInput,
} from '../api/settlements';
import { SettlementDetailPanel } from '../components/SettlementDetailPanel';
import { shortCode } from '../lib/displayId';
import {
  listInspectionsByProperty,
  type PropertyInspectionItem,
} from '../api/inspections';

const INSPECTION_TYPE_LABEL: Record<string, string> = {
  REGULAR: '정기',
  REPAIR: '수리',
  MOVE_OUT: '퇴거',
};
const INSPECTION_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '요청됨',
  SCHEDULED: '예정',
  IN_PROGRESS: '진행중',
  DONE: '완료',
};

// 임대인 정산 산출·제안 화면 — URL /landlord/settlements/new
// 흐름: 계약 선택 → (선택) inspectionId 입력 → 라인 입력 → 산출(DRAFT) →
//       산출 결과에서 "임차인에게 제안". 이의(DISPUTED) 건은 라인 수정 후 재제안.

type DraftLine = {
  checklistKey: string;
  area: string;
  category: SettlementCategory;
  grade: SettlementGrade;
  markedDefect: boolean;
  repairCost: string; // 입력 중에는 문자열로 보관
  yearsUsed: string;
};

function emptyLine(): DraftLine {
  return {
    checklistKey: '',
    area: '',
    category: 'WALLPAPER',
    grade: 'C',
    markedDefect: true,
    repairCost: '',
    yearsUsed: '',
  };
}

export function SettlementNew() {
  const { session } = useAuth();
  const [leases, setLeases] = useState<LeaseDto[] | null>(null);
  const [settlements, setSettlements] = useState<SettlementDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadLeases = useCallback(async () => {
    if (!session) return;
    const data = await listMyLeases(session.token);
    setLeases(data);
  }, [session]);

  const loadSettlements = useCallback(async () => {
    if (!session) return;
    const data = await listMySettlements(session.token);
    setSettlements(data);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadLeases().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    loadSettlements().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session, loadLeases, loadSettlements]);

  if (!session) return null;

  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span>정산</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">정산 산출</span>
      </div>

      <h1 className="text-fg mt-2" style={{ fontSize: 28, lineHeight: 1.3, fontWeight: 700 }}>
        수선비 정산 산출
      </h1>
        <p className="text-fg-secondary mt-2" style={{ fontSize: 14 }}>
          퇴거 점검 데이터를 근거로 항목별 임차인·임대인 분담액을 산출하고, 임차인에게 제안하세요.
        </p>

        {err && (
          <p style={{ color: 'var(--error)', fontSize: 14, marginTop: 16 }}>{err}</p>
        )}

        {/* 산출 폼 */}
        <section style={{ marginTop: 32 }}>
          <ComputeForm
            leases={leases}
            onComputed={() => {
              loadSettlements().catch(() => undefined);
            }}
          />
        </section>

        {/* 내가 산출/제안한 정산 목록 */}
        <section style={{ marginTop: 64 }}>
          <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            내 정산 내역
          </h2>
          <p className="text-fg-muted mb-5" style={{ fontSize: 13 }}>
            카드를 눌러 라인·근거·이력을 확인하고, DRAFT는 제안, 이의(DISPUTED) 건은 재제안하세요.
          </p>

          {!settlements && (
            <p className="text-fg-muted" style={{ fontSize: 14 }}>불러오는 중…</p>
          )}
          {settlements && settlements.length === 0 && (
            <p className="text-fg-muted" style={{ fontSize: 14 }}>
              아직 산출한 정산이 없습니다. 위에서 라인을 입력해 산출해보세요.
            </p>
          )}
          {settlements && settlements.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {settlements.map((s) => {
                const palette = SETTLEMENT_STATUS_COLORS[s.status];
                const open = selectedId === s.id;
                // 정산 카드에는 내부 leaseId 대신 계약의 물건 주소·기간을 표시
                const lease = leases?.find((l) => l.id === s.leaseId);
                const leaseLabel = lease
                  ? `${lease.propertyAddress ?? `물건 ${shortCode(lease.propertyId)}`} · ${formatDate(lease.startAt)}~${formatDate(lease.endAt)}`
                  : null;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId((p) => (p === s.id ? null : s.id))}
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
                          임차인 부담 {formatKrw(s.tenantTotal)} / 총 {formatKrw(s.totalCost)}
                        </span>
                      </div>
                      <p className="text-fg-muted" style={{ fontSize: 12 }}>
                        {leaseLabel ? `${leaseLabel} · ` : ''}
                        {formatDateTime(s.createdAt)}
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
    </>
  );
}

function ComputeForm({
  leases,
  onComputed,
}: {
  leases: LeaseDto[] | null;
  onComputed: () => void;
}) {
  const { session } = useAuth();
  const [leaseId, setLeaseId] = useState('');
  const [inspectionId, setInspectionId] = useState('');
  const [inspections, setInspections] = useState<PropertyInspectionItem[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 기본 선택값을 첫 계약으로 (정산은 보통 종료/종료예정 계약 대상)
  useEffect(() => {
    if (!leaseId && leases && leases.length > 0) {
      setLeaseId(leases[0].id);
    }
  }, [leases, leaseId]);

  // 선택한 계약의 물건에 해당하는 점검 목록을 불러와 드롭다운으로 제공
  const selectedLease = leases?.find((l) => l.id === leaseId) ?? null;
  const selectedPropertyId = selectedLease?.propertyId ?? '';
  useEffect(() => {
    if (!session || !selectedPropertyId) {
      setInspections([]);
      return;
    }
    let alive = true;
    listInspectionsByProperty(session.token, selectedPropertyId)
      .then((list) => {
        if (alive) setInspections(list);
      })
      .catch(() => {
        if (alive) setInspections([]);
      });
    return () => {
      alive = false;
    };
  }, [session, selectedPropertyId]);

  // 계약(물건)이 바뀌면 이전에 고른 점검 선택을 초기화
  useEffect(() => {
    setInspectionId('');
  }, [selectedPropertyId]);

  if (!session) return null;

  const updateLine = (i: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const handleCompute = async () => {
    if (!leaseId) {
      setError('정산 대상 계약을 선택해주세요.');
      return;
    }
    // 입력 라인 → API 입력으로 변환 + 검증
    const parsed: SettlementLineInput[] = [];
    for (const [idx, l] of lines.entries()) {
      const repairCost = Number(l.repairCost);
      const yearsUsed = Number(l.yearsUsed);
      if (!l.area.trim()) {
        setError(`${idx + 1}번 라인의 위치(area)를 입력해주세요.`);
        return;
      }
      if (!l.repairCost.trim() || Number.isNaN(repairCost)) {
        setError(`${idx + 1}번 라인의 수선비를 숫자로 입력해주세요.`);
        return;
      }
      if (!l.yearsUsed.trim() || Number.isNaN(yearsUsed)) {
        setError(`${idx + 1}번 라인의 사용연수를 숫자로 입력해주세요.`);
        return;
      }
      parsed.push({
        checklistKey: l.checklistKey.trim() || `${l.category}-${idx + 1}`,
        area: l.area.trim(),
        category: l.category,
        grade: l.grade,
        markedDefect: l.markedDefect,
        repairCost,
        yearsUsed,
      });
    }

    setSubmitting(true);
    setMsg(null);
    setError(null);
    try {
      await computeSettlement(session.token, {
        leaseId,
        inspectionId: inspectionId.trim() || undefined,
        lines: parsed,
      });
      setMsg('정산이 산출되었습니다(DRAFT). 아래 목록에서 라인·근거를 확인하고 임차인에게 제안하세요.');
      setLines([emptyLine()]);
      setInspectionId('');
      onComputed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const hasLeases = leases && leases.length > 0;

  return (
    <div className="surface-card" style={{ padding: 24, borderRadius: 'var(--card-radius)' }}>
      {!hasLeases ? (
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          {leases
            ? '정산 대상 계약이 없습니다. 물건 상세에서 계약을 먼저 생성하세요.'
            : '계약을 불러오는 중…'}
        </p>
      ) : (
        <>
          <label className="field-label" htmlFor="settlement-lease">정산 대상 계약</label>
          <select
            id="settlement-lease"
            className="field-input mb-4"
            value={leaseId}
            onChange={(e) => setLeaseId(e.target.value)}
          >
            {leases!.map((l) => (
              <option key={l.id} value={l.id}>
                {l.propertyAddress ?? `물건 ${shortCode(l.propertyId)}`} ·{' '}
                {LEASE_STATUS_LABEL[l.status]} ·{' '}
                {formatDate(l.startAt)}~{formatDate(l.endAt)}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="settlement-inspection">연결할 점검 (선택)</label>
          <select
            id="settlement-inspection"
            className="field-input mb-1"
            value={inspectionId}
            onChange={(e) => setInspectionId(e.target.value)}
            disabled={inspections.length === 0}
          >
            <option value="">
              {inspections.length === 0
                ? '이 물건에 등록된 점검 없음 — 아래 입력값으로 산출'
                : '연결 안 함 — 아래 입력값으로 산출'}
            </option>
            {inspections.map((i) => (
              <option key={i.id} value={i.id}>
                {INSPECTION_TYPE_LABEL[i.type] ?? i.type} 점검 ·{' '}
                {INSPECTION_STATUS_LABEL[i.status] ?? i.status} ·{' '}
                {formatDate(i.scheduledAt)}
              </option>
            ))}
          </select>
          <p className="text-fg-muted mb-4" style={{ fontSize: 12 }}>
            점검을 연결하면 서버가 해당 점검의 등급·결함 데이터를 권위값으로 사용합니다.
            연결 안 하면 아래 입력값으로 산출합니다.
          </p>

          {/* 라인 입력 */}
          <span className="field-label">정산 라인</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
            {lines.map((l, i) => (
              <LineEditor
                key={i}
                index={i}
                line={l}
                canRemove={lines.length > 1}
                onChange={(patch) => updateLine(i, patch)}
                onRemove={() => removeLine(i)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addLine}
            className="brand-button"
            style={{ fontSize: 13, marginTop: 12, background: 'var(--bg-muted)', color: 'var(--fg)' }}
          >
            + 라인 추가
          </button>

          <button
            type="button"
            onClick={handleCompute}
            disabled={submitting}
            className="brand-button brand-button-large"
            style={{ width: '100%', marginTop: 16 }}
          >
            {submitting ? '산출 중…' : '정산 산출하기'}
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

function LineEditor({
  index,
  line,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  line: DraftLine;
  canRemove: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 'var(--control-radius)',
        background: 'var(--bg-muted)',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span className="text-fg" style={{ fontSize: 13, fontWeight: 600 }}>
          라인 {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-fg-muted hover:text-fg transition"
            style={{ fontSize: 12 }}
          >
            삭제
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor={`settlement-line-${index}-category`}>카테고리</label>
          <select
            id={`settlement-line-${index}-category`}
            className="field-input"
            value={line.category}
            onChange={(e) => onChange({ category: e.target.value as SettlementCategory })}
          >
            {SETTLEMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SETTLEMENT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`settlement-line-${index}-area`}>위치 (area)</label>
          <input
            id={`settlement-line-${index}-area`}
            aria-label="위치 (area)"
            className="field-input"
            placeholder="예) 거실 벽면"
            value={line.area}
            onChange={(e) => onChange({ area: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`settlement-line-${index}-grade`}>등급</label>
          <select
            id={`settlement-line-${index}-grade`}
            className="field-input"
            value={line.grade}
            onChange={(e) => onChange({ grade: e.target.value as SettlementGrade })}
          >
            {SETTLEMENT_GRADES.map((g) => (
              <option key={g} value={g}>
                {g} · {SETTLEMENT_GRADE_HINT[g]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`settlement-line-${index}-checklist-key`}>점검 항목 키 (선택)</label>
          <input
            id={`settlement-line-${index}-checklist-key`}
            aria-label="점검 항목 키 (선택)"
            className="field-input"
            placeholder="예) living-wall (비우면 자동 생성)"
            value={line.checklistKey}
            onChange={(e) => onChange({ checklistKey: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`settlement-line-${index}-repair-cost`}>수선비 (원)</label>
          <input
            id={`settlement-line-${index}-repair-cost`}
            aria-label="수선비 (원)"
            className="field-input"
            inputMode="numeric"
            placeholder="예) 300000"
            value={line.repairCost}
            onChange={(e) => onChange({ repairCost: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`settlement-line-${index}-years-used`}>사용연수 (년)</label>
          <input
            id={`settlement-line-${index}-years-used`}
            aria-label="사용연수 (년)"
            className="field-input"
            inputMode="numeric"
            placeholder="예) 3"
            value={line.yearsUsed}
            onChange={(e) => onChange({ yearsUsed: e.target.value })}
          />
        </div>
      </div>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 12,
          fontSize: 14,
          cursor: 'pointer',
        }}
        className="text-fg"
      >
        <input
          type="checkbox"
          checked={line.markedDefect}
          onChange={(e) => onChange({ markedDefect: e.target.checked })}
          style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
        />
        결함으로 표시(임차인 귀책 가능 항목)
      </label>
    </div>
  );
}

