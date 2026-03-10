import { db } from './client';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';
import { config } from '../config';

const BCRYPT_ROUNDS = config.security?.bcryptRounds ?? 12;

async function seed() {
  logger.info('Seeding database...');

  // ─── Admin user ────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('admin1234', BCRYPT_ROUNDS);

  const admin = await db.user.upsert({
    where: { email: 'admin@avid.dev' },
    update: {},
    create: {
      email: 'admin@avid.dev',
      emailVerified: true,
      passwordHash,
      displayName: 'Admin User',
      preferences: { create: { theme: 'dark' } },
      tokenBalance: { create: { balance: 10000, lifetime: 10000 } },
      subscription: { create: { tier: 'ENTERPRISE', status: 'ACTIVE' } },
    },
  });
  logger.info(`Admin user created/verified: ${admin.email}`);

  // ─── Demo editor ───────────────────────────────────────────────────────────
  const editorHash = await bcrypt.hash('editor1234', BCRYPT_ROUNDS);
  const editor = await db.user.upsert({
    where: { email: 'editor@avid.dev' },
    update: {},
    create: {
      email: 'editor@avid.dev',
      emailVerified: true,
      passwordHash: editorHash,
      displayName: 'Demo Editor',
      preferences: { create: {} },
      tokenBalance: { create: { balance: 500, lifetime: 500 } },
      subscription: { create: { tier: 'PRO', status: 'ACTIVE' } },
    },
  });
  logger.info(`Editor user created/verified: ${editor.email}`);

  // ─── Demo reviewer ─────────────────────────────────────────────────────────
  const reviewerHash = await bcrypt.hash('reviewer1234', BCRYPT_ROUNDS);
  const reviewer = await db.user.upsert({
    where: { email: 'reviewer@avid.dev' },
    update: {},
    create: {
      email: 'reviewer@avid.dev',
      emailVerified: true,
      passwordHash: reviewerHash,
      displayName: 'Demo Reviewer',
      preferences: { create: {} },
      tokenBalance: { create: { balance: 100, lifetime: 100 } },
      subscription: { create: { tier: 'CREATOR', status: 'ACTIVE' } },
    },
  });
  logger.info(`Reviewer user created/verified: ${reviewer.email}`);

  // ─── Demo organization ─────────────────────────────────────────────────────
  const org = await db.organization.upsert({
    where: { slug: 'demo-studio' },
    update: {},
    create: {
      name: 'Demo Studio',
      slug: 'demo-studio',
      plan: 'PRO',
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: editor.id, role: 'EDITOR' },
          { userId: reviewer.id, role: 'VIEWER' },
        ],
      },
    },
  });
  logger.info(`Organization created/verified: ${org.slug}`);

  // ─── Demo project ──────────────────────────────────────────────────────────
  const existingProject = await db.project.findFirst({
    where: { name: 'Demo Feature Film', orgId: org.id },
  });

  const project = existingProject ?? await db.project.create({
    data: {
      name: 'Demo Feature Film',
      description: 'A demonstration project for The Avid platform',
      orgId: org.id,
      frameRate: 23.976,
      width: 1920,
      height: 1080,
      tags: ['demo', 'film', 'feature'],
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: editor.id, role: 'EDITOR' },
          { userId: reviewer.id, role: 'REVIEWER' },
        ],
      },
    },
  });
  logger.info(`Project: ${project.id} (${project.name})`);

  // ─── Bins (only if project was just created) ───────────────────────────────
  if (!existingProject) {
    await db.bin.create({
      data: {
        projectId: project.id,
        name: 'Rushes',
        color: '#6366f1',
        sortOrder: 0,
        children: {
          create: [
            { projectId: project.id, name: 'Day 1', sortOrder: 0 },
            { projectId: project.id, name: 'Day 2', sortOrder: 1 },
            { projectId: project.id, name: 'B-Roll', sortOrder: 2 },
          ],
        },
      },
    });

    await db.bin.create({
      data: { projectId: project.id, name: 'Music', color: '#22c55e', sortOrder: 1 },
    });

    await db.bin.create({
      data: { projectId: project.id, name: 'SFX', color: '#f59e0b', sortOrder: 2 },
    });

    await db.bin.create({
      data: { projectId: project.id, name: 'Graphics', color: '#ec4899', sortOrder: 3 },
    });

    // ─── Primary timeline ──────────────────────────────────────────────────────
    await db.timeline.create({
      data: {
        projectId: project.id,
        name: 'Main Timeline',
        isPrimary: true,
        frameRate: 23.976,
        tracks: {
          create: [
            { name: 'V1', type: 'VIDEO', sortOrder: 0, color: '#6366f1' },
            { name: 'V2', type: 'VIDEO', sortOrder: 1, color: '#818cf8' },
            { name: 'A1', type: 'AUDIO', sortOrder: 2, color: '#22c55e' },
            { name: 'A2', type: 'AUDIO', sortOrder: 3, color: '#4ade80' },
            { name: 'A3', type: 'AUDIO', sortOrder: 4, color: '#86efac' },
            { name: 'A4', type: 'AUDIO', sortOrder: 5, color: '#a7f3d0' },
            { name: 'FX', type: 'EFFECT', sortOrder: 6, color: '#f59e0b' },
            { name: 'SUB', type: 'SUBTITLE', sortOrder: 7, color: '#f1f5f9' },
          ],
        },
      },
    });

    logger.info('Bins and timeline created');
  }

  // ─── Marketplace demo items ────────────────────────────────────────────────
  const existingItems = await db.marketplaceItem.count({
    where: { authorId: admin.id },
  });

  if (existingItems === 0) {
    await db.marketplaceItem.createMany({
      data: [
        {
          authorId: admin.id,
          type: 'EFFECT_PLUGIN',
          name: 'Cinematic LUT Pack',
          slug: 'cinematic-lut-pack',
          description: 'Professional film-grade LUTs for color grading',
          priceTokens: 50,
          tags: ['color', 'luts', 'cinematic'],
          isPublished: true,
          isFeatured: true,
        },
        {
          authorId: admin.id,
          type: 'AI_MODEL',
          name: 'Sports Highlights AI',
          slug: 'sports-highlights-ai',
          description: 'Specialized AI model for detecting sports highlights',
          priceTokens: 200,
          tags: ['ai', 'sports', 'highlights'],
          isPublished: true,
          isFeatured: true,
        },
        {
          authorId: admin.id,
          type: 'TEMPLATE',
          name: 'News Broadcast Template',
          slug: 'news-broadcast-template',
          description: 'Professional news lower-thirds and title cards',
          priceTokens: 0,
          tags: ['template', 'news', 'broadcast'],
          isPublished: true,
        },
        {
          authorId: admin.id,
          type: 'TEMPLATE',
          name: 'Social Media Pack',
          slug: 'social-media-pack',
          description: 'Instagram, TikTok, and YouTube Shorts templates',
          priceTokens: 25,
          tags: ['template', 'social', 'instagram', 'tiktok'],
          isPublished: true,
        },
      ],
    });
    logger.info('Marketplace items created');
  }

  logger.info('Seed complete');
  logger.info('  Accounts:');
  logger.info('    Admin:    admin@avid.dev / admin1234');
  logger.info('    Editor:   editor@avid.dev / editor1234');
  logger.info('    Reviewer: reviewer@avid.dev / reviewer1234');
  logger.info(`  Project: ${project.id}`);
  logger.info(`  Org:     ${org.slug}`);
}

seed()
  .catch((e) => {
    logger.error('Seed failed', { error: e.message, stack: e.stack });
    process.exit(1);
  })
  .finally(() => db.$disconnect());
