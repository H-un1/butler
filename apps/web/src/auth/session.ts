import type { Role } from '@butler/shared';

const STORAGE_KEY = 'butler.session.v1';

export type Session = {
  token: string;
  user: {
    id: string;
    role: Role;
    name: string;
    verified: boolean;
  };
};

export function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveSession(s: Session): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
