// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Stock Video Connector (CC-05)
//  Multi-provider stock video search with AI B-Roll suggestions
// ═══════════════════════════════════════════════════════════════════════════

import { generateId } from '../utils';
import {
  StockVideoProvider,
  StockVideoSearchParams,
  StockVideoResult,
  BRollSuggestion,
} from './types';

// ─── Simulated Provider Catalogs ──────────────────────────────────────────

const DEMO_VIDEOS: StockVideoResult[] = [
  {
    id: 'sv-001', title: 'City Skyline Sunset', description: 'Aerial view of a modern city skyline at golden hour',
    keywords: ['city', 'skyline', 'sunset', 'aerial', 'urban', 'golden hour'],
    previewUrl: '/preview/city-skyline.mp4', provider: 'artgrid',
    resolution: { width: 3840, height: 2160 }, duration: 15, fps: 24,
    thumbnailUrl: '/thumb/city-skyline.jpg', licenseUrl: 'https://example.com/license/sv-001',
  },
  {
    id: 'sv-002', title: 'Ocean Waves Crashing', description: 'Slow motion waves breaking on a rocky coastline',
    keywords: ['ocean', 'waves', 'slow motion', 'nature', 'coast', 'water'],
    previewUrl: '/preview/ocean-waves.mp4', provider: 'shutterstock',
    resolution: { width: 1920, height: 1080 }, duration: 20, fps: 60,
    thumbnailUrl: '/thumb/ocean-waves.jpg', licenseUrl: 'https://example.com/license/sv-002',
  },
  {
    id: 'sv-003', title: 'Office Team Meeting', description: 'Diverse team collaborating in a modern office space',
    keywords: ['office', 'team', 'meeting', 'business', 'collaboration', 'corporate'],
    previewUrl: '/preview/office-meeting.mp4', provider: 'getty',
    resolution: { width: 3840, height: 2160 }, duration: 12, fps: 30,
    thumbnailUrl: '/thumb/office-meeting.jpg', licenseUrl: 'https://example.com/license/sv-003',
  },
  {
    id: 'sv-004', title: 'Forest Aerial Flyover', description: 'Drone shot flying over a lush green forest canopy',
    keywords: ['forest', 'aerial', 'drone', 'nature', 'green', 'trees'],
    previewUrl: '/preview/forest-aerial.mp4', provider: 'artgrid',
    resolution: { width: 3840, height: 2160 }, duration: 18, fps: 24,
    thumbnailUrl: '/thumb/forest-aerial.jpg', licenseUrl: 'https://example.com/license/sv-004',
  },
  {
    id: 'sv-005', title: 'Hands Typing on Laptop', description: 'Close-up of hands typing on a modern laptop keyboard',
    keywords: ['laptop', 'typing', 'technology', 'work', 'close-up', 'computer'],
    previewUrl: '/preview/laptop-typing.mp4', provider: 'shutterstock',
    resolution: { width: 1920, height: 1080 }, duration: 10, fps: 30,
    thumbnailUrl: '/thumb/laptop-typing.jpg', licenseUrl: 'https://example.com/license/sv-005',
  },
  {
    id: 'sv-006', title: 'Night Traffic Timelapse', description: 'Timelapse of car light trails on a highway at night',
    keywords: ['traffic', 'night', 'timelapse', 'highway', 'lights', 'urban'],
    previewUrl: '/preview/night-traffic.mp4', provider: 'getty',
    resolution: { width: 3840, height: 2160 }, duration: 14, fps: 24,
    thumbnailUrl: '/thumb/night-traffic.jpg', licenseUrl: 'https://example.com/license/sv-006',
  },
  {
    id: 'sv-007', title: 'Mountain Sunrise', description: 'Epic sunrise over snow-capped mountain peaks',
    keywords: ['mountain', 'sunrise', 'epic', 'nature', 'snow', 'landscape'],
    previewUrl: '/preview/mountain-sunrise.mp4', provider: 'artgrid',
    resolution: { width: 3840, height: 2160 }, duration: 22, fps: 24,
    thumbnailUrl: '/thumb/mountain-sunrise.jpg', licenseUrl: 'https://example.com/license/sv-007',
  },
  {
    id: 'sv-008', title: 'Coffee Shop Interior', description: 'Warm interior of a cozy coffee shop with steam rising',
    keywords: ['coffee', 'cafe', 'interior', 'cozy', 'warm', 'lifestyle'],
    previewUrl: '/preview/coffee-shop.mp4', provider: 'shutterstock',
    resolution: { width: 1920, height: 1080 }, duration: 16, fps: 30,
    thumbnailUrl: '/thumb/coffee-shop.jpg', licenseUrl: 'https://example.com/license/sv-008',
  },
  {
    id: 'sv-009', title: 'Abstract Particles', description: 'Colorful particle system flowing through dark space',
    keywords: ['abstract', 'particles', 'motion', 'graphics', 'colorful', 'animation'],
    previewUrl: '/preview/abstract-particles.mp4', provider: 'getty',
    resolution: { width: 1920, height: 1080 }, duration: 30, fps: 60,
    thumbnailUrl: '/thumb/abstract-particles.jpg', licenseUrl: 'https://example.com/license/sv-009',
  },
  {
    id: 'sv-010', title: 'Cooking Overhead Shot', description: 'Top-down view of ingredients being prepared on a cutting board',
    keywords: ['cooking', 'food', 'overhead', 'kitchen', 'preparation', 'lifestyle'],
    previewUrl: '/preview/cooking-overhead.mp4', provider: 'artgrid',
    resolution: { width: 3840, height: 2160 }, duration: 25, fps: 30,
    thumbnailUrl: '/thumb/cooking-overhead.jpg', licenseUrl: 'https://example.com/license/sv-010',
  },
];

