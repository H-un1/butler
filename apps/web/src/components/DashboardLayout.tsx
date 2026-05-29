import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { NotificationCenter } from './NotificationCenter';
import { useTheme } from '../theme/ThemeProvider';

// 임대인·관리자 공용 사이드바 대시보드 셸. 라이트/다크 테마는 상위 html[data-theme]를 따른다.

export type NavItemDef = {
  key: string;
  label: string;
  icon: ReactNode;
  badge?: number;
};

export type NavSection = {
  title?: string;
  items: NavItemDef[];
};

export type DashboardLayoutProps = {
  brandName: string; // 예: "버틀러"
  brandSub: string; // 예: "임대인" / "Admin Console"
  sections: NavSection[];
  activeKey: string;
  onSelect: (key: string) => void;
  userName: string;
  onLogout: () => void;
  children: ReactNode;
  /** 사이드바 푸터에 추가로 노출할 링크(예: AI 보조) */
  footerLinks?: { to: string; label: string; icon: ReactNode }[];
  /** 콘텐츠 상단 바 좌측 슬롯(예: 뒤로가기) */
  topLeft?: ReactNode;
};

export function DashboardLayout({
  brandName,
  brandSub,
  sections,
  activeKey,
  onSelect,
  userName,
  onLogout,
  children,
  footerLinks,
  topLeft,
}: DashboardLayoutProps) {
  const { theme } = useTheme();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__brand-logo">B</span>
          <span className="admin-sidebar__brand-text">
            <span className="admin-sidebar__brand-name">{brandName}</span>
            <span className="admin-sidebar__brand-sub">{brandSub}</span>
          </span>
        </div>

        {sections.map((section, i) => (
          <div className="admin-sidebar__section" key={section.title ?? `s${i}`}>
            {section.title && (
              <span className="admin-sidebar__section-title">{section.title}</span>
            )}
            {section.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className={
                  'admin-sidebar__item' +
                  (item.key === activeKey ? ' admin-sidebar__item--active' : '')
                }
                onClick={() => onSelect(item.key)}
              >
                <span className="admin-sidebar__icon">{item.icon}</span>
                <span>{item.label}</span>
                {typeof item.badge === 'number' && (
                  <span className="admin-sidebar__badge mono">{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}

        <div className="admin-sidebar__spacer" />

        <div className="admin-sidebar__footer">
          <ThemeToggle />
          {footerLinks?.map((l) => (
            <Link key={l.to} to={l.to} className="admin-sidebar__item">
              <span className="admin-sidebar__icon">{l.icon}</span>
              <span>{l.label}</span>
            </Link>
          ))}
          <button
            type="button"
            className="admin-sidebar__item"
            title={userName}
          >
            <span className="admin-sidebar__icon">
              <IconUser />
            </span>
            <span
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {userName}
            </span>
          </button>
          <button type="button" className="admin-sidebar__item" onClick={onLogout}>
            <span className="admin-sidebar__icon">
              <IconLogout />
            </span>
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-main__inner">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 8,
              minHeight: 32,
            }}
          >
            <div>{topLeft}</div>
            <NotificationCenter tone={theme === 'dark' ? 'linear' : 'toss'} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function IconUser() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.7-3.4 3.4-5.5 7-5.5s6.3 2.1 7 5.5" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
    </svg>
  );
}
