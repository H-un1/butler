import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { DashboardLayout, type NavSection } from '../../components/DashboardLayout';
import { listProperties } from '../../api/properties';
import { listMyLeases } from '../../api/leases';
import { listMySettlements } from '../../api/settlements';

// 임대인 대시보드 공용 레이아웃.
// 모든 임대인 화면(/landlord/*)을 감싸 사이드바를 상시 유지하고,
// 콘텐츠 영역(<Outlet/>)만 라우팅으로 교체한다.

// 현재 경로에서 "뒤로" 대상(상위)과 라벨을 파생한다.
// - 1뎁스(대시보드/내 물건/임대차/… = 사이드바 항목)는 사이드바로 이동 가능하므로 뒤로 없음
// - 2뎁스 이상(물건 등록/상세, 정산 산출/상세)만 해당 섹션으로 뒤로가기
function parentOfPath(pathname: string): { to: string; label: string } | null {
  const segs = pathname.split('/').filter(Boolean); // ['landlord', ...]
  if (segs.length < 3) return null; // /landlord, /landlord/{섹션} → 뒤로 없음
  const section = segs[1];
  const SECTION_LABEL: Record<string, string> = {
    properties: '내 물건',
    leases: '임대차',
    maintenance: '수선요청',
    settlements: '정산',
    billing: '구독·결제',
    community: '커뮤니티',
  };
  const label = SECTION_LABEL[section];
  if (!label) return null;
  return { to: `/landlord/${section}`, label };
}

function BackControl({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const parent = parentOfPath(pathname);
  if (!parent) return null;
  return (
    <button type="button" className="dash-back" onClick={() => navigate(parent.to)}>
      <span className="dash-back__icon">
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </span>
      <span>{parent.label}</span>
    </button>
  );
}

// 현재 경로(pathname)에서 사이드바 활성 키를 파생한다.
function activeKeyFromPath(pathname: string): string {
  // /landlord 정확히 일치 → 대시보드
  if (pathname === '/landlord' || pathname === '/landlord/') return 'dashboard';
  if (pathname.startsWith('/landlord/properties')) return 'properties';
  if (pathname.startsWith('/landlord/leases')) return 'leases';
  if (pathname.startsWith('/landlord/maintenance')) return 'maintenance';
  if (pathname.startsWith('/landlord/settlements')) return 'settlements';
  if (pathname.startsWith('/landlord/billing')) return 'billing';
  if (pathname.startsWith('/landlord/community')) return 'community';
  return 'dashboard';
}

export function LandlordLayout() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 사이드바 badge용 가벼운 카운트 — 실패해도 무시(레이아웃은 막지 않는다).
  const [propertyCount, setPropertyCount] = useState<number | undefined>(undefined);
  const [activeLeaseCount, setActiveLeaseCount] = useState<number | undefined>(undefined);
  const [openSettlementCount, setOpenSettlementCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!session) return;
    listProperties(session.token)
      .then((items) => setPropertyCount(items.length))
      .catch(() => undefined);
    listMyLeases(session.token)
      .then((leases) => setActiveLeaseCount(leases.filter((l) => l.status === 'ACTIVE').length))
      .catch(() => undefined);
    listMySettlements(session.token)
      .then((settlements) =>
        setOpenSettlementCount(
          settlements.filter((s) => s.status !== 'AGREED' && s.status !== 'REJECTED').length
        )
      )
      .catch(() => undefined);
  }, [session]);

  if (!session) return null;

  const activeKey = activeKeyFromPath(location.pathname);

  // 사이드바 항목 선택 → 중첩 경로로 이동
  const onSelect = (key: string) => {
    navigate('/landlord' + (key === 'dashboard' ? '' : '/' + key));
  };

  const sections: NavSection[] = [
    {
      items: [
        { key: 'dashboard', label: '대시보드', icon: <IconGrid /> },
        {
          key: 'properties',
          label: '내 물건',
          icon: <IconHome />,
          badge: propertyCount || undefined,
        },
        {
          key: 'leases',
          label: '임대차',
          icon: <IconFile />,
          badge: activeLeaseCount || undefined,
        },
        { key: 'maintenance', label: '수선요청', icon: <IconWrench /> },
        {
          key: 'settlements',
          label: '정산',
          icon: <IconCoin />,
          badge: openSettlementCount || undefined,
        },
        { key: 'billing', label: '구독·결제', icon: <IconCard /> },
        { key: 'community', label: '커뮤니티', icon: <IconChat /> },
      ],
    },
  ];

  return (
    <DashboardLayout
      brandName="버틀러"
      brandSub="임대인"
      sections={sections}
      activeKey={activeKey}
      onSelect={onSelect}
      userName={session.user.name}
      onLogout={logout}
      footerLinks={[
        { to: '/landlord/assistant', label: 'AI 보조 (mock)', icon: <IconSparkle /> },
      ]}
      topLeft={<BackControl pathname={location.pathname} />}
    >
      <Outlet />
    </DashboardLayout>
  );
}

/* ─────────────────── Icons (inline SVG, currentColor) ─────────────────── */
// 기존 LandlordHome.tsx의 인라인 SVG 재사용

function svgProps(size = 16) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

function IconGrid() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconHome() {
  return (
    <svg {...svgProps()}>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v9h14v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}
function IconFile() {
  return (
    <svg {...svgProps()}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}
function IconWrench() {
  return (
    <svg {...svgProps()}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2l-5.6 5.6a1.5 1.5 0 0 0 2.1 2.1l5.6-5.6a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.1-.4-.4-2.1z" />
    </svg>
  );
}
function IconCoin() {
  return (
    <svg {...svgProps()}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}
function IconCard() {
  return (
    <svg {...svgProps()}>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg {...svgProps()}>
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-4.5A8 8 0 0 1 5 5a8 8 0 0 1 16 7z" />
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg {...svgProps()}>
      <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M18 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}
