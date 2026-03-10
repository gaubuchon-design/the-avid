import { TrimMode, TrimSide, trimEngine } from '../engine/TrimEngine';
import { useEditorStore } from '../store/editor.store';

function normalizeFrameValue(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function getTrimSelectionLabel(): ReturnType<typeof useEditorStore.getState>['trimSelectionLabel'] {
  const { active, rollers } = trimEngine.getState();
  if (!active || rollers.length === 0) {
    return 'OFF';
  }

  const sides = new Set(rollers.map((roller) => roller.side));
  if (sides.size > 1) {
    return 'ASYM';
  }

  const [side] = sides;
  switch (side) {
    case TrimSide.A_SIDE:
      return 'A';
    case TrimSide.B_SIDE:
      return 'B';
    case TrimSide.BOTH:
      return 'AB';
    default:
      return 'OFF';
  }
}

function mapTrimMode(mode: TrimMode): ReturnType<typeof useEditorStore.getState>['trimMode'] {
  switch (mode) {
    case TrimMode.ROLL:
      return 'roll';
    case TrimMode.RIPPLE:
      return 'ripple';
    case TrimMode.SLIP:
      return 'slip';
    case TrimMode.SLIDE:
      return 'slide';
    case TrimMode.ASYMMETRIC:
      return 'asymmetric';
    default:
      return 'off';
  }
}

export function getTrimStateSnapshot(): Pick<
  ReturnType<typeof useEditorStore.getState>,
  'trimActive' | 'trimMode' | 'trimCounterFrames' | 'trimASideFrames' | 'trimBSideFrames' | 'trimSelectionLabel'
> {
  const trimState = trimEngine.getState();
  const trimDisplay = trimEngine.getTrimDisplay();

  return {
    trimActive: trimState.active,
    trimMode: trimState.active ? mapTrimMode(trimState.mode) : 'off',
    trimCounterFrames: trimState.active ? normalizeFrameValue(trimDisplay.trimCounter) : 0,
    trimASideFrames: trimState.active ? normalizeFrameValue(trimDisplay.aSideFrame) : 0,
    trimBSideFrames: trimState.active ? normalizeFrameValue(trimDisplay.bSideFrame) : 0,
    trimSelectionLabel: getTrimSelectionLabel(),
  };
}

export function syncTrimStateToStore(): void {
  const next = getTrimStateSnapshot();
  const current = useEditorStore.getState();

  if (
    current.trimActive === next.trimActive
    && current.trimMode === next.trimMode
    && current.trimCounterFrames === next.trimCounterFrames
    && current.trimASideFrames === next.trimASideFrames
    && current.trimBSideFrames === next.trimBSideFrames
    && current.trimSelectionLabel === next.trimSelectionLabel
  ) {
    return;
  }

  useEditorStore.setState(next);
}

export function subscribeTrimStateToStore(): () => void {
  syncTrimStateToStore();
  return trimEngine.subscribe(() => {
    syncTrimStateToStore();
  });
}
