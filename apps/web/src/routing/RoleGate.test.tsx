import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROLES, type Role } from '@butler/shared';
import { AuthProvider } from '../auth/AuthContext';
import { RoleGate } from './RoleGate';
import { homeForRole } from './homeForRole';
import type { Session } from '../auth/session';

function harness(session: Session | null, initialEntries: string[]) {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/landlord"
            element={
              <RoleGate allow={[ROLES.LANDLORD]}>
                <div>landlord-home</div>
              </RoleGate>
            }
          />
          <Route
            path="/admin"
            element={
              <RoleGate allow={[ROLES.ADMIN]}>
                <div>admin-home</div>
              </RoleGate>
            }
          />
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

function mkSession(role: Role): Session {
  return {
    token: 'fake-token',
    user: { id: `usr_${role}`, role, name: 'tester', verified: true },
  };
}

describe('RoleGate (Phase 1 채널 분기)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('LANDLORD can reach /landlord', () => {
    harness(mkSession(ROLES.LANDLORD), ['/landlord']);
    expect(screen.getByText('landlord-home')).toBeInTheDocument();
  });

  it('ADMIN visiting /landlord gets redirected to /admin (own home)', () => {
    harness(mkSession(ROLES.ADMIN), ['/landlord']);
    expect(screen.queryByText('landlord-home')).not.toBeInTheDocument();
    expect(screen.getByText('admin-home')).toBeInTheDocument();
  });

  it('LANDLORD visiting /admin gets redirected to /landlord (own home)', () => {
    harness(mkSession(ROLES.LANDLORD), ['/admin']);
    expect(screen.queryByText('admin-home')).not.toBeInTheDocument();
    expect(screen.getByText('landlord-home')).toBeInTheDocument();
  });

  it('no session redirects to /login', () => {
    harness(null, ['/landlord']);
    expect(screen.getByText('login-page')).toBeInTheDocument();
  });

  it('homeForRole maps every role to a route', () => {
    expect(homeForRole(ROLES.LANDLORD)).toBe('/landlord');
    expect(homeForRole(ROLES.ADMIN)).toBe('/admin');
    // 점검자도 시연용 웹 홈(/inspector)으로 진입한다.
    expect(homeForRole(ROLES.INSPECTOR)).toBe('/inspector');
    // Phase 2 — 임차인은 /tenant 로 진입한다.
    expect(homeForRole(ROLES.TENANT)).toBe('/tenant');
  });
});
