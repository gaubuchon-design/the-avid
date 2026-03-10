import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db/client';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

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
      requestId?: string;
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

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

// ─── authenticate -- required ───────────────────────────────────────────────────
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = header.slice(7);
    if (!token || token.length < 10) {
      throw new UnauthorizedError('Malformed token');
    }

    const payload = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }) as JwtPayload;

    if (!payload.sub) {
      throw new UnauthorizedError('Invalid token payload');
    }

    // Verify user still exists and is not deleted
    const user = await db.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        subscription: { select: { tier: true, status: true } },
      },
    });

    if (!user) throw new UnauthorizedError('User not found');

    // Check subscription is active (not expired/cancelled)
    const subStatus = user.subscription?.status;
    if (subStatus && !['ACTIVE', 'TRIALING'].includes(subStatus)) {
      logger.warn(`User ${user.id} has inactive subscription: ${subStatus}`);
    }

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

// ─── optionalAuth -- doesn't fail if no token ──────────────────────────────────
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return next();
  return authenticate(req, res, next);
}

// ─── requireProject access ────────────────────────────────────────────────────
const ROLE_HIERARCHY = {
  VIEWER: 0,
  REVIEWER: 1,
  ASSISTANT: 2,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
} as const;

type ProjectRole = keyof typeof ROLE_HIERARCHY;

export function requireProjectAccess(minRole: ProjectRole = 'VIEWER') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const projectId = req.params['projectId'] ?? req.params['id'];
      if (!projectId) {
        throw new ForbiddenError('Project ID is required');
      }

      const userId = req.user!.id;

      const member = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { role: true },
      });

      if (!member) throw new ForbiddenError('Not a project member');

      const memberRole = member.role as ProjectRole;
      if (!(memberRole in ROLE_HIERARCHY)) {
        throw new ForbiddenError('Unknown role');
      }

      if (ROLE_HIERARCHY[memberRole] < ROLE_HIERARCHY[minRole]) {
        throw new ForbiddenError(`Requires ${minRole} access or higher`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── requireSubscription tier ─────────────────────────────────────────────────
const TIER_HIERARCHY = {
  FREE: 0,
  CREATOR: 1,
  PRO: 2,
  ENTERPRISE: 3,
} as const;

type SubscriptionTier = keyof typeof TIER_HIERARCHY;

export function requireTier(minTier: SubscriptionTier) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userTier = (req.user?.subscriptionTier ?? 'FREE') as SubscriptionTier;

    if (!(userTier in TIER_HIERARCHY)) {
      return next(new ForbiddenError('Unknown subscription tier'));
    }

    if (TIER_HIERARCHY[userTier] < TIER_HIERARCHY[minTier]) {
      return next(new ForbiddenError(`Requires ${minTier} subscription or higher`));
    }
    next();
  };
}

// ─── requireOrgAccess -- verify org membership ────────────────────────────────
export function requireOrgAccess(minRole: ProjectRole = 'VIEWER') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const orgId = req.params['orgId'] ?? req.body?.orgId ?? (req.query['orgId'] as string);
      if (!orgId) throw new ForbiddenError('Organization ID is required');

      const userId = req.user!.id;
      const member = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId } },
        select: { role: true },
      });

      if (!member) throw new ForbiddenError('Not an organization member');

      const memberRole = member.role as ProjectRole;
      if (ROLE_HIERARCHY[memberRole] < ROLE_HIERARCHY[minRole]) {
        throw new ForbiddenError(`Requires ${minRole} organization access or higher`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── Token helpers ─────────────────────────────────────────────────────────────
export function generateTokens(user: { id: string; email: string; displayName: string }) {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, displayName: user.displayName },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn as any,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );
  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshExpiresIn as any,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );
  return { accessToken, refreshToken };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret, {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  }) as RefreshTokenPayload;
  if (payload.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }
  return payload;
}
