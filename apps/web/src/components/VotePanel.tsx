import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  listVotes,
  createVote,
  castBallot,
  closeVote,
  VOTE_STATUS_LABEL,
  VOTE_STATUS_COLORS,
  type VoteDto,
} from '../api/votes';
import { formatDateTime } from '../api/maintenance';

// 단지 전자투표 패널 — 선택 단지의 투표 목록 + 생성 폼 + 참여(집계 막대) + 마감(생성자).
// 실소유주/거주자만 접근하므로 백엔드 403은 상위 CommunityPanel에서 안내한다.
export function VotePanel({ complexName }: { complexName: string }) {
  const { session } = useAuth();
  const [votes, setVotes] = useState<VoteDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await listVotes(session.token, complexName);
      setVotes(data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session, complexName]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3 className="text-fg" style={{ fontSize: 17, fontWeight: 700 }}>
          단지 전자투표
        </h3>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="brand-button"
          style={{ fontSize: 13 }}
        >
          {showCreate ? '닫기' : '+ 투표 만들기'}
        </button>
      </div>

      {showCreate && (
        <div style={{ marginBottom: 16 }}>
          <CreateVoteForm
            complexName={complexName}
            onCreated={() => {
              setShowCreate(false);
              load().catch(() => undefined);
            }}
          />
        </div>
      )}

      {err && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{err}</p>
      )}

      {!votes && (
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          불러오는 중…
        </p>
      )}
      {votes && votes.length === 0 && (
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          아직 진행 중인 투표가 없습니다. 위 버튼으로 첫 투표를 만들어보세요.
        </p>
      )}
      {votes && votes.length > 0 && (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {votes.map((v) => (
            <li key={v.id}>
              <VoteCard
                vote={v}
                myId={session.user.id}
                onChanged={() => load().catch(() => undefined)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 투표 카드 — 집계 막대 + (미투표 시)옵션 선택 + (생성자)마감.
function VoteCard({
  vote,
  myId,
  onChanged,
}: {
  vote: VoteDto;
  myId: string;
  onChanged: () => void;
}) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const palette = VOTE_STATUS_COLORS[vote.status];
  const isCreator = vote.creatorId === myId;
  const hasVoted = vote.myOptionIndex != null;
  const isOpen = vote.status === 'OPEN';
  const maxCount = Math.max(1, ...vote.tally.map((t) => t.count));

  const handleCast = async (optionIndex: number) => {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      await castBallot(session.token, vote.id, optionIndex);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      await closeVote(session.token, vote.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="surface-card"
      style={{ padding: 20, borderRadius: 'var(--card-radius)' }}
    >
      <div className="flex items-start justify-between" style={{ gap: 12, marginBottom: 6 }}>
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
            {VOTE_STATUS_LABEL[vote.status]}
          </span>
          <h4 className="text-fg" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
            {vote.title}
          </h4>
          {vote.description && (
            <p className="text-fg-secondary" style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>
              {vote.description}
            </p>
          )}
        </div>
        {isCreator && isOpen && (
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="brand-button-weak"
            style={{ fontSize: 13, whiteSpace: 'nowrap' }}
          >
            마감하기
          </button>
        )}
      </div>

      {/* 집계 막대 — 각 옵션의 득표수를 막대로. 내가 고른 옵션은 강조. */}
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {vote.options.map((opt, i) => {
          const entry = vote.tally.find((t) => t.index === i);
          const count = entry?.count ?? 0;
          const pct =
            vote.totalBallots > 0
              ? Math.round((count / vote.totalBallots) * 100)
              : 0;
          const mine = vote.myOptionIndex === i;
          // 미투표 + 진행중이면 클릭으로 투표, 아니면 결과 표시 전용
          const clickable = isOpen && !hasVoted;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!clickable || busy}
                onClick={clickable ? () => handleCast(i) : undefined}
                style={{
                  position: 'relative',
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderRadius: 'var(--control-radius)',
                  overflow: 'hidden',
                  border: mine
                    ? '1.5px solid var(--brand)'
                    : '1px solid var(--border)',
                  background: 'var(--bg-muted)',
                  cursor: clickable ? 'pointer' : 'default',
                }}
              >
                {/* 득표 비율 배경 막대 */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${Math.round((count / maxCount) * 100)}%`,
                    background: mine ? 'var(--brand-soft)' : 'rgba(0,0,0,0.05)',
                    transition: 'width .2s ease',
                  }}
                />
                <span
                  style={{
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    className="text-fg"
                    style={{ fontSize: 14, fontWeight: mine ? 700 : 500 }}
                  >
                    {mine && '✓ '}
                    {opt}
                  </span>
                  <span className="text-fg-muted" style={{ fontSize: 12 }}>
                    {count}표 · {pct}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 12 }}>
        총 {vote.totalBallots}표
        {vote.closesAt && ` · 마감 ${formatDateTime(vote.closesAt)}`}
        {' · '}
        {clickHint(isOpen, hasVoted)}
      </p>

      {err && (
        <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>{err}</p>
      )}
    </div>
  );
}

function clickHint(isOpen: boolean, hasVoted: boolean): string {
  if (!isOpen) return '마감된 투표';
  if (hasVoted) return '투표 완료';
  return '옵션을 눌러 투표하세요 (1인 1표)';
}

// 투표 생성 폼 — 제목/설명/옵션(2개 이상)/마감일(선택).
function CreateVoteForm({
  complexName,
  onCreated,
}: {
  complexName: string;
  onCreated: () => void;
}) {
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [closesAt, setClosesAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!session) return null;

  const validOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
  const canSubmit = title.trim().length > 0 && validOptions.length >= 2;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      await createVote(session.token, complexName, {
        title: title.trim(),
        description: description.trim() || undefined,
        options: validOptions,
        // datetime-local → ISO (입력이 있으면)
        closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface-card" style={{ padding: 20, borderRadius: 'var(--card-radius)' }}>
      <label className="field-label" htmlFor="vote-title">투표 제목</label>
      <input
        id="vote-title"
        className="field-input mb-4"
        placeholder="예) 단지 외벽 도색 시기"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="field-label" htmlFor="vote-description">설명 (선택)</label>
      <textarea
        id="vote-description"
        className="field-input mb-4"
        placeholder="투표 배경을 적어주세요."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        style={{ resize: 'vertical' }}
      />

      <label className="field-label" htmlFor="vote-option-0">선택지 (2개 이상)</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input
              id={`vote-option-${i}`}
              aria-label={`선택지 ${i + 1}`}
              className="field-input"
              placeholder={`선택지 ${i + 1}`}
              value={opt}
              onChange={(e) =>
                setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))
              }
              style={{ flex: 1 }}
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-fg-muted hover:text-fg"
                style={{ fontSize: 13, padding: '0 8px' }}
              >
                삭제
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOptions((prev) => [...prev, ''])}
        className="brand-button-weak"
        style={{ fontSize: 13, marginBottom: 16 }}
      >
        + 선택지 추가
      </button>

      <label className="field-label" htmlFor="vote-closes-at">마감 일시 (선택)</label>
      <input
        id="vote-closes-at"
        type="datetime-local"
        className="field-input mb-4"
        value={closesAt}
        onChange={(e) => setClosesAt(e.target.value)}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        className="brand-button brand-button-large"
        style={{ width: '100%' }}
      >
        {submitting ? '생성 중…' : '투표 만들기'}
      </button>
      {err && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{err}</p>
      )}
    </div>
  );
}
