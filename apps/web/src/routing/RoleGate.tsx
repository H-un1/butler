import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@butler/shared';
import { useAuth } from '../auth/AuthContext';
import { homeForRole } from './homeForRole';

type Props = {
  allow: readonly Role[];
  children: React.ReactNode;
};

// role 분기의 핵심 — 임대인과 관리자가 같은 웹에서 다른 진입 화면을 보게 만든다.
// 권한 밖이면 자신의 홈으로 리다이렉트(다른 사용자의 화면을 절대 노출하지 않는다).
export function RoleGate({ allow, children }: Props) {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!allow.includes(session.user.role)) {
    const home = homeForRole(session.user.role);
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}
