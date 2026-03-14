// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Stock Music Connector (CC-04)
//  Multi-provider stock music search, preview, and licensing
// ═══════════════════════════════════════════════════════════════════════════

import { generateId } from '../utils';
import {
  StockMusicProvider,
  StockMusicSearchParams,
  StockMusicResult,
  MusicLicense,
  BeatMarker,
  MusicMood,
  MusicGenre,
} from './types';

// ─── Provider Adapter Interface ───────────────────────────────────────────

interface ProviderAdapter {
  readonly name: StockMusicProvider;
  search(params: StockMusicSearchParams): Promise<StockMusicResult[]>;
  getTrack(trackId: string): Promise<StockMusicResult | null>;
  getDownloadUrl(trackId: string, licenseType: string): Promise<string | null>;
}

// ─── Simulated Provider Catalogs ──────────────────────────────────────────

const DEMO_TRACKS: StockMusicResult[] = [
  {
    id: 'sm-001', title: 'Rising Horizon', artist: 'Skyward Audio',
    mood: ['uplifting', 'cinematic'], genre: ['cinematic'], tempo: 120,
    energy: 'high', duration: 195, previewUrl: '/preview/rising-horizon.mp3',
    licenseUrl: 'https://example.com/license/sm-001', provider: 'artlist',
    key: 'C major', tags: ['epic', 'adventure', 'inspirational', 'orchestral'],
  },
  {
    id: 'sm-002', title: 'Midnight Drive', artist: 'Neon Pulse',
    mood: ['mysterious', 'dark'], genre: ['electronic'], tempo: 95,
    energy: 'medium', duration: 240, previewUrl: '/preview/midnight-drive.mp3',
    licenseUrl: 'https://example.com/license/sm-002', provider: 'epidemic_sound',
    key: 'A minor', tags: ['synth', 'retro', 'noir', 'atmospheric'],
  },
  {
    id: 'sm-003', title: 'Golden Morning', artist: 'Sunlit Keys',
    mood: ['happy', 'calm'], genre: ['folk'], tempo: 110,
    energy: 'low', duration: 180, previewUrl: '/preview/golden-morning.mp3',
    licenseUrl: 'https://example.com/license/sm-003', provider: 'musicbed',
    key: 'G major', tags: ['acoustic', 'warm', 'gentle', 'morning'],
  },
  {
    id: 'sm-004', title: 'Urban Pulse', artist: 'Beat Collective',
    mood: ['energetic'], genre: ['hip_hop'], tempo: 140,
    energy: 'high', duration: 165, previewUrl: '/preview/urban-pulse.mp3',
    licenseUrl: 'https://example.com/license/sm-004', provider: 'soundstripe',
    key: 'D minor', tags: ['urban', 'beats', 'modern', 'confident'],
  },
  {
    id: 'sm-005', title: 'Soft Focus', artist: 'Ambient Waves',
    mood: ['ambient', 'calm'], genre: ['ambient'], tempo: 72,
    energy: 'low', duration: 360, previewUrl: '/preview/soft-focus.mp3',
    licenseUrl: 'https://example.com/license/sm-005', provider: 'artlist',
    key: 'E minor', tags: ['meditation', 'background', 'subtle', 'peaceful'],
  },
  {
    id: 'sm-006', title: 'Thunder Road', artist: 'Iron Strings',
    mood: ['dramatic', 'energetic'], genre: ['rock'], tempo: 150,
    energy: 'high', duration: 210, previewUrl: '/preview/thunder-road.mp3',
    licenseUrl: 'https://example.com/license/sm-006', provider: 'epidemic_sound',
    key: 'E major', tags: ['guitar', 'power', 'action', 'sports'],
  },
  {
    id: 'sm-007', title: 'Velvet Night', artist: 'Jazz Noir',
    mood: ['romantic', 'mysterious'], genre: ['jazz'], tempo: 88,
    energy: 'low', duration: 275, previewUrl: '/preview/velvet-night.mp3',
    licenseUrl: 'https://example.com/license/sm-007', provider: 'musicbed',
    key: 'Bb major', tags: ['saxophone', 'smooth', 'lounge', 'evening'],
  },
  {
    id: 'sm-008', title: 'Neon Dreams', artist: 'Synthwave Lab',
    mood: ['energetic', 'uplifting'], genre: ['electronic'], tempo: 128,
    energy: 'high', duration: 198, previewUrl: '/preview/neon-dreams.mp3',
    licenseUrl: 'https://example.com/license/sm-008', provider: 'soundstripe',
    key: 'F# minor', tags: ['synthwave', 'retro', 'futuristic', 'dance'],
  },
  {
    id: 'sm-009', title: 'Autumn Leaves', artist: 'Pastoral Sound',
    mood: ['sad', 'calm'], genre: ['classical'], tempo: 65,
    energy: 'low', duration: 320, previewUrl: '/preview/autumn-leaves.mp3',
    licenseUrl: 'https://example.com/license/sm-009', provider: 'artlist',
    key: 'D minor', tags: ['piano', 'melancholic', 'reflective', 'strings'],
  },
  {
    id: 'sm-010', title: 'Brand Forward', artist: 'Corporate Audio',
    mood: ['uplifting', 'happy'], genre: ['pop'], tempo: 118,
    energy: 'medium', duration: 135, previewUrl: '/preview/brand-forward.mp3',
    licenseUrl: 'https://example.com/license/sm-010', provider: 'epidemic_sound',
    key: 'C major', tags: ['corporate', 'positive', 'technology', 'startup'],
  },
  {
    id: 'sm-011', title: 'Lo-Fi Study Session', artist: 'Chill Beats Co.',
    mood: ['calm'], genre: ['lofi'], tempo: 85,
    energy: 'low', duration: 420, previewUrl: '/preview/lofi-study.mp3',
    licenseUrl: 'https://example.com/license/sm-011', provider: 'soundstripe',
    key: 'Ab major', tags: ['lofi', 'study', 'chill', 'background'],
  },
  {
    id: 'sm-012', title: 'Epic Siege', artist: 'Orchestral Force',
    mood: ['epic', 'dramatic'], genre: ['cinematic'], tempo: 135,
    energy: 'high', duration: 255, previewUrl: '/preview/epic-siege.mp3',
    licenseUrl: 'https://example.com/license/sm-012', provider: 'musicbed',
    key: 'C minor', tags: ['trailer', 'battle', 'intense', 'percussion'],
  },
];

