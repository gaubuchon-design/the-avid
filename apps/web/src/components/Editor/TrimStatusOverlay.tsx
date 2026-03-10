import React from 'react';
import { useEditorStore } from '../../store/editor.store';

function formatTrimFrames(value: number): string {
  if (value === 0) {
    return '0f';
  }

  return `${value > 0 ? '+' : ''}${value}f`;
}

export function TrimStatusOverlay() {
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const trimCounterFrames = useEditorStore((s) => s.trimCounterFrames);
  const trimASideFrames = useEditorStore((s) => s.trimASideFrames);
  const trimBSideFrames = useEditorStore((s) => s.trimBSideFrames);

  if (!trimActive) {
    return null;
  }

  return (
    <div className="trim-status-overlay" role="status" aria-live="polite">
      <div className="trim-status-overlay-header">
        <span className="trim-status-pill">{trimMode.toUpperCase()}</span>
        <span className="trim-status-side">{trimSelectionLabel}</span>
        <span className="trim-status-counter">{formatTrimFrames(trimCounterFrames)}</span>
      </div>
      <div className="trim-status-overlay-body">
        <span>A {formatTrimFrames(trimASideFrames)}</span>
        <span>B {formatTrimFrames(trimBSideFrames)}</span>
      </div>
    </div>
  );
}
