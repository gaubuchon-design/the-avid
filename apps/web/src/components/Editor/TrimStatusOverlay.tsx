import React, { useCallback, useMemo } from 'react';
import { TrimMode, TrimSide, trimEngine } from '../../engine/TrimEngine';
import { useTrimEngineSnapshot } from '../../lib/trimMonitorPreview';
import { useEditorStore } from '../../store/editor.store';

function formatTrimFrames(value: number): string {
  if (value === 0) {
    return '0f';
  }

  return `${value > 0 ? '+' : ''}${value}f`;
}

function getLiveTrimSelectionLabel(trimState: ReturnType<typeof trimEngine.getState>): 'OFF' | 'A' | 'B' | 'AB' | 'ASYM' {
  if (!trimState.active || trimState.rollers.length === 0) {
    return 'OFF';
  }

  const sides = new Set(trimState.rollers.map((roller) => roller.side));
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

export function TrimStatusOverlay() {
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const trimCounterFrames = useEditorStore((s) => s.trimCounterFrames);
  const trimASideFrames = useEditorStore((s) => s.trimASideFrames);
  const trimBSideFrames = useEditorStore((s) => s.trimBSideFrames);
  const tracks = useEditorStore((s) => s.tracks);
  const fps = useEditorStore((s) => s.sequenceSettings.fps || s.projectSettings.frameRate || 24);
  const trimState = useTrimEngineSnapshot();
  const liveTrimDisplay = trimState.active ? trimEngine.getTrimDisplay() : null;
  const displayTrimMode = trimState.active ? trimState.mode.toLowerCase() : trimMode;
  const displaySelectionLabel = trimState.active
    ? getLiveTrimSelectionLabel(trimState)
    : trimSelectionLabel;
  const displayTrimCounter = liveTrimDisplay?.trimCounter ?? trimCounterFrames;
  const displayASideFrames = liveTrimDisplay?.aSideFrame ?? trimASideFrames;
  const displayBSideFrames = liveTrimDisplay?.bSideFrame ?? trimBSideFrames;
  const trimRollers = useMemo(() => {
    return trimState.rollers.map((roller) => ({
      ...roller,
      trackName: tracks.find((track) => track.id === roller.trackId)?.name ?? roller.trackId,
    }));
  }, [tracks, trimState.rollers]);

  const setAllToASide = useCallback(() => {
    trimEngine.selectASide();
  }, []);

  const setAllToBothSides = useCallback(() => {
    trimEngine.selectBothSides();
  }, []);

  const setAllToBSide = useCallback(() => {
    trimEngine.selectBSide();
  }, []);

  const trimByFrames = useCallback((frames: number) => {
    trimEngine.trimByFrames(frames, fps);
  }, [fps]);

  const switchTrimMode = useCallback((targetMode: TrimMode) => {
    if (!trimState.active) {
      return;
    }

    if (targetMode === TrimMode.ROLL) {
      trimEngine.selectBothSides();
      return;
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (trimEngine.getCurrentMode() === targetMode) {
        return;
      }
      trimEngine.cycleTrimMode();
    }
  }, [trimState.active]);

  const exitTrimMode = useCallback(() => {
    trimEngine.exitTrimMode();
  }, []);

  const toggleLinkedSelection = useCallback(() => {
    trimEngine.toggleLinkedSelection();
  }, []);

  if (!trimActive && !trimState.active) {
    return null;
  }

  return (
    <div className="trim-status-overlay" role="status" aria-live="polite">
      <div className="trim-status-overlay-header">
        <div className="trim-status-overview">
          <span className="trim-status-pill">TRIM</span>
          <span className="trim-status-side">{displayTrimMode.toUpperCase()}</span>
          <span className="trim-status-counter">{formatTrimFrames(displayTrimCounter)}</span>
        </div>
        {trimState.active && (
          <button
            type="button"
            className="trim-control-btn trim-control-btn-utility"
            onClick={exitTrimMode}
            aria-label="Exit trim mode"
          >
            Exit
          </button>
        )}
      </div>
      <div className="trim-status-overlay-body">
        <span>A {formatTrimFrames(displayASideFrames)}</span>
        <span>B {formatTrimFrames(displayBSideFrames)}</span>
        <span>{displaySelectionLabel}</span>
      </div>
      {trimState.active && (
        <>
          <div className="trim-control-row">
            <button
              type="button"
              className={`trim-control-btn trim-control-btn-utility${trimState.linkedSelection ? ' active' : ''}`}
              onClick={toggleLinkedSelection}
              aria-label={trimState.linkedSelection ? 'Disable linked trim selection' : 'Enable linked trim selection'}
            >
              Link
            </button>
            <button
              type="button"
              className={`trim-control-btn${displayTrimMode === 'roll' ? ' active' : ''}`}
              onClick={() => switchTrimMode(TrimMode.ROLL)}
              aria-label="Switch to roll trim mode"
            >
              Roll
            </button>
            <button
              type="button"
              className={`trim-control-btn${displayTrimMode === 'slip' ? ' active' : ''}`}
              onClick={() => switchTrimMode(TrimMode.SLIP)}
              aria-label="Switch to slip trim mode"
            >
              Slip
            </button>
            <button
              type="button"
              className={`trim-control-btn${displayTrimMode === 'slide' ? ' active' : ''}`}
              onClick={() => switchTrimMode(TrimMode.SLIDE)}
              aria-label="Switch to slide trim mode"
            >
              Slide
            </button>
          </div>

          {(displayTrimMode === 'roll' || displayTrimMode === 'ripple' || displayTrimMode === 'asymmetric') && (
            <div className="trim-control-row">
              <button
                type="button"
                className={`trim-control-btn${displaySelectionLabel === 'A' ? ' active' : ''}`}
                onClick={setAllToASide}
                aria-label="Set trim to A-side"
              >
                A
              </button>
              <button
                type="button"
                className={`trim-control-btn${displaySelectionLabel === 'AB' ? ' active' : ''}`}
                onClick={setAllToBothSides}
                aria-label="Set trim to both sides"
              >
                AB
              </button>
              <button
                type="button"
                className={`trim-control-btn${displaySelectionLabel === 'B' ? ' active' : ''}`}
                onClick={setAllToBSide}
                aria-label="Set trim to B-side"
              >
                B
              </button>
            </div>
          )}

          <div className="trim-control-row">
            <button
              type="button"
              className="trim-control-btn trim-control-btn-fine"
              onClick={() => trimByFrames(-10)}
              aria-label="Trim left 10 frames"
            >
              -10
            </button>
            <button
              type="button"
              className="trim-control-btn trim-control-btn-fine"
              onClick={() => trimByFrames(-1)}
              aria-label="Trim left 1 frame"
            >
              -1
            </button>
            <button
              type="button"
              className="trim-control-btn trim-control-btn-fine"
              onClick={() => trimByFrames(1)}
              aria-label="Trim right 1 frame"
            >
              +1
            </button>
            <button
              type="button"
              className="trim-control-btn trim-control-btn-fine"
              onClick={() => trimByFrames(10)}
              aria-label="Trim right 10 frames"
            >
              +10
            </button>
          </div>

          {trimRollers.length > 1 && (
            <div className="trim-roller-grid" aria-label="Asymmetrical trim controls">
              {trimRollers.map((roller) => (
                <div key={roller.trackId} className="trim-roller-row">
                  <span className="trim-roller-track">{roller.trackName}</span>
                  <div className="trim-roller-actions">
                    <button
                      type="button"
                      className={`trim-control-btn trim-control-btn-roller${roller.side === TrimSide.A_SIDE ? ' active' : ''}`}
                      onClick={() => trimEngine.setAsymmetricRoller(roller.trackId, TrimSide.A_SIDE)}
                      aria-label={`Trim ${roller.trackName} on A-side`}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      className={`trim-control-btn trim-control-btn-roller${roller.side === TrimSide.BOTH ? ' active' : ''}`}
                      onClick={() => trimEngine.setAsymmetricRoller(roller.trackId, TrimSide.BOTH)}
                      aria-label={`Trim ${roller.trackName} on both sides`}
                    >
                      AB
                    </button>
                    <button
                      type="button"
                      className={`trim-control-btn trim-control-btn-roller${roller.side === TrimSide.B_SIDE ? ' active' : ''}`}
                      onClick={() => trimEngine.setAsymmetricRoller(roller.trackId, TrimSide.B_SIDE)}
                      aria-label={`Trim ${roller.trackName} on B-side`}
                    >
                      B
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
