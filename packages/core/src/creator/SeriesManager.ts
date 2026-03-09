// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Series Manager (CC-07)
//  Above-project organization for series/channel management
// ═══════════════════════════════════════════════════════════════════════════

import { generateId } from '../utils';
import {
  SeriesProject,
  SeriesEpisode,
  EpisodeStatus,
  BrandAsset,
  EpisodeAnalytics,
} from './types';

// ─── Storage ──────────────────────────────────────────────────────────────

const SERIES_STORAGE_KEY = 'the-avid.series.v1';

const memoryStore = new Map<string, string>();

function getStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} {
  const candidate = globalThis as typeof globalThis & {
    localStorage?: {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    };
  };

  if (candidate.localStorage) return candidate.localStorage;

  return {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => memoryStore.set(key, value),
    removeItem: (key: string) => memoryStore.delete(key),
  };
}

// ─── Episode Status Workflow ──────────────────────────────────────────────

const STATUS_ORDER: EpisodeStatus[] = ['idea', 'scripted', 'filming', 'editing', 'review', 'published'];

function canTransition(from: EpisodeStatus, to: EpisodeStatus): boolean {
  const fromIndex = STATUS_ORDER.indexOf(from);
  const toIndex = STATUS_ORDER.indexOf(to);
  // Can move forward by one step, or backward to any previous step
  return toIndex === fromIndex + 1 || toIndex < fromIndex;
}

function getNextStatus(current: EpisodeStatus): EpisodeStatus | null {
  const index = STATUS_ORDER.indexOf(current);
  if (index < STATUS_ORDER.length - 1) return STATUS_ORDER[index + 1];
  return null;
}

// ─── Analytics Aggregation ────────────────────────────────────────────────

function aggregateAnalytics(episodes: SeriesEpisode[]): SeriesProject['analytics'] {
  const publishedEpisodes = episodes.filter((ep) => ep.analytics);
  const totalViews = publishedEpisodes.reduce((sum, ep) => sum + (ep.analytics?.views ?? 0), 0);
  const totalWatchTime = publishedEpisodes.reduce((sum, ep) => sum + (ep.analytics?.watchTimeMinutes ?? 0), 0);

  return {
    totalViews,
    totalWatchTimeMinutes: totalWatchTime,
    subscriberDelta: Math.floor(totalViews * 0.02), // simulated
    averageViewsPerEpisode: publishedEpisodes.length > 0 ? Math.round(totalViews / publishedEpisodes.length) : 0,
  };
}

// ─── Main Manager Class ───────────────────────────────────────────────────

export class SeriesManager {
  private series: Map<string, SeriesProject> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  // ─── Series CRUD ──────────────────────────────────────────────────────

  /**
   * Create a new series
   */
  createSeries(
    name: string,
    options?: Partial<Omit<SeriesProject, 'id' | 'name' | 'createdAt' | 'updatedAt'>>,
  ): SeriesProject {
    const now = new Date().toISOString();
    const series: SeriesProject = {
      id: generateId(),
      name,
      description: options?.description ?? '',
      episodes: options?.episodes ?? [],
      brandAssets: options?.brandAssets ?? [],
      analytics: {
        totalViews: 0,
        totalWatchTimeMinutes: 0,
        subscriberDelta: 0,
        averageViewsPerEpisode: 0,
      },
      defaultSettings: options?.defaultSettings ?? {
        resolution: { width: 1920, height: 1080 },
        frameRate: 30,
        exportFormat: 'mp4',
      },
      createdAt: now,
      updatedAt: now,
    };

    this.series.set(series.id, series);
    this.saveToStorage();
    return this.cloneSeries(series);
  }

  /**
   * Get a series by ID
   */
  getSeries(seriesId: string): SeriesProject | null {
    const series = this.series.get(seriesId);
    return series ? this.cloneSeries(series) : null;
  }

