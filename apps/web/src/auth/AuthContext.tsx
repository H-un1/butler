import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearSession,
  loadSession,
  saveSession,
  type Session,
} from './session';

type AuthValue = {
  session: Session | null;
  login: (s: Session) => void;
  logout: () => void;
};

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession?: Session | null;
}) {
  // lazy init — 첫 렌더부터 storage 값을 반영해 RoleGate 비동기 race를 없앤다.
  const [session, setSession] = useState<Session | null>(
    () => initialSession ?? loadSession()
  );

  const value = useMemo<AuthValue>(
    () => ({
      session,
      login: (s) => {
        saveSession(s);
        setSession(s);
      },
      logout: () => {
        clearSession();
        setSession(null);
      },
    }),
    [session]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth는 AuthProvider 내부에서만 사용 가능합니다');
  return v;
}
