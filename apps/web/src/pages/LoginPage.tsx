import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLES, type Role } from '@butler/shared';
import { useAuth } from '../auth/AuthContext';
import { homeForRole } from '../routing/homeForRole';
import { exchangeDevMock } from '../api/auth';

// Toss 톤 — 흰 표면 + 큰 한글 헤드라인 + 단일 primary 블루 + 부드러운 다층 그림자

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState<Role>(ROLES.LANDLORD);
  const [name, setName] = useState('hong');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDevLogin() {
    setBusy(true);
    setErr(null);
    try {
      const session = await exchangeDevMock(role, name);
      login(session);
      nav(homeForRole(session.user.role), { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center">
        <span className="text-[15px] font-medium text-fg">버틀러</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px]">
          <h1
            className="text-fg"
            style={{
              fontSize: '36px',
              lineHeight: 1.25,
              fontWeight: 700,
              letterSpacing: 0,
              marginBottom: 12,
            }}
          >
            내 집을 원격으로,
            <br />
            데이터로 관리합니다.
          </h1>
          <p className="text-fg-secondary mb-10" style={{ fontSize: 15 }}>
            가입하면 공공데이터 대시보드 · 점검 리포트 · 구독 결제까지 한 번에.
          </p>

          <div className="surface-card p-7" style={{ borderRadius: 'var(--card-radius)' }}>
            <div className="space-y-3 mb-6">
              <button
                type="button"
                disabled
                className="w-full"
                style={{
                  background: '#FEE500',
                  color: '#191919',
                  borderRadius: 'var(--control-radius)',
                  padding: '14px 18px',
                  fontSize: 15,
                  fontWeight: 500,
                  opacity: 0.55,
                  cursor: 'not-allowed',
                }}
                title="카카오 OAuth 키 발급 후 활성화"
              >
                카카오로 시작하기
              </button>
              <button
                type="button"
                disabled
                className="w-full"
                style={{
                  background: '#03C75A',
                  color: '#FFFFFF',
                  borderRadius: 'var(--control-radius)',
                  padding: '14px 18px',
                  fontSize: 15,
                  fontWeight: 500,
                  opacity: 0.55,
                  cursor: 'not-allowed',
                }}
                title="네이버 OAuth 키 발급 후 활성화"
              >
                네이버로 시작하기
              </button>
            </div>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-fg-muted" style={{ fontSize: 12 }}>
                개발 환경 mock
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>

            <label className="field-label" htmlFor="login-role">역할</label>
            <select
              id="login-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="field-input mb-4"
            >
              <option value={ROLES.LANDLORD}>임대인 (LANDLORD)</option>
              <option value={ROLES.TENANT}>임차인 (TENANT)</option>
              <option value={ROLES.ADMIN}>관리자 (ADMIN)</option>
              <option value={ROLES.INSPECTOR}>점검자 (INSPECTOR)</option>
            </select>

            <label className="field-label" htmlFor="login-name">표시 이름</label>
            <input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field-input mb-6"
            />

            <button
              type="button"
              onClick={onDevLogin}
              disabled={busy}
              className="brand-button brand-button-large w-full"
            >
              {busy ? '로그인 중…' : 'mock 로그인'}
            </button>
            {err && (
              <p className="mt-3" style={{ color: 'var(--error)', fontSize: 13 }}>
                {err}
              </p>
            )}
          </div>

          <p className="text-fg-muted text-center mt-6" style={{ fontSize: 13 }}>
            공식 OAuth · PASS 본인인증은 키 발급 후 활성화됩니다.
          </p>
        </div>
      </main>
    </div>
  );
}
