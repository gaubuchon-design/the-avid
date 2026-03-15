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

function getTrimDisplayLabels(trimMode: string): { left: string; right: string } {
  if (trimMode === 'slip') {
    return { left: 'IN', right: 'OUT' };
  }

  if (trimMode === 'slide') {
    return { left: 'LEFT', right: 'RIGHT' };
  }

  return { left: 'A', right: 'B' };
}

function clampTrimRollFrames(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.round(value));
}

export function TrimStatusOverlay() {
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const trimCounterFrames = useEditorStore((s) => s.trimCounterFrames);
  const trimASideFrames = useEditorStore((s) => s.trimASideFrames);
  const trimBSideFrames = useEditorStore((s) => s.trimBSideFrames);
  const trimViewMode = useEditorStore((s) => s.trimViewMode);
  const trimLoopPlaybackActive = useEditorStore((s) => s.trimLoopPlaybackActive);
  const trimLoopPlaybackDirection = useEditorStore((s) => s.trimLoopPlaybackDirection);
  const trimLoopPlaybackRate = useEditorStore((s) => s.trimLoopPlaybackRate);
  const trimLoopDurationPreset = useEditorStore((s) => s.trimLoopDurationPreset);
  const trimLoopPreRollFrames = useEditorStore((s) => s.trimLoopPreRollFrames);
  const trimLoopPostRollFrames = useEditorStore((s) => s.trimLoopPostRollFrames);
  const toggleTrimViewMode = useEditorStore((s) => s.toggleTrimViewMode);
  const toggleTrimLoopPlayback = useEditorStore((s) => s.toggleTrimLoopPlayback);
  const setTrimLoopDurationPreset = useEditorStore((s) => s.setTrimLoopDurationPreset);
  const setTrimLoopRollFrames = useEditorStore((s) => s.setTrimLoopRollFrames);
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
  const trimDiagnostics = useMemo(() => (
    trimState.active ? trimEngine.getSessionDiagnostics(fps) : null
  ), [fps, trimState]);
  const lockedTrackNames = useMemo(() => (
    trimDiagnostics?.rollers
      .filter((roller) => roller.locked)
      .map((roller) => tracks.find((track) => track.id === roller.trackId)?.name ?? roller.trackId)
      ?? []
  ), [tracks, trimDiagnostics]);
  const canTrimLeft = (trimDiagnostics?.constrainedTrimLeftFrames ?? 0) > 0;
  const canTrimRight = (trimDiagnostics?.constrainedTrimRightFrames ?? 0) > 0;
  const trimLoopStatusLabel = trimLoopPlaybackActive
    ? `${trimLoopPlaybackDirection < 0 ? 'REV' : 'FWD'} ${trimLoopPlaybackRate}x`
    : 'IDLE';
  const trimDisplayLabels = getTrimDisplayLabels(displayTrimMode);

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

  const toggleLoopPlayback = useCallback(() => {
    if (!trimState.active) {
      return;
    }

    toggleTrimLoopPlayback();
  }, [toggleTrimLoopPlayback, trimState.active]);

  const toggleViewMode = useCallback(() => {
    if (!trimState.active) {
      return;
    }

    toggleTrimViewMode();
  }, [toggleTrimViewMode, trimState.active]);

  const handlePreRollChange = useCallback((value: number) => {
    setTrimLoopRollFrames(clampTrimRollFrames(value), trimLoopPostRollFrames);
  }, [setTrimLoopRollFrames, trimLoopPostRollFrames]);

  const handlePostRollChange = useCallback((value: number) => {
    setTrimLoopRollFrames(trimLoopPreRollFrames, clampTrimRollFrames(value));
  }, [setTrimLoopRollFrames, trimLoopPreRollFrames]);

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
        <div className="trim-status-header-actions">
          {trimState.active && (
            <>
              <button
                type="button"
                className={`trim-control-btn trim-control-btn-utility${trimLoopPlaybackActive ? ' active' : ''}`}
                onClick={toggleLoopPlayback}
                aria-label={trimLoopPlaybackActive ? 'Stop trim loop playback' : 'Start trim loop playback'}
              >
                Loop
              </button>
              <button
                type="button"
                className="trim-control-btn trim-control-btn-utility"
                onClick={toggleViewMode}
                aria-label="Toggle big and small trim view"
              >
                {trimViewMode === 'big' ? 'Small' : 'Big'}
              </button>
              <button
                type="button"
                className="trim-control-btn trim-control-btn-utility"
                onClick={exitTrimMode}
                aria-label="Exit trim mode"
              >
                Exit
              </button>
            </>
          )}
        </div>
      </div>
      <div className="trim-status-overlay-body">
        <span>{trimDisplayLabels.left} {formatTrimFrames(displayASideFrames)}</span>
        <span>{trimDisplayLabels.right} {formatTrimFrames(displayBSideFrames)}</span>
        <span>{displaySelectionLabel}</span>
      </div>
      {trimState.active && (
        <div className="trim-status-settings">
          <span>{trimViewMode === 'big' ? 'BIG TRIM' : 'SMALL TRIM'}</span>
          <span>{trimLoopStatusLabel}</span>
          <span>{trimLoopPreRollFrames}f PRE</span>
          <span>{trimLoopPostRollFrames}f POST</span>
        </div>
      )}
      {trimState.active && trimDiagnostics && (
        <div className="trim-status-settings trim-status-diagnostics" aria-label="Trim diagnostics">
          <span>L {trimDiagnostics.constrainedTrimLeftFrames}f</span>
          <span>R {trimDiagnostics.constrainedTrimRightFrames}f</span>
          <span>{trimDiagnostics.hasLockedRollers ? `LOCKED ${lockedTrackNames.join(', ')}` : 'LOCKS CLEAR'}</span>
        </div>
      )}
      {trimState.active && (
        <>
          {trimViewMode === 'big' && (
            <>
              <div className="trim-control-row" aria-label="Trim playback duration controls">
                <button
                  type="button"
                  className={`trim-control-btn trim-control-btn-utility${trimLoopDurationPreset === 'short' ? ' active' : ''}`}
                  onClick={() => setTrimLoopDurationPreset('short')}
                  aria-label="Set short trim playback duration"
                >
                  0.5s
                </button>
                <button
                  type="button"
                  className={`trim-control-btn trim-control-btn-utility${trimLoopDurationPreset === 'medium' ? ' active' : ''}`}
                  onClick={() => setTrimLoopDurationPreset('medium')}
                  aria-label="Set medium trim playback duration"
                >
                  1.0s
                </button>
                <button
                  type="button"
                  className={`trim-control-btn trim-control-btn-utility${trimLoopDurationPreset === 'long' ? ' active' : ''}`}
                  onClick={() => setTrimLoopDurationPreset('long')}
                  aria-label="Set long trim playback duration"
                >
                  2.0s
                </button>
              </div>
              <div className="trim-duration-editor" aria-label="Custom trim playback duration">
                <label className="trim-duration-field">
                  <span className="trim-duration-label">Pre</span>
                  <input
                    className="trim-duration-input"
                    aria-label="Set trim preroll frames"
                    type="number"
                    min={1}
                    step={1}
                    value={trimLoopPreRollFrames}
                    onChange={(event) => handlePreRollChange(Number.parseInt(event.currentTarget.value || '0', 10))}
                  />
                  <span className="trim-duration-unit">f</span>
                </label>
                <label className="trim-duration-field">
                  <span className="trim-duration-label">Post</span>
                  <input
                    className="trim-duration-input"
                    aria-label="Set trim postroll frames"
                    type="number"
                    min={1}
                    step={1}
                    value={trimLoopPostRollFrames}
                    onChange={(event) => handlePostRollChange(Number.parseInt(event.currentTarget.value || '0', 10))}
                  />
                  <span className="trim-duration-unit">f</span>
                </label>
                <span className="trim-duration-preset">
                  {trimLoopDurationPreset === 'custom' ? 'Custom' : trimLoopDurationPreset.toUpperCase()}
                </span>
              </div>
            </>
          )}

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
              disabled={!canTrimLeft}
            >
              -10
            </button>
            <button
              type="button"
              className="trim-control-btn trim-control-btn-fine"
              onClick={() => trimByFrames(-1)}
              aria-label="Trim left 1 frame"
              disabled={!canTrimLeft}
            >
              -1
            </button>
            <button
              type="button"
              className="trim-control-btn trim-control-btn-fine"
              onClick={() => trimByFrames(1)}
              aria-label="Trim right 1 frame"
              disabled={!canTrimRight}
            >
              +1
            </button>
            <button
              type="button"
              className="trim-control-btn trim-control-btn-fine"
              onClick={() => trimByFrames(10)}
              aria-label="Trim right 10 frames"
              disabled={!canTrimRight}
            >
              +10
            </button>
          </div>

          {trimRollers.length > 1 && (
            <div className="trim-roller-grid" aria-label="Asymmetrical trim controls">
              {trimRollers.map((roller) => {
                const rollerDiagnostics = trimDiagnostics?.rollers.find((candidate) => candidate.trackId === roller.trackId);

                return (
                <div key={roller.trackId} className="trim-roller-row">
                  <span className="trim-roller-track">{roller.trackName}</span>
                  {rollerDiagnostics && (
                    <span className="trim-roller-meta">
                      {rollerDiagnostics.locked
                        ? 'LOCKED'
                        : `L ${rollerDiagnostics.availableTrimLeftFrames}f / R ${rollerDiagnostics.availableTrimRightFrames}f`}
                      {rollerDiagnostics.missingSides.length > 0 && ` · MISS ${rollerDiagnostics.missingSides.join('+')}`}
                    </span>
                  )}
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
              );})}
            </div>
          )}
        </>
      )}
    </div>
  );
}