// ─── Search Filter Logic ──────────────────────────────────────────────────

function filterVideos(
  videos: StockVideoResult[],
  params: StockVideoSearchParams,
  provider?: StockVideoProvider,
): StockVideoResult[] {
  let results = [...videos];

  if (provider) {
    results = results.filter((v) => v.provider === provider);
  }

  if (params.providers && params.providers.length > 0) {
    results = results.filter((v) => params.providers!.includes(v.provider));
  }

  if (params.query) {
    const q = params.query.toLowerCase();
    results = results.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.keywords.some((k) => k.includes(q)),
    );
  }

  if (params.keywords && params.keywords.length > 0) {
    const kw = params.keywords.map((k) => k.toLowerCase());
    results = results.filter((v) =>
      kw.some((k) => v.keywords.some((vk) => vk.includes(k))),
    );
  }

  if (params.resolution) {
    const minWidth = params.resolution === '8k' ? 7680 : params.resolution === '4k' ? 3840 : 1920;
    results = results.filter((v) => v.resolution.width >= minWidth);
  }

  if (params.duration) {
    results = results.filter(
      (v) => v.duration >= params.duration!.min && v.duration <= params.duration!.max,
    );
  }

  if (params.fps) {
    results = results.filter((v) => v.fps >= params.fps!);
  }

  // Pagination
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? 20;
  const start = page * pageSize;
  return results.slice(start, start + pageSize);
}

// ─── AI B-Roll Suggestion ─────────────────────────────────────────────────

interface TranscriptCueForBRoll {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  speaker?: string;
}

// Keywords to search for based on common transcript content
const TOPIC_TO_KEYWORDS: Record<string, string[]> = {
  technology: ['laptop', 'typing', 'computer', 'technology', 'abstract'],
  nature: ['forest', 'mountain', 'ocean', 'nature', 'landscape'],
  business: ['office', 'meeting', 'corporate', 'team', 'collaboration'],
  city: ['city', 'skyline', 'urban', 'traffic', 'night'],
  food: ['cooking', 'food', 'kitchen', 'cafe', 'coffee'],
  travel: ['aerial', 'drone', 'mountain', 'ocean', 'landscape'],
  lifestyle: ['coffee', 'cozy', 'lifestyle', 'warm', 'morning'],
  action: ['motion', 'fast', 'slow motion', 'sports', 'dynamic'],
};

function extractKeywordsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const keywords: string[] = [];

  for (const [topic, kws] of Object.entries(TOPIC_TO_KEYWORDS)) {
    // Check if any keyword pattern matches the text
    const topicWords = topic.split('_');
    if (topicWords.some((tw) => lower.includes(tw))) {
      keywords.push(...kws);
    }
  }

  // Extract nouns / significant words
  const words = lower.split(/\s+/).filter((w) => w.length > 3);
  const stopwords = new Set(['this', 'that', 'with', 'from', 'they', 'have', 'been', 'were', 'about', 'would', 'could', 'should', 'their', 'there', 'where', 'which', 'these', 'those', 'other', 'some', 'many', 'much', 'more', 'most', 'very', 'just', 'also', 'even', 'only', 'then', 'than', 'when', 'what']);
  for (const word of words) {
    if (!stopwords.has(word)) {
      keywords.push(word);
    }
  }

  return [...new Set(keywords)];
}

function suggestBRollForTranscript(
  cues: TranscriptCueForBRoll[],
  availableVideos: StockVideoResult[],
): BRollSuggestion[] {
  const suggestions: BRollSuggestion[] = [];

  for (const cue of cues) {
    const keywords = extractKeywordsFromText(cue.text);
    if (keywords.length === 0) continue;

    // Find matching videos
    const query = keywords.slice(0, 3).join(' ');
    const matches = availableVideos.filter((v) =>
      keywords.some(
        (kw) =>
          v.keywords.some((vk) => vk.includes(kw)) ||
          v.title.toLowerCase().includes(kw) ||
          v.description.toLowerCase().includes(kw),
      ),
    );

    if (matches.length > 0) {
      // Score matches by keyword overlap
      const scored = matches.map((v) => {
        const matchCount = keywords.filter(
          (kw) =>
            v.keywords.some((vk) => vk.includes(kw)) ||
            v.title.toLowerCase().includes(kw),
        ).length;
        return { video: v, score: matchCount / keywords.length };
      });

      scored.sort((a, b) => b.score - a.score);

      suggestions.push({
        transcriptCueId: cue.id,
        query,
        reason: `Matches keywords: ${keywords.slice(0, 3).join(', ')}`,
        suggestedResults: scored.slice(0, 3).map((s) => s.video),
        confidence: scored[0]!.score,
      });
    }
  }

  return suggestions;
}

// ─── Provider Adapters ────────────────────────────────────────────────────

interface VideoProviderAdapter {
  readonly name: StockVideoProvider;
  search(params: StockVideoSearchParams): Promise<StockVideoResult[]>;
  getClip(clipId: string): Promise<StockVideoResult | null>;
  getDownloadUrl(clipId: string): Promise<string | null>;
}

class ArtgridAdapter implements VideoProviderAdapter {
  readonly name: StockVideoProvider = 'artgrid';

  async search(params: StockVideoSearchParams): Promise<StockVideoResult[]> {
    return filterVideos(DEMO_VIDEOS, params, this.name);
  }

  async getClip(clipId: string): Promise<StockVideoResult | null> {
    return DEMO_VIDEOS.find((v) => v.id === clipId && v.provider === this.name) ?? null;
  }

  async getDownloadUrl(clipId: string): Promise<string | null> {
    const clip = await this.getClip(clipId);
    return clip ? `/download/artgrid/${clipId}.mov` : null;
  }
}

class ShutterstockVideoAdapter implements VideoProviderAdapter {
  readonly name: StockVideoProvider = 'shutterstock';

  async search(params: StockVideoSearchParams): Promise<StockVideoResult[]> {
    return filterVideos(DEMO_VIDEOS, params, this.name);
  }

