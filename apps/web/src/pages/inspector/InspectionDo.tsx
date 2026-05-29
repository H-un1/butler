import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  acceptInspection,
  addInspectionItem,
  formatScheduled,
  getInspection,
  STATUS_COLORS,
  STATUS_LABEL,
  submitInspection,
  TYPE_LABEL,
  type InspectionDetail,
  type InspectionGrade,
  type SubmitResult,
} from './api';
import { shortCode } from '../../lib/displayId';

const GRADES: InspectionGrade[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const GRADE_HINT: Record<InspectionGrade, string> = {
  A: '문제없음',
  B: '경미',
  C: '주의',
  D: '수리 필요',
  E: '심각',
  F: '교체 필요',
};

// 점검 진행 화면 — URL /inspector/:id
// 상태별 분기:
//  - REQUESTED / SCHEDULED : "수락하기"
//  - IN_PROGRESS : 항목 추가 폼 + 목록 + 제출 버튼
//  - DONE : 결과 요약 + PDF 링크
export function InspectionDo() {
  const { session } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<InspectionDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  async function refresh() {
    if (!session || !id) return;
    try {
      const res = await getInspection(session.token, id);
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, id]);

  if (!session || !id) return null;

  async function onAccept() {
    if (!session || !id) return;
    setBusy(true);
    setErr(null);
    try {
      await acceptInspection(session.token, id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!session || !id) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await submitInspection(session.token, id);
      setSubmitResult(res);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Nav onLogout={() => {}} />
      <main
        className="max-w-[840px] mx-auto"
        style={{ paddingTop: 40, paddingBottom: 120, paddingLeft: 32, paddingRight: 32 }}
      >
        <Link
          to="/inspector"
          className="text-fg-muted hover:text-fg transition"
          style={{ fontSize: 14 }}
        >
          ← 내 의뢰 목록
        </Link>

        {err && (
          <p
            style={{
              color: 'var(--error)',
              fontSize: 15,
              marginTop: 16,
              padding: 16,
              background: '#FEEBED',
              borderRadius: 'var(--control-radius)',
            }}
          >
            {err}
          </p>
        )}

        {!data ? (
          <p className="text-fg-muted" style={{ fontSize: 16, marginTop: 32 }}>
            불러오는 중…
          </p>
        ) : (
          <>
            <MetaHeader data={data} />

            {submitResult ? (
              <SubmitResultPanel result={submitResult} />
            ) : data.status === 'REQUESTED' || data.status === 'SCHEDULED' ? (
              <AcceptPanel busy={busy} onAccept={onAccept} />
            ) : data.status === 'IN_PROGRESS' ? (
              <ProgressPanel
                data={data}
                onItemAdded={refresh}
                onSubmit={onSubmit}
                busy={busy}
              />
            ) : (
              <DonePanel data={data} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function MetaHeader({ data }: { data: InspectionDetail }) {
  const palette = STATUS_COLORS[data.status];
  return (
    <header style={{ marginTop: 20, marginBottom: 32 }}>
      <span
        style={{
          display: 'inline-block',
          padding: '6px 14px',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 600,
          background: palette.bg,
          color: palette.fg,
          marginBottom: 16,
        }}
      >
        {STATUS_LABEL[data.status]}
      </span>
      <h1
        className="text-fg"
        style={{ fontSize: 32, lineHeight: 1.3, fontWeight: 700, marginBottom: 8 }}
      >
        {TYPE_LABEL[data.type]} 점검
      </h1>
      <p className="text-fg-secondary" style={{ fontSize: 16 }}>
        예정 일시 · {formatScheduled(data.scheduledAt)}
      </p>
      <p className="text-fg-muted" style={{ fontSize: 14, marginTop: 4 }}>
        {data.propertyAddress ?? `물건 ${shortCode(data.propertyId)}`}
        {data.propertyComplexName && ` · ${data.propertyComplexName}`}
      </p>
    </header>
  );
}

function AcceptPanel({ busy, onAccept }: { busy: boolean; onAccept: () => void }) {
  return (
    <section
      className="surface-card"
      style={{ padding: 32, borderRadius: 'var(--card-radius)' }}
    >
      <h2 className="text-fg" style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        이 점검을 수락하시겠어요?
      </h2>
      <p className="text-fg-secondary" style={{ fontSize: 15, marginBottom: 24 }}>
        수락하면 현장에서 항목을 입력할 수 있는 상태가 됩니다.
      </p>
      <button
        type="button"
        onClick={onAccept}
        disabled={busy}
        className="brand-button brand-button-large w-full"
        style={{ minHeight: 56, fontSize: 18 }}
      >
        {busy ? '수락 중…' : '수락하기'}
      </button>
    </section>
  );
}

function ProgressPanel({
  data,
  onItemAdded,
  onSubmit,
  busy,
}: {
  data: InspectionDetail;
  onItemAdded: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <ItemList items={data.items} />
      <AddItemForm inspectionId={data.id} onAdded={onItemAdded} />
      <section
        className="surface-card"
        style={{ padding: 28, borderRadius: 'var(--card-radius)' }}
      >
        <h2 className="text-fg" style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>
          모든 항목을 입력했나요?
        </h2>
        <p className="text-fg-secondary" style={{ fontSize: 15, marginBottom: 20 }}>
          제출하면 PDF 리포트가 자동 생성되고 임대인에게 알림이 전송됩니다.
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || data.items.length === 0}
          className="brand-button brand-button-large w-full"
          style={{ minHeight: 56, fontSize: 18 }}
          title={data.items.length === 0 ? '항목을 1개 이상 추가해야 제출할 수 있습니다' : ''}
        >
          {busy ? '제출 중…' : '제출하기'}
        </button>
        {data.items.length === 0 && (
          <p className="text-fg-muted" style={{ fontSize: 13, marginTop: 10 }}>
            항목을 1개 이상 추가해야 제출할 수 있습니다.
          </p>
        )}
      </section>
    </div>
  );
}

function ItemList({ items }: { items: InspectionDetail['items'] }) {
  if (items.length === 0) {
    return (
      <section
        className="surface-card"
        style={{ padding: 24, borderRadius: 'var(--card-radius)' }}
      >
        <h2 className="text-fg" style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
          추가된 항목 (0)
        </h2>
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          아래에서 첫 항목을 추가해주세요.
        </p>
      </section>
    );
  }
  return (
    <section
      className="surface-card"
      style={{ padding: 24, borderRadius: 'var(--card-radius)' }}
    >
      <h2 className="text-fg" style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>
        추가된 항목 ({items.length})
      </h2>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it) => (
          <li
            key={it.id}
            style={{
              padding: 16,
              borderRadius: 'var(--control-radius)',
              background: 'var(--bg-muted)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 6,
              }}
            >
              <div className="text-fg" style={{ fontSize: 16, fontWeight: 600 }}>
                {it.area} · {it.checklistKey}
              </div>
              <GradeBadge grade={it.grade} />
            </div>
            {it.note && (
              <p className="text-fg-secondary" style={{ fontSize: 14, lineHeight: 1.55 }}>
                {it.note}
              </p>
            )}
            {it.markedDefect && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--error)',
                }}
              >
                파손 마킹됨
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GradeBadge({ grade }: { grade: InspectionGrade }) {
  const colors: Record<InspectionGrade, string> = {
    A: '#1B7F3A',
    B: '#3182F6',
    C: '#B7791F',
    D: '#D9531E',
    E: '#C0392B',
    F: '#8E1B1B',
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 999,
        background: colors[grade],
        color: '#fff',
        fontWeight: 700,
        fontSize: 16,
      }}
      title={GRADE_HINT[grade]}
    >
      {grade}
    </span>
  );
}

function AddItemForm({
  inspectionId,
  onAdded,
}: {
  inspectionId: string;
  onAdded: () => void;
}) {
  const { session } = useAuth();
  const [area, setArea] = useState('');
  const [checklistKey, setChecklistKey] = useState('');
  const [grade, setGrade] = useState<InspectionGrade>('A');
  const [note, setNote] = useState('');
  const [markedDefect, setMarkedDefect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => area.trim().length > 0 && checklistKey.trim().length > 0,
    [area, checklistKey]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      await addInspectionItem(session.token, inspectionId, {
        area: area.trim(),
        checklistKey: checklistKey.trim(),
        grade,
        note: note.trim() || undefined,
        markedDefect,
      });
      // 폼 리셋
      setArea('');
      setChecklistKey('');
      setGrade('A');
      setNote('');
      setMarkedDefect(false);
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="surface-card"
      style={{ padding: 28, borderRadius: 'var(--card-radius)' }}
    >
      <h2 className="text-fg" style={{ fontSize: 19, fontWeight: 700, marginBottom: 20 }}>
        항목 추가
      </h2>
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          <div>
            <label className="field-label" htmlFor="inspection-area" style={{ fontSize: 14 }}>
              구역 (area)
            </label>
            <input
              id="inspection-area"
              className="field-input"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="욕실 / 거실 / 주방 / 침실"
              style={{ fontSize: 16, padding: '14px 16px', minHeight: 52 }}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="inspection-checklist-key" style={{ fontSize: 14 }}>
              체크리스트 키 (checklistKey)
            </label>
            <input
              id="inspection-checklist-key"
              className="field-input"
              value={checklistKey}
              onChange={(e) => setChecklistKey(e.target.value)}
              placeholder="bathroom.leak / living.floor"
              style={{ fontSize: 16, padding: '14px 16px', minHeight: 52 }}
            />
          </div>
        </div>

        <div>
          <span className="field-label" id="inspection-grade-label" style={{ fontSize: 14 }}>
            등급 (grade)
          </span>
          <div
            role="radiogroup"
            aria-labelledby="inspection-grade-label"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 8,
            }}
          >
            {GRADES.map((g) => {
              const active = g === grade;
              return (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setGrade(g)}
                  style={{
                    minHeight: 56,
                    borderRadius: 'var(--control-radius)',
                    border: active ? '2px solid var(--brand)' : '1px solid var(--border)',
                    background: active ? 'var(--brand-soft)' : 'var(--bg-page)',
                    color: active ? 'var(--brand-hover)' : 'var(--fg)',
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <span>{g}</span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 500,
                      color: active ? 'var(--brand-hover)' : 'var(--fg-muted)',
                      marginTop: 2,
                    }}
                  >
                    {GRADE_HINT[g]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="inspection-note" style={{ fontSize: 14 }}>
            메모 (note)
          </label>
          <textarea
            id="inspection-note"
            className="field-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="현장 상황을 자유롭게 적어주세요"
            style={{ fontSize: 16, padding: '14px 16px', minHeight: 96, resize: 'vertical' }}
          />
        </div>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            padding: '12px 0',
          }}
        >
          <input
            type="checkbox"
            checked={markedDefect}
            onChange={(e) => setMarkedDefect(e.target.checked)}
            style={{ width: 22, height: 22 }}
          />
          <span className="text-fg" style={{ fontSize: 16, fontWeight: 500 }}>
            파손 마킹 (markedDefect)
          </span>
        </label>

        {err && (
          <p style={{ color: 'var(--error)', fontSize: 14 }}>{err}</p>
        )}

        <button
          type="submit"
          className="brand-button brand-button-large"
          disabled={!canSubmit || busy}
          style={{ minHeight: 56, fontSize: 17 }}
        >
          {busy ? '추가 중…' : '항목 추가'}
        </button>
      </form>
    </section>
  );
}

function SubmitResultPanel({ result }: { result: SubmitResult }) {
  return (
    <section
      className="surface-card"
      style={{
        padding: 32,
        borderRadius: 'var(--card-radius)',
        background: 'var(--brand-soft)',
        boxShadow: 'inset 0 0 0 1px rgba(49,130,246,0.22)',
        marginTop: 8,
      }}
    >
      <p
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--brand-hover)',
          marginBottom: 12,
        }}
      >
        제출 완료
      </p>
      <h2
        className="text-fg"
        style={{ fontSize: 26, fontWeight: 700, marginBottom: 10, lineHeight: 1.3 }}
      >
        점검 리포트가 임대인에게 전달되었습니다
      </h2>
      <p className="text-fg-secondary" style={{ fontSize: 15, marginBottom: 24 }}>
        {result.status === 'done'
          ? '임대인에게 도착 알림이 전송되었고, HouseLog에도 자동 기록되었습니다.'
          : `PDF 생성은 보류되었지만 제출은 완료되었습니다. (사유: ${result.reason ?? '알 수 없음'})`}
      </p>

      {result.status === 'done' && (
        <div
          style={{
            background: 'var(--bg-page)',
            borderRadius: 'var(--control-radius)',
            padding: 16,
            marginBottom: 20,
          }}
        >
          <p className="text-fg-muted" style={{ fontSize: 13, marginBottom: 6 }}>
            리포트 PDF
          </p>
          <a
            href={result.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="text-fg"
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--brand-hover)',
              wordBreak: 'break-all',
            }}
          >
            {result.pdfUrl}
          </a>
        </div>
      )}

      <Link
        to="/inspector"
        className="brand-button brand-button-large"
        style={{ minHeight: 56, fontSize: 17, width: '100%' }}
      >
        내 의뢰 목록으로
      </Link>
    </section>
  );
}

