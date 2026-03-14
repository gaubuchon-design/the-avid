import { describe, it, expect } from 'vitest';
import {
  FrameRateMixer,
  FrameRateMixerError,
  STANDARD_FRAME_RATES,
  FRAME_RATE_PRESETS,
} from '../sequence/FrameRateMixer';
import type { EditorProject, EditorTrack, EditorClip, EditorBin, EditorMediaAsset } from '../project-library';

// =============================================================================
//  Test helpers
// =============================================================================

function makeAsset(id: string, frameRate?: number): EditorMediaAsset {
  return {
    id,
    name: `asset-${id}`,
    type: 'VIDEO',
    status: 'READY',
    tags: [],
    isFavorite: false,
    technicalMetadata: frameRate !== undefined ? { frameRate } : undefined,
  };
}

function makeClip(id: string, assetId?: string, startTime = 0, endTime = 10): EditorClip {
  return {
    id,
    trackId: 'track-1',
    name: `clip-${id}`,
    startTime,
    endTime,
    trimStart: 0,
    trimEnd: endTime - startTime,
    type: 'video',
    assetId,
  };
}

function makeTrack(clips: EditorClip[]): EditorTrack {
  return {
    id: 'track-1',
    name: 'V1',
    type: 'VIDEO',
    sortOrder: 0,
    muted: false,
    locked: false,
    solo: false,
    volume: 1,
    clips,
    color: '#00ff00',
  };
}

function makeProject(
  frameRate: number,
  tracks: EditorTrack[] = [],
  bins: EditorBin[] = [],
): EditorProject {
  return {
    schemaVersion: 2,
    id: 'proj-1',
    name: 'Test Project',
    description: '',
    template: 'film',
    tags: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    progress: 0,
    settings: {
      frameRate,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      exportFormat: 'mp4',
    },
    tracks,
    markers: [],
    bins,
    collaborators: [],
    aiJobs: [],
    transcript: [],
    transcriptSpeakers: [],
    scriptDocument: null,
    transcriptionSettings: {
      provider: 'local-faster-whisper',
      translationProvider: 'local-runtime',
      preferredLanguage: 'auto',
      enableDiarization: true,
      enableSpeakerIdentification: false,
      translateToEnglish: false,
    },
    reviewComments: [],
    approvals: [],
    publishJobs: [],
    watchFolders: [],
    tokenBalance: 1000,
    editorialState: {
      selectedBinId: bins[0]?.id ?? null,
      sourceAssetId: null,
      enabledTrackIds: tracks.map((track) => track.id),
      syncLockedTrackIds: [],
      videoMonitorTrackId: tracks.find((track) => track.type === 'VIDEO' || track.type === 'GRAPHIC')?.id ?? null,
      sourceTrackDescriptors: [],
      trackPatches: [],
    },
    workstationState: {
      subtitleTracks: [],
      titleClips: [],
      trackHeights: {},
      activeWorkspaceId: 'source-record',
      composerLayout: 'source-record',
      showTrackingInfo: true,
      trackingInfoFields: ['master-tc', 'duration'],
      clipTextDisplay: 'name',
      dupeDetectionEnabled: false,
      versionHistoryRetentionPreference: 'manual',
      versionHistoryCompareMode: 'summary',
    },
  };
}

function makeBin(assets: EditorMediaAsset[]): EditorBin {
  return {
    id: 'bin-1',
    name: 'Main',
    color: '#fff',
    children: [],
    assets,
    isOpen: true,
  };
}

// =============================================================================
//  Constructor
// =============================================================================

describe('FrameRateMixer constructor', () => {
  it('creates instance with valid project', () => {
    const project = makeProject(24);
    expect(() => new FrameRateMixer(project)).not.toThrow();
  });

  it('throws for null project', () => {
    expect(() => new FrameRateMixer(null as unknown as EditorProject)).toThrow(FrameRateMixerError);
  });

  it('throws for invalid frame rate (0)', () => {
    const project = makeProject(0);
    expect(() => new FrameRateMixer(project)).toThrow(FrameRateMixerError);
    try {
      new FrameRateMixer(project);
    } catch (e) {
      expect((e as FrameRateMixerError).code).toBe('INVALID_FRAME_RATE');
    }
  });

  it('throws for negative frame rate', () => {
    const project = makeProject(-1);
    expect(() => new FrameRateMixer(project)).toThrow(FrameRateMixerError);
  });

  it('throws for NaN frame rate', () => {
    const project = makeProject(NaN);
    expect(() => new FrameRateMixer(project)).toThrow(FrameRateMixerError);
  });
});

