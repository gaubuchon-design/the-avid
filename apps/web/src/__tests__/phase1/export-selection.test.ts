import { describe, expect, it } from 'vitest';

import { buildPlaybackFrameSignature, buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import { buildExportPlaybackSnapshot, buildExportSelectionSummary } from '../../lib/exportSelection';
import { makeClip } from '../../store/editor.store';

describe('phase 1 export selection', () => {
  const source = {
    tracks: [
      {
        id: 't-v1',
        name: 'V1',
        type: 'VIDEO' as const,
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#5b6af5',
        clips: [
          makeClip({
            id: 'clip-1',
            trackId: 't-v1',
            name: 'Opening',
            startTime: 0,
            endTime: 4,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-opening',
          }),
          makeClip({
            id: 'clip-2',
            trackId: 't-v1',
            name: 'Interview',
            startTime: 6,
            endTime: 12,
            trimStart: 1,
            trimEnd: 0,
            type: 'video',
            assetId: 'asset-interview',
          }),
        ],
      },
    ],
    subtitleTracks: [],
    titleClips: [],
    selectedClipIds: [],
    inPoint: null,
    outPoint: null,
    playheadTime: 3,
    duration: 12,
    showSafeZones: false,
    sequenceSettings: {
      fps: 24,
      width: 1920,
      height: 1080,
    },
    projectSettings: {
      frameRate: 24,
      width: 1920,
      height: 1080,
    },
  };

  it('builds full-sequence export ranges from the real timeline duration', () => {
    const summary = buildExportSelectionSummary(source, 'full');

    expect(summary.valid).toBe(true);
    expect(summary.inPoint).toBe(0);
    expect(summary.outPoint).toBe(12);
    expect(summary.duration).toBe(12);
    expect(summary.frameCount).toBe(288);
  });

  it('validates missing in/out marks before export', () => {
    const summary = buildExportSelectionSummary(source, 'inout');

    expect(summary.valid).toBe(false);
    expect(summary.issue).toBe('Set both sequence In and Out points first.');
    expect(summary.frameCount).toBe(0);
  });

  it('derives selected-clip export ranges and preview snapshots from the same contract', () => {
    const selectionSource = {
      ...source,
      selectedClipIds: ['clip-2'],
    };

    const summary = buildExportSelectionSummary(selectionSource, 'selected');
    const snapshot = buildExportPlaybackSnapshot(selectionSource, 'selected');

    expect(summary.valid).toBe(true);
    expect(summary.inPoint).toBe(6);
    expect(summary.outPoint).toBe(12);
    expect(summary.selectedClipCount).toBe(1);
    expect(snapshot.consumer).toBe('export');
    expect(snapshot.playheadTime).toBe(6);
    expect(snapshot.primaryVideoLayer?.clip.id).toBe('clip-2');
    expect(snapshot.primaryVideoLayer?.sourceTime).toBe(1);
  });

  it('keeps paused export snapshots aligned with paused record-monitor frames', () => {
    const selectionSource = {
      ...source,
      selectedClipIds: ['clip-2'],
    };

    const exportSnapshot = buildExportPlaybackSnapshot(selectionSource, 'selected');
    const recordSnapshot = buildPlaybackSnapshot({
      tracks: selectionSource.tracks,
      subtitleTracks: selectionSource.subtitleTracks,
      titleClips: selectionSource.titleClips,
      playheadTime: 6,
      duration: selectionSource.duration,
      isPlaying: false,
      showSafeZones: false,
      activeMonitor: 'record',
      activeScope: null,
      sequenceSettings: selectionSource.sequenceSettings,
      projectSettings: selectionSource.projectSettings,
    }, 'record-monitor');

    expect(buildPlaybackFrameSignature(exportSnapshot)).toBe(buildPlaybackFrameSignature(recordSnapshot));
    expect(exportSnapshot.sequenceRevision).toBe(recordSnapshot.sequenceRevision);
    expect(exportSnapshot.primaryVideoLayer?.clip.id).toBe(recordSnapshot.primaryVideoLayer?.clip.id);
    expect(exportSnapshot.primaryVideoLayer?.sourceTime).toBe(recordSnapshot.primaryVideoLayer?.sourceTime);
  });
});
