import { describe, expect, it } from 'vitest';

import { TrimSide } from '../../engine/TrimEngine';
import { resolveTrimAudioPreviewRoute } from '../../lib/trimAudioPreview';

import type { TrimMonitorPreview } from '../../lib/trimMonitorPreview';

const basePreviewSide = {
  role: 'A' as const,
  monitorLabel: 'A-SIDE',
  monitorContext: 'OUTGOING',
  trackId: 'v1',
  trackName: 'V1',
  trackType: 'VIDEO' as const,
  clipId: 'clip-a',
  clipName: 'Clip A',
  assetId: 'asset-a',
  asset: null,
  sourceTime: 1,
  timelineTime: 1,
  playable: true,
  selected: true,
  rollerSide: TrimSide.A_SIDE,
};

describe('trim audio preview routing', () => {
  it('routes A-side trim review to the source monitor', () => {
    const preview: TrimMonitorPreview = {
      active: true,
      selectionLabel: 'A',
      linkedSelection: true,
      aSide: basePreviewSide,
      bSide: {
        ...basePreviewSide,
        role: 'B',
        monitorLabel: 'B-SIDE',
        monitorContext: 'INCOMING',
        clipId: 'clip-b',
        clipName: 'Clip B',
        assetId: 'asset-b',
        sourceTime: 2,
        timelineTime: 2,
        rollerSide: TrimSide.B_SIDE,
      },
      sourceMonitor: basePreviewSide,
      recordMonitor: null,
    };

    expect(resolveTrimAudioPreviewRoute(preview, 'record')).toEqual({
      channel: 'source',
      side: basePreviewSide,
    });
  });

  it('routes AB trim review to the active monitor side', () => {
    const sourceMonitor = basePreviewSide;
    const recordMonitor = {
      ...basePreviewSide,
      role: 'B' as const,
      monitorLabel: 'B-SIDE',
      monitorContext: 'INCOMING',
      clipId: 'clip-b',
      clipName: 'Clip B',
      assetId: 'asset-b',
      sourceTime: 2,
      timelineTime: 2,
      rollerSide: TrimSide.BOTH,
    };
    const preview: TrimMonitorPreview = {
      active: true,
      selectionLabel: 'AB',
      linkedSelection: true,
      aSide: sourceMonitor,
      bSide: recordMonitor,
      sourceMonitor,
      recordMonitor,
    };

    expect(resolveTrimAudioPreviewRoute(preview, 'source')).toEqual({
      channel: 'source',
      side: sourceMonitor,
    });
    expect(resolveTrimAudioPreviewRoute(preview, 'record')).toEqual({
      channel: 'record',
      side: recordMonitor,
    });
  });
});
