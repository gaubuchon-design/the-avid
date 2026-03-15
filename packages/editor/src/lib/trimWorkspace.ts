import { TrimSide, trimEngine } from '../engine/TrimEngine';
import { useEditorStore } from '../store/editor.store';
import { useUserSettingsStore } from '../store/userSettings.store';
import { enterTrimModeFromContext, type TrimEntryTarget } from './trimEntry';

export type TrimWorkspaceRequest =
  | { outcome: 'entered'; target: TrimEntryTarget }
  | { outcome: 'toggled-view' }
  | { outcome: 'noop' };

export function requestTrimWorkspace(side: TrimSide = TrimSide.BOTH): TrimWorkspaceRequest {
  const state = useEditorStore.getState();
  const userSettings = useUserSettingsStore.getState().settings;

  if (trimEngine.getState().active || state.trimActive) {
    state.toggleTrimViewMode();
    return { outcome: 'toggled-view' };
  }

  state.setActiveTool('trim');
  const target = enterTrimModeFromContext(state, { side });
  if (!target) {
    return { outcome: 'noop' };
  }

  if (userSettings.trimViewPreference === 'small' || userSettings.trimViewPreference === 'big') {
    useEditorStore.getState().setTrimViewMode(userSettings.trimViewPreference);
  }
  useEditorStore.getState().selectTrack(target.anchorTrackId);
  useEditorStore.getState().clearTrimEditPoints();
  return { outcome: 'entered', target };
}

export function exitTrimWorkspace(): void {
  const state = useEditorStore.getState();
  if (!trimEngine.getState().active && !state.trimActive) {
    return;
  }

  trimEngine.exitTrimMode();
}

export function scrubTimelineTimecodeTrack(nextTime: number): void {
  if (useUserSettingsStore.getState().settings.trimRulerExitsTrim) {
    exitTrimWorkspace();
  }
  useEditorStore.getState().setPlayhead(nextTime);
}
