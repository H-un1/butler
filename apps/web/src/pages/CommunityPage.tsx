import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { homeForRole } from '../routing/homeForRole';
import { CommunityPanel } from '../components/CommunityPanel';
import { VendorDirectory } from '../components/VendorDirectory';
import { NotificationCenter } from '../components/NotificationCenter';

// 단지 커뮤니티 + 전자투표 + 보수업체 매칭 통합 화면 (Phase 3 M4).
// 임대인·임차인·관리자 공용 진입(/community). 커뮤니티/투표는 실소유주·거주자만,
// 보수업체는 인증된 누구나 조회(등록은 관리자, 리뷰는 임대인·임차인).
//
// 임대인/임차인 홈과 동일한 Toss 톤(상단 ThemeBoundary tone="toss")으로 감싼다.
// 임대인·임차인·관리자 공용 진입(/community).
// - embedded: 사이드바 레이아웃 안에서 콘텐츠만 렌더(외곽 래퍼·자체 Nav 생략).
// - standalone(기본): 상단 Nav + 전체화면(기존 그대로). 임차인·관리자가 사용.
//   (임대인은 /landlord/community 의 LandlordCommunity 사용)
export function CommunityPage({ embedded }: { embedded?: boolean }) {
  const { session, logout } = useAuth();
  const [section, setSection] = useState<'community' | 'vendors'>('community');

  if (!session) return null;

  const roleLabel =
    session.user.role === 'LANDLORD'
      ? '임대인'
      : session.user.role === 'TENANT'
        ? '임차인'
        : '관리자';

  // 화면 본문 — embedded/standalone 공통.
  const body = (
    <>
      <section style={{ marginBottom: 28 }}>
        <h1 className="text-fg" style={{ fontSize: 30, lineHeight: 1.25, fontWeight: 700 }}>
          우리 단지, 함께 결정해요.
        </h1>
        <p className="text-fg-secondary" style={{ fontSize: 14, marginTop: 8 }}>
          단지 이웃과 소식을 나누고, 전자투표로 의견을 모으고, 검증된 보수업체를 찾아보세요.
        </p>
      </section>

      {/* 섹션 전환 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        <SectionTab
          label="단지 커뮤니티"
          active={section === 'community'}
          onClick={() => setSection('community')}
        />
        <SectionTab
          label="보수업체 찾기"
          active={section === 'vendors'}
          onClick={() => setSection('vendors')}
        />
      </div>

      {section === 'community' ? (
        <CommunityPanel />
      ) : (
        <section>
          <p className="text-fg-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            카테고리·지역으로 보수업체를 검색하고 평점·리뷰를 확인하세요.
            수선요청(M1) 카테고리에 맞는 업체를 골라 직접 연락할 수 있습니다.
          </p>
          <VendorDirectory />
        </section>
      )}
    </>
  );

  if (embedded) {
    return (
      <>
        <div className="admin-breadcrumb mono">
          <span>{roleLabel}</span>
          <span className="admin-breadcrumb__sep">/</span>
          <span className="admin-breadcrumb__current">커뮤니티</span>
        </div>
        {body}
      </>
    );
  }

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
            단지 커뮤니티 · {roleLabel}
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