function DonePanel({ data }: { data: InspectionDetail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ItemList items={data.items} />
      <section
        className="surface-card"
        style={{
          padding: 28,
          borderRadius: 'var(--card-radius)',
          background: 'var(--brand-soft)',
          boxShadow: 'inset 0 0 0 1px rgba(49,130,246,0.18)',
        }}
      >
        <h2
          className="text-fg"
          style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}
        >
          제출 완료된 점검입니다
        </h2>
        {data.report ? (
          <>
            <p className="text-fg-secondary" style={{ fontSize: 14, marginBottom: 16 }}>
              생성 일시 · {formatScheduled(data.report.generatedAt)}
            </p>
            <a
              href={data.report.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="brand-button brand-button-large"
              style={{ minHeight: 52, fontSize: 17 }}
            >
              PDF 리포트 열기
            </a>
          </>
        ) : (
          <p className="text-fg-secondary" style={{ fontSize: 14 }}>
            아직 PDF가 생성되지 않았습니다.
          </p>
        )}
      </section>
    </div>
  );
}

function Nav({ onLogout }: { onLogout: () => void }) {
  // 진행 화면에서는 로그아웃을 노출하지 않음 (실수 방지) — 홈으로 돌아가기 링크로 대체
  void onLogout;
  return (
    <header
      className="sticky top-0 z-10"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        className="max-w-[840px] mx-auto flex items-center justify-between"
        style={{ height: 72, paddingLeft: 32, paddingRight: 32 }}
      >
        <div className="flex items-center" style={{ gap: 10 }}>
          <span
            className="text-fg"
            style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0 }}
          >
            버틀러
          </span>
          <span className="text-fg-muted" style={{ fontSize: 14 }}>
            점검자
          </span>
        </div>
        <Link
          to="/inspector"
          className="text-fg-muted hover:text-fg transition"
          style={{ fontSize: 14 }}
        >
          내 의뢰
        </Link>
      </div>
    </header>
  );
}
