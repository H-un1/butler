import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  listMyInspections,
  TYPE_LABEL,
  STATUS_LABEL,
  STATUS_COLORS,
  formatScheduled,
  type InspectionListItem,
} from './api';
import { shortCode } from '../../lib/displayId';

// 점검자 웹 홈 — 현장 친화 톤(Toss 라이트 + 더 큰 폰트·버튼·여백)으로
// 내 의뢰 목록을 카드 리스트로 보여준다. 각 카드 → /inspector/:id 진입.
export function InspectorHome() {
  const { session, logout } = useAuth();
  const [items, setItems] = useState<InspectionListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listMyInspections(session.token)
      .then(setItems)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session]);

  if (!session) return null;

  const total = items?.length ?? 0;
  const pending = items?.filter((i) => i.status !== 'DONE').length ?? 0;

  return (
    <div className="min-h-screen">
      <Nav onLogout={logout} userName={session.user.name} />

      <main
        className="max-w-[840px] mx-auto"
        style={{ paddingTop: 56, paddingBottom: 120, paddingLeft: 32, paddingRight: 32 }}
      >
        {/* Hero — 현장 변형: 더 큰 헤드라인 */}
        <section style={{ marginBottom: 40 }}>
          <p className="text-fg-secondary" style={{ fontSize: 16, marginBottom: 8 }}>
            안녕하세요, {session.user.name} 점검자님
          </p>
          <h1
            className="text-fg"
            style={{ fontSize: 38, lineHeight: 1.25, fontWeight: 700, letterSpacing: 0 }}
          >
            오늘의 점검 의뢰,
            <br />
            바로 시작하세요.
          </h1>
        </section>

        {/* 요약 */}
        <section
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          style={{ marginBottom: 36 }}
        >
          <Stat title="전체 의뢰" value={`${total}건`} hint="배정된 모든 점검" />
          <Stat
            title="대기/진행 중"
            value={`${pending}건`}
            hint="DONE 이전 상태"
            emphasis
          />
        </section>

        {/* 의뢰 목록 */}
        <section>
          <h2
            className="text-fg"
            style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}
          >
            내 의뢰
          </h2>

          {err && (
            <p style={{ color: 'var(--error)', fontSize: 15, marginBottom: 16 }}>
              {err}
            </p>
          )}
          {!items && !err && (
            <p className="text-fg-muted" style={{ fontSize: 16 }}>
              불러오는 중…
            </p>
          )}

          {items && items.length === 0 && (
            <div
              className="surface-card text-center"
              style={{ padding: '64px 28px', borderRadius: 'var(--card-radius)' }}
            >
              <p className="text-fg" style={{ fontSize: 19, fontWeight: 500, marginBottom: 8 }}>
                아직 배정된 점검이 없습니다
              </p>
              <p className="text-fg-muted" style={{ fontSize: 15 }}>
                임대인이 의뢰를 보내면 여기에 표시됩니다.
              </p>
            </div>
          )}

          {items && items.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {items.map((insp) => (
                <li key={insp.id}>
                  <InspectionCard insp={insp} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function InspectionCard({ insp }: { insp: InspectionListItem }) {
  const palette = STATUS_COLORS[insp.status];
  return (
    <Link
      to={`/inspector/${insp.id}`}
      className="surface-card surface-card-hover block"
      style={{ padding: 28, borderRadius: 'var(--card-radius)' }}
    >
      <div className="flex items-start justify-between" style={{ gap: 24 }}>
        <div className="flex-1 min-w-0">
          <span
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              background: palette.bg,
              color: palette.fg,
              marginBottom: 12,
            }}
          >
            {STATUS_LABEL[insp.status]}
          </span>
          <p
            className="text-fg"
            style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 }}
          >
            {TYPE_LABEL[insp.type]} 점검 · {formatScheduled(insp.scheduledAt)}
          </p>
          <p className="text-fg-muted" style={{ fontSize: 14 }}>
            {insp.propertyAddress ?? `물건 ${shortCode(insp.propertyId)}`}
            {insp.propertyComplexName && ` · ${insp.propertyComplexName}`}
          </p>
        </div>
        <div className="shrink-0" style={{ display: 'flex', alignItems: 'center' }}>
          <span
            className="brand-button brand-button-large"
            style={{ pointerEvents: 'none', minHeight: 48 }}
          >
            들어가기
          </span>
        </div>
      </div>
    </Link>
  );
}

function Nav({ onLogout, userName }: { onLogout: () => void; userName: string }) {
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
        <div className="flex items-center" style={{ gap: 18 }}>
          <span className="text-fg-secondary" style={{ fontSize: 14 }}>
            {userName}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="text-fg-muted hover:text-fg transition"
            style={{ fontSize: 14 }}
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
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
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className="surface-card"
      style={{
        padding: 24,
        borderRadius: 'var(--card-radius)',
        ...(emphasis
          ? { background: 'var(--brand-soft)', boxShadow: 'inset 0 0 0 1px rgba(49,130,246,0.18)' }
          : {}),
      }}
    >
      <p
        className={emphasis ? '' : 'text-fg-muted'}
        style={{
          fontSize: 13,
          color: emphasis ? 'var(--brand-hover)' : undefined,
          fontWeight: 600,
        }}
      >
        {title}
      </p>
      <p
        className="text-fg"
        style={{
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.2,
          marginTop: 6,
        }}
      >
        {value}
      </p>
      <p className="text-fg-muted" style={{ fontSize: 13, marginTop: 8 }}>
        {hint}
      </p>
    </div>
  );
}
