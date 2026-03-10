import { smartToolEngine } from '../engine/SmartToolEngine';
import { useEditorStore } from '../store/editor.store';

export function getSmartToolStateSnapshot(): Pick<
  ReturnType<typeof useEditorStore.getState>,
  'smartToolLiftOverwrite' | 'smartToolExtractSplice' | 'smartToolOverwriteTrim' | 'smartToolRippleTrim'
> {
  const state = smartToolEngine.getState();

  return {
    smartToolLiftOverwrite: state.liftOverwriteSegment,
    smartToolExtractSplice: state.extractSpliceSegment,
    smartToolOverwriteTrim: state.overwriteTrim,
    smartToolRippleTrim: state.rippleTrim,
  };
}

export function syncSmartToolStateToStore(): void {
  const next = getSmartToolStateSnapshot();
  const current = useEditorStore.getState();

  if (
    current.smartToolLiftOverwrite === next.smartToolLiftOverwrite
    && current.smartToolExtractSplice === next.smartToolExtractSplice
    && current.smartToolOverwriteTrim === next.smartToolOverwriteTrim
    && current.smartToolRippleTrim === next.smartToolRippleTrim
  ) {
    return;
  }

  useEditorStore.setState(next);
}

export function syncSmartToolStateFromStore(): void {
  const state = useEditorStore.getState();

  smartToolEngine.setSmartToolState({
    liftOverwriteSegment: state.smartToolLiftOverwrite,
    extractSpliceSegment: state.smartToolExtractSplice,
    overwriteTrim: state.smartToolOverwriteTrim,
    rippleTrim: state.smartToolRippleTrim,
  });
}

export function subscribeSmartToolStateToStore(): () => void {
  syncSmartToolStateFromStore();
  syncSmartToolStateToStore();

  return smartToolEngine.subscribe(() => {
    syncSmartToolStateToStore();
  });
}