// =============================================================================
//  Static: areEquivalent
// =============================================================================

describe('FrameRateMixer.areEquivalent', () => {
  it('returns true for identical rates', () => {
    expect(FrameRateMixer.areEquivalent(24, 24)).toBe(true);
  });

  it('returns true for rates within 0.02 tolerance', () => {
    expect(FrameRateMixer.areEquivalent(23.976, 23.98)).toBe(true);
  });

  it('returns false for rates differing by more than 0.02', () => {
    expect(FrameRateMixer.areEquivalent(24, 25)).toBe(false);
  });

  it('returns false for non-finite inputs', () => {
    expect(FrameRateMixer.areEquivalent(NaN, 24)).toBe(false);
    expect(FrameRateMixer.areEquivalent(24, Infinity)).toBe(false);
  });

  it('returns false for non-positive inputs', () => {
    expect(FrameRateMixer.areEquivalent(0, 0)).toBe(false);
    expect(FrameRateMixer.areEquivalent(-1, -1)).toBe(false);
  });
});

// =============================================================================
//  Static: nearestStandard
// =============================================================================

describe('FrameRateMixer.nearestStandard', () => {
  it.each([
    [23, 23.976],
    [24, 24],
    [25, 25],
    [30, 30],
    [60, 60],
    [29.97, 29.97],
    [59.94, 59.94],
  ])('nearestStandard(%s) returns %s', (input, expected) => {
    expect(FrameRateMixer.nearestStandard(input)).toBe(expected);
  });

  it('throws for non-positive rate', () => {
    expect(() => FrameRateMixer.nearestStandard(0)).toThrow(FrameRateMixerError);
    expect(() => FrameRateMixer.nearestStandard(-5)).toThrow(FrameRateMixerError);
  });

  it('throws for NaN', () => {
    expect(() => FrameRateMixer.nearestStandard(NaN)).toThrow(FrameRateMixerError);
  });
});

// =============================================================================
//  Static: convertFrames
// =============================================================================

