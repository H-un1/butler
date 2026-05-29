import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { listAdminSubscriptions, type AdminSubscriptionItem } from '../api/admin';
import { shortCode } from '../lib/displayId';
import { MaintenanceBoard } from '../components/MaintenanceBoard';
import { NotificationCenter } from '../components/NotificationCenter';
import { CrmOverviewPanel } from '../components/CrmOverviewPanel';
import { CommunityPanel } from '../components/CommunityPanel';
import { VendorDirectory } from '../components/VendorDirectory';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../theme/ThemeProvider';

const TIER_LABEL: Record<string, string> = {
  TIER_1: '소규모',
  TIER_2: '중규모',
  TIER_3: '대규모',
};

type NavKey =
  | 'dashboard'
  | 'users'
  | 'properties'
  | 'inspections'
  | 'subscriptions'
  | 'maintenance'
  | 'community'
  | 'vendors'
  | 'reports-overview'
  | 'reports-revenue'
  | 'maintenance-logs'
  | 'maintenance-settings';

type TabKey = 'all' | 'active' | 'past_due' | 'canceled' | 'settings';

export function AdminHome() {
  const { session, logout } = useAuth();
  const { theme } = useTheme();
  const [subs, setSubs] = useState<AdminSubscriptionItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('active');
  const [query, setQuery] = useState('');
  // 사이드바에서 전환하는 콘솔 화면 — 기본은 임대차 CRM, 구독/수선요청 보드 등 추가
  const [view, setView] = useState<
    'subscriptions' | 'maintenance' | 'crm' | 'community' | 'vendors'
  >('crm');

  useEffect(() => {
    if (!session) return;
    listAdminSubscriptions(session.token)
      .then(setSubs)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [session]);

  if (!session) return null;

  const all = subs ?? [];
  const active = all.filter((s) => s.status === 'ACTIVE');
  const pastDue = all.filter((s) => s.status === 'PAST_DUE');
  const canceled = all.filter((s) => s.status === 'CANCELED');
  const totalMrr = active.reduce((sum, s) => sum + s.monthlyFee, 0);

  const filteredByTab =
    tab === 'all'
      ? all
      : tab === 'active'
        ? active
        : tab === 'past_due'
          ? pastDue
          : tab === 'canceled'
            ? canceled
            : all;

  const q = query.trim().toLowerCase();
  const visible = q
    ? filteredByTab.filter(
        (s) =>
          s.landlordId.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (TIER_LABEL[s.tier] ?? s.tier).toLowerCase().includes(q),
      )
    : filteredByTab;

  return (
    <div className="admin-shell">
      <AdminSidebar
        active={
          view === 'maintenance'
            ? 'maintenance'
            : view === 'crm'
              ? 'dashboard'
              : view === 'community'
                ? 'community'
                : view === 'vendors'
                  ? 'vendors'
                  : 'subscriptions'
        }
        counts={{
          subscriptions: all.length || undefined,
          inspections: undefined,
        }}
        userName={session.user.name}
        onLogout={logout}
        onSelectSubscriptions={() => setView('subscriptions')}
        onSelectMaintenance={() => setView('maintenance')}
        onSelectCrm={() => setView('crm')}
        onSelectCommunity={() => setView('community')}
        onSelectVendors={() => setView('vendors')}
      />

      <main className="admin-main">
        <div className="admin-main__inner">
          {/* 콘솔 우상단 알림센터 — 관리자 전역 알림 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: 8,
            }}
          >
            <NotificationCenter tone={theme === 'dark' ? 'linear' : 'toss'} />
          </div>
          {view === 'crm' ? (
            <CrmView />
          ) : view === 'maintenance' ? (
            <MaintenanceView />
          ) : view === 'community' ? (
            <CommunityView />
          ) : view === 'vendors' ? (
            <VendorsView />
          ) : (
            <>
          {/* breadcrumb */}
          <div className="admin-breadcrumb mono">
            <span>관리자</span>
            <span className="admin-breadcrumb__sep">/</span>
            <span className="admin-breadcrumb__current">구독</span>
          </div>

          {/* heading row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 24,
              marginTop: 6,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1 className="admin-h1">구독 관리</h1>
              <p className="admin-sub">
                구독, 요금 구간, PG 결제 상태를 확인하고 관리하세요.
              </p>
            </div>
            <div className="admin-page-actions">
              <button type="button" className="admin-btn">
                <IconDownload />
                내보내기
              </button>
              <button type="button" className="admin-btn admin-btn--primary">
                <IconSend />
                청구서 보내기
              </button>
            </div>
          </div>

          {/* metrics */}
          <div className="admin-metrics">
            <MetricCard
              label="활성"
              value={active.length.toString()}
              delta={
                all.length > 0
                  ? `전체 대비 ${Math.round((active.length / all.length) * 100)}%`
                  : '—'
              }
            />
            <MetricCard
              label="월 반복매출 (원)"
              value={`₩ ${totalMrr.toLocaleString()}`}
              delta="활성 구간 요금 기준"
            />
            <MetricCard
              label="전체"
              value={all.length.toString()}
              delta={`연체 ${pastDue.length}건 · 해지 ${canceled.length}건`}
            />
          </div>

          {/* tabs */}
          <nav className="admin-tabs" role="tablist">
            <TabButton
              active={tab === 'all'}
              onClick={() => setTab('all')}
              label="전체"
              count={all.length}
            />
            <TabButton
              active={tab === 'active'}
              onClick={() => setTab('active')}
              label="활성"
              count={active.length}
            />
            <TabButton
              active={tab === 'past_due'}
              onClick={() => setTab('past_due')}
              label="연체"
              count={pastDue.length}
            />
            <TabButton
              active={tab === 'canceled'}
              onClick={() => setTab('canceled')}
              label="해지"
              count={canceled.length}
            />
            <TabButton
              active={tab === 'settings'}
              onClick={() => setTab('settings')}
              label="설정"
            />
          </nav>

          {/* table card */}
          <section className="admin-table">
            <div className="admin-table__toolbar">
              <label className="admin-table__filter">
                <IconSearch />
                <input
                  type="text"
                  placeholder="임대인·ID·구간으로 검색…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <span className="admin-table__count mono">
                {visible.length} / {all.length} 건
              </span>
            </div>

            {err && (
              <div style={{ padding: 16 }}>
                <p style={{ color: 'var(--error)', fontSize: 13 }}>{err}</p>
              </div>
            )}

            {!subs && !err && (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <p className="text-fg-muted" style={{ fontSize: 13 }}>
                  불러오는 중…
                </p>
              </div>
            )}

            {subs && visible.length === 0 && !err && (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <p className="text-fg" style={{ fontSize: 14, fontWeight: 510 }}>
                  조건에 맞는 구독이 없습니다
                </p>
                <p
                  className="text-fg-muted"
                  style={{ fontSize: 13, marginTop: 4 }}
                >
                  다른 탭을 보거나 필터를 지워보세요.
                </p>
              </div>
            )}

            {subs && visible.length > 0 && (
              <div>
                <div
                  className="linear-row"
                  style={{
                    background: 'var(--bg-sub)',
                    fontWeight: 510,
                    color: 'var(--fg-muted)',
                    fontSize: 11.5,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    height: 34,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ flex: '0 0 90px' }}>ID</span>
                  <span style={{ flex: '0 0 200px' }}>임대인</span>
                  <span style={{ flex: '0 0 110px' }}>구간</span>
                  <span style={{ flex: '0 0 70px', textAlign: 'right' }}>
                    물건수
                  </span>
                  <span style={{ flex: '0 0 130px', textAlign: 'right' }}>
                    월 요금
                  </span>
                  <span style={{ flex: '0 0 130px' }}>상태</span>
                  <span style={{ flex: 1 }}>가입일</span>
                </div>
                {visible.map((s) => (
                  <div key={s.id} className="linear-row">
                    <span
                      style={{ flex: '0 0 90px', color: 'var(--fg-muted)' }}
                      className="mono truncate"
                      title={s.id}
                    >
                      {shortCode(s.id)}
                    </span>
                    <span
                      style={{
                        flex: '0 0 200px',
                        color: 'var(--fg-secondary)',
                      }}
                      className="truncate"
                      title={s.landlordId}
                    >
                      {s.landlordName ?? shortCode(s.landlordId)}
                    </span>
                    <span style={{ flex: '0 0 110px' }}>
                      <span className="label-pill">
                        {TIER_LABEL[s.tier] ?? s.tier}
                      </span>
                    </span>
                    <span
                      style={{ flex: '0 0 70px', textAlign: 'right' }}
                      className="text-fg mono"
                    >
                      {s.propertyCount}
                    </span>
                    <span
                      style={{ flex: '0 0 130px', textAlign: 'right' }}
                      className="text-fg mono"
                    >
                      ₩ {s.monthlyFee.toLocaleString()}
                    </span>
                    <span style={{ flex: '0 0 130px' }}>
                      <StatusDot status={s.status} />
                    </span>
                    <span
                      style={{ flex: 1, color: 'var(--fg-muted)' }}
                      className="mono"
                    >
                      {new Date(s.createdAt).toISOString().slice(0, 10)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-fg-muted mt-8" style={{ fontSize: 12 }}>
            ※ 회원 / 물건 / 점검 화면은 후속 마일스톤에서 제공됩니다.
          </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// 관리자 임대차 CRM — 전체 계약 개요 + 알림 스캔 (Linear 톤 헤더 + 공통 패널)
function CrmView() {
  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>관리자</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">CRM</span>
      </div>
      <div style={{ marginTop: 6, marginBottom: 8 }}>
        <h1 className="admin-h1">임대차 CRM</h1>
        <p className="admin-sub">
          전체 임대차 계약의 만료·월세·수선·정산 상태를 관리하고, 알림을 스캔하세요.
        </p>
      </div>
      <CrmOverviewPanel />
    </>
  );
}

// 관리자 수선요청 보드 — 전체 물건의 수선요청을 상태별로 관리 (Linear 톤 헤더 + 공통 보드)
function MaintenanceView() {
  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>관리자</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">수선요청</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <h1 className="admin-h1">수선요청 보드</h1>
        <p className="admin-sub">
          전체 임대인·임차인의 수선요청을 상태별로 확인하고, 카드를 눌러 상태전이·코멘트를 남기세요.
        </p>
      </div>
      <div style={{ marginTop: 24 }}>
        <MaintenanceBoard />
      </div>
    </>
  );
}

// 관리자 단지 커뮤니티 — 내가 접근 가능한 단지의 게시판/투표 (Linear 톤 헤더 + 공통 패널)
function CommunityView() {
  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>관리자</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">단지 커뮤니티</span>
      </div>
      <div style={{ marginTop: 6, marginBottom: 24 }}>
        <h1 className="admin-h1">단지 커뮤니티</h1>
        <p className="admin-sub">
          단지별 게시판과 전자투표를 확인하고 참여하세요. 게시·투표는 해당 단지 실소유주·거주자만 가능합니다.
        </p>
      </div>
      <CommunityPanel />
    </>
  );
}

// 관리자 보수업체 — 디렉토리 등록·검색 + 평점 (Linear 톤 헤더 + 공통 패널)
function VendorsView() {
  return (
    <>
      <div className="admin-breadcrumb mono">
        <span>관리자</span>
        <span className="admin-breadcrumb__sep">/</span>
        <span className="admin-breadcrumb__current">보수업체</span>
      </div>
      <div style={{ marginTop: 6, marginBottom: 24 }}>
        <h1 className="admin-h1">보수업체 매칭</h1>
        <p className="admin-sub">
          보수업체를 등록·검색하고 평점·리뷰를 관리하세요. 업체 등록은 관리자만 가능합니다.
        </p>
      </div>
      <VendorDirectory />
    </>
  );
}

/* ─────────────────── Sidebar ─────────────────── */

function AdminSidebar({
  active,
  counts,
  userName,
  onLogout,
  onSelectSubscriptions,
  onSelectMaintenance,
  onSelectCrm,
  onSelectCommunity,
  onSelectVendors,
}: {
  active: NavKey;
  counts: { subscriptions?: number; inspections?: number };
  userName: string;
  onLogout: () => void;
  onSelectSubscriptions: () => void;
  onSelectMaintenance: () => void;
  onSelectCrm: () => void;
  onSelectCommunity: () => void;
  onSelectVendors: () => void;
}) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar__brand">
        <span className="admin-sidebar__brand-logo">B</span>
        <span className="admin-sidebar__brand-text">
          <span className="admin-sidebar__brand-name">버틀러</span>
          <span className="admin-sidebar__brand-sub">관리자 콘솔</span>
        </span>
      </div>

      <div className="admin-sidebar__search">
        <span className="admin-sidebar__search-icon">
          <IconSearch />
        </span>
        <input type="text" aria-label="검색" placeholder="검색  ⌘/" />
      </div>

      <div className="admin-sidebar__section">
        <NavItem
          icon={<IconGrid />}
          label="임대차 CRM"
          active={active === 'dashboard'}
          onClick={onSelectCrm}
        />
        <NavItem
          icon={<IconUsers />}
          label="회원"
          active={active === 'users'}
        />
        <NavItem
          icon={<IconHome />}
          label="물건"
          active={active === 'properties'}
        />
        <NavItem
          icon={<IconClipboard />}
          label="점검"
          active={active === 'inspections'}
          badge={counts.inspections}
        />
        <NavItem
          icon={<IconCard />}
          label="구독"
          active={active === 'subscriptions'}
          badge={counts.subscriptions}
          onClick={onSelectSubscriptions}
        />
        <NavItem
          icon={<IconWrench />}
          label="수선요청"
          active={active === 'maintenance'}
          onClick={onSelectMaintenance}
        />
        <NavItem
          icon={<IconChat />}
          label="단지 커뮤니티"
          active={active === 'community'}
          onClick={onSelectCommunity}
        />
        <NavItem
          icon={<IconStore />}
          label="보수업체"
          active={active === 'vendors'}
          onClick={onSelectVendors}
        />
      </div>

      <div className="admin-sidebar__section">
        <span className="admin-sidebar__section-title">리포트</span>
        <NavItem
          icon={<IconChart />}
          label="개요"
          active={active === 'reports-overview'}
        />
        <NavItem
          icon={<IconCoin />}
          label="매출"
          active={active === 'reports-revenue'}
        />
      </div>

      <div className="admin-sidebar__section">
        <span className="admin-sidebar__section-title">수선요청</span>
        <NavItem
          icon={<IconLog />}
          label="활동 로그"
          active={active === 'maintenance-logs'}
        />
        <NavItem
          icon={<IconCog />}
          label="설정"
          active={active === 'maintenance-settings'}
        />
      </div>

      <div className="admin-sidebar__spacer" />

      <div className="admin-sidebar__footer">
        {/* 라이트/다크 테마 토글 */}
        <ThemeToggle />
        {/* AI 보조 (Phase 3 M5 — 전부 mock) — 챗봇·등기부 안전진단 */}
        <Link to="/assistant" className="admin-sidebar__item">
          <span className="admin-sidebar__icon">
            <IconSparkle />
          </span>
          <span>AI 보조 (mock)</span>
        </Link>
        <button type="button" className="admin-sidebar__item">
          <span className="admin-sidebar__icon">
            <IconUser />
          </span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userName}
          </span>
        </button>
        <button
          type="button"
          className="admin-sidebar__item"
          onClick={onLogout}
        >
          <span className="admin-sidebar__icon">
            <IconLogout />
          </span>
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <a
      href="#"
      className={
        'admin-sidebar__item' +
        (active ? ' admin-sidebar__item--active' : '')
      }
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
    >
      <span className="admin-sidebar__icon">{icon}</span>
      <span>{label}</span>
      {typeof badge === 'number' && (
        <span className="admin-sidebar__badge mono">{badge}</span>
      )}
    </a>
  );
}

/* ─────────────────── Cells ─────────────────── */

function MetricCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="admin-metric">
      <span className="admin-metric__label mono">{label}</span>
      <span className="admin-metric__value">{value}</span>
      {delta && <span className="admin-metric__delta">{delta}</span>}
    </div>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active?: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={'admin-tab' + (active ? ' admin-tab--active' : '')}
    >
      {label}
      {typeof count === 'number' && (
        <span
          className="mono"
          style={{
            marginLeft: 6,
            fontSize: 11.5,
            color: 'var(--fg-muted)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function StatusDot({
  status,
}: {
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
}) {
  const conf = {
    ACTIVE: { color: '#27A644', text: '활성' },
    PAST_DUE: { color: '#F0BF00', text: '연체' },
    CANCELED: { color: '#6F6E77', text: '해지' },
  }[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: conf.color,
        }}
      />
      <span
        className="mono"
        style={{ fontSize: 12, color: 'var(--fg-secondary)' }}
      >
        {conf.text}
      </span>
    </span>
  );
}

/* ─────────────────── Icons (inline SVG, currentColor) ─────────────────── */

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

function IconSearch() {
  return (
    <svg {...svgProps(14)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
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
function IconUsers() {
  return (
    <svg {...svgProps()}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.7-3.4 3.4-5.5 6.5-5.5s5.8 2.1 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21.5 18c-.4-2.2-1.9-3.7-4-4.1" />
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
function IconClipboard() {
  return (
    <svg {...svgProps()}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
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
function IconChart() {
  return (
    <svg {...svgProps()}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
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
function IconWrench() {
  return (
    <svg {...svgProps()}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2l-5.6 5.6a1.5 1.5 0 0 0 2.1 2.1l5.6-5.6a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.1-.4-.4-2.1z" />
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
function IconStore() {
  return (
    <svg {...svgProps()}>
      <path d="M3 9 4.5 4h15L21 9" />
      <path d="M3 9v11h18V9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}
function IconLog() {
  return (
    <svg {...svgProps()}>
      <path d="M4 5h16M4 10h16M4 15h10M4 20h10" />
    </svg>
  );
}
function IconCog() {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.7-3.4 3.4-5.5 7-5.5s6.3 2.1 7 5.5" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg {...svgProps()}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
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
function IconDownload() {
  return (
    <svg {...svgProps(14)}>
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg {...svgProps(14)}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}
