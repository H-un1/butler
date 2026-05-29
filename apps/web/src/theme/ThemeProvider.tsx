import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// 라이트/다크 테마 — 기본은 시스템 설정(prefers-color-scheme), 토글하면 localStorage에 기억.
// data-theme 속성을 <html>에 반영한다. 임차인/점검자/로그인은 별도로 data-theme="light" 래핑(강제 라이트).

export type ResolvedTheme = 'light' | 'dark';
const STORAGE_KEY = 'butler-theme';

type ThemeContextValue = {
  theme: ResolvedTheme; // 현재 적용된 테마
  isSystem: boolean; // 저장값 없이 시스템을 따르는 중인지
  toggle: () => void; // 라이트<->다크 전환(+저장)
  useSystem: () => void; // 시스템 따름으로 되돌리기
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function storedTheme(): ResolvedTheme | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<ResolvedTheme | null>(() => storedTheme());
  const [sys, setSys] = useState<ResolvedTheme>(() => systemTheme());

  const theme: ResolvedTheme = stored ?? sys;

  // <html>에 data-theme 반영
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 시스템 테마 변경 감지(저장값 없을 때만 반영)
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) =>
      setSys(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggle = useCallback(() => {
    setStored((prev) => {
      const current = prev ?? systemTheme();
      const next: ResolvedTheme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const useSystem = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    setSys(systemTheme());
    setStored(null);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, isSystem: stored === null, toggle, useSystem }),
    [theme, stored, toggle, useSystem]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Provider 밖(임차인/점검자 등 강제 라이트 영역)에서도 안전하게 동작
    return {
      theme: 'light',
      isSystem: true,
      toggle: () => undefined,
      useSystem: () => undefined,
    };
  }
  return ctx;
}

// 강제 라이트 영역 래퍼 — 임차인/점검자/로그인용 (상위 html 테마와 무관하게 항상 라이트)
export function LightScope({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--fg)' }}>
      {children}
    </div>
  );
}