  /**
   * List all series
   */
  listSeries(): SeriesProject[] {
    return Array.from(this.series.values())
      .map((s) => this.cloneSeries(s))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Update series metadata
   */
  updateSeries(
    seriesId: string,
    updates: Partial<Pick<SeriesProject, 'name' | 'description' | 'defaultSettings'>>,
  ): SeriesProject | null {
    const series = this.series.get(seriesId);
    if (!series) return null;

    if (updates.name !== undefined) series.name = updates.name;
    if (updates.description !== undefined) series.description = updates.description;
    if (updates.defaultSettings !== undefined) series.defaultSettings = { ...updates.defaultSettings };

    series.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return this.cloneSeries(series);
  }

  /**
   * Delete a series
   */
  deleteSeries(seriesId: string): boolean {
    const deleted = this.series.delete(seriesId);
    if (deleted) this.saveToStorage();
    return deleted;
  }

  // ─── Episode Management ───────────────────────────────────────────────

  /**
   * Add an episode to a series
   */
  addEpisode(
    seriesId: string,
    projectId: string,
    options?: Partial<Omit<SeriesEpisode, 'id' | 'projectId'>>,
  ): SeriesEpisode | null {
    const series = this.series.get(seriesId);
    if (!series) return null;

    const episodeNumber = options?.episodeNumber ?? series.episodes.length + 1;

    const episode: SeriesEpisode = {
      id: generateId(),
      projectId,
      episodeNumber,
      title: options?.title ?? `Episode ${episodeNumber}`,
      description: options?.description ?? '',
      status: options?.status ?? 'idea',
      thumbnailUrl: options?.thumbnailUrl,
      duration: options?.duration,
      tags: options?.tags ?? [],
    };

    series.episodes.push(episode);
    series.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    series.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return { ...episode };
  }

  /**
   * Update an episode
   */
  updateEpisode(
    seriesId: string,
    episodeId: string,
    updates: Partial<Omit<SeriesEpisode, 'id' | 'projectId'>>,
  ): SeriesEpisode | null {
    const series = this.series.get(seriesId);
    if (!series) return null;

    const episode = series.episodes.find((ep) => ep.id === episodeId);
    if (!episode) return null;

    if (updates.episodeNumber !== undefined) episode.episodeNumber = updates.episodeNumber;
    if (updates.title !== undefined) episode.title = updates.title;
    if (updates.description !== undefined) episode.description = updates.description;
    if (updates.status !== undefined) episode.status = updates.status;
    if (updates.thumbnailUrl !== undefined) episode.thumbnailUrl = updates.thumbnailUrl;
    if (updates.duration !== undefined) episode.duration = updates.duration;
    if (updates.tags !== undefined) episode.tags = [...updates.tags];
    if (updates.publishedAt !== undefined) episode.publishedAt = updates.publishedAt;
    if (updates.analytics !== undefined) episode.analytics = { ...updates.analytics };

    series.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    series.analytics = aggregateAnalytics(series.episodes);
    series.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return { ...episode };
  }

  /**
   * Remove an episode
   */
  removeEpisode(seriesId: string, episodeId: string): boolean {
    const series = this.series.get(seriesId);
    if (!series) return false;

    const index = series.episodes.findIndex((ep) => ep.id === episodeId);
    if (index === -1) return false;

    series.episodes.splice(index, 1);
    series.analytics = aggregateAnalytics(series.episodes);
    series.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return true;
  }

  /**
   * Transition episode status
   */
  transitionEpisodeStatus(
    seriesId: string,
    episodeId: string,
    newStatus: EpisodeStatus,
  ): { success: boolean; error?: string } {
    const series = this.series.get(seriesId);
    if (!series) return { success: false, error: 'Series not found' };

    const episode = series.episodes.find((ep) => ep.id === episodeId);
    if (!episode) return { success: false, error: 'Episode not found' };

    if (!canTransition(episode.status, newStatus)) {
      return {
        success: false,
        error: `Cannot transition from "${episode.status}" to "${newStatus}"`,
      };
    }

    episode.status = newStatus;
    if (newStatus === 'published') {
      episode.publishedAt = new Date().toISOString();
    }

    series.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return { success: true };
  }

  /**
   * Get next available status for an episode
   */
  getNextStatus(seriesId: string, episodeId: string): EpisodeStatus | null {
    const series = this.series.get(seriesId);
    if (!series) return null;

    const episode = series.episodes.find((ep) => ep.id === episodeId);
    if (!episode) return null;

    return getNextStatus(episode.status);
  }

  // ─── Brand Assets ─────────────────────────────────────────────────────

  /**
   * Add a brand asset to a series
   */
  addBrandAsset(
    seriesId: string,
    asset: Omit<BrandAsset, 'id'>,
  ): BrandAsset | null {
    const series = this.series.get(seriesId);
    if (!series) return null;

    const brandAsset: BrandAsset = {
      id: generateId(),
      ...asset,
    };

    series.brandAssets.push(brandAsset);
    series.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return { ...brandAsset };
  }

  /**
   * Remove a brand asset
   */
  removeBrandAsset(seriesId: string, assetId: string): boolean {
    const series = this.series.get(seriesId);
    if (!series) return false;

    const index = series.brandAssets.findIndex((a) => a.id === assetId);
    if (index === -1) return false;

    series.brandAssets.splice(index, 1);
    series.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return true;
  }

  /**
   * Get brand assets for a series
   */
  getBrandAssets(seriesId: string): BrandAsset[] {
    const series = this.series.get(seriesId);
    if (!series) return [];
    return series.brandAssets.map((a) => ({ ...a }));
  }

  // ─── Analytics ────────────────────────────────────────────────────────

  /**
   * Update analytics for an episode
   */
  updateEpisodeAnalytics(
    seriesId: string,
    episodeId: string,
    analytics: EpisodeAnalytics,
  ): boolean {
    const series = this.series.get(seriesId);
    if (!series) return false;

    const episode = series.episodes.find((ep) => ep.id === episodeId);
    if (!episode) return false;

    episode.analytics = { ...analytics };
    series.analytics = aggregateAnalytics(series.episodes);
    series.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return true;
  }

  /**
   * Get aggregate analytics for a series
   */
  getSeriesAnalytics(seriesId: string): SeriesProject['analytics'] | null {
    const series = this.series.get(seriesId);
    if (!series) return null;
    return { ...series.analytics };
  }

  /**
   * Get all status values
   */
  getStatusValues(): EpisodeStatus[] {
    return [...STATUS_ORDER];
  }

  // ─── Storage ──────────────────────────────────────────────────────────

  private loadFromStorage(): void {
    try {
      const raw = getStorage().getItem(SERIES_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as SeriesProject[];
      for (const s of data) {
        this.series.set(s.id, s);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveToStorage(): void {
    try {
      const data = Array.from(this.series.values());
      getStorage().setItem(SERIES_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }

  private cloneSeries(series: SeriesProject): SeriesProject {
    return JSON.parse(JSON.stringify(series));
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────

export function createSeriesManager(): SeriesManager {
  return new SeriesManager();
}
