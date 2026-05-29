import jwt from 'jsonwebtoken';
import type { Role } from '@butler/shared';

export type JwtPayload = {
  sub: string;
  role: Role;
  verified: boolean;
};

export function signSession(
  payload: JwtPayload,
  secret: string,
  expiresIn: string
): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifySession(token: string, secret: string): JwtPayload {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === 'string') {
    throw new Error('invalid token payload');
  }
  const { sub, role, verified } = decoded as Record<string, unknown>;
  if (typeof sub !== 'string' || typeof role !== 'string' || typeof verified !== 'boolean') {
    throw new Error('malformed session token');
  }
  return { sub, role: role as Role, verified };
}
