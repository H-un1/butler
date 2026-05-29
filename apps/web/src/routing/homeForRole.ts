import type { Role } from '@butler/shared';

// role별 진입 화면 매핑 — RoleGate와 여러 페이지가 공유한다.
// 컴포넌트가 아닌 export라 Fast Refresh를 위해 RoleGate.tsx에서 분리했다.
export function homeForRole(role: Role): string {
  switch (role) {
    case 'LANDLORD':
      return '/landlord';
    case 'ADMIN':
      return '/admin';
    case 'INSPECTOR':
      // 점검자도 발표 시연용 웹 화면이 생겨서 /inspector 로 진입한다.
      // (현장 변형 Toss 톤 — 고대비·큰 버튼)
      return '/inspector';
    case 'TENANT':
      // Phase 2 — 임차인은 임대인·관리자와 같은 웹앱을 쓰고 /tenant 로 진입한다.
      return '/tenant';
    default: {
      // 컴파일 타임에 누락된 role을 잡아내기 위함 — Phase 2 TENANT 추가 시 여기서 컴파일 에러
      const _exhaustive: never = role;
      void _exhaustive;
      return '/login';
    }
  }
}
