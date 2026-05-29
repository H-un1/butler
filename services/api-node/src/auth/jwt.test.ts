import { describe, it, expect } from 'vitest';
import { ROLES } from '@butler/shared';
import { signSession, verifySession } from './jwt.js';

const SECRET = 'jwt-test-secret-1234567890abcdef';

describe('JWT session', () => {
  it('round-trips role + verified flag', () => {
    const token = signSession(
      { sub: 'usr_1', role: ROLES.LANDLORD, verified: true },
      SECRET,
      '1h'
    );
    const decoded = verifySession(token, SECRET);
    expect(decoded.sub).toBe('usr_1');
    expect(decoded.role).toBe(ROLES.LANDLORD);
    expect(decoded.verified).toBe(true);
  });

  it('rejects tokens signed with a different secret', () => {
    const token = signSession(
      { sub: 'usr_1', role: ROLES.ADMIN, verified: false },
      SECRET,
      '1h'
    );
    expect(() => verifySession(token, 'wrong-secret')).toThrow();
  });
});
