import { useCallback, useEffect, useState } from 'react';
import { MAINTENANCE_CATEGORIES, type VendorCategory } from '@butler/shared';
import { useAuth } from '../auth/AuthContext';
import { CATEGORY_LABEL, formatDateTime } from '../api/maintenance';
import {
  listVendors,
  getVendor,
  createVendor,
  addReview,
  formatRating,
  type VendorDto,
  type VendorDetail,
} from '../api/vendors';
import { shortCode } from '../lib/displayId';

// 보수업체 매칭 디렉토리 — 카테고리/지역 필터, 평점, 상세(리뷰 목록), 리뷰 작성.
// 등록 폼은 관리자(ADMIN)에게만 노출(서버가 최종 권한 검증).
// 리뷰는 임대인(LANDLORD)·임차인(TENANT)만 작성 가능.
//
// initialCategory: 수선요청(M1)에서 카테고리에 맞는 업체 추천 진입 시 초기 필터.
export function VendorDirectory({
  initialCategory,
}: {
  initialCategory?: VendorCategory;
}) {
  const { session } = useAuth();
  const [vendors, setVendors] = useState<VendorDto[] | null>(null);
  const [category, setCategory] = useState<VendorCategory | ''>(initialCategory ?? '');
  const [region, setRegion] = useState('');
  const [appliedRegion, setAppliedRegion] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await listVendors(session.token, {
        category: category || undefined,
        region: appliedRegion || undefined,
      });
      setVendors(data);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session, category, appliedRegion]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;

  const isAdmin = session.user.role === 'ADMIN';

  return (
    <div>
      {/* 필터 + (관리자)등록 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'flex-end',
          marginBottom: 16,
        }}
      >
        <div>
          <label className="field-label" htmlFor="vendor-filter-category">카테고리</label>
          <select
            id="vendor-filter-category"
            className="field-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as VendorCategory | '')}
            style={{ minWidth: 140 }}
          >
            <option value="">전체</option>
            {MAINTENANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="field-label" htmlFor="vendor-filter-region">지역</label>
          <input
            id="vendor-filter-region"
            className="field-input"
            placeholder="예) 서울 강남구"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setAppliedRegion(region.trim());
            }}
            style={{ width: '100%' }}
          />
        </div>
        <button
          type="button"
          onClick={() => setAppliedRegion(region.trim())}
          className="brand-button"
          style={{ fontSize: 13 }}
        >
          검색
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowRegister((v) => !v)}
            className="brand-button-weak"
            style={{ fontSize: 13 }}
          >
            {showRegister ? '닫기' : '+ 업체 등록'}
          </button>
        )}
      </div>

      {isAdmin && showRegister && (
        <div style={{ marginBottom: 16 }}>
          <RegisterVendorForm
            onCreated={() => {
              setShowRegister(false);
              load().catch(() => undefined);
            }}
          />
        </div>
      )}

      {err && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{err}</p>
      )}

      {!vendors && (
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          불러오는 중…
        </p>
      )}
      {vendors && vendors.length === 0 && (
        <p className="text-fg-muted" style={{ fontSize: 14 }}>
          조건에 맞는 보수업체가 없습니다.
        </p>
      )}
      {vendors && vendors.length > 0 && (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {vendors.map((v) => {
            const open = selectedId === v.id;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId((prev) => (prev === v.id ? null : v.id))}
                  className="surface-card surface-card-hover"
                  style={{
                    padding: 16,
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
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'var(--brand-soft)',
                        color: 'var(--brand-hover)',
                      }}
                    >
                      {CATEGORY_LABEL[v.category]}
                    </span>
                    <span className="text-fg-muted" style={{ fontSize: 12 }}>
                      {v.region}
                    </span>
                  </div>
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <p className="text-fg" style={{ fontSize: 15, fontWeight: 600 }}>
                      {v.name}
                    </p>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: v.reviewCount > 0 ? '#B7791F' : 'var(--fg-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatRating(v.avgRating, v.reviewCount)}
                    </span>
                  </div>
                </button>
                {open && (
                  <div style={{ marginTop: 12 }}>
                    <VendorDetailView
                      vendorId={v.id}
                      onReviewed={() => load().catch(() => undefined)}
                    />
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

// 업체 상세 — 연락처/설명 + 리뷰 목록 + (임대인·임차인)리뷰 작성.
function VendorDetailView({
  vendorId,
  onReviewed,
}: {
  vendorId: string;
  onReviewed: () => void;
}) {
  const { session } = useAuth();
  const [detail, setDetail] = useState<VendorDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const d = await getVendor(session.token, vendorId);
      setDetail(d);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session, vendorId]);

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

  const canReview =
    session.user.role === 'LANDLORD' || session.user.role === 'TENANT';

  return (
    <div className="surface-card" style={{ padding: 20, borderRadius: 'var(--card-radius)' }}>
      <div className="flex items-center justify-between" style={{ gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#B7791F' }}>
          {formatRating(detail.avgRating, detail.reviewCount)}
        </span>
        {detail.phone && (
          <a
            href={`tel:${detail.phone}`}
            className="brand-button"
            style={{ fontSize: 13, textDecoration: 'none' }}
          >
            {detail.phone}
          </a>
        )}
      </div>
      {detail.description && (
        <p
          className="text-fg-secondary"
          style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginBottom: 12 }}
        >
          {detail.description}
        </p>
      )}

      {/* 리뷰 작성 */}
      {canReview && (
        <ReviewForm
          vendorId={vendorId}
          onReviewed={() => {
            load().catch(() => undefined);
            onReviewed();
          }}
        />
      )}

      {/* 리뷰 목록 */}
      <div style={{ marginTop: 16 }}>
        <span className="field-label">리뷰 {detail.reviews.length}</span>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {detail.reviews.length === 0 && (
            <li className="text-fg-muted" style={{ fontSize: 13 }}>
              아직 리뷰가 없습니다.
            </li>
          )}
          {detail.reviews.map((rv) => (
            <li
              key={rv.id}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--control-radius)',
                background: 'var(--bg-muted)',
              }}
            >
              <p style={{ fontSize: 13, color: '#B7791F', fontWeight: 600 }}>
                {'★'.repeat(rv.rating)}
                <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - rv.rating)}</span>
              </p>
              {rv.comment && (
                <p className="text-fg" style={{ fontSize: 14, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                  {rv.comment}
                </p>
              )}
              <p className="text-fg-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {rv.authorId === session.user.id
                  ? '나'
                  : rv.authorName ?? shortCode(rv.authorId)}{' '}
                · {formatDateTime(rv.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {err && (
        <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>{err}</p>
      )}
    </div>
  );
}

// 리뷰 작성 폼 — 별점(1~5) + 코멘트(선택). 중복(1인 1리뷰)은 409.
function ReviewForm({
  vendorId,
  onReviewed,
}: {
  vendorId: string;
  onReviewed: () => void;
}) {
  const { session } = useAuth();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!session) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await addReview(session.token, vendorId, {
        rating,
        comment: comment.trim() || undefined,
      });
      setComment('');
      onReviewed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 'var(--control-radius)',
        background: 'var(--bg-muted)',
      }}
    >
      <span className="field-label">리뷰 작성</span>
      {/* 별점 선택 */}
      <div style={{ display: 'flex', gap: 4, margin: '6px 0 10px' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n}점`}
            style={{
              fontSize: 22,
              lineHeight: 1,
              color: n <= rating ? '#F0BF00' : 'var(--border)',
              padding: 0,
            }}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        aria-label="리뷰 내용"
        className="field-input"
        placeholder="이용 경험을 남겨주세요. (선택)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="brand-button"
          style={{ fontSize: 13 }}
        >
          {submitting ? '등록 중…' : '리뷰 등록'}
        </button>
      </div>
      {err && (
        <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>{err}</p>
      )}
    </div>
  );
}

// 업체 등록 폼 — 관리자 전용.
function RegisterVendorForm({ onCreated }: { onCreated: () => void }) {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<VendorCategory>('PLUMBING');
  const [region, setRegion] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!session) return null;

  const canSubmit = name.trim().length > 0 && region.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      await createVendor(session.token, {
        name: name.trim(),
        category,
        region: region.trim(),
        phone: phone.trim() || undefined,
        description: description.trim() || undefined,
      });
      setName('');
      setRegion('');
      setPhone('');
      setDescription('');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface-card" style={{ padding: 20, borderRadius: 'var(--card-radius)' }}>
      <label className="field-label" htmlFor="vendor-register-name">업체명</label>
      <input
        id="vendor-register-name"
        className="field-input mb-4"
        placeholder="예) 한빛설비"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label className="field-label" htmlFor="vendor-register-category">카테고리</label>
      <select
        id="vendor-register-category"
        className="field-input mb-4"
        value={category}
        onChange={(e) => setCategory(e.target.value as VendorCategory)}
      >
        {MAINTENANCE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>

      <label className="field-label" htmlFor="vendor-register-region">지역</label>
      <input
        id="vendor-register-region"
        className="field-input mb-4"
        placeholder="예) 서울 강남구"
        value={region}
        onChange={(e) => setRegion(e.target.value)}
      />

      <label className="field-label" htmlFor="vendor-register-phone">전화번호 (선택)</label>
      <input
        id="vendor-register-phone"
        className="field-input mb-4"
        placeholder="예) 02-1234-5678"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      <label className="field-label" htmlFor="vendor-register-description">소개 (선택)</label>
      <textarea
        id="vendor-register-description"
        className="field-input mb-4"
        placeholder="업체 소개를 적어주세요."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        style={{ resize: 'vertical' }}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        className="brand-button brand-button-large"
        style={{ width: '100%' }}
      >
        {submitting ? '등록 중…' : '업체 등록'}
      </button>
      {err && (
        <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{err}</p>
      )}
    </div>
  );
}
