import { describe, expect, it } from 'vitest';

import {
  clampEditorLayoutForViewport,
  DEFAULT_EDITOR_LAYOUT,
  getEditorLayoutViewportBounds,
  sanitizeEditorLayout,
} from '../../lib/editorLayout';

describe('editorLayout utilities', () => {
  it('sanitizes persisted layout values into safe editor bounds', () => {
    expect(sanitizeEditorLayout({
      binWidth: 999,
      trackerWidth: -20,
      inspectorWidth: 12,
      timelineHeight: 999,
      dualMonitorSplit: 400,
    })).toEqual({
      binWidth: 480,
      trackerWidth: 260,
      inspectorWidth: 280,
      timelineHeight: 480,
      dualMonitorSplit: 70,
    });
  });

  it('clamps layout to the current viewport while preserving preferences when possible', () => {
    expect(clampEditorLayoutForViewport({
      ...DEFAULT_EDITOR_LAYOUT,
      binWidth: 420,
      trackerWidth: 420,
      inspectorWidth: 460,
      timelineHeight: 480,
      dualMonitorSplit: 65,
    }, 1280, 780)).toEqual({
      binWidth: 420,
      trackerWidth: 358,
      inspectorWidth: 409,
      timelineHeight: 296,
      dualMonitorSplit: 65,
    });
  });

  it('shrinks layout bounds for narrower and shorter viewports', () => {
    expect(getEditorLayoutViewportBounds(900, 640)).toEqual({
      minBinWidth: 180,
      maxBinWidth: 252,
      minTrackerWidth: 220,
      maxTrackerWidth: 234,
      minInspectorWidth: 240,
      maxInspectorWidth: 270,
      minTimelineHeight: 160,
      maxTimelineHeight: 243,
    });

    expect(clampEditorLayoutForViewport({
      ...DEFAULT_EDITOR_LAYOUT,
      binWidth: 320,
      trackerWidth: 320,
      inspectorWidth: 360,
      timelineHeight: 320,
      dualMonitorSplit: 50,
    }, 900, 640)).toEqual({
      binWidth: 252,
      trackerWidth: 234,
      inspectorWidth: 270,
      timelineHeight: 243,
      dualMonitorSplit: 50,
    });
  });
});
