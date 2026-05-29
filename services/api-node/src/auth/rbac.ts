import type { Request, Response, NextFunction } from 'express';
import { isValidRole, type Role } from '@butler/shared';
import { verifySession, type JwtPayload } from './jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export type RbacDeps = {
  jwtSecret: string;
};

export function requireAuth(deps: RbacDeps) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: '인증이 필요합니다 (Bearer 토큰 누락)' });
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      req.user = verifySession(token, deps.jwtSecret);
      next();
    } catch {
      res.status(401).json({ error: '세션 토큰이 유효하지 않습니다' });
    }
  };
}

export function requireRoles(allowed: readonly Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: '인증이 필요합니다' });
      return;
    }
    if (!isValidRole(user.role) || !allowed.includes(user.role)) {
      res.status(403).json({
        error: `이 작업은 ${allowed.join('/')} 권한이 필요합니다`,
      });
      return;
    }
    next();
  };
}

export function requireVerified() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: '인증이 필요합니다' });
      return;
    }
    if (!req.user.verified) {
      res.status(403).json({ error: 'PASS 본인인증이 필요합니다' });
      return;
    }
    next();
  };
}