// ─── Provider Adapters ────────────────────────────────────────────────────

class ArtlistAdapter implements ProviderAdapter {
  readonly name: StockMusicProvider = 'artlist';

  async search(params: StockMusicSearchParams): Promise<StockMusicResult[]> {
    return filterTracks(DEMO_TRACKS, params, this.name);
  }

  async getTrack(trackId: string): Promise<StockMusicResult | null> {
    return DEMO_TRACKS.find((t) => t.id === trackId && t.provider === this.name) ?? null;
  }

  async getDownloadUrl(trackId: string): Promise<string | null> {
    const track = await this.getTrack(trackId);
    return track ? `/download/artlist/${trackId}.wav` : null;
  }
}

class EpidemicSoundAdapter implements ProviderAdapter {
  readonly name: StockMusicProvider = 'epidemic_sound';

  async search(params: StockMusicSearchParams): Promise<StockMusicResult[]> {
    return filterTracks(DEMO_TRACKS, params, this.name);
  }

  async getTrack(trackId: string): Promise<StockMusicResult | null> {
    return DEMO_TRACKS.find((t) => t.id === trackId && t.provider === this.name) ?? null;
  }

  async getDownloadUrl(trackId: string): Promise<string | null> {
    const track = await this.getTrack(trackId);
    return track ? `/download/epidemic/${trackId}.wav` : null;
  }
}

class MusicbedAdapter implements ProviderAdapter {
  readonly name: StockMusicProvider = 'musicbed';

  async search(params: StockMusicSearchParams): Promise<StockMusicResult[]> {
    return filterTracks(DEMO_TRACKS, params, this.name);
  }

  async getTrack(trackId: string): Promise<StockMusicResult | null> {
    return DEMO_TRACKS.find((t) => t.id === trackId && t.provider === this.name) ?? null;
  }

  async getDownloadUrl(trackId: string): Promise<string | null> {
    const track = await this.getTrack(trackId);
    return track ? `/download/musicbed/${trackId}.wav` : null;
  }
}

class SoundstripeAdapter implements ProviderAdapter {
  readonly name: StockMusicProvider = 'soundstripe';

