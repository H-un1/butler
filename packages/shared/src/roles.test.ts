import { describe, it, expect } from 'vitest';
import {
  ROLES,
  ALL_ROLES,
  isValidRole,
  isWebRole,
  isMobileRole,
} from './roles.js';

describe('roles (Phase 2 — TENANT 활성화)', () => {
  it('4개 역할 노출 — Phase 2에서 TENANT 추가', () => {
    expect(ALL_ROLES).toHaveLength(4);
    expect(ALL_ROLES).toEqual(
      expect.arrayContaining(['LANDLORD', 'INSPECTOR', 'ADMIN', 'TENANT'])
    );
  });

  it('isValidRole은 TENANT를 유효 role로 인정한다 (Phase 2)', () => {
    expect(isValidRole('TENANT')).toBe(true);
    expect(isValidRole('LANDLORD')).toBe(true);
    expect(isValidRole('NOPE')).toBe(false);
  });

  it('LANDLORD·ADMIN·TENANT는 같은 웹 채널을 공유한다', () => {
    expect(isWebRole(ROLES.LANDLORD)).toBe(true);
    expect(isWebRole(ROLES.ADMIN)).toBe(true);
    expect(isWebRole(ROLES.TENANT)).toBe(true);
    expect(isWebRole(ROLES.INSPECTOR)).toBe(false);
  });

  it('INSPECTOR만 모바일 전용 역할이다', () => {
    expect(isMobileRole(ROLES.INSPECTOR)).toBe(true);
    expect(isMobileRole(ROLES.LANDLORD)).toBe(false);
    expect(isMobileRole(ROLES.ADMIN)).toBe(false);
    expect(isMobileRole(ROLES.TENANT)).toBe(false);
  });
});
