import { describe, it, expect } from 'vitest';
import {
  getMediaCapabilityDispositionLabel,
  getMediaAssetPlaybackUrl,
  getMediaAssetPrimaryPath,
  getMediaAssetResolutionLabel,
  getMediaAssetSurfaceCapability,
  getMediaAssetTechnicalSummary,
} from '../media-helpers';
import type { EditorMediaAsset } from '../project-library';

// =============================================================================
//  Helper to create minimal asset objects for testing
// =============================================================================

type PlaybackAsset = Pick<EditorMediaAsset, 'playbackUrl' | 'locations' | 'proxyMetadata'>;
type PathAsset = Pick<EditorMediaAsset, 'locations' | 'proxyMetadata'>;
type ResolutionAsset = Pick<EditorMediaAsset, 'type' | 'technicalMetadata'>;

// =============================================================================
//  getMediaAssetPlaybackUrl
// =============================================================================

describe('getMediaAssetPlaybackUrl', () => {
  it('returns proxy playback URL when proxy is READY', () => {
    const asset: PlaybackAsset = {
      playbackUrl: 'http://primary.mp4',
      locations: { pathHistory: [], playbackUrl: 'http://location.mp4' },
      proxyMetadata: { status: 'READY', playbackUrl: 'http://proxy.mp4' },
    };
    expect(getMediaAssetPlaybackUrl(asset)).toBe('http://proxy.mp4');
  });

  it('returns primary playbackUrl when proxy is not READY', () => {
    const asset: PlaybackAsset = {
      playbackUrl: 'http://primary.mp4',
      locations: { pathHistory: [] },
      proxyMetadata: { status: 'QUEUED' },
    };
    expect(getMediaAssetPlaybackUrl(asset)).toBe('http://primary.mp4');
  });

  it('falls back to locations.playbackUrl when primary playbackUrl is undefined', () => {
    const asset: PlaybackAsset = {
      playbackUrl: undefined,
      locations: { pathHistory: [], playbackUrl: 'http://location.mp4' },
      proxyMetadata: { status: 'NOT_REQUESTED' },
    };
    expect(getMediaAssetPlaybackUrl(asset)).toBe('http://location.mp4');
  });

  it('returns undefined when no URLs are available', () => {
    const asset: PlaybackAsset = {
      playbackUrl: undefined,
      locations: { pathHistory: [] },
      proxyMetadata: { status: 'NOT_REQUESTED' },
    };
    expect(getMediaAssetPlaybackUrl(asset)).toBeUndefined();
  });

  it('returns undefined for null/undefined asset', () => {
    expect(getMediaAssetPlaybackUrl(null as unknown as PlaybackAsset)).toBeUndefined();
  });

  it('ignores proxy URL when proxy status is READY but playbackUrl is empty', () => {
    const asset: PlaybackAsset = {
      playbackUrl: 'http://primary.mp4',
      locations: { pathHistory: [] },
      proxyMetadata: { status: 'READY', playbackUrl: '' },
    };
    // '' is falsy, so it should fall back
    expect(getMediaAssetPlaybackUrl(asset)).toBe('http://primary.mp4');
  });

  it('caches results for same object reference', () => {
    const asset: PlaybackAsset = {
      playbackUrl: 'http://cached.mp4',
      locations: { pathHistory: [] },
      proxyMetadata: { status: 'NOT_REQUESTED' },
    };
    const result1 = getMediaAssetPlaybackUrl(asset);
    const result2 = getMediaAssetPlaybackUrl(asset);
    expect(result1).toBe(result2);
    expect(result1).toBe('http://cached.mp4');
  });

  it('uses canonical playback variants when present', () => {
    const asset: PlaybackAsset & Pick<EditorMediaAsset, 'references' | 'variants'> = {
      playbackUrl: undefined,
      locations: { pathHistory: [] },
      proxyMetadata: { status: 'NOT_REQUESTED' },
      references: [
        {
          id: 'ref-playback',
          role: 'playback',
          locator: 'file-url',
          url: 'file:///canonical/playback.mov',
        },
      ],
      variants: [
        {
          id: 'variant-playback',
          name: 'Playback',
          purpose: 'playback',
          availability: 'ready',
          supportTier: 'normalized',
          referenceIds: ['ref-playback'],
          streamIds: [],
        },
      ],
    };

    expect(getMediaAssetPlaybackUrl(asset)).toBe('file:///canonical/playback.mov');
  });
});

