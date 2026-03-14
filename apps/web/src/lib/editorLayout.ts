export interface EditorLayoutState {
  binWidth: number;
  trackerWidth: number;
  inspectorWidth: number;
  timelineHeight: number;
  dualMonitorSplit: number;
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

export function clampEditorLayoutForViewport(
  layout: EditorLayoutState,
  viewportWidth: number,
  viewportHeight: number,
): EditorLayoutState {
  const safeWidth = Math.max(960, viewportWidth);
  const safeHeight = Math.max(720, viewportHeight);
  const maxBinWidth = Math.min(420, Math.max(260, Math.floor(safeWidth * 0.34)));
  const maxTrackerWidth = Math.min(420, Math.max(280, Math.floor(safeWidth * 0.28)));
  const maxInspectorWidth = Math.min(440, Math.max(300, Math.floor(safeWidth * 0.32)));
  const maxTimelineHeight = Math.min(460, Math.max(220, Math.floor(safeHeight * 0.46)));

  return {
    ...layout,
    binWidth: clamp(layout.binWidth, 220, maxBinWidth),
    trackerWidth: clamp(layout.trackerWidth, 260, maxTrackerWidth),
    inspectorWidth: clamp(layout.inspectorWidth, 280, maxInspectorWidth),
    timelineHeight: clamp(layout.timelineHeight, 180, maxTimelineHeight),
    dualMonitorSplit: clamp(layout.dualMonitorSplit, 30, 70),
  };
}