  async search(params: StockMusicSearchParams): Promise<StockMusicResult[]> {
    return filterTracks(DEMO_TRACKS, params, this.name);
  }

  async getTrack(trackId: string): Promise<StockMusicResult | null> {
    return DEMO_TRACKS.find((t) => t.id === trackId && t.provider === this.name) ?? null;
  }

  async getDownloadUrl(trackId: string): Promise<string | null> {
    const track = await this.getTrack(trackId);
    return track ? `/download/soundstripe/${trackId}.wav` : null;
  }
}

// ─── Filter Logic ─────────────────────────────────────────────────────────

function filterTracks(
  tracks: StockMusicResult[],
  params: StockMusicSearchParams,
  provider?: StockMusicProvider,
): StockMusicResult[] {
  let results = [...tracks];

  if (provider) {
    results = results.filter((t) => t.provider === provider);
  }

  if (params.providers && params.providers.length > 0) {
    results = results.filter((t) => params.providers!.includes(t.provider));
  }

  if (params.query) {
    const q = params.query.toLowerCase();
    results = results.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q)),
    );
  }

  if (params.mood && params.mood.length > 0) {
    results = results.filter((t) =>
      t.mood.some((m) => params.mood!.includes(m)),
    );
  }

  if (params.genre && params.genre.length > 0) {
    results = results.filter((t) =>
      t.genre.some((g) => params.genre!.includes(g)),
    );
  }

  if (params.tempo) {
    results = results.filter(
      (t) => t.tempo >= params.tempo!.min && t.tempo <= params.tempo!.max,
    );
  }

  if (params.energy) {
    results = results.filter((t) => t.energy === params.energy);
  }

  if (params.duration) {
    results = results.filter(
      (t) => t.duration >= params.duration!.min && t.duration <= params.duration!.max,
    );
  }

  if (params.instrumental !== undefined) {
    // All demo tracks are instrumental, so a false filter excludes the demo set.
    results = params.instrumental ? results : [];
  }

  // Pagination
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? 20;
  const start = page * pageSize;
  return results.slice(start, start + pageSize);
}

// ─── Beat Detection ───────────────────────────────────────────────────────

export function detectBeats(
  _audioData: Float32Array | number[],
  sampleRate: number,
  bpm?: number,
): BeatMarker[] {
  // Simulated beat detection
  // In production, use onset detection + spectral flux algorithm
  const estimatedBPM = bpm ?? 120;
  const beatInterval = 60 / estimatedBPM;
  const totalDuration = Array.isArray(_audioData)
    ? _audioData.length / sampleRate
    : _audioData.length / sampleRate;

  const beats: BeatMarker[] = [];
  let beatCount = 0;

  for (let time = 0; time < totalDuration; time += beatInterval) {
    const isDownbeat = beatCount % 4 === 0;
    beats.push({
      time,
      strength: isDownbeat ? 0.9 + Math.random() * 0.1 : 0.5 + Math.random() * 0.3,
      type: isDownbeat ? 'downbeat' : 'beat',
    });
    beatCount++;
  }

  return beats;
}

// ─── Auto-Trim / Loop ─────────────────────────────────────────────────────

export interface TrimResult {
  startTime: number;
  endTime: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  loopCount: number;
}

function autoTrimToLength(
  trackDuration: number,
  targetDuration: number,
  beats: BeatMarker[],
): TrimResult {
  if (trackDuration <= targetDuration) {
    // Track is shorter; calculate loop count
    const loopCount = Math.ceil(targetDuration / trackDuration);
    return {
      startTime: 0,
      endTime: trackDuration,
      fadeInDuration: 0.5,
      fadeOutDuration: 1.0,
      loopCount,
    };
  }

  // Track is longer; find best cut point using beats
  const targetEnd = targetDuration;

  // Find the closest downbeat to our target duration
  let bestEnd = targetEnd;
  let bestDistance = Infinity;

  for (const beat of beats) {
    if (beat.type === 'downbeat' && beat.time > targetDuration * 0.8) {
      const distance = Math.abs(beat.time - targetEnd);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestEnd = beat.time;
      }
      if (beat.time > targetDuration * 1.1) break;
    }
  }

  return {
    startTime: 0,
    endTime: bestEnd,
    fadeInDuration: 0,
    fadeOutDuration: 2.0,
    loopCount: 1,
  };
}

