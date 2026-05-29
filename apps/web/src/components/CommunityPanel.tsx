import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  myComplexes,
  listPosts,
  getPost,
  createPost,
  addComment,
  shortAuthor,
  type PostListItem,
  type PostDetail,
} from '../api/community';
import { formatDateTime } from '../api/maintenance';
import { VotePanel } from './VotePanel';

// 단지 커뮤니티 패널 — 내 단지 선택 → 게시판(목록/작성/상세·댓글) + 전자투표.
// 실소유주/거주자만 접근(해당 단지 소유 임대인·ACTIVE 임차인·관리자).
// 내 단지가 없으면(=물건에 complexName 없음) 안내 문구를 보여준다.
//
// tone: 'toss'는 임대인/임차인 홈(밝은 카드), 'linear'는 관리자 콘솔에서 사용.
export function CommunityPanel() {
  const { session } = useAuth();
  const [complexes, setComplexes] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'board' | 'vote'>('board');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    myComplexes(session.token)
      .then((list) => {
        setComplexes(list);
        // 단지가 하나뿐이면 자동 선택
        if (list.length > 0) setSelected((prev) => prev ?? list[0]);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session]);

  if (!session) return null;

  if (err) {
    return <p style={{ color: 'var(--error)', fontSize: 14 }}>{err}</p>;
  }
  if (!complexes) {
    return (
      <p className="text-fg-muted" style={{ fontSize: 14 }}>
        내 단지를 불러오는 중…
      </p>
    );
  }
  if (complexes.length === 0) {
    return (
      <div
        className="surface-card"
        style={{ padding: 24, borderRadius: 'var(--card-radius)' }}
      >
        <p className="text-fg" style={{ fontSize: 15, fontWeight: 600 }}>
          참여할 수 있는 단지가 없습니다
        </p>
        <p className="text-fg-muted" style={{ fontSize: 13, marginTop: 6 }}>
          단지 커뮤니티는 해당 단지에 물건을 소유한 임대인, 계약 중(ACTIVE)인
          임차인, 관리자만 이용할 수 있습니다. 물건에 단지명(complexName)이
          등록되어 있어야 합니다.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* 단지 선택 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {complexes.map((c) => {
          const active = c === selected;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setSelected(c)}
              className="surface-card surface-card-hover"
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                boxShadow: active ? 'inset 0 0 0 2px var(--brand)' : undefined,
                color: active ? 'var(--brand-hover)' : 'var(--fg-secondary)',
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      {selected && (
        <>
          {/* 게시판 / 투표 탭 */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            <TabButton label="게시판" active={tab === 'board'} onClick={() => setTab('board')} />
            <TabButton label="전자투표" active={tab === 'vote'} onClick={() => setTab('vote')} />
          </div>

          {tab === 'board' ? (
            <CommunityBoard complexName={selected} />
          ) : (
            <VotePanel complexName={selected} />
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
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
        padding: '8px 16px',
        borderRadius: 'var(--control-radius)',
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        background: active ? 'var(--brand-soft)' : 'transparent',
        color: active ? 'var(--brand-hover)' : 'var(--fg-muted)',
      }}
    >
      {label}
    </button>
  );
}

// 게시판 — 글 목록 + 작성 폼 + 선택 글 상세(댓글).
function CommunityBoard({ complexName }: { complexName: string }) {
  const { session } = useAuth();
  const [posts, setPosts] = useState<PostListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await listPosts(session.token, complexName);
      setPosts(data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session, complexName]);

  useEffect(() => {
    // 단지 전환 시 선택 글/작성폼 초기화
    setSelectedId(null);
    setShowCreate(false);
    load();
  }, [load]);

  if (!session) return null;

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3 className="text-fg" style={{ fontSize: 17, fontWeight: 700 }}>
          {complexName} 게시판
        </h3>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="brand-button"
          style={{ fontSize: 13 }}
        >
          {showCreate ? '닫기' : '+ 글쓰기'}
        </button>
      </div>

      {showCreate && (
        <div style={{ marginBottom: 16 }}>
          <CreatePostForm
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

      {!posts && (
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          불러오는 중…
        </p>
      )}
      {posts && posts.length === 0 && (
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          아직 게시글이 없습니다. 첫 글을 남겨보세요.
        </p>
      )}
      {posts && posts.length > 0 && (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {posts.map((p) => {
            const open = selectedId === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId((prev) => (prev === p.id ? null : p.id))}
                  className="surface-card surface-card-hover"
                  style={{
                    padding: 16,
                    borderRadius: 'var(--card-radius)',
                    width: '100%',
                    textAlign: 'left',
                    boxShadow: open ? 'inset 0 0 0 2px var(--brand)' : undefined,
                  }}
                >
                  <p className="text-fg" style={{ fontSize: 15, fontWeight: 600 }}>
                    {p.title}
                  </p>
                  <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {shortAuthor(p.authorId, session.user.id)} · {formatDateTime(p.createdAt)}
                  </p>
                </button>
                {open && (
                  <div style={{ marginTop: 12 }}>
                    <PostDetailView postId={p.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// 게시글 상세 — 본문 + 댓글 타임라인 + 댓글 작성.
function PostDetailView({ postId }: { postId: string }) {
  const { session } = useAuth();
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const d = await getPost(session.token, postId);
      setDetail(d);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session, postId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;

  if (err && !detail) {
    return <p style={{ color: 'var(--error)', fontSize: 13 }}>{err}</p>;
  }
  if (!detail) {
    return (
      <p className="text-fg-muted" style={{ fontSize: 13 }}>
        불러오는 중…
      </p>
    );
  }

  const handleComment = async () => {
    const c = comment.trim();
    if (!c) return;
    setBusy(true);
    setErr(null);
    try {
      await addComment(session.token, postId, c);
      setComment('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="surface-card" style={{ padding: 20, borderRadius: 'var(--card-radius)' }}>
      <p
        className="text-fg"
        style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
      >
        {detail.body}
      </p>
      <p className="text-fg-muted" style={{ fontSize: 12, marginTop: 8 }}>
        {shortAuthor(detail.authorId, session.user.id)} · {formatDateTime(detail.createdAt)}
      </p>

      {/* 댓글 */}
      <div style={{ marginTop: 20 }}>
        <span className="field-label">댓글 {detail.comments.length}</span>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {detail.comments.length === 0 && (
            <li className="text-fg-muted" style={{ fontSize: 13 }}>
              아직 댓글이 없습니다.
            </li>
          )}
          {detail.comments.map((c) => (
            <li
              key={c.id}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--control-radius)',
                background: 'var(--bg-muted)',
              }}
            >
              <p className="text-fg" style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                {c.body}
              </p>
              <p className="text-fg-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {shortAuthor(c.authorId, session.user.id)} · {formatDateTime(c.createdAt)}
              </p>
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 12 }}>
          <textarea
            aria-label="댓글 입력"
            className="field-input"
            placeholder="댓글을 입력하세요."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={handleComment}
              disabled={busy || !comment.trim()}
              className="brand-button"
              style={{ fontSize: 13 }}
            >
              {busy ? '작성 중…' : '댓글 작성'}
            </button>
          </div>
        </div>
      </div>

      {err && (
        <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>{err}</p>
      )}
    </div>
  );
}

// 게시글 작성 폼 — 제목 + 본문.
function CreatePostForm({
  complexName,
  onCreated,
}: {
  complexName: string;
  onCreated: () => void;
}) {
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!session) return null;

  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      await createPost(session.token, complexName, {
        title: title.trim(),
        body: body.trim(),
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
      <label className="field-label" htmlFor="community-post-title">제목</label>
      <input
        id="community-post-title"
        className="field-input mb-4"
        placeholder="예) 분리수거 요일 안내"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="field-label" htmlFor="community-post-body">내용</label>
      <textarea
        id="community-post-body"
        className="field-input mb-4"
        placeholder="단지 이웃에게 전할 내용을 적어주세요."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        style={{ resize: 'vertical' }}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        className="brand-button brand-button-large"
        style={{ width: '100%' }}
      >
        {submitting ? '게시 중…' : '게시하기'}
      </button>
      {err && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{err}</p>
      )}
    </div>
  );
}
