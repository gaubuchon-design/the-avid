import { describe, it, expect, beforeEach } from 'vitest';
import { SnapEngine } from '../../engine/SnapEngine';
import {
  DEFAULT_INTRINSIC_VIDEO,
  DEFAULT_INTRINSIC_AUDIO,
  DEFAULT_TIME_REMAP,
} from '../../store/editor.store';

describe('SnapEngine', () => {
  let engine: SnapEngine;

  beforeEach(() => {
    engine = new SnapEngine();
  });

  it('should snap to nearby anchor', () => {
    // With zoom=60, tolerance=8px, toleranceSec = 8/60 ~= 0.133s
    // 5.02 is 0.02s away from 5.0, well within tolerance
    const result = engine.snap(5.02, 60, [5.0, 10.0]);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.time).toBe(5.0);
      expect(result.anchor).toBe(5.0);
      expect(result.delta).toBeCloseTo(0.02, 5);
    }
  });

  it('should not snap when too far from anchor', () => {
    // 5.5 is 4.5s away from 10.0, well outside tolerance of ~0.133s
    const result = engine.snap(5.5, 60, [10.0]);
    expect(result).toBeNull();
  });

  it('should snap to nearest anchor when multiple are close', () => {
    // 5.05 is 0.05s from 5.0 and 0.05s from 5.1; both within tolerance
    // Should pick the closest: 5.0 (distance 0.05)
    const result = engine.snap(5.05, 60, [5.0, 5.1]);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.time).toBe(5.0);
    }
  });

  it('should return null when snapping is disabled', () => {
    engine.setEnabled(false);
    const result = engine.snap(5.02, 60, [5.0, 10.0]);
    expect(result).toBeNull();
  });

  it('should return null for empty anchors', () => {
    const result = engine.snap(5.0, 60, []);
    expect(result).toBeNull();
  });

  it('should respect tolerance setting', () => {
    // Default tolerance is 8px. At zoom=60, toleranceSec = 8/60 ~= 0.133s
    // 0.2s away from 5.0 should NOT snap
    const result = engine.snap(5.2, 60, [5.0]);
    expect(result).toBeNull();

    // Increase tolerance to 20px => toleranceSec = 20/60 ~= 0.333s
    engine.setTolerance(20);
    const result2 = engine.snap(5.2, 60, [5.0]);
    expect(result2).not.toBeNull();
  });

  it('should report enabled state', () => {
    expect(engine.isEnabled()).toBe(true);
    engine.setEnabled(false);
    expect(engine.isEnabled()).toBe(false);
  });

  it('should collect anchors from tracks', () => {
    const tracks = [
      {
        id: 't1',
        name: 'V1',
        type: 'VIDEO' as const,
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#fff',
        clips: [
          { id: 'c1', trackId: 't1', name: 'Clip 1', startTime: 0, endTime: 5, trimStart: 0, trimEnd: 0, type: 'video' as const, intrinsicVideo: DEFAULT_INTRINSIC_VIDEO, intrinsicAudio: DEFAULT_INTRINSIC_AUDIO, timeRemap: DEFAULT_TIME_REMAP },
          { id: 'c2', trackId: 't1', name: 'Clip 2', startTime: 7, endTime: 12, trimStart: 0, trimEnd: 0, type: 'video' as const, intrinsicVideo: DEFAULT_INTRINSIC_VIDEO, intrinsicAudio: DEFAULT_INTRINSIC_AUDIO, timeRemap: DEFAULT_TIME_REMAP },
        ],
      },
    ];
    const markers = [{ id: 'm1', time: 3, label: 'Marker', color: '#f00' }];
    const anchors = engine.collectAnchors(tracks, 8.5, markers);

    // Should include: 0 (origin), 5 (c1 end), 7 (c2 start), 12 (c2 end), 8.5 (playhead), 3 (marker)
    expect(anchors).toContain(0);
    expect(anchors).toContain(5);
    expect(anchors).toContain(7);
    expect(anchors).toContain(12);
    expect(anchors).toContain(8.5);
    expect(anchors).toContain(3);
    expect(anchors.length).toBe(6);
  });

  it('should exclude a specific clip from anchors', () => {
    const tracks = [
      {
        id: 't1',
        name: 'V1',
        type: 'VIDEO' as const,
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#fff',
        clips: [
          { id: 'c1', trackId: 't1', name: 'Clip 1', startTime: 0, endTime: 5, trimStart: 0, trimEnd: 0, type: 'video' as const, intrinsicVideo: DEFAULT_INTRINSIC_VIDEO, intrinsicAudio: DEFAULT_INTRINSIC_AUDIO, timeRemap: DEFAULT_TIME_REMAP },
          { id: 'c2', trackId: 't1', name: 'Clip 2', startTime: 7, endTime: 12, trimStart: 0, trimEnd: 0, type: 'video' as const, intrinsicVideo: DEFAULT_INTRINSIC_VIDEO, intrinsicAudio: DEFAULT_INTRINSIC_AUDIO, timeRemap: DEFAULT_TIME_REMAP },
        ],
      },
    ];
    const markers: any[] = [];
    const anchors = engine.collectAnchors(tracks, 0, markers, 'c1');

    // Should NOT include c1's edges (0, 5) from c1 — but 0 is also the origin so it's still there
    expect(anchors).toContain(0);   // origin
    expect(anchors).toContain(7);   // c2 start
    expect(anchors).toContain(12);  // c2 end
    // c1's startTime=0 is also origin, so we can't distinguish, but c1's endTime=5 should be excluded
    expect(anchors).not.toContain(5);
  });

  it('should return sorted anchors', () => {
    const tracks = [
      {
        id: 't1',
        name: 'V1',
        type: 'VIDEO' as const,
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#fff',
        clips: [
          { id: 'c1', trackId: 't1', name: 'Clip 1', startTime: 10, endTime: 20, trimStart: 0, trimEnd: 0, type: 'video' as const, intrinsicVideo: DEFAULT_INTRINSIC_VIDEO, intrinsicAudio: DEFAULT_INTRINSIC_AUDIO, timeRemap: DEFAULT_TIME_REMAP },
        ],
      },
    ];
    const markers = [{ id: 'm1', time: 5, label: 'M', color: '#f00' }];
    const anchors = engine.collectAnchors(tracks, 15, markers);

    // Check sorted order
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i]).toBeGreaterThanOrEqual(anchors[i - 1]!);
    }
  });
});
