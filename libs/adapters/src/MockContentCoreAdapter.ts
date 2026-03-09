/**
 * @fileoverview In-memory mock of {@link IContentCoreAdapter}.
 *
 * Seeds a catalogue of ~10 fake archive assets with metadata, rights info,
 * and usage records.  `semanticSearch` performs naive text matching against
 * asset names, descriptions, and tags.
 */

import type {
  ArchiveResult,
  HydrationLevel,
  MediaRef,
  RightsInfo,
  RightsStatus,
  SemanticQuery,
  UsageRecord,
} from './contracts-types';
import type { IContentCoreAdapter } from './IContentCoreAdapter';
import { NotFoundError } from './AdapterError';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoNow(): string {
  return new Date().toISOString();
}

/** Naive relevance score: fraction of query words that appear in the text. */
function textRelevance(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Count words and hits inline to avoid creating intermediate arrays
  let wordCount = 0;
  let hits = 0;
  let start = 0;
  const len = lowerQuery.length;

  while (start < len) {
    // Skip whitespace
    while (start < len && lowerQuery.charCodeAt(start) <= 32) start++;
    if (start >= len) break;

    // Find end of word
    let end = start;
    while (end < len && lowerQuery.charCodeAt(end) > 32) end++;

    wordCount++;
    if (lowerText.includes(lowerQuery.slice(start, end))) {
      hits++;
    }
    start = end;
  }

  return wordCount === 0 ? 0 : hits / wordCount;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function seedAssets(): ArchiveResult[] {
  const now = '2025-11-15T12:00:00Z';

  const makeRef = (
    id: string,
    name: string,
    mime: string,
    dur: number,
  ): MediaRef => ({
    id,
    name,
    mimeType: mime,
    duration: dur,
    uri: `/archive/${id}.mxf`,
  });

  const makeRights = (
    holder: string,
    status: RightsStatus,
    territory: string[] = ['worldwide'],
  ): { rights: RightsInfo; rightsStatus: RightsStatus } => ({
    rights: {
      holder,
      licenseType: status === 'cleared' ? 'royalty-free' : 'rights-managed',
      territory,
      validFrom: '2025-01-01T00:00:00Z',
      validTo: '2026-12-31T23:59:59Z',
      restrictions:
        status === 'restricted' ? ['no-social-media'] : [],
    },
    rightsStatus: status,
  });

  return [
    {
      id: 'arc_001',
      name: 'Interview - Sarah Chen (Wide)',
      description:
        'Wide shot interview with Dr. Sarah Chen discussing AI in journalism.',
      mediaRef: makeRef(
        'arc_001',
        'Interview - Sarah Chen (Wide)',
        'video/mxf',
        342,
      ),
      ...makeRights('NewsOrg Inc.', 'cleared'),
      tags: ['interview', 'sarah-chen', 'AI', 'journalism', 'wide-shot'],
      createdAt: '2025-10-20T09:00:00Z',
      updatedAt: now,
      metadata: { camera: 'Sony FX9', codec: 'XAVC-I', resolution: '4K' },
    },
    {
      id: 'arc_002',
      name: 'Interview - Sarah Chen (Close-up)',
      description:
        'Close-up reaction shots of Dr. Sarah Chen.',
      mediaRef: makeRef(
        'arc_002',
        'Interview - Sarah Chen (Close-up)',
        'video/mxf',
        342,
      ),
      ...makeRights('NewsOrg Inc.', 'cleared'),
      tags: ['interview', 'sarah-chen', 'close-up', 'reaction'],
      createdAt: '2025-10-20T09:00:00Z',
      updatedAt: now,
      metadata: { camera: 'Sony FX9', codec: 'XAVC-I', resolution: '4K' },
    },
    {
      id: 'arc_003',
      name: 'Interview - Marcus Rivera',
      description:
        'Marcus Rivera explains new broadcast automation workflows.',
      mediaRef: makeRef(
        'arc_003',
        'Interview - Marcus Rivera',
        'video/mxf',
        280,
      ),
      ...makeRights('NewsOrg Inc.', 'cleared'),
      tags: ['interview', 'marcus-rivera', 'automation', 'broadcast'],
      createdAt: '2025-10-22T14:30:00Z',
      updatedAt: now,
      metadata: { camera: 'Canon C300 III', codec: 'XF-AVC', resolution: '4K' },
    },
    {
      id: 'arc_004',
      name: 'B-Roll - City Skyline Timelapse',
      description:
        'Golden-hour timelapse of the downtown skyline, drones and ground level.',
      mediaRef: makeRef(
        'arc_004',
        'B-Roll - City Skyline Timelapse',
        'video/mxf',
        60,
      ),
      ...makeRights('Stock Footage Co.', 'cleared'),
      tags: ['b-roll', 'city', 'skyline', 'timelapse', 'golden-hour'],
      createdAt: '2025-09-15T18:00:00Z',
      updatedAt: now,
      metadata: { camera: 'DJI Inspire 3', codec: 'ProRes 422 HQ', resolution: '4K' },
    },
    {
      id: 'arc_005',
      name: 'B-Roll - Newsroom Operations',
      description:
        'Wide and medium shots of the newsroom floor during a live broadcast.',
      mediaRef: makeRef(
        'arc_005',
        'B-Roll - Newsroom Operations',
        'video/mxf',
        120,
      ),
      ...makeRights('NewsOrg Inc.', 'cleared'),
      tags: ['b-roll', 'newsroom', 'operations', 'live-broadcast'],
      createdAt: '2025-10-01T08:00:00Z',
      updatedAt: now,
      metadata: { camera: 'Sony FX6', codec: 'XAVC-I', resolution: 'HD' },
    },
    {
      id: 'arc_006',
      name: 'B-Roll - Server Room',
      description:
        'Close-ups of blinking servers, cable runs, and cooling systems.',
      mediaRef: makeRef(
        'arc_006',
        'B-Roll - Server Room',
        'video/mxf',
        45,
      ),
      ...makeRights('TechVault Media', 'restricted', ['US', 'EU']),
      tags: ['b-roll', 'server', 'technology', 'data-center'],
      createdAt: '2025-08-10T11:00:00Z',
      updatedAt: now,
      metadata: { camera: 'RED Komodo', codec: 'REDCODE RAW', resolution: '6K' },
    },
    {
      id: 'arc_007',
      name: 'Music - Ambient Underscore',
      description:
        'Gentle ambient music bed, useful for interview underscoring.',
      mediaRef: makeRef(
        'arc_007',
        'Music - Ambient Underscore',
        'audio/wav',
        180,
      ),
      ...makeRights('Audio Network', 'cleared'),
      tags: ['music', 'ambient', 'underscore', 'interview'],
      createdAt: '2025-07-01T00:00:00Z',
      updatedAt: now,
      metadata: { sampleRate: 48000, bitDepth: 24, channels: 2 },
    },
    {
      id: 'arc_008',
      name: 'Music - Upbeat Opener',
      description:
        'Energetic opening theme with drums and synths.',
      mediaRef: makeRef(
        'arc_008',
        'Music - Upbeat Opener',
        'audio/wav',
        30,
      ),
      ...makeRights('Audio Network', 'cleared'),
      tags: ['music', 'upbeat', 'opener', 'energetic', 'theme'],
      createdAt: '2025-07-01T00:00:00Z',
      updatedAt: now,
      metadata: { sampleRate: 48000, bitDepth: 24, channels: 2 },
    },
    {
      id: 'arc_009',
      name: 'GFX - Lower Third Template',
      description:
        'Animated lower-third graphic template with customisable name and title fields.',
      mediaRef: makeRef(
        'arc_009',
        'GFX - Lower Third Template',
        'image/png',
        NaN,
      ),
      ...makeRights('NewsOrg Inc.', 'cleared'),
      tags: ['graphics', 'lower-third', 'template', 'animated'],
      createdAt: '2025-06-15T10:00:00Z',
      updatedAt: now,
      metadata: { resolution: '1920x1080', hasAlpha: true },
    },
    {
      id: 'arc_010',
      name: 'Archival - 2019 Conference Keynote',
      description:
        'Keynote presentation from the 2019 Media Technology Summit.',
      mediaRef: makeRef(
        'arc_010',
        'Archival - 2019 Conference Keynote',
        'video/mxf',
        3600,
      ),
      ...makeRights('Conference Org', 'expired'),
      tags: ['archival', 'conference', 'keynote', '2019', 'media-tech'],
      createdAt: '2019-05-20T09:00:00Z',
      updatedAt: '2019-05-20T09:00:00Z',
      metadata: { camera: 'Panasonic EVA1', codec: 'AVC-Intra', resolution: 'HD' },
    },
  ];
}

function seedUsageRecords(): Map<string, UsageRecord[]> {
  const map = new Map<string, UsageRecord[]>();

  map.set('arc_001', [
    {
      assetId: 'arc_001',
      sequenceId: 'seq_main_001',
      sequenceName: 'Main Assembly',
      usedAt: '2025-11-10T14:00:00Z',
      usedBy: 'editor_jdoe',
    },
    {
      assetId: 'arc_001',
      sequenceId: 'seq_rough_002',
      sequenceName: 'Rough Cut v2',
      usedAt: '2025-11-08T11:30:00Z',
      usedBy: 'editor_asmith',
    },
  ]);

  map.set('arc_004', [
    {
      assetId: 'arc_004',
      sequenceId: 'seq_main_001',
      sequenceName: 'Main Assembly',
      usedAt: '2025-11-12T16:45:00Z',
      usedBy: 'editor_jdoe',
    },
  ]);

  return map;
}

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

/**
 * In-memory mock of {@link IContentCoreAdapter}.
 *
 * Seeds ~10 fake archive assets with realistic metadata, rights, and tags.
 * Text search is a simple substring / word-match scorer.
 */
export class MockContentCoreAdapter implements IContentCoreAdapter {
  private readonly assets: Map<string, ArchiveResult>;
  private readonly usageRecords: Map<string, UsageRecord[]>;
  private readonly availability: Map<string, boolean>;
  /** Pre-computed lowercase search corpus per asset to avoid rebuilding on every query. */
  private readonly searchCorpus: Map<string, string>;

  constructor() {
    const list = seedAssets();
    this.assets = new Map(list.map((a) => [a.id, a]));
    this.usageRecords = seedUsageRecords();

    // All assets online except the archival one
    this.availability = new Map(list.map((a) => [a.id, true]));
    this.availability.set('arc_010', false); // nearline / tape

    // Pre-compute search corpus for each asset (lowercased, joined once)
    this.searchCorpus = new Map(
      list.map((a) => [
        a.id,
        [a.name, a.description ?? '', a.tags.join(' '), JSON.stringify(a.metadata)].join(' ').toLowerCase(),
      ]),
    );
  }

  // -----------------------------------------------------------------------
  // IContentCoreAdapter
  // -----------------------------------------------------------------------

  async searchMetadata(
    query: string,
    filters?: Record<string, unknown>,
  ): Promise<ArchiveResult[]> {
    const results: Array<{ asset: ArchiveResult; score: number }> = [];

    for (const asset of this.assets.values()) {
      const corpus = this.searchCorpus.get(asset.id) ?? '';

      const score = textRelevance(corpus, query);
      if (score > 0) {
        // Apply optional filters
        if (filters) {
          let pass = true;
          for (const [key, value] of Object.entries(filters)) {
            const meta = asset.metadata[key];
            if (meta !== undefined && meta !== value) {
              pass = false;
              break;
            }
          }
          if (!pass) continue;
        }
        results.push({ asset, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .map((r) => ({ ...r.asset }));
  }

  async semanticSearch(query: SemanticQuery): Promise<ArchiveResult[]> {
    // Semantic search approximated as text relevance in the mock
    const results: Array<{ asset: ArchiveResult; score: number }> = [];

    for (const asset of this.assets.values()) {
      // Optional modality filter
      if (query.modalities && query.modalities.length > 0) {
        const mime = asset.mediaRef.mimeType;
        const assetModality = mime.startsWith('video')
          ? 'video'
          : mime.startsWith('audio')
            ? 'audio'
            : mime.startsWith('image')
              ? 'image'
              : 'text';
        if (!query.modalities.includes(assetModality as never)) continue;
      }

      const corpus = [
        asset.name,
        asset.description ?? '',
        asset.tags.join(' '),
      ].join(' ');

      const score = textRelevance(corpus, query.text);
      const threshold = query.threshold ?? 0.1;
      if (score >= threshold) {
        results.push({ asset, score });
      }
    }

    const limit = query.limit ?? 20;
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => ({ ...r.asset }));
  }

  async getAssetDetail(
    assetId: string,
    _hydrationLevel?: HydrationLevel,
  ): Promise<ArchiveResult> {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new NotFoundError('content-core', 'Asset', assetId);
    }
    return { ...asset };
  }

  async getRightsStatus(assetId: string): Promise<RightsStatus> {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new NotFoundError('content-core', 'Asset', assetId);
    }
    return asset.rightsStatus;
  }

  async getUsageHistory(assetId: string): Promise<UsageRecord[]> {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new NotFoundError('content-core', 'Asset', assetId);
    }
    const records = this.usageRecords.get(assetId) ?? [];
    return records.map((r) => ({ ...r }));
  }

  async checkAvailability(
    assetIds: string[],
  ): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    for (const id of assetIds) {
      result.set(id, this.availability.get(id) ?? false);
    }
    return result;
  }
}
