import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildProject, type EditorProject } from '@mcua/core';

import { CollabEngine, collabEngine } from '../../collab/CollabEngine';
import { useCollabStore } from '../../store/collab.store';
import { type Track , useEditorStore } from '../../store/editor.store';

const repositoryMocks = vi.hoisted(() => ({
  getProjectFromRepository: vi.fn(),
  saveProjectToRepository: vi.fn(),
}));

vi.mock('../../lib/projectRepository', () => ({
  getProjectFromRepository: repositoryMocks.getProjectFromRepository,
  saveProjectToRepository: repositoryMocks.saveProjectToRepository,
}));


const initialEditorState = useEditorStore.getState();
const initialCollabState = useCollabStore.getState();
const seedVersions = new CollabEngine().getVersions();

function flushAsync(rounds = 4): Promise<void> {
  return (async () => {
    for (let i = 0; i < rounds; i += 1) {
      await Promise.resolve();
    }
  })();
}

function makeProject(projectId: string, clipName: string): EditorProject {
  const project = buildProject({
    name: `Project ${projectId}`,
    template: 'film',
    seedContent: false,
  });

  return {
    ...project,
    id: projectId,
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
          {
            id: `clip-${projectId}`,
            trackId: 't-v1',
            name: clipName,
            startTime: 0,
            endTime: 4,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
          },
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
    editorialState: {
      selectedBinId: 'b-master',
      sourceAssetId: null,
      enabledTrackIds: ['t-v1'],
      syncLockedTrackIds: [],
      videoMonitorTrackId: 't-v1',
      sourceTrackDescriptors: [],
      trackPatches: [],
    },
    workstationState: {
      ...project.workstationState,
      activeWorkspaceId: 'source-record',
      composerLayout: 'source-record',
      trackHeights: { 't-v1': 64 },
    },
  };
}

describe('phase 1 web-load hydration', () => {
  beforeEach(() => {
    collabEngine.hydrateVersions(seedVersions);
    useEditorStore.setState(initialEditorState, true);
    useCollabStore.setState(initialCollabState, true);
    useCollabStore.getState().refreshFromEngine();
  });

  it('hydrates persisted sequence settings including drop-frame timecode', async () => {
    const project = buildProject({
      name: 'News Package',
      template: 'news',
      seedContent: false,
      frameRate: 29.97,
      width: 1280,
      height: 720,
      dropFrame: true,
    });
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    await useEditorStore.getState().loadProject(project.id);

    const state = useEditorStore.getState();
    expect(state.sequenceSettings.fps).toBe(29.97);
    expect(state.sequenceSettings.width).toBe(1280);
    expect(state.sequenceSettings.height).toBe(720);
    expect(state.sequenceSettings.dropFrame).toBe(true);
  });

  it('keeps the latest repository hydration when earlier load requests resolve late', async () => {
    let resolveFirst: ((project: EditorProject) => void) | undefined;
    let resolveSecond: ((project: EditorProject) => void) | undefined;

    const firstResponse = new Promise<EditorProject>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<EditorProject>((resolve) => {
      resolveSecond = resolve;
    });

    repositoryMocks.getProjectFromRepository.mockImplementation((projectId: string) => {
      if (projectId === 'project-a') {
        return firstResponse;
      }
      return secondResponse;
    });

    void useEditorStore.getState().loadProject('project-a');
    void useEditorStore.getState().loadProject('project-b');

    resolveSecond?.(makeProject('project-b', 'Newest Clip'));
    await flushAsync();
    resolveFirst?.(makeProject('project-a', 'Stale Clip'));
    await flushAsync();

    const state = useEditorStore.getState();
    expect(state.projectId).toBe('project-b');
    expect(state.projectName).toBe('Project project-b');
    expect(state.tracks[0]?.clips[0]?.name).toBe('Newest Clip');
    expect(state.saveStatus).toBe('saved');
  });

  it('persists restored version snapshots so reopen loads restored timeline state', async () => {
    const repository = new Map<string, EditorProject>();
    const project = makeProject('project-reopen', 'Original Clip');
    repository.set(project.id, project);

    repositoryMocks.getProjectFromRepository.mockImplementation(async (projectId: string) => {
      return repository.get(projectId) ?? null;
    });
    repositoryMocks.saveProjectToRepository.mockImplementation(async (savedProject: EditorProject) => {
      repository.set(savedProject.id, savedProject);
      return savedProject;
    });

    await useEditorStore.getState().loadProject(project.id);
    useEditorStore.setState({
      projectId: project.id,
      tracks: makeProject('project-reopen', 'Restored Clip').tracks as Track[],
      selectedBinId: 'b-master',
      activeWorkspaceId: 'audio-mixing',
      composerLayout: 'full-frame',
    });

    useCollabStore.getState().saveVersion('Restored Snapshot', 'Saved restored state');
    const restoreVersionId = useCollabStore.getState().versions[0]?.id;
    expect(restoreVersionId).toBeDefined();

    useEditorStore.setState({
      tracks: makeProject('project-reopen', 'Mutated Clip').tracks as Track[],
      activeWorkspaceId: 'source-record',
      composerLayout: 'source-record',
    });

    useCollabStore.getState().restoreVersion(restoreVersionId!);
    await flushAsync(6);
    await useEditorStore.getState().loadProject(project.id);

    const state = useEditorStore.getState();
    expect(state.tracks[0]?.clips[0]?.name).toBe('Restored Clip');
    expect(state.activeWorkspaceId).toBe('audio-mixing');
    expect(state.composerLayout).toBe('full-frame');
  });
});
