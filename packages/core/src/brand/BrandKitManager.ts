// ─── Brand Kit Manager ───────────────────────────────────────────────────────
// Central brand asset store: CRUD operations for brand kits per org,
// font prioritization, color palette, logo placement rules, voice/tone
// guidelines, approved music library, and prohibited elements list.

import { generateId } from '../utils';
import type {
  BrandKit,
  BrandFont,
  BrandLogoFile,
  BrandTypography,
  BrandSafeArea,
} from './types';

// ─── Default safe area (10% padding on all sides) ────────────────────────────

const DEFAULT_SAFE_AREA: BrandSafeArea = {
  top: 10,
  right: 10,
  bottom: 10,
  left: 10,
};

const DEFAULT_TYPOGRAPHY: BrandTypography = {
  heading: { family: 'Inter', weight: 700, style: 'normal' },
  body: { family: 'Inter', weight: 400, style: 'normal' },
  caption: { family: 'Inter', weight: 400, style: 'normal' },
};

// ─── In-memory store (per session; persisted via Zustand in the web app) ─────

const brandKitStore = new Map<string, BrandKit>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function createBrandKit(
  orgId: string,
  brandName: string,
  partial?: Partial<Omit<BrandKit, 'id' | 'orgId' | 'brandName' | 'createdAt' | 'updatedAt'>>,
): BrandKit {
  const kit: BrandKit = {
    id: generateId(),
    orgId,
    brandName,
    logoFiles: partial?.logoFiles ?? [],
    primaryColors: partial?.primaryColors ?? [],
    secondaryColors: partial?.secondaryColors ?? [],
    fonts: partial?.fonts ?? [],
    typography: partial?.typography ?? clone(DEFAULT_TYPOGRAPHY),
    safeArea: partial?.safeArea ?? clone(DEFAULT_SAFE_AREA),
    voiceTone: partial?.voiceTone ?? '',
    approvedMusicIds: partial?.approvedMusicIds ?? [],
    prohibitedElements: partial?.prohibitedElements ?? [],
    createdAt: now(),
    updatedAt: now(),
  };
  brandKitStore.set(kit.id, clone(kit));
  return clone(kit);
}

export function getBrandKit(id: string): BrandKit | null {
  const kit = brandKitStore.get(id);
  return kit ? clone(kit) : null;
}

export function listBrandKits(orgId: string): BrandKit[] {
  return Array.from(brandKitStore.values())
    .filter((kit) => kit.orgId === orgId)
    .map(clone);
}

export function updateBrandKit(
  id: string,
  patch: Partial<Omit<BrandKit, 'id' | 'orgId' | 'createdAt'>>,
): BrandKit {
  const existing = brandKitStore.get(id);
  if (!existing) {
    throw new Error(`BrandKit not found: ${id}`);
  }

  const updated: BrandKit = {
    ...existing,
    ...patch,
    id: existing.id,
    orgId: existing.orgId,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };
  brandKitStore.set(id, clone(updated));
  return clone(updated);
}

export function deleteBrandKit(id: string): void {
  if (!brandKitStore.has(id)) {
    throw new Error(`BrandKit not found: ${id}`);
  }
  brandKitStore.delete(id);
}

// ─── Font prioritization ────────────────────────────────────────────────────

/** Returns brand fonts ordered by typography role: heading > body > caption > extras. */
export function getPrioritizedFonts(kit: BrandKit): BrandFont[] {
  const roleOrder: BrandFont[] = [
    kit.typography.heading,
    kit.typography.body,
    kit.typography.caption,
  ];
  const roleSet = new Set(roleOrder.map((f) => `${f.family}-${f.weight}-${f.style}`));
  const extras = kit.fonts.filter(
    (f) => !roleSet.has(`${f.family}-${f.weight}-${f.style}`),
  );
  return [...roleOrder, ...extras];
}

// ─── Color palette helpers ──────────────────────────────────────────────────

/** Returns all brand colors (primary first, then secondary). */
export function getAllColors(kit: BrandKit): string[] {
  return [...kit.primaryColors, ...kit.secondaryColors];
}

/** Check whether a hex color is within the brand palette (case-insensitive). */
export function isColorOnBrand(kit: BrandKit, hex: string): boolean {
  const normalized = hex.toLowerCase().replace(/\s/g, '');
  return getAllColors(kit).some(
    (c) => c.toLowerCase().replace(/\s/g, '') === normalized,
  );
}