// =============================================================================
//  getMediaAssetPrimaryPath
// =============================================================================

describe('getMediaAssetPrimaryPath', () => {
  it('returns proxy file path when proxy is READY', () => {
    const asset: PathAsset = {
      locations: { pathHistory: [], managedPath: '/managed/file.mp4' },
      proxyMetadata: { status: 'READY', filePath: '/proxy/file.mp4' },
    };
    expect(getMediaAssetPrimaryPath(asset)).toBe('/proxy/file.mp4');
  });

  it('returns managed path when proxy is not READY', () => {
    const asset: PathAsset = {
      locations: { pathHistory: [], managedPath: '/managed/file.mp4' },
      proxyMetadata: { status: 'QUEUED' },
    };
    expect(getMediaAssetPrimaryPath(asset)).toBe('/managed/file.mp4');
  });

  it('falls back to original path when managed path is unavailable', () => {
    const asset: PathAsset = {
      locations: { pathHistory: [], originalPath: '/original/file.mp4' },
      proxyMetadata: { status: 'NOT_REQUESTED' },
    };
    expect(getMediaAssetPrimaryPath(asset)).toBe('/original/file.mp4');
  });

  it('returns undefined when no paths are available', () => {
    const asset: PathAsset = {
      locations: { pathHistory: [] },
      proxyMetadata: { status: 'NOT_REQUESTED' },
    };
    expect(getMediaAssetPrimaryPath(asset)).toBeUndefined();
  });

  it('returns undefined for null asset', () => {
    expect(getMediaAssetPrimaryPath(null as unknown as PathAsset)).toBeUndefined();
  });

  it('uses canonical managed/source references when present', () => {
    const asset: PathAsset & Pick<EditorMediaAsset, 'references' | 'variants'> = {
      locations: { pathHistory: [] },
      proxyMetadata: { status: 'NOT_REQUESTED' },
      references: [
        {
          id: 'ref-managed',
          role: 'managed',
          locator: 'absolute-path',
          path: '/canonical/managed.mov',
        },
      ],
      variants: [
        {
          id: 'variant-managed',
          name: 'Managed',
          purpose: 'managed',
          availability: 'ready',
          supportTier: 'native',
          referenceIds: ['ref-managed'],
          streamIds: [],
        },
      ],
    };

    expect(getMediaAssetPrimaryPath(asset)).toBe('/canonical/managed.mov');
  });
});

// =============================================================================
//  getMediaAssetResolutionLabel
// =============================================================================

describe('getMediaAssetResolutionLabel', () => {
  it('returns resolution with frame rate for VIDEO', () => {
    const asset: ResolutionAsset = {
      type: 'VIDEO',
      technicalMetadata: { width: 1920, height: 1080, frameRate: 24 },
    };
    expect(getMediaAssetResolutionLabel(asset)).toBe('1920x1080 @ 24fps');
  });

  it('returns resolution without frame rate when missing', () => {
    const asset: ResolutionAsset = {
      type: 'VIDEO',
      technicalMetadata: { width: 1920, height: 1080 },
    };
    expect(getMediaAssetResolutionLabel(asset)).toBe('1920x1080');
  });

  it('returns resolution for IMAGE type', () => {
    const asset: ResolutionAsset = {
      type: 'IMAGE',
      technicalMetadata: { width: 3840, height: 2160 },
    };
    expect(getMediaAssetResolutionLabel(asset)).toBe('3840x2160');
  });

  it('returns null for AUDIO type', () => {
    const asset: ResolutionAsset = {
      type: 'AUDIO',
      technicalMetadata: { width: 0, height: 0 },
    };
    expect(getMediaAssetResolutionLabel(asset)).toBeNull();
  });

  it('returns null for DOCUMENT type', () => {
    const asset: ResolutionAsset = {
      type: 'DOCUMENT',
      technicalMetadata: {},
    };
    expect(getMediaAssetResolutionLabel(asset)).toBeNull();
  });

  it('returns null when technicalMetadata is undefined', () => {
    const asset: ResolutionAsset = {
      type: 'VIDEO',
      technicalMetadata: undefined,
    };
    expect(getMediaAssetResolutionLabel(asset)).toBeNull();
  });

  it('returns null for null asset', () => {
    expect(getMediaAssetResolutionLabel(null as unknown as ResolutionAsset)).toBeNull();
  });

  it('returns null when width or height is 0', () => {
    const asset: ResolutionAsset = {
      type: 'VIDEO',
      technicalMetadata: { width: 0, height: 1080 },
    };
    expect(getMediaAssetResolutionLabel(asset)).toBeNull();
  });

  it('rounds fractional frame rates to 2 decimal places', () => {
    const asset: ResolutionAsset = {
      type: 'VIDEO',
      technicalMetadata: { width: 1920, height: 1080, frameRate: 29.97 },
    };
    expect(getMediaAssetResolutionLabel(asset)).toBe('1920x1080 @ 29.97fps');
  });

  it('ignores non-finite frame rate values', () => {
    const asset: ResolutionAsset = {
      type: 'VIDEO',
      technicalMetadata: { width: 1920, height: 1080, frameRate: NaN },
    };
    expect(getMediaAssetResolutionLabel(asset)).toBe('1920x1080');
  });
});