  async getClip(clipId: string): Promise<StockVideoResult | null> {
    return DEMO_VIDEOS.find((v) => v.id === clipId && v.provider === this.name) ?? null;
  }

  async getDownloadUrl(clipId: string): Promise<string | null> {
    const clip = await this.getClip(clipId);
    return clip ? `/download/shutterstock/${clipId}.mov` : null;
  }
}

class GettyVideoAdapter implements VideoProviderAdapter {
  readonly name: StockVideoProvider = 'getty';

  async search(params: StockVideoSearchParams): Promise<StockVideoResult[]> {
    return filterVideos(DEMO_VIDEOS, params, this.name);
  }

  async getClip(clipId: string): Promise<StockVideoResult | null> {
    return DEMO_VIDEOS.find((v) => v.id === clipId && v.provider === this.name) ?? null;
  }

  async getDownloadUrl(clipId: string): Promise<string | null> {
    const clip = await this.getClip(clipId);
    return clip ? `/download/getty/${clipId}.mov` : null;
  }
}

// ─── Main Connector Class ─────────────────────────────────────────────────

export class StockVideoConnector {
  private adapters: Map<StockVideoProvider, VideoProviderAdapter> = new Map();

  constructor(providers?: StockVideoProvider[]) {
    const enabledProviders = providers ?? ['artgrid', 'shutterstock', 'getty'];

    for (const provider of enabledProviders) {
      switch (provider) {
        case 'artgrid':
          this.adapters.set(provider, new ArtgridAdapter());
          break;
        case 'shutterstock':
          this.adapters.set(provider, new ShutterstockVideoAdapter());
          break;
        case 'getty':
          this.adapters.set(provider, new GettyVideoAdapter());
          break;
      }
    }
  }

  /**
   * Search across all enabled providers
   */
  async search(params: StockVideoSearchParams): Promise<StockVideoResult[]> {
    const targetProviders = params.providers ?? Array.from(this.adapters.keys());
    const results: StockVideoResult[] = [];

    const searches = targetProviders.map(async (provider) => {
      const adapter = this.adapters.get(provider);
      if (!adapter) return [];
      try {
        return await adapter.search(params);
      } catch {
        return [];
      }
    });

    const allResults = await Promise.all(searches);
    for (const providerResults of allResults) {
      results.push(...providerResults);
    }

    // Sort by relevance
    if (params.query) {
      const q = params.query.toLowerCase();
      results.sort((a, b) => {
        const aScore = a.keywords.filter((k) => k.includes(q)).length;
        const bScore = b.keywords.filter((k) => k.includes(q)).length;
        return bScore - aScore;
      });
    }

    return results;
  }

  /**
   * Get a specific clip by ID
   */
  async getClip(clipId: string): Promise<StockVideoResult | null> {
    for (const adapter of this.adapters.values()) {
      const clip = await adapter.getClip(clipId);
      if (clip) return clip;
    }
    return null;
  }

  /**
   * Get download URL
   */
  async getDownloadUrl(clipId: string): Promise<string | null> {
    for (const adapter of this.adapters.values()) {
      const url = await adapter.getDownloadUrl(clipId);
      if (url) return url;
    }
    return null;
  }

  /**
   * AI: Suggest B-Roll from transcript
   */
  async suggestBRoll(
    transcriptCues: TranscriptCueForBRoll[],
  ): Promise<BRollSuggestion[]> {
    // Search all providers for a broad catalog
    const allVideos: StockVideoResult[] = [];
    for (const adapter of this.adapters.values()) {
      try {
        const results = await adapter.search({ pageSize: 50 });
        allVideos.push(...results);
      } catch {
        // Skip failed providers
      }
    }

    return suggestBRollForTranscript(transcriptCues, allVideos);
  }

  /**
   * Get available providers
   */
  getProviders(): StockVideoProvider[] {
    return Array.from(this.adapters.keys());
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createStockVideoConnector(
  providers?: StockVideoProvider[],
): StockVideoConnector {
  return new StockVideoConnector(providers);
}
