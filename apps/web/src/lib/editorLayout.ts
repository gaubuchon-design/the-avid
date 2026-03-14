export interface EditorLayoutState {
  binWidth: number;
  trackerWidth: number;
  inspectorWidth: number;
  timelineHeight: number;
  dualMonitorSplit: number;
}

export interface EditorLayoutViewportBounds {
  minBinWidth: number;
  maxBinWidth: number;
  minTrackerWidth: number;
  maxTrackerWidth: number;
  minInspectorWidth: number;
  maxInspectorWidth: number;
  minTimelineHeight: number;
  maxTimelineHeight: number;
}

export const EDITOR_LAYOUT_STORAGE_KEY = 'the-avid.editor-layout.v1';

export const DEFAULT_EDITOR_LAYOUT: EditorLayoutState = {
  binWidth: 300,
  trackerWidth: 320,
  inspectorWidth: 340,
  timelineHeight: 290,
  dualMonitorSplit: 50,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function sanitizeEditorLayout(
  candidate: Partial<EditorLayoutState> | null | undefined,
): EditorLayoutState {
  const next = {
    ...DEFAULT_EDITOR_LAYOUT,
    ...(candidate ?? {}),
  };

  return {
    binWidth: clamp(Number(next.binWidth) || DEFAULT_EDITOR_LAYOUT.binWidth, 220, 480),
    trackerWidth: clamp(Number(next.trackerWidth) || DEFAULT_EDITOR_LAYOUT.trackerWidth, 260, 420),
    inspectorWidth: clamp(Number(next.inspectorWidth) || DEFAULT_EDITOR_LAYOUT.inspectorWidth, 280, 460),
    timelineHeight: clamp(Number(next.timelineHeight) || DEFAULT_EDITOR_LAYOUT.timelineHeight, 180, 480),
    dualMonitorSplit: clamp(Number(next.dualMonitorSplit) || DEFAULT_EDITOR_LAYOUT.dualMonitorSplit, 30, 70),
  };
}

export function readStoredEditorLayout(storage: Storage | null | undefined): EditorLayoutState {
  if (!storage) {
    return DEFAULT_EDITOR_LAYOUT;
  }

  try {
    const raw = storage.getItem(EDITOR_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_EDITOR_LAYOUT;
    }

    return sanitizeEditorLayout(JSON.parse(raw) as Partial<EditorLayoutState>);
  } catch {
    return DEFAULT_EDITOR_LAYOUT;
  }
}

export function getEditorLayoutViewportBounds(
  viewportWidth: number,
  viewportHeight: number,
): EditorLayoutViewportBounds {
  const safeWidth = Math.max(640, viewportWidth);
  const safeHeight = Math.max(560, viewportHeight);
  const compactWidth = safeWidth < 1100;
  const compactHeight = safeHeight < 820;
  const minBinWidth = compactWidth ? 180 : 220;
  const minTrackerWidth = compactWidth ? 220 : 260;
  const minInspectorWidth = compactWidth ? 240 : 280;
  const minTimelineHeight = compactHeight ? 160 : 180;

  return {
    minBinWidth,
    maxBinWidth: Math.min(420, Math.max(minBinWidth, Math.floor(safeWidth * (compactWidth ? 0.28 : 0.34)))),
    minTrackerWidth,
    maxTrackerWidth: Math.min(420, Math.max(minTrackerWidth, Math.floor(safeWidth * (compactWidth ? 0.26 : 0.28)))),
    minInspectorWidth,
    maxInspectorWidth: Math.min(440, Math.max(minInspectorWidth, Math.floor(safeWidth * (compactWidth ? 0.3 : 0.32)))),
    minTimelineHeight,
    maxTimelineHeight: Math.min(460, Math.max(minTimelineHeight, Math.floor(safeHeight * (compactHeight ? 0.38 : 0.46)))),
  };
}

export function clampEditorLayoutForViewport(
  layout: EditorLayoutState,
  viewportWidth: number,
  viewportHeight: number,
): EditorLayoutState {
  const bounds = getEditorLayoutViewportBounds(viewportWidth, viewportHeight);

  return {
    ...layout,
    binWidth: clamp(layout.binWidth, bounds.minBinWidth, bounds.maxBinWidth),
    trackerWidth: clamp(layout.trackerWidth, bounds.minTrackerWidth, bounds.maxTrackerWidth),
    inspectorWidth: clamp(layout.inspectorWidth, bounds.minInspectorWidth, bounds.maxInspectorWidth),
    timelineHeight: clamp(layout.timelineHeight, bounds.minTimelineHeight, bounds.maxTimelineHeight),
    dualMonitorSplit: clamp(layout.dualMonitorSplit, 30, 70),
  };
}
