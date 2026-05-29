import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CHATBOT_TOPICS, type ChatbotTopic } from '@butler/shared';
import { useAuth } from '../auth/AuthContext';
import { homeForRole } from '../routing/homeForRole';
import { NotificationCenter } from '../components/NotificationCenter';
import { MockDisclaimer } from '../components/MockDisclaimer';
import {
  ask,
  history as chatbotHistory,
  CHATBOT_TOPIC_LABEL,
  formatDateTime as formatChatTime,
  type ChatbotAnswer,
  type ChatbotHistoryItem,
} from '../api/chatbot';
import {
  analyzeRegistry,
  history as ocrHistory,
  OCR_SAFETY_LABEL,
  OCR_SAFETY_COLORS,
  formatKrw,
  formatDateTime as formatOcrTime,
  type OcrRegistryResult,
  type OcrHistoryItem,
} from '../api/ocr';

// AI 보조 통합 화면 (Phase 3 M5 — 전부 mock).
// 임대인·임차인·관리자·점검자 등 인증된 전 역할이 진입(/assistant).
// 두 섹션: ① AI 상담 챗봇 ② 등기부 안전진단(OCR mock).
// 임대인·임차인 홈과 동일한 Toss 톤(상단 ThemeBoundary tone="toss").
// 임대인·임차인·관리자·점검자 공용 진입(/assistant).
// - 임대인: embedded(/landlord/assistant) — LandlordLayout 사이드바 안에서 콘텐츠만 렌더.
// - 그 외 역할: standalone — 상단 Nav + 전체화면(기존 그대로).
export function AssistantPage({ embedded }: { embedded?: boolean }) {
  const { session, logout } = useAuth();
  const [section, setSection] = useState<'chatbot' | 'ocr'>('chatbot');

  if (!session) return null;

  const roleLabel =
    session.user.role === 'LANDLORD'
      ? '임대인'
      : session.user.role === 'TENANT'
        ? '임차인'
        : session.user.role === 'ADMIN'
          ? '관리자'
          : '점검자';

  // 화면 본문 — embedded/standalone 공통.
  const body = (
    <>
      <section style={{ marginBottom: 24 }}>
        <h1 className="text-fg" style={{ fontSize: 30, lineHeight: 1.25, fontWeight: 700 }}>
          AI 보조, 가볍게 물어보세요.
        </h1>
        <p className="text-fg-secondary" style={{ fontSize: 14, marginTop: 8 }}>
          임대차·세무 상담과 등기부 안전진단을 AI가 도와드립니다.
        </p>
      </section>

      {/* 전 화면 공통 면책 — 전부 mock */}
      <div style={{ marginBottom: 24 }}>
        <MockDisclaimer />
      </div>

      {/* 섹션 전환 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        <SectionTab
          label="AI 상담 챗봇"
          active={section === 'chatbot'}
          onClick={() => setSection('chatbot')}
        />
        <SectionTab
          label="등기부 안전진단"
          active={section === 'ocr'}
          onClick={() => setSection('ocr')}
        />
      </div>

      {section === 'chatbot' ? <ChatbotSection /> : <OcrSection />}
    </>
  );

  // 임대인 embedded — 레이아웃이 사이드바·여백을 제공하므로 콘텐츠만 렌더.
  if (embedded) {
    return (
      <>
        <div className="admin-breadcrumb mono">
          <span>임대인</span>
          <span className="admin-breadcrumb__sep">/</span>
          <span className="admin-breadcrumb__current">AI 보조</span>
        </div>
        {body}
      </>
    );
  }

  // standalone — 상단 Nav + 전체화면(현행 유지).
  return (
    <div className="min-h-screen">
      <Nav
        onLogout={logout}
        userName={session.user.name}
        roleLabel={roleLabel}
        homePath={homeForRole(session.user.role)}
      />

      <main
        className="max-w-[840px] mx-auto px-6"
        style={{ paddingTop: 48, paddingBottom: 100 }}
      >
        {body}
      </main>
    </div>
  );
}

/* ───────────────────────── AI 상담 챗봇 ───────────────────────── */

function ChatbotSection() {
  const { session } = useAuth();
  const [question, setQuestion] = useState('');
  const [topic, setTopic] = useState<ChatbotTopic>('GENERAL');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<ChatbotAnswer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ChatbotHistoryItem[] | null>(null);

  const loadHistory = useCallback(async () => {
    if (!session) return;
    try {
      setItems(await chatbotHistory(session.token));
    } catch {
      // 이력 조회 실패는 화면을 막지 않는다(메인 흐름은 질문/답변).
      setItems([]);
    }
  }, [session]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (!session) return null;

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setErr(null);
    try {
      const res = await ask(session.token, { question: q, topic });
      setAnswer(res);
      setQuestion('');
      await loadHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  return (
    <section>
      {/* 질문 입력 */}
      <div
        className="surface-card"
        style={{ padding: 24, borderRadius: 'var(--card-radius)', marginBottom: 20 }}
      >
        <label className="field-label" htmlFor="assistant-topic">상담 주제</label>
        <select
          id="assistant-topic"
          className="field-input mb-4"
          value={topic}
          onChange={(e) => setTopic(e.target.value as ChatbotTopic)}
          disabled={asking}
        >
          {CHATBOT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {CHATBOT_TOPIC_LABEL[t]}
            </option>
          ))}
        </select>

        <label className="field-label" htmlFor="assistant-question">질문</label>
        <textarea
          id="assistant-question"
          className="field-input mb-4"
          placeholder="예) 전세 계약 만기 전 보증금을 못 돌려받으면 어떻게 하나요?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          style={{ resize: 'vertical' }}
          disabled={asking}
        />

        <button
          type="button"
          onClick={handleAsk}
          disabled={asking || !question.trim()}
          className="brand-button brand-button-large"
          style={{ width: '100%' }}
        >
          {asking ? '답변 생성 중…' : 'AI에게 물어보기 (mock)'}
        </button>

        {err && (
          <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{err}</p>
        )}
      </div>

      {/* 답변 */}
      {answer && (
        <div
          className="surface-card"
          style={{ padding: 24, borderRadius: 'var(--card-radius)', marginBottom: 20 }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--brand-soft)',
                color: 'var(--brand-hover)',
              }}
            >
              {CHATBOT_TOPIC_LABEL[answer.topic]}
            </span>
            <span className="text-fg-muted" style={{ fontSize: 12 }}>
              AI 답변 (mock)
            </span>
          </div>

          <p
            className="text-fg"
            style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
          >
            {answer.answer}
          </p>

          {answer.sources.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <span className="field-label">참고 출처 (mock)</span>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {answer.sources.map((s, i) => (
                  <li
                    key={`${s.title}-${i}`}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--control-radius)',
                      background: 'var(--bg-muted)',
                    }}
                  >
                    <p className="text-fg" style={{ fontSize: 13, fontWeight: 600 }}>
                      {s.title}
                    </p>
                    <p
                      className="text-fg-secondary"
                      style={{ fontSize: 13, marginTop: 2, lineHeight: 1.5 }}
                    >
                      {s.snippet}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <MockDisclaimer text={answer.disclaimer} compact />
          </div>
        </div>
      )}

      {/* 대화 이력 */}
      <div>
        <h2 className="text-fg" style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          상담 이력
        </h2>
        {!items && <p className="text-fg-muted" style={{ fontSize: 14 }}>불러오는 중…</p>}
        {items && items.length === 0 && (
          <p className="text-fg-muted" style={{ fontSize: 14 }}>
            아직 상담 이력이 없습니다.
          </p>
        )}
        {items && items.length > 0 && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it) => (
              <li
                key={it.id}
                className="surface-card"
                style={{ padding: 16, borderRadius: 'var(--card-radius)' }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      background: 'var(--bg-muted)',
                      color: 'var(--fg-secondary)',
                    }}
                  >
                    {CHATBOT_TOPIC_LABEL[it.topic]}
                  </span>
                  <span className="text-fg-muted" style={{ fontSize: 12 }}>
                    {formatChatTime(it.createdAt)}
                  </span>
                </div>
                <p className="text-fg" style={{ fontSize: 14, fontWeight: 600 }}>
                  Q. {it.question}
                </p>
                <p
                  className="text-fg-secondary"
                  style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
                >
                  A. {it.answer}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── 등기부 안전진단(OCR mock) ───────────────────────── */

function OcrSection() {
  const { session } = useAuth();
  const [documentRef, setDocumentRef] = useState('');
  const [rawText, setRawText] = useState('');
  const [marketPrice, setMarketPrice] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<OcrRegistryResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<OcrHistoryItem[] | null>(null);

  const loadHistory = useCallback(async () => {
    if (!session) return;
    try {
      setItems(await ocrHistory(session.token));
    } catch {
      setItems([]);
    }
  }, [session]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (!session) return null;

  const handleAnalyze = async () => {
    // mock: 실제 파일 업로드 대신 문서 참조 또는 텍스트 + 시세 입력으로 진단한다.
    if (!documentRef.trim() && !rawText.trim()) {
      setErr('등기부 문서 참조 또는 등기부 텍스트 중 하나를 입력해주세요.');
      return;
    }
    setAnalyzing(true);
    setErr(null);
    try {
      const mp = marketPrice.trim() ? Number(marketPrice.replace(/[^\d]/g, '')) : undefined;
      const res = await analyzeRegistry(session.token, {
        documentRef: documentRef.trim() || undefined,
        rawText: rawText.trim() || undefined,
        marketPrice: Number.isFinite(mp) ? mp : undefined,
      });
      setResult(res);
      await loadHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <section>
      {/* 입력(파일 업로드 mock) */}
      <div
        className="surface-card"
        style={{ padding: 24, borderRadius: 'var(--card-radius)', marginBottom: 20 }}
      >
        {/* 파일 업로드 UI — mock이라 실제 업로드는 하지 않고 참조/텍스트로 대체 */}
        <div
          style={{
            border: '1.5px dashed var(--border)',
            borderRadius: 'var(--control-radius)',
            padding: '20px 16px',
            textAlign: 'center',
            marginBottom: 16,
            background: 'var(--bg-muted)',
          }}
        >
          <p className="text-fg" style={{ fontSize: 14, fontWeight: 600 }}>
            등기부등본 파일 업로드 (mock)
          </p>
          <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 4 }}>
            데모에서는 실제 업로드 대신 아래 문서 참조 또는 등기부 텍스트로 분석합니다.
          </p>
        </div>

        <label className="field-label" htmlFor="assistant-document-ref">등기부 문서 참조 (선택)</label>
        <input
          id="assistant-document-ref"
          className="field-input mb-4"
          placeholder="예) reg-2026-000123 (업로드 문서 식별자)"
          value={documentRef}
          onChange={(e) => setDocumentRef(e.target.value)}
          disabled={analyzing}
        />

        <label className="field-label" htmlFor="assistant-raw-text">등기부 텍스트 직접 입력 (선택)</label>
        <textarea
          id="assistant-raw-text"
          className="field-input mb-4"
          placeholder="등기부 갑구·을구 텍스트를 붙여넣으면 mock 분석합니다."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={4}
          style={{ resize: 'vertical' }}
          disabled={analyzing}
        />

        <label className="field-label" htmlFor="assistant-market-price">시세 (원, 선택)</label>
        <input
          id="assistant-market-price"
          className="field-input mb-2"
          placeholder="예) 300000000"
          inputMode="numeric"
          value={marketPrice}
          onChange={(e) => setMarketPrice(e.target.value)}
          disabled={analyzing}
        />
        <p className="text-fg-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          시세를 입력하면 근저당 등 채무 대비 안전등급을 더 정확히 산정합니다.
        </p>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={analyzing}
          className="brand-button brand-button-large"
          style={{ width: '100%' }}
        >
          {analyzing ? '진단 중…' : '안전진단 실행 (mock)'}
        </button>

        <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 12 }}>
          🔒 주민등록번호는 마스킹되어 저장되지 않습니다.
        </p>

        {err && (
          <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{err}</p>
        )}
      </div>

      {/* 진단 결과 */}
      {result && (
        <div
          className="surface-card"
          style={{ padding: 24, borderRadius: 'var(--card-radius)', marginBottom: 20 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <SafetyBadge grade={result.safetyGrade} />
            <span className="text-fg-muted" style={{ fontSize: 12 }}>
              등기부 안전진단 결과 (mock)
            </span>
          </div>

          <p className="text-fg" style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
            {result.safetyReason}
          </p>

          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
            style={{
              padding: 16,
              borderRadius: 'var(--control-radius)',
              background: 'var(--bg-muted)',
              marginBottom: 16,
            }}
          >
            <InfoCell label="소유자" value={result.ownerMasked} />
            <InfoCell label="주소" value={result.address} />
            <InfoCell label="총 채무(근저당 등)" value={formatKrw(result.totalDebt)} />
            <InfoCell
              label="주민번호 처리"
              value={result.rrnMasked ? '마스킹됨 (######-*******)' : '—'}
            />
          </div>

          {result.rights.length > 0 && (
            <div>
              <span className="field-label">권리관계 (mock)</span>
              <div style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--fg-muted)' }}>
                      <th style={thStyle}>권리 종류</th>
                      <th style={thStyle}>권리자</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rights.map((rt, i) => (
                      <tr key={`${rt.type}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={tdStyle} className="text-fg">
                          {rt.type}
                        </td>
                        <td style={tdStyle} className="text-fg-secondary">
                          {rt.holderMasked}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }} className="text-fg">
                          {rt.amount.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <MockDisclaimer text={result.disclaimer} compact />
          </div>
        </div>
      )}

      {/* 진단 이력 */}
      <div>
        <h2 className="text-fg" style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          진단 이력
        </h2>
        {!items && <p className="text-fg-muted" style={{ fontSize: 14 }}>불러오는 중…</p>}
        {items && items.length === 0 && (
          <p className="text-fg-muted" style={{ fontSize: 14 }}>
            아직 진단 이력이 없습니다.
          </p>
        )}
        {items && items.length > 0 && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it) => (
              <li
                key={it.id}
                className="surface-card"
                style={{ padding: 16, borderRadius: 'var(--card-radius)' }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <SafetyBadge grade={it.safetyGrade} compact />
                  <span className="text-fg-muted" style={{ fontSize: 12 }}>
                    {formatOcrTime(it.createdAt)}
                  </span>
                </div>
                <p className="text-fg" style={{ fontSize: 14, fontWeight: 600 }}>
                  {it.address}
                </p>
                <p className="text-fg-secondary" style={{ fontSize: 13, marginTop: 2 }}>
                  {it.ownerMasked} · 총 채무 {formatKrw(it.totalDebt)}
                  {it.marketPrice != null && ` · 시세 ${formatKrw(it.marketPrice)}`}
                </p>
                <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {it.safetyReason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '8px',
  verticalAlign: 'top',
};

// 안전등급 배지 — SAFE 녹색 / CAUTION 주황 / DANGER 빨강
export function SafetyBadge({
  grade,
  compact,
}: {
  grade: keyof typeof OCR_SAFETY_COLORS;
  compact?: boolean;
}) {
  const palette = OCR_SAFETY_COLORS[grade];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: compact ? '3px 10px' : '5px 14px',
        borderRadius: 999,
        fontSize: compact ? 12 : 14,
        fontWeight: 700,
        background: palette.bg,
        color: palette.fg,
      }}
    >
      {OCR_SAFETY_LABEL[grade]}
    </span>
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

function SectionTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 20px',
        borderRadius: 999,
        fontSize: 15,
        fontWeight: active ? 700 : 500,
        background: active ? 'var(--brand)' : 'var(--bg-muted)',
        color: active ? '#fff' : 'var(--fg-secondary)',
        transition: 'background .16s ease',
      }}
    >
      {label}
    </button>
  );
}

function Nav({
  onLogout,
  userName,
  roleLabel,
  homePath,
}: {
  onLogout: () => void;
  userName: string;
  roleLabel: string;
  homePath: string;
}) {
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
        <div className="flex items-center gap-3">
          <Link to={homePath} className="text-fg" style={{ fontSize: 17, fontWeight: 700 }}>
            버틀러
          </Link>
          <span className="text-fg-muted" style={{ fontSize: 13 }}>
            AI 보조 · {roleLabel}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to={homePath}
            className="text-fg-muted hover:text-fg transition"
            style={{ fontSize: 13 }}
          >
            ← 내 홈으로
          </Link>
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