describe('FrameRateMixer.convertFrames', () => {
  it('converts 24 frames from 24fps to 30fps', () => {
    const result = FrameRateMixer.convertFrames(24, 24, 30);
    expect(result).toBe(30);
  });

  it('converts 30 frames from 30fps to 24fps', () => {
    const result = FrameRateMixer.convertFrames(30, 30, 24);
    expect(result).toBe(24);
  });

  it('handles zero frames', () => {
    expect(FrameRateMixer.convertFrames(0, 24, 30)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    // 10 frames at 24fps = 10/24 seconds = 0.4167s
    // 0.4167 * 30 = 12.5 -> rounds to 13
    const result = FrameRateMixer.convertFrames(10, 24, 30);
    expect(result).toBe(13);
  });

  it('throws for negative frames', () => {
    expect(() => FrameRateMixer.convertFrames(-1, 24, 30)).toThrow(FrameRateMixerError);
  });

  it('throws for non-positive fromRate', () => {
    expect(() => FrameRateMixer.convertFrames(10, 0, 30)).toThrow(FrameRateMixerError);
  });

  it('throws for non-positive toRate', () => {
    expect(() => FrameRateMixer.convertFrames(10, 24, 0)).toThrow(FrameRateMixerError);
  });

  it('throws for NaN frames', () => {
    expect(() => FrameRateMixer.convertFrames(NaN, 24, 30)).toThrow(FrameRateMixerError);
  });

  it('throws for Infinity fromRate', () => {
    expect(() => FrameRateMixer.convertFrames(10, Infinity, 30)).toThrow(FrameRateMixerError);
  });
});

// =============================================================================
//  Static: getConversionRatio
// =============================================================================

describe('FrameRateMixer.getConversionRatio', () => {
  it('returns ratio for standard frame rate pair', () => {
    const ratio = FrameRateMixer.getConversionRatio(24, 30);
    expect(ratio).toBeCloseTo(30 / 24, 10);
  });

  it('returns undefined for non-standard pair', () => {
    expect(FrameRateMixer.getConversionRatio(17, 30)).toBeUndefined();
  });

  it('returns undefined for same rate (not in LUT)', () => {
    expect(FrameRateMixer.getConversionRatio(24, 24)).toBeUndefined();
  });
});

// =============================================================================
//  getSummary
// =============================================================================

describe('FrameRateMixer.getSummary', () => {
  it('returns summary for empty project', () => {
    const project = makeProject(24);
    const mixer = new FrameRateMixer(project);
    const summary = mixer.getSummary();

    expect(summary.timelineFrameRate).toBe(24);
    expect(summary.totalClips).toBe(0);
    expect(summary.matchingClips).toBe(0);
    expect(summary.mismatchedClips).toBe(0);
    expect(summary.isFullyConformed).toBe(true);
    expect(summary.uniqueFrameRates).toEqual([]);
    expect(summary.breakdown).toEqual([]);
  });

  it('reports matching clips correctly', () => {
    const asset = makeAsset('a1', 24);
    const clip = makeClip('c1', 'a1');
    const track = makeTrack([clip]);
    const bin = makeBin([asset]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);
    const summary = mixer.getSummary();

    expect(summary.totalClips).toBe(1);
    expect(summary.matchingClips).toBe(1);
    expect(summary.mismatchedClips).toBe(0);
    expect(summary.isFullyConformed).toBe(true);
  });

  it('detects mismatched clips', () => {
    const asset24 = makeAsset('a24', 24);
    const asset30 = makeAsset('a30', 30);
    const clip1 = makeClip('c1', 'a24');
    const clip2 = makeClip('c2', 'a30');
    const track = makeTrack([clip1, clip2]);
    const bin = makeBin([asset24, asset30]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);
    const summary = mixer.getSummary();

    expect(summary.totalClips).toBe(2);
    expect(summary.matchingClips).toBe(1);
    expect(summary.mismatchedClips).toBe(1);
    expect(summary.isFullyConformed).toBe(false);
    expect(summary.uniqueFrameRates).toEqual([24, 30]);
  });

  it('calculates percentage breakdown', () => {
    const asset = makeAsset('a1', 24);
    const clip1 = makeClip('c1', 'a1');
    const clip2 = makeClip('c2', 'a1');
    const track = makeTrack([clip1, clip2]);
    const bin = makeBin([asset]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);
    const summary = mixer.getSummary();

    expect(summary.breakdown).toHaveLength(1);
    expect(summary.breakdown[0]!.frameRate).toBe(24);
    expect(summary.breakdown[0]!.clipCount).toBe(2);
    expect(summary.breakdown[0]!.percentage).toBe(100);
  });
});

// =============================================================================
//  getWarnings
// =============================================================================

describe('FrameRateMixer.getWarnings', () => {
  it('returns empty array when all clips match', () => {
    const asset = makeAsset('a1', 24);
    const clip = makeClip('c1', 'a1');
    const track = makeTrack([clip]);
    const bin = makeBin([asset]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);

    expect(mixer.getWarnings()).toEqual([]);
  });

  it('returns warnings for mismatched clips', () => {
    const asset = makeAsset('a1', 30);
    const clip = makeClip('c1', 'a1');
    const track = makeTrack([clip]);
    const bin = makeBin([asset]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);
    const warnings = mixer.getWarnings();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.clipId).toBe('c1');
    expect(warnings[0]!.severity).not.toBe('none');
    expect(warnings[0]!.message).toContain('clip-c1');
    expect(warnings[0]!.suggestedConform).toBeDefined();
    expect(warnings[0]!.availableConforms.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty project', () => {
    const project = makeProject(24);
    const mixer = new FrameRateMixer(project);
    expect(mixer.getWarnings()).toEqual([]);
  });
});

// =============================================================================
//  getClipIndicators
// =============================================================================

describe('FrameRateMixer.getClipIndicators', () => {
  it('returns indicators for all clips', () => {
    const asset = makeAsset('a1', 24);
    const clip1 = makeClip('c1', 'a1');
    const clip2 = makeClip('c2', 'a1', 10, 20);
    const track = makeTrack([clip1, clip2]);
    const bin = makeBin([asset]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);
    const indicators = mixer.getClipIndicators();

    expect(indicators).toHaveLength(2);
    expect(indicators[0]!.isMismatch).toBe(false);
    expect(indicators[0]!.sourceFrameRate).toBe(24);
    expect(indicators[0]!.timelineFrameRate).toBe(24);
    expect(indicators[0]!.severity).toBe('none');
  });

  it('marks mismatched clips', () => {
    const asset = makeAsset('a1', 30);
    const clip = makeClip('c1', 'a1');
    const track = makeTrack([clip]);
    const bin = makeBin([asset]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);
    const indicators = mixer.getClipIndicators();

    expect(indicators[0]!.isMismatch).toBe(true);
    expect(indicators[0]!.conformMethod).toBe('nearest');
    expect(indicators[0]!.speedRatio).toBe(1.0);
  });

  it('returns empty array for empty project', () => {
    const project = makeProject(24);
    const mixer = new FrameRateMixer(project);
    expect(mixer.getClipIndicators()).toEqual([]);
  });
});

// =============================================================================
//  conform
// =============================================================================

describe('FrameRateMixer.conform', () => {
  it('applies conform to a single clip', () => {
    const asset = makeAsset('a1', 30);
    const clip = makeClip('c1', 'a1', 0, 10);
    const track = makeTrack([clip]);
    const bin = makeBin([asset]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);

    const result = mixer.conform({ clipId: 'c1', method: 'blend', applyToAll: false });

    expect(result.clipsAffected).toBe(1);
    expect(result.details[0]!.clipId).toBe('c1');
    expect(result.details[0]!.method).toBe('blend');
    expect(mixer.getConformMethod('c1')).toBe('blend');
  });

  it('applies conform to all clips with same frame rate', () => {
    const asset = makeAsset('a1', 30);
    const clip1 = makeClip('c1', 'a1', 0, 5);
    const clip2 = makeClip('c2', 'a1', 5, 10);
    const track = makeTrack([clip1, clip2]);
    const bin = makeBin([asset]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);

    const result = mixer.conform({ clipId: 'c1', method: 'nearest', applyToAll: true });

    expect(result.clipsAffected).toBe(2);
  });

  it('throws for non-existent clip', () => {
    const project = makeProject(24);
    const mixer = new FrameRateMixer(project);

    expect(() => mixer.conform({ clipId: 'nonexistent', method: 'blend', applyToAll: false })).toThrow(
      FrameRateMixerError,
    );
  });

  it('throws for empty clipId', () => {
    const project = makeProject(24);
    const mixer = new FrameRateMixer(project);

    expect(() => mixer.conform({ clipId: '', method: 'blend', applyToAll: false })).toThrow(
      FrameRateMixerError,
    );
  });
});

// =============================================================================
//  clearConforms
// =============================================================================

describe('FrameRateMixer.clearConforms', () => {
  it('clears all conform overrides', () => {
    const asset = makeAsset('a1', 30);
    const clip = makeClip('c1', 'a1');
    const track = makeTrack([clip]);
    const bin = makeBin([asset]);
    const project = makeProject(24, [track], [bin]);
    const mixer = new FrameRateMixer(project);

    mixer.conform({ clipId: 'c1', method: 'blend', applyToAll: false });
    expect(mixer.getConformMethod('c1')).toBe('blend');

    mixer.clearConforms();
    expect(mixer.getConformMethod('c1')).toBe('none');
  });
});

// =============================================================================
//  Constants
// =============================================================================

describe('FrameRateMixer constants', () => {
  it('STANDARD_FRAME_RATES contains common rates', () => {
    expect(STANDARD_FRAME_RATES).toContain(24);
    expect(STANDARD_FRAME_RATES).toContain(25);
    expect(STANDARD_FRAME_RATES).toContain(30);
    expect(STANDARD_FRAME_RATES).toContain(60);
    expect(STANDARD_FRAME_RATES).toContain(23.976);
    expect(STANDARD_FRAME_RATES).toContain(29.97);
  });

  it('FRAME_RATE_PRESETS maps labels to numbers', () => {
    expect(FRAME_RATE_PRESETS['Film (24)']).toBe(24);
    expect(FRAME_RATE_PRESETS['PAL (25)']).toBe(25);
    expect(FRAME_RATE_PRESETS['HD (30)']).toBe(30);
  });
});

// =============================================================================
//  FrameRateMixerError
// =============================================================================

describe('FrameRateMixerError', () => {
  it('has correct name and code', () => {
    const error = new FrameRateMixerError('test', 'INVALID_FRAME_RATE');
    expect(error.name).toBe('FrameRateMixerError');
    expect(error.code).toBe('INVALID_FRAME_RATE');
    expect(error.message).toBe('test');
    expect(error).toBeInstanceOf(Error);
  });
});
