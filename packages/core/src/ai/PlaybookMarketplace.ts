// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Playbook Marketplace (AI-03)
//  Saved multi-step agentic workflows ("playbooks") that can be shared,
//  browsed by vertical, rated by the community, with revenue share.
// ═══════════════════════════════════════════════════════════════════════════

import type { AgentVertical } from './VerticalAgentRegistry';

// ─── Types ─────────────────────────────────────────────────────────────────

export type PlaybookStatus = 'draft' | 'published' | 'archived' | 'review';
export type PlaybookStepType = 'tool-call' | 'condition' | 'loop' | 'prompt' | 'wait-for-user';

export interface PlaybookStep {
  id: string;
  order: number;
  type: PlaybookStepType;
  name: string;
  description: string;
  toolName?: string;
  toolParameters?: Record<string, unknown>;
  condition?: string; // For conditional steps
  loopCount?: number; // For loop steps
  promptTemplate?: string; // For prompt steps
  onSuccess?: string; // Step ID to jump to on success
  onFailure?: string; // Step ID to jump to on failure
  tokenCost: number;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  vertical: AgentVertical;
  authorId: string;
  authorName: string;
  steps: PlaybookStep[];
  totalTokenCost: number;
  status: PlaybookStatus;
  version: string;
  tags: string[];
  icon: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface PlaybookRating {
  id: string;
  playbookId: string;
  userId: string;
  rating: number; // 1-5
  review: string;
  createdAt: string;
}

export interface PlaybookStats {
  playbookId: string;
  averageRating: number;
  totalRatings: number;
  totalRuns: number;
  successRate: number; // 0-1
  averageRunTimeSeconds: number;
  totalRevenue: number;
}

export interface PlaybookRunResult {
  id: string;
  playbookId: string;
  userId: string;
  status: 'success' | 'failure' | 'partial' | 'cancelled';
  stepsCompleted: number;
  totalSteps: number;
  tokensUsed: number;
  durationSeconds: number;
  error?: string;
  startedAt: string;
  completedAt: string;
}

export interface PlaybookListingFilter {
  vertical?: AgentVertical;
  tags?: string[];
  minRating?: number;
  maxTokenCost?: number;
  sortBy?: 'rating' | 'runs' | 'newest' | 'cost';
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export interface PlaybookRevenue {
  playbookId: string;
  authorId: string;
  totalEarned: number;
  creatorShare: number; // 70%
  platformShare: number; // 30%
  runCount: number;
  periodStart: string;
  periodEnd: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CREATOR_REVENUE_SHARE = 0.70;
const PLATFORM_REVENUE_SHARE = 0.30;
const TOKEN_TO_REVENUE_RATE = 0.001; // $0.001 per token

// ─── Marketplace ───────────────────────────────────────────────────────────

export class PlaybookMarketplace {
  private playbooks: Map<string, Playbook> = new Map();
  private ratings: Map<string, PlaybookRating[]> = new Map();
  private stats: Map<string, PlaybookStats> = new Map();
  private runs: PlaybookRunResult[] = [];

  constructor() {
    this.seedDefaultPlaybooks();
  }

  // ─── Browse & Search ───────────────────────────────────────────────

  /**
   * Lists playbooks with filtering and sorting.
   */
  listPlaybooks(filter?: PlaybookListingFilter): Playbook[] {
    let results = Array.from(this.playbooks.values())
      .filter((p) => p.status === 'published');

    if (filter?.vertical) {
      results = results.filter((p) => p.vertical === filter.vertical);
    }

    if (filter?.tags && filter.tags.length > 0) {
      results = results.filter((p) =>
        filter.tags!.some((tag) => p.tags.includes(tag)),
      );
    }

    if (filter?.minRating) {
      results = results.filter((p) => {
        const playbookStats = this.stats.get(p.id);
        return playbookStats && playbookStats.averageRating >= filter.minRating!;
      });
    }

    if (filter?.maxTokenCost) {
      results = results.filter((p) => p.totalTokenCost <= filter.maxTokenCost!);
    }

    if (filter?.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      results = results.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some((t) => t.toLowerCase().includes(query)),
      );
    }

    // Sort
    const sortBy = filter?.sortBy ?? 'rating';
    results.sort((a, b) => {
      switch (sortBy) {
        case 'rating': {
          const ratingA = this.stats.get(a.id)?.averageRating ?? 0;
          const ratingB = this.stats.get(b.id)?.averageRating ?? 0;
          return ratingB - ratingA;
        }
        case 'runs': {
          const runsA = this.stats.get(a.id)?.totalRuns ?? 0;
          const runsB = this.stats.get(b.id)?.totalRuns ?? 0;
          return runsB - runsA;
        }
        case 'newest':
          return (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);
        case 'cost':
          return a.totalTokenCost - b.totalTokenCost;
        default:
          return 0;
      }
    });

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    return results.slice(offset, offset + limit);
  }

  /**
   * Gets a specific playbook by ID.
   */
  getPlaybook(playbookId: string): Playbook | null {
    return this.playbooks.get(playbookId) ?? null;
  }

  /**
   * Gets stats for a playbook.
   */
  getPlaybookStats(playbookId: string): PlaybookStats | null {
    return this.stats.get(playbookId) ?? null;
  }

  /**
   * Gets ratings for a playbook.
   */
  getPlaybookRatings(playbookId: string): PlaybookRating[] {
    return this.ratings.get(playbookId) ?? [];
  }

  // ─── Create & Manage ───────────────────────────────────────────────

  /**
   * Creates a new playbook (starts as draft).
   */
  createPlaybook(
    playbook: Omit<Playbook, 'id' | 'status' | 'totalTokenCost' | 'createdAt' | 'updatedAt' | 'publishedAt'>,
  ): Playbook {
    const newPlaybook: Playbook = {
      ...playbook,
      id: `playbook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status: 'draft',
      totalTokenCost: playbook.steps.reduce((sum, s) => sum + s.tokenCost, 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: null,
    };

    this.playbooks.set(newPlaybook.id, newPlaybook);
    this.initStats(newPlaybook.id);
    return newPlaybook;
  }

  /**
   * Updates a playbook.
   */
  updatePlaybook(playbookId: string, update: Partial<Playbook>): Playbook | null {
    const existing = this.playbooks.get(playbookId);
    if (!existing) return null;

    Object.assign(existing, update, {
      updatedAt: new Date().toISOString(),
      totalTokenCost: (update.steps ?? existing.steps).reduce((sum, s) => sum + s.tokenCost, 0),
    });

    return existing;
  }

  /**
   * Publishes a draft playbook to the marketplace.
   */
  publishPlaybook(playbookId: string): boolean {
    const playbook = this.playbooks.get(playbookId);
    if (!playbook || playbook.status !== 'draft') return false;

    playbook.status = 'published';
    playbook.publishedAt = new Date().toISOString();
    playbook.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Archives a published playbook.
   */
  archivePlaybook(playbookId: string): boolean {
    const playbook = this.playbooks.get(playbookId);
    if (!playbook) return false;

    playbook.status = 'archived';
    playbook.updatedAt = new Date().toISOString();
    return true;
  }

  // ─── Rating & Reviews ──────────────────────────────────────────────

  /**
   * Submits a rating for a playbook.
   */
  ratePlaybook(playbookId: string, userId: string, rating: number, review: string): PlaybookRating | null {
    if (rating < 1 || rating > 5) return null;
    if (!this.playbooks.has(playbookId)) return null;

    const ratingEntry: PlaybookRating = {
      id: `rating-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      playbookId,
      userId,
      rating,
      review,
      createdAt: new Date().toISOString(),
    };

    if (!this.ratings.has(playbookId)) {
      this.ratings.set(playbookId, []);
    }
    this.ratings.get(playbookId)!.push(ratingEntry);
    this.updateStats(playbookId);

    return ratingEntry;
  }

  // ─── Run Tracking ──────────────────────────────────────────────────

  /**
   * Records a playbook run result.
   */
  recordRun(result: Omit<PlaybookRunResult, 'id'>): PlaybookRunResult {
    const run: PlaybookRunResult = {
      ...result,
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };

    this.runs.push(run);
    this.updateStats(result.playbookId);
    return run;
  }

  /**
   * Gets run history for a playbook.
   */
  getRunHistory(playbookId: string, limit = 50): PlaybookRunResult[] {
    return this.runs
      .filter((r) => r.playbookId === playbookId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  // ─── Revenue ───────────────────────────────────────────────────────

  /**
   * Calculates revenue for a playbook author.
   */
  calculateRevenue(playbookId: string): PlaybookRevenue | null {
    const playbook = this.playbooks.get(playbookId);
    if (!playbook) return null;

    const playbookRuns = this.runs.filter(
      (r) => r.playbookId === playbookId && r.status === 'success',
    );

    const totalTokens = playbookRuns.reduce((sum, r) => sum + r.tokensUsed, 0);
    const totalEarned = totalTokens * TOKEN_TO_REVENUE_RATE;

    return {
      playbookId,
      authorId: playbook.authorId,
      totalEarned,
      creatorShare: totalEarned * CREATOR_REVENUE_SHARE,
      platformShare: totalEarned * PLATFORM_REVENUE_SHARE,
      runCount: playbookRuns.length,
      periodStart: playbookRuns[0]?.startedAt ?? new Date().toISOString(),
      periodEnd: new Date().toISOString(),
    };
  }

  /**
   * Gets revenue summary for an author across all their playbooks.
   */
  getAuthorRevenue(authorId: string): PlaybookRevenue[] {
    const authorPlaybooks = Array.from(this.playbooks.values())
      .filter((p) => p.authorId === authorId);

    return authorPlaybooks
      .map((p) => this.calculateRevenue(p.id))
      .filter((r): r is PlaybookRevenue => r !== null);
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private initStats(playbookId: string): void {
    this.stats.set(playbookId, {
      playbookId,
      averageRating: 0,
      totalRatings: 0,
      totalRuns: 0,
      successRate: 0,
      averageRunTimeSeconds: 0,
      totalRevenue: 0,
    });
  }

  private updateStats(playbookId: string): void {
    const playbookRatings = this.ratings.get(playbookId) ?? [];
    const playbookRuns = this.runs.filter((r) => r.playbookId === playbookId);
    const successfulRuns = playbookRuns.filter((r) => r.status === 'success');

    const avgRating = playbookRatings.length > 0
      ? playbookRatings.reduce((sum, r) => sum + r.rating, 0) / playbookRatings.length
      : 0;

    const avgRunTime = successfulRuns.length > 0
      ? successfulRuns.reduce((sum, r) => sum + r.durationSeconds, 0) / successfulRuns.length
      : 0;

    const totalTokens = successfulRuns.reduce((sum, r) => sum + r.tokensUsed, 0);

    this.stats.set(playbookId, {
      playbookId,
      averageRating: Math.round(avgRating * 10) / 10,
      totalRatings: playbookRatings.length,
      totalRuns: playbookRuns.length,
      successRate: playbookRuns.length > 0 ? successfulRuns.length / playbookRuns.length : 0,
      averageRunTimeSeconds: Math.round(avgRunTime),
      totalRevenue: totalTokens * TOKEN_TO_REVENUE_RATE,
    });
  }

  private seedDefaultPlaybooks(): void {
    const seedPlaybooks: Array<Omit<Playbook, 'id' | 'status' | 'totalTokenCost' | 'createdAt' | 'updatedAt' | 'publishedAt'>> = [
      {
        name: 'Quick Rough Cut',
        description: 'Assembles a rough cut from selects using scene detection and transcript analysis.',
        vertical: 'film',
        authorId: 'avid-team',
        authorName: 'The Avid Team',
        steps: [
          { id: 's1', order: 1, type: 'tool-call', name: 'Detect Scenes', description: 'Analyze footage for scene boundaries', toolName: 'detect_scenes', toolParameters: { sensitivity: 0.6 }, tokenCost: 10 },
          { id: 's2', order: 2, type: 'tool-call', name: 'Search Best Takes', description: 'Find strongest performances per scene', toolName: 'search_transcript', toolParameters: {}, tokenCost: 8 },
          { id: 's3', order: 3, type: 'prompt', name: 'Assemble Order', description: 'AI determines assembly order', promptTemplate: 'Given the detected scenes and best takes, create an assembly order for the rough cut.', tokenCost: 15 },
          { id: 's4', order: 4, type: 'tool-call', name: 'Place Clips', description: 'Place selected clips on timeline', toolName: 'move_clip', tokenCost: 5 },
        ],
        version: '1.0.0',
        tags: ['rough-cut', 'assembly', 'ai-driven'],
        icon: 'clapperboard',
        color: '#4f63f5',
      },
      {
        name: 'Podcast Clean & Master',
        description: 'Removes verbal tics, levels speakers, adds chapters, and masters for distribution.',
        vertical: 'podcast',
        authorId: 'avid-team',
        authorName: 'The Avid Team',
        steps: [
          { id: 's1', order: 1, type: 'tool-call', name: 'Remove Filler Words', description: 'Clean verbal tics and filler', toolName: 'remove_verbal_tics', toolParameters: { aggressiveness: 0.6 }, tokenCost: 10 },
          { id: 's2', order: 2, type: 'tool-call', name: 'Level Speakers', description: 'Match speaker volumes', toolName: 'level_speakers', toolParameters: { targetLufs: -16 }, tokenCost: 8 },
          { id: 's3', order: 3, type: 'tool-call', name: 'Remove Silence', description: 'Trim excessive silences', toolName: 'remove_silence', toolParameters: { thresholdDb: -40, minDuration: 1.5 }, tokenCost: 8 },
          { id: 's4', order: 4, type: 'tool-call', name: 'Create Chapters', description: 'Auto-generate chapter markers', toolName: 'create_chapters', tokenCost: 8 },
          { id: 's5', order: 5, type: 'tool-call', name: 'Master Audio', description: 'Master for distribution', toolName: 'master_for_platform', toolParameters: { platform: 'spotify' }, tokenCost: 10 },
        ],
        version: '1.0.0',
        tags: ['podcast', 'cleanup', 'mastering', 'ai-driven'],
        icon: 'mic',
        color: '#7c5cfc',
      },
      {
        name: 'Social Cutdown Pack',
        description: 'Creates cutdowns for Instagram, TikTok, and YouTube from a master commercial edit.',
        vertical: 'commercial',
        authorId: 'avid-team',
        authorName: 'The Avid Team',
        steps: [
          { id: 's1', order: 1, type: 'tool-call', name: 'Analyze Hook', description: 'Find the strongest opening hook', toolName: 'optimize_hook', toolParameters: { maxDuration: 3 }, tokenCost: 10 },
          { id: 's2', order: 2, type: 'tool-call', name: 'Create 15s Cut', description: 'Create 15-second version', toolName: 'create_cutdown', toolParameters: { targetDuration: 15, platform: 'instagram' }, tokenCost: 15 },
          { id: 's3', order: 3, type: 'tool-call', name: 'Create 30s Cut', description: 'Create 30-second version', toolName: 'create_cutdown', toolParameters: { targetDuration: 30, platform: 'tiktok' }, tokenCost: 15 },
          { id: 's4', order: 4, type: 'tool-call', name: 'Adapt Vertical', description: 'Reframe for 9:16', toolName: 'adapt_aspect_ratio', toolParameters: { targetRatio: '9:16' }, tokenCost: 12 },
          { id: 's5', order: 5, type: 'tool-call', name: 'Batch Export', description: 'Export all formats', toolName: 'batch_export_social', toolParameters: { platforms: ['instagram', 'tiktok', 'youtube'] }, tokenCost: 20 },
        ],
        version: '1.0.0',
        tags: ['social', 'cutdowns', 'commercial', 'batch-export'],
        icon: 'tv',
        color: '#25a865',
      },
    ];

    for (const playbook of seedPlaybooks) {
      const created = this.createPlaybook(playbook);
      this.publishPlaybook(created.id);

      // Add some demo ratings
      this.ratePlaybook(created.id, 'user-1', 5, 'Excellent workflow, saved me hours.');
      this.ratePlaybook(created.id, 'user-2', 4, 'Works well, would love more customization.');
    }
  }

  dispose(): void {
    this.playbooks.clear();
    this.ratings.clear();
    this.stats.clear();
    this.runs = [];
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createPlaybookMarketplace(): PlaybookMarketplace {
  return new PlaybookMarketplace();
}
