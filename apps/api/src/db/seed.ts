import { db } from './client';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

async function seed() {
  logger.info('Seeding database…');

  // Admin user
  const passwordHash = await bcrypt.hash('admin1234', 12);

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
  logger.info(`Admin user: ${admin.email}`);

  // Demo editor
  const editor = await db.user.upsert({
    where: { email: 'editor@avid.dev' },
    update: {},
    create: {
      email: 'editor@avid.dev',
      emailVerified: true,
      passwordHash: await bcrypt.hash('editor1234', 12),
      displayName: 'Demo Editor',
      preferences: { create: {} },
      tokenBalance: { create: { balance: 500, lifetime: 500 } },
      subscription: { create: { tier: 'PRO', status: 'ACTIVE' } },
    },
  });

  // Demo organization
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
        ],
      },
    },
  });

  // Demo project
  const project = await db.project.create({
    data: {
      name: 'Demo Feature Film',
      description: 'A demonstration project for The Avid',
      orgId: org.id,
      frameRate: 23.976,
      width: 1920,
      height: 1080,
      tags: ['demo', 'film'],
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: editor.id, role: 'EDITOR' },
        ],
      },
    },
  });

  // Root bins
  const rushesbin = await db.bin.create({
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
    include: { children: true },
  });

  const musicBin = await db.bin.create({
    data: { projectId: project.id, name: 'Music', color: '#22c55e', sortOrder: 1 },
  });

  // Primary timeline
  const timeline = await db.timeline.create({
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
          { name: 'FX', type: 'EFFECT', sortOrder: 5, color: '#f59e0b' },
          { name: 'SUB', type: 'SUBTITLE', sortOrder: 6, color: '#f1f5f9' },
        ],
      },
    },
  });

  // Marketplace demo items
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
    ],
  });

  logger.info('Seed complete ✓');
  logger.info(`  Admin:   admin@avid.dev / admin1234`);
  logger.info(`  Editor:  editor@avid.dev / editor1234`);
  logger.info(`  Project: ${project.id}`);
}

seed()
  .catch((e) => { logger.error('Seed failed', e); process.exit(1); })
  .finally(() => db.$disconnect());