// ─── Logo placement rules ───────────────────────────────────────────────────

export interface LogoPlacementResult {
  valid: boolean;
  issues: string[];
}

/** Validate that a logo placement respects the brand's safe area rules. */
export function validateLogoPlacement(
  kit: BrandKit,
  logo: BrandLogoFile,
  placement: { x: number; y: number; width: number; height: number },
  canvasSize: { width: number; height: number },
): LogoPlacementResult {
  const issues: string[] = [];
  const sa = kit.safeArea;

  const safeLeft = (sa.left / 100) * canvasSize.width;
  const safeRight = canvasSize.width - (sa.right / 100) * canvasSize.width;
  const safeTop = (sa.top / 100) * canvasSize.height;
  const safeBottom = canvasSize.height - (sa.bottom / 100) * canvasSize.height;

  if (placement.x < safeLeft) {
    issues.push(`Logo left edge (${placement.x}px) is inside the safe area margin (${safeLeft.toFixed(0)}px).`);
  }
  if (placement.x + placement.width > safeRight) {
    issues.push(`Logo right edge exceeds safe area boundary.`);
  }
  if (placement.y < safeTop) {
    issues.push(`Logo top edge is inside the safe area margin.`);
  }
  if (placement.y + placement.height > safeBottom) {
    issues.push(`Logo bottom edge exceeds safe area boundary.`);
  }

  if (logo.minWidth && placement.width < logo.minWidth) {
    issues.push(`Logo width (${placement.width}px) is below minimum (${logo.minWidth}px).`);
  }
  if (logo.minHeight && placement.height < logo.minHeight) {
    issues.push(`Logo height (${placement.height}px) is below minimum (${logo.minHeight}px).`);
  }

  return { valid: issues.length === 0, issues };
}

// ─── Music & Prohibited Elements ─────────────────────────────────────────────

/** Check if a music asset ID is in the approved list. */
export function isMusicApproved(kit: BrandKit, musicId: string): boolean {
  return kit.approvedMusicIds.includes(musicId);
}

/** Check if a term matches any prohibited element (case-insensitive partial match). */
export function isProhibited(kit: BrandKit, term: string): boolean {
  const lower = term.toLowerCase();
  return kit.prohibitedElements.some(
    (el) => lower.includes(el.toLowerCase()) || el.toLowerCase().includes(lower),
  );
}

// ─── Seed data for demos ─────────────────────────────────────────────────────

export function seedDemoBrandKit(orgId: string): BrandKit {
  return createBrandKit(orgId, 'Acme Corp', {
    logoFiles: [
      {
        id: generateId(),
        name: 'Acme Primary Logo',
        url: '/assets/logos/acme-primary.svg',
        variant: 'primary',
        format: 'svg',
        minWidth: 80,
        minHeight: 40,
      },
      {
        id: generateId(),
        name: 'Acme Icon',
        url: '/assets/logos/acme-icon.svg',
        variant: 'icon',
        format: 'svg',
        minWidth: 24,
        minHeight: 24,
      },
    ],
    primaryColors: ['#1A1A2E', '#16213E', '#0F3460'],
    secondaryColors: ['#E94560', '#F5A623', '#FFFFFF'],
    fonts: [
      { family: 'Montserrat', weight: 700, style: 'normal' },
      { family: 'Montserrat', weight: 400, style: 'normal' },
      { family: 'Source Sans Pro', weight: 400, style: 'normal' },
    ],
    typography: {
      heading: { family: 'Montserrat', weight: 700, style: 'normal' },
      body: { family: 'Source Sans Pro', weight: 400, style: 'normal' },
      caption: { family: 'Source Sans Pro', weight: 400, style: 'italic' },
    },
    safeArea: { top: 10, right: 10, bottom: 15, left: 10 },
    voiceTone: 'Professional, confident, approachable. Avoid jargon. Speak directly to the viewer.',
    approvedMusicIds: ['music-001', 'music-002', 'music-003'],
    prohibitedElements: ['competitor-logo', 'profanity', 'political-content', 'tobacco'],
  });
}

// ─── Reset (for tests) ──────────────────────────────────────────────────────

export function _resetBrandKitStore(): void {
  brandKitStore.clear();
}
