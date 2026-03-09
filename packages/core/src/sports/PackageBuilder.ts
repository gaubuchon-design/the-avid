// ─── Sports Package Builder ───────────────────────────────────────────────────
// SP-08: Structured package workflows for Pre-Game, Half-Time, Post-Game,
// and Social Clip templates. Required elements checklist, auto-fill from
// bin search and StatsDataBridge, and one-click delivery to playout and social.

import type {
  SportsPackage,
  SportsPackageType,
  PackageElement,
  PackageRequirement,
  DeliveryTarget,
  SportsMetadata,
  SportsLeague,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Package Templates ────────────────────────────────────────────────────────

interface PackageTemplate {
  type: SportsPackageType;
  name: string;
  elements: Array<Omit<PackageElement, 'id'>>;
  requirements: Array<Omit<PackageRequirement, 'id' | 'isMet'>>;
  defaultDeliveryTargets: Array<Omit<DeliveryTarget, 'id' | 'status'>>;
}

const PRE_GAME_TEMPLATE: PackageTemplate = {
  type: 'PRE_GAME',
  name: 'Pre-Game Package',
  elements: [
    { type: 'GRAPHIC', label: 'Opening Title Card', duration: 3, sortOrder: 0, status: 'MISSING' },
    { type: 'CLIP', label: 'Stadium Atmosphere', duration: 8, sortOrder: 1, status: 'MISSING' },
    { type: 'GRAPHIC', label: 'Team Lineup Graphic', duration: 6, sortOrder: 2, status: 'MISSING' },
    { type: 'CLIP', label: 'Player Warm-Up ISO', duration: 12, sortOrder: 3, status: 'MISSING' },
    { type: 'STATS_CARD', label: 'Head-to-Head Stats', duration: 5, sortOrder: 4, status: 'MISSING' },
    { type: 'VOICEOVER', label: 'Presenter VO', duration: 20, sortOrder: 5, status: 'MISSING' },
    { type: 'AUDIO', label: 'Music Bed', duration: 30, sortOrder: 6, status: 'MISSING' },
    { type: 'GRAPHIC', label: 'Sponsor Bug', duration: 3, sortOrder: 7, status: 'MISSING' },
  ],
  requirements: [
    { label: 'Opening title with team names', elementType: 'GRAPHIC', autoFillQuery: 'title card' },
    { label: 'Stadium beauty shot', elementType: 'CLIP', autoFillQuery: 'stadium atmosphere beauty' },
    { label: 'Both team lineups', elementType: 'GRAPHIC', autoFillQuery: 'lineup' },
    { label: 'Pre-game presenter VO', elementType: 'VOICEOVER' },
    { label: 'Music bed (30s minimum)', elementType: 'AUDIO', autoFillQuery: 'music bed pre-game' },
    { label: 'Sponsor integration', elementType: 'GRAPHIC', autoFillQuery: 'sponsor' },
  ],
  defaultDeliveryTargets: [
    { name: 'Broadcast Playout', type: 'PLAYOUT', format: 'MXF OP-1a', resolution: { width: 1920, height: 1080 }, frameRate: 50, destination: '/playout/pre-game/' },
    { name: 'Social Media', type: 'SOCIAL', format: 'H.264 MP4', resolution: { width: 1080, height: 1920 }, frameRate: 30, destination: 'social-queue' },
  ],
};

const HALFTIME_TEMPLATE: PackageTemplate = {
  type: 'HALFTIME',
  name: 'Half-Time Package',
  elements: [
    { type: 'GRAPHIC', label: 'Score Bug Freeze', duration: 3, sortOrder: 0, status: 'MISSING' },
    { type: 'CLIP', label: 'First Half Highlights', duration: 45, sortOrder: 1, status: 'MISSING' },
    { type: 'STATS_CARD', label: 'First Half Stats', duration: 6, sortOrder: 2, status: 'MISSING' },
    { type: 'CLIP', label: 'Key Moment Replay', duration: 15, sortOrder: 3, status: 'MISSING' },
    { type: 'VOICEOVER', label: 'Analyst VO', duration: 30, sortOrder: 4, status: 'MISSING' },
    { type: 'AUDIO', label: 'Transition Music', duration: 5, sortOrder: 5, status: 'MISSING' },
    { type: 'GRAPHIC', label: 'Sponsor Bug', duration: 3, sortOrder: 6, status: 'MISSING' },
  ],
  requirements: [
    { label: 'Score display', elementType: 'GRAPHIC', autoFillQuery: 'score bug' },
    { label: 'First half highlight clips', elementType: 'CLIP', autoFillQuery: 'highlight first half' },
    { label: 'Key stats graphic', elementType: 'STATS_CARD', autoFillQuery: 'stats first half' },
    { label: 'Analyst commentary', elementType: 'VOICEOVER' },
  ],
  defaultDeliveryTargets: [
    { name: 'Broadcast Playout', type: 'PLAYOUT', format: 'MXF OP-1a', resolution: { width: 1920, height: 1080 }, frameRate: 50, destination: '/playout/halftime/' },
  ],
};

const POST_GAME_TEMPLATE: PackageTemplate = {
  type: 'POST_GAME',
  name: 'Post-Game Package',
  elements: [
    { type: 'GRAPHIC', label: 'Final Score Card', duration: 4, sortOrder: 0, status: 'MISSING' },
    { type: 'CLIP', label: 'Full Match Highlights', duration: 90, sortOrder: 1, status: 'MISSING' },
    { type: 'STATS_CARD', label: 'Match Statistics', duration: 8, sortOrder: 2, status: 'MISSING' },
    { type: 'CLIP', label: 'Player of the Match', duration: 12, sortOrder: 3, status: 'MISSING' },
    { type: 'CLIP', label: 'Post-Match Reactions', duration: 20, sortOrder: 4, status: 'MISSING' },
    { type: 'VOICEOVER', label: 'Post-Match Summary VO', duration: 45, sortOrder: 5, status: 'MISSING' },
    { type: 'AUDIO', label: 'Closing Music', duration: 10, sortOrder: 6, status: 'MISSING' },
    { type: 'GRAPHIC', label: 'Next Match Preview', duration: 5, sortOrder: 7, status: 'MISSING' },
    { type: 'GRAPHIC', label: 'End Sponsor Bug', duration: 3, sortOrder: 8, status: 'MISSING' },
  ],
  requirements: [
    { label: 'Final score graphic', elementType: 'GRAPHIC', autoFillQuery: 'final score' },
    { label: 'Match highlight package', elementType: 'CLIP', autoFillQuery: 'highlight goal' },
    { label: 'Full match stats', elementType: 'STATS_CARD', autoFillQuery: 'stats full match' },
    { label: 'Player of match segment', elementType: 'CLIP', autoFillQuery: 'player of the match' },
    { label: 'Post-match interview/reaction', elementType: 'CLIP', autoFillQuery: 'post-match reaction' },
    { label: 'Summary voiceover', elementType: 'VOICEOVER' },
  ],
  defaultDeliveryTargets: [
    { name: 'Broadcast Playout', type: 'PLAYOUT', format: 'MXF OP-1a', resolution: { width: 1920, height: 1080 }, frameRate: 50, destination: '/playout/post-game/' },
    { name: 'Web VOD', type: 'WEB', format: 'H.264 MP4', resolution: { width: 1920, height: 1080 }, frameRate: 25, destination: 'vod-ingest' },
    { name: 'Archive', type: 'ARCHIVE', format: 'ProRes 422 HQ', resolution: { width: 1920, height: 1080 }, frameRate: 50, destination: '/archive/' },
  ],
};

const SOCIAL_CLIP_TEMPLATE: PackageTemplate = {
  type: 'SOCIAL_CLIP',
  name: 'Social Media Clip',
  elements: [
    { type: 'CLIP', label: 'Key Moment', duration: 15, sortOrder: 0, status: 'MISSING' },
    { type: 'GRAPHIC', label: 'Score Overlay', duration: 3, sortOrder: 1, status: 'MISSING' },
    { type: 'AUDIO', label: 'Crowd Audio', duration: 15, sortOrder: 2, status: 'MISSING' },
    { type: 'GRAPHIC', label: 'Brand Watermark', duration: 15, sortOrder: 3, status: 'MISSING' },
  ],
  requirements: [
    { label: 'Highlight clip (15s max)', elementType: 'CLIP', autoFillQuery: 'highlight' },
    { label: 'Score overlay graphic', elementType: 'GRAPHIC', autoFillQuery: 'score overlay' },
    { label: 'Brand watermark', elementType: 'GRAPHIC', autoFillQuery: 'watermark' },
  ],
  defaultDeliveryTargets: [
    { name: 'Twitter/X', type: 'SOCIAL', format: 'H.264 MP4', resolution: { width: 1280, height: 720 }, frameRate: 30, bitrate: 5000, destination: 'x-queue' },
    { name: 'Instagram Reels', type: 'SOCIAL', format: 'H.264 MP4', resolution: { width: 1080, height: 1920 }, frameRate: 30, bitrate: 8000, destination: 'ig-reels-queue' },
    { name: 'TikTok', type: 'SOCIAL', format: 'H.264 MP4', resolution: { width: 1080, height: 1920 }, frameRate: 30, bitrate: 6000, destination: 'tiktok-queue' },
  ],
};

const PACKAGE_TEMPLATES: Record<SportsPackageType, PackageTemplate> = {
  PRE_GAME: PRE_GAME_TEMPLATE,
  HALFTIME: HALFTIME_TEMPLATE,
  POST_GAME: POST_GAME_TEMPLATE,
  SOCIAL_CLIP: SOCIAL_CLIP_TEMPLATE,
};

// ─── Events ───────────────────────────────────────────────────────────────────

export type PackageEvent =
  | { type: 'PACKAGE_CREATED'; pkg: SportsPackage }
  | { type: 'PACKAGE_UPDATED'; pkg: SportsPackage }
  | { type: 'ELEMENT_PLACED'; packageId: string; elementId: string }
  | { type: 'REQUIREMENT_MET'; packageId: string; requirementId: string }
  | { type: 'DELIVERY_STARTED'; packageId: string; targetId: string }
  | { type: 'DELIVERY_COMPLETE'; packageId: string; targetId: string }
  | { type: 'DELIVERY_FAILED'; packageId: string; targetId: string; error: string }
  | { type: 'ERROR'; error: string };

export type PackageListener = (event: PackageEvent) => void;

// ─── Package Builder ──────────────────────────────────────────────────────────

export class PackageBuilder {
  private packages: Map<string, SportsPackage> = new Map();
  private listeners: Set<PackageListener> = new Set();

  // ─── Package Lifecycle ──────────────────────────────────────────────────────

  /**
   * Create a new package from a template type.
   */
  createPackage(
    type: SportsPackageType,
    metadata: SportsMetadata,
    name?: string,
  ): SportsPackage {
    const template = PACKAGE_TEMPLATES[type];
    const now = new Date().toISOString();

    const pkg: SportsPackage = {
      id: createId('pkg'),
      name: name ?? `${template.name} - ${metadata.teams.join(' vs ')}`,
      type,
      league: metadata.league,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
      elements: template.elements.map((e) => ({
        ...e,
        id: createId('elem'),
      })),
      requiredElements: template.requirements.map((r) => ({
        ...r,
        id: createId('req'),
        isMet: false,
      })),
      deliveryTargets: template.defaultDeliveryTargets.map((t) => ({
        ...t,
        id: createId('target'),
        status: 'PENDING' as const,
      })),
      metadata,
    };

    this.packages.set(pkg.id, pkg);
    this.emit({ type: 'PACKAGE_CREATED', pkg });
    return pkg;
  }

  /**
   * Get all packages.
   */
  getAllPackages(): SportsPackage[] {
    return Array.from(this.packages.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  /**
   * Get packages by type.
   */
  getPackagesByType(type: SportsPackageType): SportsPackage[] {
    return this.getAllPackages().filter((p) => p.type === type);
  }

  /**
   * Get a single package.
   */
  getPackage(id: string): SportsPackage | null {
    return this.packages.get(id) ?? null;
  }

  /**
   * Delete a package.
   */
  deletePackage(id: string): void {
    this.packages.delete(id);
  }

  // ─── Element Management ─────────────────────────────────────────────────────

  /**
   * Place an element in the package (mark as filled with an asset).
   */
  placeElement(
    packageId: string,
    elementId: string,
    assetId: string,
    options: { clipId?: string; graphicTemplateId?: string; duration?: number } = {},
  ): boolean {
    const pkg = this.packages.get(packageId);
    if (!pkg) return false;

    const element = pkg.elements.find((e) => e.id === elementId);
    if (!element) return false;

    element.assetId = assetId;
    element.clipId = options.clipId;
    element.graphicTemplateId = options.graphicTemplateId;
    if (options.duration !== undefined) {
      element.duration = options.duration;
    }
    element.status = 'PLACED';
    pkg.updatedAt = new Date().toISOString();

    this.emit({ type: 'ELEMENT_PLACED', packageId, elementId });
    this.updateRequirements(pkg);
    this.updatePackageStatus(pkg);
    return true;
  }

  /**
   * Approve a placed element.
   */
  approveElement(packageId: string, elementId: string): boolean {
    const pkg = this.packages.get(packageId);
    if (!pkg) return false;

    const element = pkg.elements.find((e) => e.id === elementId);
    if (!element || element.status !== 'PLACED') return false;

    element.status = 'APPROVED';
    pkg.updatedAt = new Date().toISOString();
    this.updatePackageStatus(pkg);
    return true;
  }

  /**
   * Remove an element's asset (mark as missing again).
   */
  clearElement(packageId: string, elementId: string): boolean {
    const pkg = this.packages.get(packageId);
    if (!pkg) return false;

    const element = pkg.elements.find((e) => e.id === elementId);
    if (!element) return false;

    element.assetId = undefined;
    element.clipId = undefined;
    element.graphicTemplateId = undefined;
    element.status = 'MISSING';
    pkg.updatedAt = new Date().toISOString();
    this.updateRequirements(pkg);
    this.updatePackageStatus(pkg);
    return true;
  }

  /**
   * Get the completion percentage of a package.
   */
  getCompletionPercent(packageId: string): number {
    const pkg = this.packages.get(packageId);
    if (!pkg) return 0;
    const placed = pkg.elements.filter((e) => e.status !== 'MISSING').length;
    return Math.round((placed / pkg.elements.length) * 100);
  }

  /**
   * Get unmet requirements for a package.
   */
  getUnmetRequirements(packageId: string): PackageRequirement[] {
    const pkg = this.packages.get(packageId);
    if (!pkg) return [];
    return pkg.requiredElements.filter((r) => !r.isMet);
  }

  /**
   * Auto-fill queries for missing elements.
   * Returns a list of search queries that can be used to find matching assets.
   */
  getAutoFillQueries(packageId: string): Array<{ elementId: string; query: string }> {
    const pkg = this.packages.get(packageId);
    if (!pkg) return [];

    return pkg.requiredElements
      .filter((r) => !r.isMet && r.autoFillQuery)
      .map((r) => ({
        elementId: r.id,
        query: r.autoFillQuery!,
      }));
  }

  // ─── Delivery ───────────────────────────────────────────────────────────────

  /**
   * Calculate the total duration of a package.
   */
  getPackageDuration(packageId: string): number {
    const pkg = this.packages.get(packageId);
    if (!pkg) return 0;
    return pkg.elements
      .filter((e) => e.status !== 'MISSING')
      .reduce((total, e) => total + e.duration, 0);
  }

  /**
   * Start delivery to a specific target.
   */
  async startDelivery(packageId: string, targetId: string): Promise<void> {
    const pkg = this.packages.get(packageId);
    if (!pkg) throw new Error('Package not found');

    const target = pkg.deliveryTargets.find((t) => t.id === targetId);
    if (!target) throw new Error('Delivery target not found');

    target.status = 'QUEUED';
    this.emit({ type: 'DELIVERY_STARTED', packageId, targetId });

    // In production, this would queue a render/export job.
    // Simulate delivery completion.
    target.status = 'DELIVERING';

    // Simulate async delivery
    setTimeout(() => {
      target.status = 'DELIVERED';
      this.emit({ type: 'DELIVERY_COMPLETE', packageId, targetId });
    }, 2000);
  }

  /**
   * Deliver to all configured targets (one-click delivery).
   */
  async deliverAll(packageId: string): Promise<void> {
    const pkg = this.packages.get(packageId);
    if (!pkg) throw new Error('Package not found');

    const promises = pkg.deliveryTargets.map((target) =>
      this.startDelivery(packageId, target.id).catch((error) => {
        const message = error instanceof Error ? error.message : 'Delivery failed';
        this.emit({ type: 'DELIVERY_FAILED', packageId, targetId: target.id, error: message });
      }),
    );

    await Promise.allSettled(promises);
  }

  /**
   * Add a custom delivery target to a package.
   */
  addDeliveryTarget(
    packageId: string,
    target: Omit<DeliveryTarget, 'id' | 'status'>,
  ): string | null {
    const pkg = this.packages.get(packageId);
    if (!pkg) return null;

    const id = createId('target');
    pkg.deliveryTargets.push({ ...target, id, status: 'PENDING' });
    return id;
  }

  /**
   * Get available package template types with metadata.
   */
  getAvailableTemplates(): Array<{
    type: SportsPackageType;
    name: string;
    elementCount: number;
    requirementCount: number;
  }> {
    return (Object.entries(PACKAGE_TEMPLATES) as Array<[SportsPackageType, PackageTemplate]>).map(
      ([type, template]) => ({
        type,
        name: template.name,
        elementCount: template.elements.length,
        requirementCount: template.requirements.length,
      }),
    );
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  on(listener: PackageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: PackageListener): void {
    this.listeners.delete(listener);
  }

  destroy(): void {
    this.packages.clear();
    this.listeners.clear();
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private emit(event: PackageEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors
      }
    }
  }

  private updateRequirements(pkg: SportsPackage): void {
    for (const req of pkg.requiredElements) {
      const matchingElements = pkg.elements.filter((e) => e.type === req.elementType);
      req.isMet = matchingElements.some((e) => e.status !== 'MISSING');

      if (req.isMet) {
        this.emit({ type: 'REQUIREMENT_MET', packageId: pkg.id, requirementId: req.id });
      }
    }
  }

  private updatePackageStatus(pkg: SportsPackage): void {
    const allPlaced = pkg.elements.every((e) => e.status !== 'MISSING');
    const allApproved = pkg.elements.every((e) => e.status === 'APPROVED');
    const anyDelivered = pkg.deliveryTargets.some((t) => t.status === 'DELIVERED');

    if (anyDelivered) {
      pkg.status = 'DELIVERED';
    } else if (allApproved) {
      pkg.status = 'APPROVED';
    } else if (allPlaced) {
      pkg.status = 'REVIEW';
    } else if (pkg.elements.some((e) => e.status !== 'MISSING')) {
      pkg.status = 'IN_PROGRESS';
    } else {
      pkg.status = 'DRAFT';
    }

    this.emit({ type: 'PACKAGE_UPDATED', pkg });
  }
}

/**
 * Create a pre-configured PackageBuilder.
 */
export function createPackageBuilder(): PackageBuilder {
  return new PackageBuilder();
}
