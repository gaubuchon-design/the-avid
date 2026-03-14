import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildProject, type EditorProject } from '@mcua/core';


import { EditorWorkbenchBar } from '../../components/Editor/EditorWorkbenchBar';
import { StatusBar } from '../../components/Editor/StatusBar';
import { TrimStatusOverlay } from '../../components/Editor/TrimStatusOverlay';
import { RecordMonitor } from '../../components/RecordMonitor/RecordMonitor';
import { SourceMonitor } from '../../components/SourceMonitor/SourceMonitor';
import { TrackHeaders } from '../../components/TimelinePanel/TrackHeaders';
import { TrackPatchPanel } from '../../components/TimelinePanel/TrackPatchPanel';
import { Toolbar } from '../../components/Toolbar/Toolbar';
import { VersionHistoryPanel } from '../../components/VersionHistory/VersionHistoryPanel';
import { trackPatchingEngine } from '../../engine/TrackPatchingEngine';
import { useGlobalKeyboard } from '../../hooks/useGlobalKeyboard';
import { useKeyboardAction } from '../../hooks/useKeyboardAction';
import { useCollabStore } from '../../store/collab.store';
import { makeClip , useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';


const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const repositoryMocks = vi.hoisted(() => ({
  getProjectFromRepository: vi.fn(),
  saveProjectToRepository: vi.fn(),
}));

vi.mock('../../lib/projectRepository', () => ({
  getProjectFromRepository: repositoryMocks.getProjectFromRepository,
  saveProjectToRepository: repositoryMocks.saveProjectToRepository,
}));


const initialEditorState = useEditorStore.getState();
const initialPlayerState = usePlayerStore.getState();
const initialCollabState = useCollabStore.getState();

function KeyboardHarness() {
  const deleteSelectedClips = useEditorStore((state) => state.deleteSelectedClips);
  useGlobalKeyboard();
  useKeyboardAction('edit.delete', deleteSelectedClips, [deleteSelectedClips]);
  return <div>keyboard harness</div>;
}

function makePersistedProject(): EditorProject {
  const project = buildProject({ name: 'Persisted Project', template: 'film' });

  return {
    ...project,
    tracks: [
      {
        id: 't-v1',
        name: 'V1',
        type: 'VIDEO',
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#5b6af5',
        clips: [],
      },
      {
        id: 't-v2',
        name: 'V2',
        type: 'VIDEO',
        sortOrder: 1,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        color: '#818cf8',
        clips: [],
      },
      {
        id: 't-a1',
        name: 'A1',
        type: 'AUDIO',
        sortOrder: 2,
        muted: false,
        locked: false,
        solo: false,
        volume: 0.8,
        color: '#2bb672',
        clips: [],
      },
    ],
    bins: [
      {
        id: 'b-master',
        name: 'Master',
        color: '#5b6af5',
        isOpen: true,
        children: [],
        assets: [
          {
            id: 'asset-source',
            name: 'Source Asset',
            type: 'VIDEO',
            status: 'READY',
            tags: [],
            isFavorite: false,
          },
        ],
      },
      {
        id: 'b-selects',
        name: 'Selects',
        color: '#e05b8e',
        isOpen: true,
        children: [],
        assets: [
          {
            id: 'asset-select',
            name: 'Selected Asset',
            type: 'VIDEO',
            status: 'READY',
            tags: ['select'],
            isFavorite: true,
          },
        ],
      },
    ],
    editorialState: {
      selectedBinId: 'b-selects',
      sourceAssetId: 'asset-source',
      enabledTrackIds: ['t-v2'],
      syncLockedTrackIds: ['t-a1'],
      videoMonitorTrackId: 't-v2',
      sourceTrackDescriptors: [
        { id: 'src-v1', type: 'VIDEO', index: 1 },
        { id: 'src-a1', type: 'AUDIO', index: 1 },
      ],
      trackPatches: [
        {
          sourceTrackId: 'src-v1',
          sourceTrackType: 'VIDEO',
          sourceTrackIndex: 1,
          recordTrackId: 't-v2',
          enabled: true,
        },
        {
          sourceTrackId: 'src-a1',
          sourceTrackType: 'AUDIO',
          sourceTrackIndex: 1,
          recordTrackId: 't-a1',
          enabled: true,
        },
      ],
    },
    workstationState: {
      subtitleTracks: [
        {
          id: 'sub-1',
          name: 'English',
          language: 'en',
          cues: [
            { id: 'cue-1', start: 1, end: 3, text: 'Hello world' },
          ],
        },
      ],
      titleClips: [
        {
          id: 'title-1',
          text: 'Opening Title',
          style: {
            fontFamily: 'Helvetica',
            fontSize: 64,
            fontWeight: 700,
            color: '#ffffff',
            opacity: 1,
            textAlign: 'center',
          },
          position: {
            x: 0.5,
            y: 0.15,
            width: 0.8,
            height: 0.2,
          },
        },
      ],
      trackHeights: { 't-v1': 88 },
      activeWorkspaceId: 'audio-mixing',
      composerLayout: 'full-frame',
      showTrackingInfo: false,
      trackingInfoFields: ['duration'],
      clipTextDisplay: 'source',
      dupeDetectionEnabled: true,
      versionHistoryRetentionPreference: 'session',
      versionHistoryCompareMode: 'details',
    },
  };
}

describe('phase 1 project persistence', () => {
  beforeEach(() => {
    repositoryMocks.getProjectFromRepository.mockReset();
    repositoryMocks.saveProjectToRepository.mockReset();
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
    useCollabStore.setState(initialCollabState, true);
    trackPatchingEngine.reset();
  });

  it('hydrates repository projects into editor and patching state', async () => {
    const project = makePersistedProject();
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    await useEditorStore.getState().loadProject(project.id);

    const state = useEditorStore.getState();
    expect(state.projectName).toBe('Persisted Project');
    expect(state.selectedBinId).toBe('b-selects');
    expect(state.activeBinAssets.map((asset) => asset.id)).toEqual(['asset-select']);
    expect(state.sourceAsset?.id).toBe('asset-source');
    expect(state.enabledTrackIds).toEqual(['t-v2']);
    expect(state.syncLockedTrackIds).toEqual(['t-a1']);
    expect(state.videoMonitorTrackId).toBe('t-v2');
    expect(trackPatchingEngine.getSourceAssetId()).toBe('asset-source');
    expect(trackPatchingEngine.getSourceTracks()).toEqual([
      { id: 'src-v1', type: 'VIDEO', index: 1 },
      { id: 'src-a1', type: 'AUDIO', index: 1 },
    ]);
    expect(trackPatchingEngine.getPatches()).toEqual([
      {
        sourceTrackId: 'src-v1',
        sourceTrackType: 'VIDEO',
        sourceTrackIndex: 1,
        recordTrackId: 't-v2',
        enabled: true,
      },
      {
        sourceTrackId: 'src-a1',
        sourceTrackType: 'AUDIO',
        sourceTrackIndex: 1,
        recordTrackId: 't-a1',
        enabled: true,
      },
    ]);
    expect(state.subtitleTracks).toHaveLength(1);
    expect(state.titleClips).toHaveLength(1);
    expect(state.trackHeights).toEqual({ 't-v1': 88 });
    expect(state.activeWorkspaceId).toBe('audio-mixing');
    expect(state.composerLayout).toBe('full-frame');
    expect(state.showTrackingInfo).toBe(false);
    expect(state.trackingInfoFields).toEqual(['duration']);
    expect(state.clipTextDisplay).toBe('source');
    expect(state.dupeDetectionEnabled).toBe(true);
    expect(state.versionHistoryRetentionPreference).toBe('session');
    expect(state.versionHistoryCompareMode).toBe('details');
    expect(trackPatchingEngine.getEnabledRecordTracks()).toEqual(['t-v2']);
    expect(trackPatchingEngine.getSyncLockedTracks()).toEqual(['t-a1']);
    expect(trackPatchingEngine.getVideoMonitorTrack()).toBe('t-v2');
    expect(state.saveStatus).toBe('saved');
    expect(state.lastSavedAt).toBe(project.updatedAt);
  });

  it('serializes editorial state back into repository projects on save', async () => {
    repositoryMocks.saveProjectToRepository.mockImplementation(async (project: EditorProject) => project);

    useEditorStore.setState({
      projectId: 'project-save',
      projectName: 'Autosave Cut',
      projectTemplate: 'social',
      projectDescription: 'Save path test',
      projectTags: ['promo'],
      projectSchemaVersion: 2,
      projectCreatedAt: '2026-03-10T12:00:00.000Z',
      projectSettings: {
        width: 1080,
        height: 1920,
        frameRate: 30,
        exportFormat: 'mp4',
      },
      sequenceSettings: {
        ...useEditorStore.getState().sequenceSettings,
        fps: 30,
        width: 1080,
        height: 1920,
        sampleRate: 48000,
      },
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
        },
        {
          id: 't-a1',
          name: 'A1',
          type: 'AUDIO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 0.8,
          color: '#2bb672',
          clips: [],
        },
      ],
      bins: [
        {
          id: 'b-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            {
              id: 'asset-source',
              name: 'Source Asset',
              type: 'VIDEO',
              status: 'READY',
              tags: [],
              isFavorite: false,
            },
          ],
        },
      ],
      markers: [],
      transcript: [],
      reviewComments: [],
      approvals: [],
      publishJobs: [],
      watchFolders: [],
      subtitleTracks: [
        { id: 'sub-1', name: 'English', language: 'en', cues: [{ id: 'cue-1', start: 0, end: 2, text: 'Hi' }] },
      ],
      titleClips: [
        {
          id: 'title-1',
          text: 'Promo',
          style: {
            fontFamily: 'Helvetica',
            fontSize: 54,
            fontWeight: 700,
            color: '#ffffff',
            opacity: 1,
            textAlign: 'center',
          },
          position: { x: 0.5, y: 0.2, width: 0.7, height: 0.18 },
        },
      ],
      trackHeights: { 't-v1': 96 },
      activeWorkspaceId: 'effects',
      composerLayout: 'full-frame',
      showTrackingInfo: false,
      trackingInfoFields: ['duration'],
      clipTextDisplay: 'source',
      dupeDetectionEnabled: true,
      versionHistoryRetentionPreference: 'session',
      versionHistoryCompareMode: 'details',
      sourceAsset: {
        id: 'asset-source',
        name: 'Source Asset',
        type: 'VIDEO',
        status: 'READY',
        tags: [],
        isFavorite: false,
      },
      selectedBinId: 'b-master',
      enabledTrackIds: ['t-v1'],
      syncLockedTrackIds: ['t-a1'],
      videoMonitorTrackId: 't-v1',
    });
    trackPatchingEngine.setSourceContext('asset-source', [
      { id: 'src-v1', type: 'VIDEO', index: 1 },
      { id: 'src-a1', type: 'AUDIO', index: 1 },
    ]);
    trackPatchingEngine.patchSourceToRecord('src-v1', 't-v1');

    await useEditorStore.getState().saveProject();

    expect(repositoryMocks.saveProjectToRepository).toHaveBeenCalledTimes(1);
    const savedProject = repositoryMocks.saveProjectToRepository.mock.calls[0]?.[0] as EditorProject;
    expect(savedProject.name).toBe('Autosave Cut');
    expect(savedProject.template).toBe('social');
    expect(savedProject.description).toBe('Save path test');
    expect(savedProject.tags).toEqual(['promo']);
    expect(savedProject.settings.sampleRate).toBe(48000);
    expect(savedProject.editorialState).toEqual({
      selectedBinId: 'b-master',
      sourceAssetId: 'asset-source',
      enabledTrackIds: ['t-v1'],
      syncLockedTrackIds: ['t-a1'],
      videoMonitorTrackId: 't-v1',
      sourceTrackDescriptors: [
        { id: 'src-v1', type: 'VIDEO', index: 1 },
        { id: 'src-a1', type: 'AUDIO', index: 1 },
      ],
      trackPatches: [
        {
          sourceTrackId: 'src-v1',
          sourceTrackType: 'VIDEO',
          sourceTrackIndex: 1,
          recordTrackId: 't-v1',
          enabled: true,
        },
      ],
    });
    expect(savedProject.workstationState).toEqual({
      subtitleTracks: [
        { id: 'sub-1', name: 'English', language: 'en', cues: [{ id: 'cue-1', start: 0, end: 2, text: 'Hi' }] },
      ],
      titleClips: [
        {
          id: 'title-1',
          text: 'Promo',
          style: {
            fontFamily: 'Helvetica',
            fontSize: 54,
            fontWeight: 700,
            color: '#ffffff',
            opacity: 1,
            textAlign: 'center',
          },
          position: { x: 0.5, y: 0.2, width: 0.7, height: 0.18 },
        },
      ],
      trackHeights: { 't-v1': 96 },
      activeWorkspaceId: 'effects',
      composerLayout: 'full-frame',
      showTrackingInfo: false,
      trackingInfoFields: ['duration'],
      clipTextDisplay: 'source',
      dupeDetectionEnabled: true,
      versionHistoryRetentionPreference: 'session',
      versionHistoryCompareMode: 'details',
    });
    expect(useEditorStore.getState().saveStatus).toBe('saved');
  });

  it('preserves restored patch maps when the track patch panel mounts', async () => {
    const project = makePersistedProject();
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    await useEditorStore.getState().loadProject(project.id);

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrackPatchPanel />);
    });

    expect(trackPatchingEngine.getSourceAssetId()).toBe('asset-source');
    expect(trackPatchingEngine.getPatches()).toEqual([
      {
        sourceTrackId: 'src-v1',
        sourceTrackType: 'VIDEO',
        sourceTrackIndex: 1,
        recordTrackId: 't-v2',
        enabled: true,
      },
      {
        sourceTrackId: 'src-a1',
        sourceTrackType: 'AUDIO',
        sourceTrackIndex: 1,
        recordTrackId: 't-a1',
        enabled: true,
      },
    ]);

    await act(async () => {
      root.unmount();
    });
  });

  it('updates monitored-track UI in rendered track headers', async () => {
    usePlayerStore.getState().setActiveMonitor('record');
    useEditorStore.setState({
      projectName: 'Rendered Monitor Test',
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
        },
        {
          id: 't-v2',
          name: 'V2',
          type: 'VIDEO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#818cf8',
          clips: [],
        },
      ],
      enabledTrackIds: ['t-v1', 't-v2'],
      syncLockedTrackIds: [],
      videoMonitorTrackId: 't-v1',
      trackPatchLabels: [],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <TrackHeaders />
          <StatusBar />
        </>,
      );
    });

    const monitorButton = Array.from(container.querySelectorAll('button')).find((button) => {
      return button.getAttribute('aria-label') === 'Monitor V2';
    });

    expect(monitorButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      monitorButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useEditorStore.getState().videoMonitorTrackId).toBe('t-v2');
    const activeMonitorButton = Array.from(container.querySelectorAll('button')).find((button) => {
      return button.getAttribute('aria-label') === 'V2 is the monitored video track';
    });
    expect(activeMonitorButton).toHaveAttribute('aria-pressed', 'true');
    expect(container.textContent).toContain('Monitor: RECORD V2');

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps track headers focused on editorial controls even when legacy collaboration state is present', async () => {
    useEditorStore.setState({
      sequenceSettings: {
        ...useEditorStore.getState().sequenceSettings,
        fps: 24,
      },
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
        },
        {
          id: 't-a1',
          name: 'A1',
          type: 'AUDIO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#2bb672',
          clips: [],
        },
      ],
    });
    useCollabStore.setState({
      connected: true,
      currentUserId: 'u-self',
      onlineUsers: [
        {
          id: 'u-self',
          name: 'You',
          color: '#5b6af5',
          cursorFrame: 0,
          cursorTrackId: 't-v1',
          playheadTime: 0,
          isOnline: true,
        },
        {
          id: 'u-producer',
          name: 'Robin Producer',
          color: '#1f9de8',
          cursorFrame: 96,
          cursorTrackId: 't-v1',
          playheadTime: 4,
          isOnline: true,
        },
        {
          id: 'u-mixer',
          name: 'Casey Mixer',
          color: '#f59e0b',
          cursorFrame: 240,
          cursorTrackId: 't-v1',
          playheadTime: 10,
          isOnline: false,
        },
      ],
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrackHeaders />);
    });

    const v1PresenceGroup = container.querySelector('[aria-label="V1 collaborator presence"]');
    expect(v1PresenceGroup).toBeNull();
    expect(container.textContent).toContain('V1');
    expect(container.textContent).toContain('A1');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders save and checkpoint affordances in the workbench shell', async () => {
    repositoryMocks.saveProjectToRepository.mockImplementation(async (project: EditorProject) => project);
    useEditorStore.setState({
      projectId: 'project-shell',
      projectName: 'Shell Save Test',
      saveStatus: 'saved',
      hasUnsavedChanges: true,
    });

    const versionsBefore = useCollabStore.getState().versions.length;
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <EditorWorkbenchBar
          activePage="edit"
          onPageChange={() => {}}
        />,
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save');

    expect(container.textContent).toContain('Unsaved changes');
    expect(container.textContent).toContain('Shell Save Test');
    expect(saveButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(repositoryMocks.saveProjectToRepository).toHaveBeenCalledTimes(1);
    expect(useCollabStore.getState().versions.length).toBe(versionsBefore);

    await act(async () => {
      root.unmount();
    });
  });

  it('falls back to the local project snapshot when the repository save returns no payload', async () => {
    repositoryMocks.saveProjectToRepository.mockResolvedValue(undefined as unknown as EditorProject);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    useEditorStore.setState({
      projectId: 'project-fallback-save',
      projectName: 'Fallback Save',
      saveStatus: 'idle',
      hasUnsavedChanges: true,
    });

    await useEditorStore.getState().saveProject();

    const state = useEditorStore.getState();
    expect(repositoryMocks.saveProjectToRepository).toHaveBeenCalledTimes(1);
    expect(state.projectId).toBe('project-fallback-save');
    expect(state.projectName).toBe('Fallback Save');
    expect(state.saveStatus).toBe('saved');
    expect(state.hasUnsavedChanges).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('restores saved version snapshots back into the editor state', () => {
    useEditorStore.setState({
      projectId: 'project-versioned',
      projectName: 'Versioned Cut',
      projectDescription: 'Checkpoint restore test',
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-original',
              trackId: 't-v1',
              name: 'Original',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      bins: [
        {
          id: 'b-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [],
        },
      ],
      selectedBinId: 'b-master',
      saveStatus: 'saved',
      hasUnsavedChanges: false,
    });

    useCollabStore.getState().saveVersion('Editorial Checkpoint', 'Pre-trim state');
    const checkpointId = useCollabStore.getState().versions[0]?.id;
    expect(checkpointId).toBeTruthy();

    useEditorStore.setState({
      projectName: 'Diverged Cut',
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
        },
      ],
      hasUnsavedChanges: false,
    });

    useCollabStore.getState().restoreVersion(checkpointId!);

    const restoredState = useEditorStore.getState();
    expect(restoredState.projectId).toBe('project-versioned');
    expect(restoredState.projectName).toBe('Versioned Cut');
    expect(restoredState.tracks[0]?.clips.map((clip) => clip.id)).toEqual(['clip-original']);
    expect(restoredState.hasUnsavedChanges).toBe(true);
  });

  it('renders trim HUD feedback from shared trim state', async () => {
    useEditorStore.setState({
      trimActive: true,
      trimMode: 'asymmetric',
      trimSelectionLabel: 'ASYM',
      trimCounterFrames: 3,
      trimASideFrames: -2,
      trimBSideFrames: 5,
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrimStatusOverlay />);
    });

    expect(container.textContent).toContain('ASYMMETRIC');
    expect(container.textContent).toContain('ASYM');
    expect(container.textContent).toContain('+3f');
    expect(container.textContent).toContain('A -2f');
    expect(container.textContent).toContain('B +5f');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders selected clip feedback in the top toolbar shell', async () => {
    useEditorStore.setState({
      projectName: 'Selection Feedback',
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-selected',
              trackId: 't-v1',
              name: 'Selected Interview',
              startTime: 10,
              endTime: 14,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      selectedClipIds: ['clip-selected'],
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter future={routerFuture}>
          <Toolbar />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Selected Interview');
    expect(container.textContent).toContain('00:00:04:00');

    await act(async () => {
      root.unmount();
    });
  });

  it('supports keyboard-first deletes through the mounted global keyboard hook', async () => {
    useEditorStore.setState({
      playheadTime: 2,
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-keyboard',
              trackId: 't-v1',
              name: 'Keyboard Clip',
              startTime: 0,
              endTime: 6,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      selectedClipIds: ['clip-keyboard'],
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<KeyboardHarness />);
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    });

    expect(useEditorStore.getState().tracks[0]?.clips).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('restores a version through the rendered version-history panel flow', async () => {
    repositoryMocks.saveProjectToRepository.mockImplementation(async (project: EditorProject) => project);

    useEditorStore.setState({
      projectId: 'project-collab',
      projectName: 'Collab Restore',
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-collab',
              trackId: 't-v1',
              name: 'Saved Clip',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      bins: [
        {
          id: 'b-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [],
        },
      ],
      selectedBinId: 'b-master',
      saveStatus: 'saved',
      hasUnsavedChanges: false,
    });
    useCollabStore.setState({ activeTab: 'versions' });
    useCollabStore.getState().saveVersion('Rendered Restore', 'Saved from version history');

    useEditorStore.setState({
      projectName: 'Diverged Collab Restore',
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
        },
      ],
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <VersionHistoryPanel />
          <StatusBar />
        </>,
      );
    });

    const demoRestoreButton = Array.from(container.querySelectorAll('button')).find((button) => {
      return button.getAttribute('aria-label') === 'Restore First Assembly';
    });
    const restoreButton = Array.from(container.querySelectorAll('button')).find((button) => {
      return button.getAttribute('aria-label') === 'Restore Rendered Restore';
    });

    expect(demoRestoreButton).toBeDisabled();
    expect(restoreButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      restoreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useEditorStore.getState().projectName).toBe('Collab Restore');
    expect(useEditorStore.getState().tracks[0]?.clips.map((clip) => clip.id)).toEqual(['clip-collab']);
    expect(container.textContent).toContain('Saved');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders version-history metadata affordances beyond the restore button path', async () => {
    useEditorStore.setState({
      projectId: 'project-metadata',
      projectName: 'Metadata Cut',
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-metadata',
              trackId: 't-v1',
              name: 'Metadata Clip',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      bins: [
        {
          id: 'b-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [],
        },
      ],
      selectedBinId: 'b-master',
    });
    useCollabStore.setState({ activeTab: 'versions' });
    useCollabStore.getState().saveVersion('Metadata Restore Point', 'Saved with metadata');

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<VersionHistoryPanel />);
    });

    expect(container.textContent).toContain('Restore point');
    expect(container.textContent).toContain('Retained manually');
    expect(container.textContent).toContain('Tracks 1');
    expect(container.textContent).toContain('Clips 1');
    expect(container.textContent).toContain('Legacy demo');
    expect(container.textContent).toContain('This entry is demo history only');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders detailed version compare metrics with persisted compare preferences', async () => {
    useEditorStore.setState({
      projectId: 'project-compare',
      projectName: 'Baseline Compare',
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-compare-a',
              trackId: 't-v1',
              name: 'Compare A',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      bins: [
        {
          id: 'b-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [],
        },
        {
          id: 'b-selects',
          name: 'Selects',
          color: '#e05b8e',
          isOpen: true,
          children: [],
          assets: [],
        },
      ],
      selectedBinId: 'b-master',
      activeWorkspaceId: 'source-record',
      composerLayout: 'source-record',
      enabledTrackIds: ['t-v1'],
      syncLockedTrackIds: [],
      versionHistoryRetentionPreference: 'session',
      versionHistoryCompareMode: 'details',
    });

    useCollabStore.getState().saveVersion('Baseline Compare', 'Original state');

    useEditorStore.setState({
      tracks: [
        ...useEditorStore.getState().tracks,
        {
          id: 't-a1',
          name: 'A1',
          type: 'AUDIO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 0.8,
          color: '#2bb672',
          clips: [],
        },
      ],
      selectedBinId: 'b-selects',
      activeWorkspaceId: 'audio-mixing',
      composerLayout: 'full-frame',
      enabledTrackIds: ['t-v1', 't-a1'],
      syncLockedTrackIds: ['t-a1'],
    });

    useCollabStore.getState().saveVersion(
      'Compare Session',
      'Detailed compare session',
      undefined,
      { retentionPolicy: 'session' },
    );
    useCollabStore.setState({ activeTab: 'versions' });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<VersionHistoryPanel />);
    });

    expect(container.textContent).toContain('Session retention');
    expect(container.textContent).toContain('Detailed compare');
    expect(container.textContent).toContain('Compared to Baseline Compare');
    expect(container.textContent).toContain('Workspace: source-record -> audio-mixing');
    expect(container.textContent).toContain('Composer: source-record -> full-frame');
    expect(container.textContent).toContain('Target tracks: 1 -> 2');
    expect(container.textContent).toContain('Sync locks: 0 -> 1');

    await act(async () => {
      root.unmount();
    });
  });

  it('switches rendered monitor focus between source and record monitors', async () => {
    usePlayerStore.setState({ activeMonitor: 'source' });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <SourceMonitor />
          <RecordMonitor />
          <StatusBar />
        </>,
      );
    });

    const sourceMonitor = container.querySelector('[aria-label="Source Monitor"]');
    const recordMonitor = container.querySelector('[aria-label="Record Monitor"]');

    expect(container.textContent).toContain('Monitor: SOURCE');

    await act(async () => {
      recordMonitor?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usePlayerStore.getState().activeMonitor).toBe('record');
    expect(container.textContent).toContain('Monitor: RECORD');

    await act(async () => {
      sourceMonitor?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usePlayerStore.getState().activeMonitor).toBe('source');
    expect(container.textContent).toContain('Monitor: SOURCE');

    await act(async () => {
      root.unmount();
    });
  });
});
