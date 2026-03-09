import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db/client';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

// ─── Augment Express Request ───────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        displayName: string;
        subscriptionTier: string;
      };
    }
  }
}

export interface JwtPayload {
  sub: string;  // user id
  email: string;
  displayName: string;
  iat: number;
  exp: number;
}

// ─── authenticate — required ───────────────────────────────────────────────────
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Verify user still exists
    const user = await db.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        subscription: { select: { tier: true } },
      },
    });

    if (!user) throw new UnauthorizedError('User not found');

    req.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      subscriptionTier: user.subscription?.tier ?? 'FREE',
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return next(new UnauthorizedError('Token expired'));
    if (err instanceof jwt.JsonWebTokenError) return next(new UnauthorizedError('Invalid token'));
    next(err);
  }
}

// ─── optionalAuth — doesn't fail if no token ──────────────────────────────────
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return next();
  return authenticate(req, res, next);
}

// ─── requireProject access ────────────────────────────────────────────────────
export function requireProjectAccess(minRole: 'VIEWER' | 'REVIEWER' | 'EDITOR' | 'ADMIN' | 'OWNER' = 'VIEWER') {
  const hierarchy = { VIEWER: 0, REVIEWER: 1, EDITOR: 2, ASSISTANT: 2, ADMIN: 3, OWNER: 4 };
  type ProjectRole = keyof typeof hierarchy;

  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const projectId = req.params.projectId ?? req.params.id;
      const userId = req.user!.id;

      const member = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { role: true },
      });

      if (!member) throw new ForbiddenError('Not a project member');
      const memberRole = member.role as ProjectRole;
      if (hierarchy[memberRole] < hierarchy[minRole]) {
        throw new ForbiddenError(`Requires ${minRole} access or higher`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── requireSubscription tier ─────────────────────────────────────────────────
export function requireTier(minTier: 'FREE' | 'CREATOR' | 'PRO' | 'ENTERPRISE') {
  const hierarchy = { FREE: 0, CREATOR: 1, PRO: 2, ENTERPRISE: 3 };

  return (_req: Request, _res: Response, next: NextFunction) => {
    const userTier = _req.user?.subscriptionTier ?? 'FREE';
    if (hierarchy[userTier as keyof typeof hierarchy] < hierarchy[minTier]) {
      return next(new ForbiddenError(`Requires ${minTier} subscription or higher`));
    }
    next();
  };
}

// ─── Token helpers ─────────────────────────────────────────────────────────────
export function generateTokens(user: { id: string; email: string; displayName: string }) {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, displayName: user.displayName },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  );
  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn as any }
  );
  return { accessToken, refreshToken };
}
