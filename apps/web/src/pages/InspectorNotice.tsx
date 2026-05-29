import { Link } from 'react-router-dom';

export function InspectorNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div
        className="surface-card max-w-[440px] text-center"
        style={{ padding: '40px 28px', borderRadius: 'var(--card-radius)' }}
      >
        <p
          style={{
            display: 'inline-block',
            background: 'var(--brand-soft)',
            color: 'var(--brand-hover)',
            padding: '4px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            marginBottom: 18,
          }}
        >
          점검자 채널
        </p>
        <h1 className="text-fg mb-3" style={{ fontSize: 24, fontWeight: 700 }}>
          점검자 전용 모바일 앱
        </h1>
        <p className="text-fg-secondary mb-6" style={{ fontSize: 14, lineHeight: 1.6 }}>
          점검자(INSPECTOR) 계정은 현장 친화 UI가 적용된 모바일 앱에서 사용합니다.
          웹에서는 점검 기능이 제공되지 않습니다.
        </p>
        <Link to="/login" className="brand-button">
          로그인 화면으로
        </Link>
      </div>
    </div>
  );
}
