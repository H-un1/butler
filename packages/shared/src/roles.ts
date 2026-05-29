// 역할 — Phase 2에서 임차인(TENANT) 활성화 (02_DATA_MODEL.md)
// 임차인은 임대인·관리자와 같은 웹앱을 공유하고 role로 분기한다.

export const ROLES = {
  LANDLORD: 'LANDLORD',
  INSPECTOR: 'INSPECTOR',
  ADMIN: 'ADMIN',
  TENANT: 'TENANT',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value);
}

// 임차인도 웹앱 사용 (점검자만 모바일 전용)
export const WEB_ROLES: readonly Role[] = [ROLES.LANDLORD, ROLES.ADMIN, ROLES.TENANT];
export const MOBILE_ROLES: readonly Role[] = [ROLES.INSPECTOR];

export function isWebRole(role: Role): boolean {
  return (WEB_ROLES as readonly Role[]).includes(role);
}

export function isMobileRole(role: Role): boolean {
  return (MOBILE_ROLES as readonly Role[]).includes(role);
}
