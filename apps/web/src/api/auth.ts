import type { Role } from '@butler/shared';
import type { Session } from '../auth/session';

const API_BASE = '/api';

export async function exchangeDevMock(role: Role, name: string): Promise<Session> {
  const r = await fetch(`${API_BASE}/auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'dev-mock',
      code: `dev:${role}:${name}`,
      role,
    }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `로그인 실패 (${r.status})`);
  }
  return (await r.json()) as Session;
}
