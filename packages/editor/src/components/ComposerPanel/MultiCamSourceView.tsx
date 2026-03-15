import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  multicamEngine,
  type CameraAngle,
  type MulticamDisplayMode,
  type MulticamGroup,
  type MulticamSyncMethod,
} from '../../engine/MulticamEngine';
import { useEditorStore, type Bin, type MediaAsset } from '../../store/editor.store';

const DISPLAY_MODES: Array<{ id: MulticamDisplayMode; label: string }> = [
  { id: 'quad', label: '4' },
  { id: 'nine', label: '9' },
  { id: 'sixteen', label: '16' },
];

const SYNC_METHODS: Array<{ id: MulticamSyncMethod; label: string }> = [
  { id: 'timecode', label: 'Timecode' },
  { id: 'in-points', label: 'In Points' },
  { id: 'aux-timecode', label: 'Aux TC' },
  { id: 'audio-waveform', label: 'Waveform' },
  { id: 'slate-clap', label: 'Slate' },
];

function flattenAssets(bins: Bin[]): MediaAsset[] {
  const assets: MediaAsset[] = [];
  const visit = (nodes: Bin[]) => {
    for (const node of nodes) {
      assets.push(...node.assets);
      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };

  visit(bins);
  return assets;
}

function findBinName(bins: Bin[], binId: string | null): string | null {
  if (!binId) {
    return null;
  }

  const visit = (nodes: Bin[]): string | null => {
    for (const node of nodes) {
      if (node.id === binId) {
        return node.name;
      }
      const nested = visit(node.children);
      if (nested) {
        return nested;
      }
    }
    return null;
  };

  return visit(bins);
}

function keyHintForIndex(index: number): string | null {
  const hints = ['F9', 'F10', 'F11', 'F12', 'Shift+F9', 'Shift+F10', 'Shift+F11', 'Shift+F12'];
  return hints[index] ?? null;
}

function resolveAngleAsset(
  angle: CameraAngle | null | undefined,
  assetsById: Map<string, MediaAsset>,
): MediaAsset | null {
  if (!angle) {
    return null;
  }

  return assetsById.get(angle.assetId) ?? assetsById.get(angle.clipId) ?? null;
}

export function MultiCamSourceView() {
  const activeBinAssets = useEditorStore((state) => state.activeBinAssets);
  const bins = useEditorStore((state) => state.bins);
  const selectedBinId = useEditorStore((state) => state.selectedBinId);
  const selectedTrackId = useEditorStore((state) => state.selectedTrackId);
  const playheadTime = useEditorStore((state) => state.playheadTime);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const tracks = useEditorStore((state) => state.tracks);
  const setSourceAsset = useEditorStore((state) => state.setSourceAsset);
  const setMulticamActive = useEditorStore((state) => state.setMulticamActive);
  const setMulticamDisplayMode = useEditorStore((state) => state.setMulticamDisplayMode);
  const setMulticamGroupId = useEditorStore((state) => state.setMulticamGroupId);
  const isPlaying = useEditorStore((state) => state.isPlaying);

  const [syncMethod, setSyncMethod] = useState<MulticamSyncMethod>('timecode');
  const [revision, setRevision] = useState(0);

  const allAssets = useMemo(() => flattenAssets(bins), [bins]);
  const assetsById = useMemo(
    () => new Map(allAssets.map((asset) => [asset.id, asset])),
    [allAssets],
  );

  const syncStoreFromEngine = useCallback(() => {
    const state = multicamEngine.getState();
    setMulticamActive(state.active);
    setMulticamDisplayMode(state.displayMode);
    setMulticamGroupId(state.currentGroupId);

    if (!state.active || !state.currentGroupId) {
      return;
    }

    const group = multicamEngine.getGroup(state.currentGroupId);
    const activeAngle = group?.angles[state.activeAngleIndex];
    const activeAsset = resolveAngleAsset(activeAngle, assetsById);
    if (activeAsset) {
      setSourceAsset(activeAsset);
    }
  }, [
    assetsById,
    setMulticamActive,
    setMulticamDisplayMode,
    setMulticamGroupId,
    setSourceAsset,
  ]);

  useEffect(() => {
    syncStoreFromEngine();
    return multicamEngine.subscribe(() => {
      setRevision((current) => current + 1);
      syncStoreFromEngine();
    });
  }, [syncStoreFromEngine]);

  void revision;

  const engineState = multicamEngine.getState();
  const groups = multicamEngine.getAllGroups();
  const activeGroup = engineState.currentGroupId
    ? multicamEngine.getGroup(engineState.currentGroupId)
    : null;
  const activeBinName = findBinName(bins, selectedBinId) ?? 'Current Bin';
  const candidateAssets = activeBinAssets.filter((asset) => asset.type === 'VIDEO' || asset.type === 'AUDIO');
  const visibleAngles = activeGroup ? multicamEngine.getVisibleAngles() : [];
  const previewAngleIndex = engineState.previewAngleIndex;
  const focusedAngleIndex = previewAngleIndex ?? engineState.activeAngleIndex;
  const focusedAngle = activeGroup?.angles[focusedAngleIndex] ?? null;
  const focusedAsset = resolveAngleAsset(focusedAngle, assetsById);
  const audioAngle = activeGroup?.angles[multicamEngine.getAudioSourceAngle()] ?? null;
  const cutSegments = activeGroup ? multicamEngine.getCutSegments() : [];
  const activeSegment = cutSegments.find((segment) => (
    playheadTime >= segment.startTime && playheadTime < segment.endTime
  )) ?? cutSegments[0] ?? null;
  const targetVideoTrack = tracks.find((track) => track.id === selectedTrackId && track.type === 'VIDEO')
    ?? tracks.find((track) => track.type === 'VIDEO')
    ?? null;
  const targetTrackLabel = targetVideoTrack?.name ?? 'No video track';
  const totalBanks = multicamEngine.getTotalBanks();
  const currentBank = multicamEngine.getCurrentBank();

  useEffect(() => {
    if (activeGroup && activeGroup.syncMethod !== syncMethod) {
      setSyncMethod(activeGroup.syncMethod);
    }
  }, [activeGroup, syncMethod]);

  const handleCreateGroup = useCallback(() => {
    if (candidateAssets.length < 2) {
      return;
    }

    const group = multicamEngine.createGroup(
      `${activeBinName} MultiCam`,
      candidateAssets.map((asset) => asset.id),
      syncMethod,
    );
    multicamEngine.enterMulticamMode(group.id);
  }, [activeBinName, candidateAssets, syncMethod]);

  const handleResumeGroup = useCallback((groupId: string) => {
    multicamEngine.enterMulticamMode(groupId);
  }, []);

  const handleAngleActivate = useCallback((angle: CameraAngle) => {
    const asset = resolveAngleAsset(angle, assetsById);
    if (isPlaying || engineState.isRecording) {
      multicamEngine.cutToAngle(angle.angleIndex);
    } else {
      multicamEngine.setActiveAngle(angle.angleIndex);
    }

    if (asset) {
      setSourceAsset(asset);
    }
  }, [assetsById, engineState.isRecording, isPlaying, setSourceAsset]);

  const handleApplyCuts = useCallback(() => {
    if (!targetVideoTrack) {
      return;
    }
    multicamEngine.applyCutsToTimeline(targetVideoTrack.id);
  }, [targetVideoTrack]);

  const handleFlatten = useCallback(() => {
    multicamEngine.flattenMulticamToTimeline();
  }, []);

  const handleExit = useCallback(() => {
    multicamEngine.exitMulticamMode();
  }, []);

  const handleAudioFollowToggle = useCallback(() => {
    multicamEngine.toggleAudioFollowVideo();
  }, []);

  const handleRecordingToggle = useCallback(() => {
    if (engineState.isRecording) {
      multicamEngine.stopRecording();
      return;
    }
    multicamEngine.startRecording();
  }, [engineState.isRecording]);

  const handleDisplayModeChange = useCallback((mode: MulticamDisplayMode) => {
    multicamEngine.setDisplayMode(mode);
  }, []);

  const handleResync = useCallback(async () => {
    if (!activeGroup) {
      return;
    }
    await multicamEngine.resyncGroup(activeGroup.id, syncMethod);
  }, [activeGroup, syncMethod]);

  const focusSegment = useCallback((segmentIndex: number) => {
    const segment = cutSegments[segmentIndex];
    if (!segment) {
      return;
    }

    setPlayhead(segment.startTime);
    multicamEngine.setActiveAngle(segment.angleIndex);
    const angle = activeGroup?.angles[segment.angleIndex];
    const asset = resolveAngleAsset(angle, assetsById);
    if (asset) {
      setSourceAsset(asset);
    }
  }, [activeGroup?.angles, assetsById, cutSegments, setPlayhead, setSourceAsset]);

  const stepSegmentAngle = useCallback((delta: -1 | 1) => {
    if (!activeGroup || !activeSegment) {
      return;
    }

    const nextAngleIndex = (activeSegment.angleIndex + delta + activeGroup.angles.length) % activeGroup.angles.length;
    setPlayhead(activeSegment.startTime + 0.001);
    multicamEngine.switchAngle(`multicam-segment-${activeSegment.index}`, nextAngleIndex);
  }, [activeGroup, activeSegment, setPlayhead]);

  if (!activeGroup) {
    return (
      <section className="multicam-source" aria-label="Multicam source bank">
        <header className="multicam-source-header">
          <div className="multicam-source-header-copy">
            <span className="multicam-source-title">MultiCam</span>
            <span className="multicam-source-subtitle">Build an Avid-style grouped source bank from the current bin.</span>
          </div>
        </header>

        <div className="multicam-source-empty">
          <div className="multicam-source-empty-card">
            <div className="multicam-source-empty-copy">
              <span className="multicam-source-empty-title">{activeBinName}</span>
              <span className="multicam-source-empty-note">
                {candidateAssets.length >= 2
                  ? `${candidateAssets.length} eligible angles are ready for grouping.`
                  : 'Load at least two picture or audio angles in the current bin to build a multicam group.'}
              </span>
            </div>

            <div className="multicam-source-sync-row" role="group" aria-label="Multicam sync method">
              {SYNC_METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  className={`multicam-pill${syncMethod === method.id ? ' active' : ''}`}
                  onClick={() => setSyncMethod(method.id)}
                >
                  {method.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="multicam-primary-action"
              onClick={handleCreateGroup}
              disabled={candidateAssets.length < 2}
            >
              Build From Current Bin
            </button>

            <p className="multicam-source-caption">
              Waveform sync currently seeds the group immediately and is designed to hand off deeper alignment to the background media pipeline.
            </p>
          </div>

          {groups.length > 0 && (
            <div className="multicam-source-library">
              <div className="multicam-source-library-title">Available Groups</div>
              <div className="multicam-source-library-list">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className="multicam-library-item"
                    onClick={() => handleResumeGroup(group.id)}
                  >
                    <span>{group.name}</span>
                    <span>{group.angles.length} angles</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="multicam-source" aria-label="Multicam source bank">
      <header className="multicam-source-header">
        <div className="multicam-source-header-copy">
          <span className="multicam-source-title">MultiCam Source</span>
          <span className="multicam-source-subtitle">
            {activeGroup.name} · {activeGroup.angles.length} angles · {engineState.cuts.length} cut{engineState.cuts.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="multicam-source-toolbar">
          <div className="multicam-source-toolbar-group" role="group" aria-label="Display mode">
            {DISPLAY_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`multicam-pill${engineState.displayMode === mode.id ? ' active' : ''}`}
                onClick={() => handleDisplayModeChange(mode.id)}
                disabled={mode.id === 'nine' && activeGroup.angles.length <= 4}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="multicam-source-toolbar-group" role="group" aria-label="Bank navigation">
            <button
              type="button"
              className="multicam-pill"
              onClick={() => multicamEngine.prevBank()}
              disabled={totalBanks <= 1}
            >
              Prev
            </button>
            <span className="multicam-bank-label">
              Bank {currentBank.bankIndex + 1}/{totalBanks}
            </span>
            <button
              type="button"
              className="multicam-pill"
              onClick={() => multicamEngine.nextBank()}
              disabled={totalBanks <= 1}
            >
              Next
            </button>
          </div>

          <button
            type="button"
            className={`multicam-pill${multicamEngine.isAudioFollowVideo() ? ' active' : ''}`}
            onClick={handleAudioFollowToggle}
          >
            Audio Follow
          </button>

          <div className="multicam-source-toolbar-group" role="group" aria-label="Multicam sync mode">
            {SYNC_METHODS.map((method) => (
              <button
                key={method.id}
                type="button"
                className={`multicam-pill${syncMethod === method.id ? ' active' : ''}`}
                onClick={() => setSyncMethod(method.id)}
              >
                {method.label}
              </button>
            ))}
            <button
              type="button"
              className="multicam-pill"
              onClick={handleResync}
            >
              Re-Sync
            </button>
          </div>

          <button
            type="button"
            className={`multicam-pill multicam-record-pill${engineState.isRecording ? ' active' : ''}`}
            onClick={handleRecordingToggle}
          >
            {engineState.isRecording ? 'Stop Cuts' : 'Record Cuts'}
          </button>

          <button
            type="button"
            className="multicam-pill"
            onClick={handleApplyCuts}
            disabled={!targetVideoTrack || engineState.cuts.length === 0}
          >
            Apply
          </button>

          <button
            type="button"
            className="multicam-pill"
            onClick={handleFlatten}
            disabled={engineState.cuts.length === 0}
          >
            Flatten
          </button>

          <button
            type="button"
            className="multicam-pill"
            onClick={handleExit}
          >
            Exit
          </button>
        </div>
      </header>

      <div className="multicam-source-status">
        <span>{engineState.isRecording ? 'Recording live multicam cuts.' : 'Parked for multicam preview and refinement.'}</span>
        <span>Target track: {targetTrackLabel}</span>
        <span>Audio source: {audioAngle?.name ?? 'Follows active angle'}</span>
      </div>

      <div className="multicam-source-workspace">
        <div
          className={`multicam-angle-grid multicam-angle-grid-${engineState.displayMode}`}
          role="grid"
          aria-label="Multicam angles"
        >
          {visibleAngles.map((angle) => {
            const asset = resolveAngleAsset(angle, assetsById);
            const isActive = angle.angleIndex === engineState.activeAngleIndex;
            const isPreview = angle.angleIndex === previewAngleIndex;
            const keyHint = keyHintForIndex(angle.angleIndex);

            return (
              <button
                key={angle.id}
                type="button"
                className={`multicam-angle-card${isActive ? ' is-active' : ''}${isPreview ? ' is-preview' : ''}`}
                onClick={() => handleAngleActivate(angle)}
                onMouseEnter={() => multicamEngine.setPreviewAngle(angle.angleIndex)}
                onMouseLeave={() => multicamEngine.setPreviewAngle(null)}
              >
                <span className="multicam-angle-card-index">Cam {angle.angleIndex + 1}</span>
                <span className="multicam-angle-card-name">{angle.name}</span>
                <span className="multicam-angle-card-meta">
                  {asset?.codec ?? asset?.type ?? 'Media'} · {asset?.fps ? `${asset.fps.toFixed(2)} fps` : `${angle.duration.toFixed(1)}s`}
                </span>
                <span className="multicam-angle-card-meta">
                  Offset {angle.syncOffset >= 0 ? '+' : ''}{angle.syncOffset.toFixed(2)}s
                </span>
                {keyHint && <span className="multicam-angle-card-key">{keyHint}</span>}
              </button>
            );
          })}
        </div>

        <aside className="multicam-refine-panel" aria-label="Multicam refinement">
          <section className="multicam-refine-section">
            <div className="multicam-refine-title">Current Segment</div>
            {activeSegment ? (
              <>
                <div className="multicam-refine-row">
                  <span>{activeSegment.startTime.toFixed(2)}s</span>
                  <span>Angle {activeSegment.angleIndex + 1}</span>
                </div>
                <div className="multicam-refine-actions">
                  <button type="button" className="multicam-pill" onClick={() => stepSegmentAngle(-1)}>Prev Angle</button>
                  <button type="button" className="multicam-pill" onClick={() => stepSegmentAngle(1)}>Next Angle</button>
                </div>
              </>
            ) : (
              <div className="multicam-source-caption">Record a live pass to unlock post-cut angle refinement.</div>
            )}
          </section>

          <section className="multicam-refine-section">
            <div className="multicam-refine-title">Cut List</div>
            <div className="multicam-cut-list">
              {cutSegments.length === 0 ? (
                <div className="multicam-source-caption">No multicam cuts yet.</div>
              ) : cutSegments.map((segment) => (
                <button
                  key={`${segment.index}-${segment.startTime}`}
                  type="button"
                  className={`multicam-cut-row${activeSegment?.index === segment.index ? ' active' : ''}`}
                  onClick={() => focusSegment(segment.index)}
                >
                  <span>{segment.startTime.toFixed(2)}s</span>
                  <span>Cam {segment.angleIndex + 1}</span>
                </button>
              ))}
            </div>
          </section>

          {!multicamEngine.isAudioFollowVideo() && (
            <section className="multicam-refine-section">
              <div className="multicam-refine-title">Audio Source</div>
              <div className="multicam-refine-actions">
                {activeGroup.angles.map((angle) => (
                  <button
                    key={angle.id}
                    type="button"
                    className={`multicam-pill${audioAngle?.id === angle.id ? ' active' : ''}`}
                    onClick={() => multicamEngine.setAudioSourceAngle(angle.angleIndex)}
                  >
                    {angle.angleIndex + 1}
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      <footer className="multicam-source-footer">
        <div className="multicam-source-footer-copy">
          <span className="multicam-source-footer-title">
            {focusedAsset?.name ?? focusedAngle?.name ?? 'Active angle'}
          </span>
          <span className="multicam-source-footer-note">
            {isPlaying || engineState.isRecording
              ? 'Clicks and F9-F12 record cuts at the playhead.'
              : 'When parked, clicks update the active angle without adding a cut.'}
          </span>
        </div>
        <div className="multicam-source-footer-copy">
          <span className="multicam-source-footer-title">
            Source/Record Model
          </span>
          <span className="multicam-source-footer-note">
            The source side holds the angle bank while the record side stays on program, mirroring Media Composer-style multicam operation.
          </span>
        </div>
      </footer>
    </section>
  );
}

export default MultiCamSourceView;
