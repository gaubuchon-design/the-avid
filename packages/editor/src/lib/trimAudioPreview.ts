import type { TrimMonitorPreview, TrimPreviewSide } from './trimMonitorPreview';

export interface TrimAudioPreviewRoute {
  channel: 'source' | 'record' | null;
  side: TrimPreviewSide | null;
}

export function resolveTrimAudioPreviewRoute(
  preview: TrimMonitorPreview,
  activeMonitor: 'source' | 'record',
): TrimAudioPreviewRoute {
  if (!preview.active) {
    return { channel: null, side: null };
  }

  const sourceSide = preview.sourceMonitor ?? preview.aSide;
  const recordSide = preview.recordMonitor ?? preview.bSide;

  if (preview.selectionLabel === 'A' && sourceSide) {
    return { channel: 'source', side: sourceSide };
  }

  if (preview.selectionLabel === 'B' && recordSide) {
    return { channel: 'record', side: recordSide };
  }

  if (preview.selectionLabel === 'AB' || preview.selectionLabel === 'ASYM') {
    if (activeMonitor === 'source' && sourceSide) {
      return { channel: 'source', side: sourceSide };
    }

    if (activeMonitor === 'record' && recordSide) {
      return { channel: 'record', side: recordSide };
    }

    return { channel: sourceSide ? 'source' : (recordSide ? 'record' : null), side: sourceSide ?? recordSide ?? null };
  }

  return { channel: null, side: null };
}