// ─── Main Connector Class ─────────────────────────────────────────────────

export class StockMusicConnector {
  private adapters: Map<StockMusicProvider, ProviderAdapter> = new Map();
  private licenses: MusicLicense[] = [];

  constructor(providers?: StockMusicProvider[]) {
    const enabledProviders = providers ?? ['artlist', 'epidemic_sound', 'musicbed', 'soundstripe'];

    for (const provider of enabledProviders) {
      switch (provider) {
        case 'artlist':
          this.adapters.set(provider, new ArtlistAdapter());
          break;
        case 'epidemic_sound':
          this.adapters.set(provider, new EpidemicSoundAdapter());
          break;
        case 'musicbed':
          this.adapters.set(provider, new MusicbedAdapter());
          break;
        case 'soundstripe':
          this.adapters.set(provider, new SoundstripeAdapter());
          break;
      }
    }
  }

  /**
   * Search across all enabled providers
   */
  async search(params: StockMusicSearchParams): Promise<StockMusicResult[]> {
    const targetProviders = params.providers ?? Array.from(this.adapters.keys());
    const results: StockMusicResult[] = [];

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

    // Sort by relevance (mood/genre match count)
    results.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      if (params.mood) {
        scoreA += a.mood.filter((m) => params.mood!.includes(m)).length;
        scoreB += b.mood.filter((m) => params.mood!.includes(m)).length;
      }
      if (params.genre) {
        scoreA += a.genre.filter((g) => params.genre!.includes(g)).length;
        scoreB += b.genre.filter((g) => params.genre!.includes(g)).length;
      }
      return scoreB - scoreA;
    });

    return results;
  }

  /**
   * Get a specific track by ID
   */
  async getTrack(trackId: string): Promise<StockMusicResult | null> {
    for (const adapter of this.adapters.values()) {
      const track = await adapter.getTrack(trackId);
      if (track) return track;
    }
    return null;
  }

  /**
   * Get download URL for a track
   */
  async getDownloadUrl(
    trackId: string,
    licenseType = 'standard',
  ): Promise<string | null> {
    for (const adapter of this.adapters.values()) {
      const url = await adapter.getDownloadUrl(trackId, licenseType);
      if (url) return url;
    }
    return null;
  }

  /**
   * Record a license grant for a track
   */
  grantLicense(
    trackId: string,
    provider: StockMusicProvider,
    projectId: string,
    type: MusicLicense['type'] = 'standard',
  ): MusicLicense {
    const license: MusicLicense = {
      id: generateId(),
      trackId,
      provider,
      type,
      projectId,
      grantedAt: new Date().toISOString(),
    };
    this.licenses.push(license);
    return license;
  }

  /**
   * Get all licenses for a project
   */
  getProjectLicenses(projectId: string): MusicLicense[] {
    return this.licenses.filter((l) => l.projectId === projectId);
  }

  /**
   * Auto-trim a music track to fit a sequence duration
   */
  async autoTrim(
    trackId: string,
    targetDuration: number,
  ): Promise<TrimResult | null> {
    const track = await this.getTrack(trackId);
    if (!track) return null;

    // Detect beats in the track
    const beats = detectBeats([], 44100, track.tempo);

    return autoTrimToLength(track.duration, targetDuration, beats);
  }

  /**
   * Get available providers
   */
  getProviders(): StockMusicProvider[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all available moods
   */
  getAvailableMoods(): MusicMood[] {
    return [
      'happy', 'sad', 'energetic', 'calm', 'dramatic',
      'mysterious', 'romantic', 'dark', 'uplifting', 'ambient',
      'cinematic', 'corporate', 'playful', 'tense', 'epic',
    ];
  }

  /**
   * Get all available genres
   */
  getAvailableGenres(): MusicGenre[] {
    return [
      'pop', 'rock', 'electronic', 'hip_hop', 'classical',
      'jazz', 'folk', 'ambient', 'cinematic', 'lofi',
      'rnb', 'country', 'reggae', 'metal', 'indie',
    ];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createStockMusicConnector(
  providers?: StockMusicProvider[],
): StockMusicConnector {
  return new StockMusicConnector(providers);
}
