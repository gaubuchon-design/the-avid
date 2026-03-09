import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/client';
import { authenticate, generateTokens } from '../../middleware/auth';
import { validate, schemas, uuidParam } from '../../utils/validation';
import { UnauthorizedError, ConflictError, NotFoundError, BadRequestError } from '../../utils/errors';
import { config } from '../../config';

const router = Router();

// ─── POST /auth/register ───────────────────────────────────────────────────────
router.post('/register', validate(schemas.register), async (req: Request, res: Response) => {
  const { email, password, displayName } = req.body;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      preferences: { create: {} },
      tokenBalance: { create: { balance: 100, lifetime: 100 } },
      subscription: { create: { tier: 'FREE', status: 'ACTIVE' } },
    },
    select: { id: true, email: true, displayName: true },
  });

  const { accessToken, refreshToken } = generateTokens(user);

  // Persist refresh token
  await db.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30d
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    },
  });

  res.status(201).json({ user, accessToken, refreshToken });
});

// ─── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', validate(schemas.login), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await db.user.findUnique({
    where: { email, deletedAt: null },
    select: {
      id: true,
      email: true,
      displayName: true,
      passwordHash: true,
      avatarUrl: true,
      subscription: { select: { tier: true, status: true } },
    },
  });

  if (!user?.passwordHash) throw new UnauthorizedError('Invalid credentials');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const { accessToken, refreshToken } = generateTokens(user);

  await db.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    },
  });

  // Update last active
  await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

  const { passwordHash: _, ...userOut } = user;
  res.json({ user: userOut, accessToken, refreshToken });
});

// ─── POST /auth/refresh ────────────────────────────────────────────────────────
router.post('/refresh', validate(schemas.refreshToken), async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  const stored = await db.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: { select: { id: true, email: true, displayName: true, deletedAt: true } } },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  if (stored.user.deletedAt) throw new UnauthorizedError('Account not found');

  // Rotate: revoke old, issue new pair
  await db.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const tokens = generateTokens(stored.user);

  await db.refreshToken.create({
    data: {
      token: tokens.refreshToken,
      userId: stored.user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    },
  });

  res.json(tokens);
});

// ─── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/logout', authenticate, validate(schemas.logoutBody), async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await db.refreshToken.updateMany({
      where: { token: refreshToken, userId: req.user!.id },
      data: { revokedAt: new Date() },
    });
  }
  res.status(204).send();
});

// ─── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = await db.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      timezone: true,
      locale: true,
      createdAt: true,
      lastActiveAt: true,
      subscription: { select: { tier: true, status: true, currentPeriodEnd: true } },
      tokenBalance: { select: { balance: true } },
      preferences: true,
    },
  });
  if (!user) throw new NotFoundError('User');
  res.json({ user });
});

// ─── PATCH /auth/me ────────────────────────────────────────────────────────────
router.patch('/me', authenticate, validate(schemas.updateProfile), async (req: Request, res: Response) => {
  const { displayName, bio, timezone, locale, avatarUrl } = req.body;

  const user = await db.user.update({
    where: { id: req.user!.id },
    data: { displayName, bio, timezone, locale, avatarUrl },
    select: {
      id: true, email: true, displayName: true, bio: true, avatarUrl: true,
    },
  });
  res.json({ user });
});

// ─── POST /auth/change-password ────────────────────────────────────────────────
router.post('/change-password', authenticate, validate(schemas.changePassword), async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (currentPassword === newPassword) {
    throw new BadRequestError('New password must be different from current password');
  }

  const user = await db.user.findUnique({
    where: { id: req.user!.id },
    select: { passwordHash: true },
  });

  if (!user?.passwordHash) throw new UnauthorizedError('No password set');
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Current password incorrect');

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: req.user!.id }, data: { passwordHash: newHash } });

  // Revoke all refresh tokens
  await db.refreshToken.updateMany({
    where: { userId: req.user!.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  res.json({ message: 'Password changed successfully' });
});

// ─── GET /auth/sessions ────────────────────────────────────────────────────────
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  const sessions = await db.refreshToken.findMany({
    where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ sessions });
});

// ─── DELETE /auth/sessions/:id ─────────────────────────────────────────────────
router.delete('/sessions/:id', authenticate, validate(uuidParam, 'params'), async (req: Request, res: Response) => {
  await db.refreshToken.updateMany({
    where: { id: req.params['id'], userId: req.user!.id },
    data: { revokedAt: new Date() },
  });
  res.status(204).send();
});

export default router;
