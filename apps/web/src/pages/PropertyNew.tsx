import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { createProperty } from '../api/properties';

export function PropertyNew() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [address, setAddress] = useState('');
  const [dong, setDong] = useState('');
  const [ho, setHo] = useState('');
  const [complexName, setComplexName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!session) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const created = await createProperty(session!.token, {
        address,
        complexName: complexName || undefined,
        dong: dong || undefined,
        ho: ho || undefined,
      });
      nav(`/landlord/properties/${created.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>임대인</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span>내 물건</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">새 물건 등록</span>
      </div>
      <div style={{ maxWidth: 680 }}>
        <h1
          className="text-fg mt-2 mb-2"
          style={{ fontSize: 32, lineHeight: 1.25, fontWeight: 700 }}
        >
          내 집 등록
        </h1>
        <p className="text-fg-secondary mb-10" style={{ fontSize: 15 }}>
          주소만 입력하면 국토부·건축물대장·K-APT 데이터가 자동으로 연동됩니다 — 목표는 30초 이내.
        </p>

        <form
          onSubmit={onSubmit}
          className="surface-card"
          style={{ padding: 28, borderRadius: 'var(--card-radius)' }}
        >
          <label className="field-label" htmlFor="property-address">도로명 주소</label>
          <input
            id="property-address"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="field-input"
            placeholder="예: 서울시 강서구 화곡로 12"
            style={{ marginBottom: 18 }}
          />

          <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 18 }}>
            <div>
              <label className="field-label" htmlFor="property-dong">동 (선택)</label>
              <input id="property-dong" value={dong} onChange={(e) => setDong(e.target.value)} className="field-input" />
            </div>
            <div>
              <label className="field-label" htmlFor="property-ho">호 (선택)</label>
              <input id="property-ho" value={ho} onChange={(e) => setHo(e.target.value)} className="field-input" />
            </div>
          </div>

          <label className="field-label" htmlFor="property-complex">단지명 (선택)</label>
          <input
            id="property-complex"
            value={complexName}
            onChange={(e) => setComplexName(e.target.value)}
            className="field-input"
            placeholder="예: 항공아파트"
            style={{ marginBottom: 22 }}
          />

          {err && (
            <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{err}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="brand-button brand-button-large w-full"
          >
            {busy ? '등록 중…' : '등록하고 대시보드 보기'}
          </button>
        </form>

        <p className="text-fg-muted text-center mt-6" style={{ fontSize: 13 }}>
          등록한 정보는 본인만 볼 수 있으며, 수정·삭제는 언제든 가능합니다.
        </p>
      </div>
    </>
  );
}