// =============================================================================
//  getMediaAssetTechnicalSummary
// =============================================================================

describe('getMediaAssetTechnicalSummary', () => {
  it('returns complete summary for a video with all metadata', () => {
    const asset: ResolutionAsset & { technicalMetadata: NonNullable<ResolutionAsset['technicalMetadata']> } = {
      type: 'VIDEO',
      technicalMetadata: {
        width: 1920,
        height: 1080,
        frameRate: 24,
        videoCodec: 'H.264',
        audioCodec: 'AAC',
        sampleRate: 48000,
        audioChannels: 2,
      },
    };
    const summary = getMediaAssetTechnicalSummary(asset);
    expect(summary).toContain('1920x1080 @ 24fps');
    expect(summary).toContain('H.264');
    expect(summary).toContain('AAC');
    expect(summary).toContain('48000Hz');
    expect(summary).toContain('2ch');
  });

  it('returns empty array for null asset', () => {
    expect(getMediaAssetTechnicalSummary(null as unknown as ResolutionAsset)).toEqual([]);
  });

  it('returns empty array for audio asset without metadata', () => {
    const asset: ResolutionAsset = {
      type: 'AUDIO',
      technicalMetadata: undefined,
    };
    expect(getMediaAssetTechnicalSummary(asset)).toEqual([]);
  });

  it('skips non-finite sample rate', () => {
    const asset: ResolutionAsset = {
      type: 'AUDIO',
      technicalMetadata: { sampleRate: NaN },
    };
    const summary = getMediaAssetTechnicalSummary(asset);
    expect(summary.some((s) => s.includes('Hz'))).toBe(false);
  });

  it('skips zero audio channels', () => {
    const asset: ResolutionAsset = {
      type: 'AUDIO',
      technicalMetadata: { audioChannels: 0 },
    };
    const summary = getMediaAssetTechnicalSummary(asset);
    expect(summary.some((s) => s.includes('ch'))).toBe(false);
  });
});

describe('capability helpers', () => {
  it('finds a surface capability report by target surface', () => {
    const asset = {
      capabilityReport: {
        primarySurface: 'desktop',
        primaryDisposition: 'proxy-only',
        sourceSupportTier: 'normalized',
        surfaces: [
          {
            surface: 'desktop',
            disposition: 'proxy-only',
            supportTier: 'normalized',
            reasons: ['Ready proxy available.'],
          },
          {
            surface: 'worker',
            disposition: 'mezzanine-required',
            supportTier: 'normalized',
            reasons: ['Generate mezzanine first.'],
          },
        ],
        issues: ['Generate mezzanine first.'],
      },
    } satisfies Pick<EditorMediaAsset, 'capabilityReport'>;

    expect(getMediaAssetSurfaceCapability(asset, 'worker')?.disposition).toBe('mezzanine-required');
  });

  it('formats disposition labels for UI copy', () => {
    expect(getMediaCapabilityDispositionLabel('proxy-only')).toBe('Proxy only');
    expect(getMediaCapabilityDispositionLabel('mezzanine-required')).toBe('Mezzanine required');
    expect(getMediaCapabilityDispositionLabel('native')).toBe('native');
  });
});
