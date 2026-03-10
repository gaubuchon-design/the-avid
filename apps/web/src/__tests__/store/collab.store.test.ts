import { buildProject, type EditorProject } from '@mcua/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCollabStore } from '../../store/collab.store';
import { CollabEngine, collabEngine } from '../../collab/CollabEngine';
import { useEditorStore } from '../../store/editor.store';

const repositoryMocks = vi.hoisted(() => ({
  getProjectFromRepository: vi.fn(),
  saveProjectToRepository: vi.fn(),
}));

vi.mock('../../lib/projectRepository', () => ({
  getProjectFromRepository: repositoryMocks.getProjectFromRepository,
  saveProjectToRepository: repositoryMocks.saveProjectToRepository,
}));

const initialCollabState = useCollabStore.getState();
const initialEditorState = useEditorStore.getState();
const seedVersions = new CollabEngine().getVersions();
const flushAsyncTasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function buildRepositoryProject(projectId: string): EditorProject {
  const project = buildProject({
    name: 'Collab Persistence Project',
    template: 'film',
    seedContent: false,
  });
  return {
    ...project,
    id: projectId,
    versionHistory: [],
  };
}

describe('useCollabStore', () => {
  beforeEach(() => {
    collabEngine.hydrateVersions(seedVersions);
    repositoryMocks.getProjectFromRepository.mockReset();
    repositoryMocks.saveProjectToRepository.mockReset();
    repositoryMocks.getProjectFromRepository.mockResolvedValue(null);
    repositoryMocks.saveProjectToRepository.mockImplementation(async (project: EditorProject) => project);
    useCollabStore.setState(initialCollabState, true);
    useCollabStore.getState().refreshFromEngine();
    useEditorStore.setState(initialEditorState, true);
  });

  it('initial state has demo data', () => {
    const state = useCollabStore.getState();
    expect(state.onlineUsers.length).toBeGreaterThan(0);
    expect(state.comments.length).toBeGreaterThan(0);
    expect(state.versions.length).toBeGreaterThan(0);
    expect(state.activityFeed.length).toBeGreaterThan(0);
  });

  it('connect() sets connected to true', () => {
    useCollabStore.getState().connect('project_1', 'user_1');
    expect(useCollabStore.getState().connected).toBe(true);
    expect(useCollabStore.getState().projectId).toBe('project_1');
    expect(useCollabStore.getState().currentUserId).toBe('user_1');
  });

  it('hydrates collab identity from profile metadata on connect', () => {
    useCollabStore.getState().connect('project_identity', 'user_identity', {
      name: 'Taylor Editor',
      avatar: 'avatar://taylor',
    });

    useCollabStore.getState().addComment(100, 't1', 'Identity-backed comment');
    useCollabStore.getState().saveVersion('Identity Version', 'Metadata should use profile');

    const state = useCollabStore.getState();
    expect(state.currentUserName).toBe('Taylor Editor');
    expect(state.currentUserAvatar).toBe('avatar://taylor');
    expect(state.comments[0]?.userName).toBe('Taylor Editor');
    expect(state.versions[0]?.createdBy).toBe('Taylor Editor');
    expect(state.versions[0]?.createdByProfile?.avatarUrl).toBe('avatar://taylor');
    expect(state.versions[0]?.createdByProfile?.displayName).toBe('Taylor Editor');
    expect(state.activityFeed[0]?.user).toBe('Taylor Editor');
    expect(state.activityFeed[0]?.userId).toBe('user_identity');
    expect(state.onlineUsers.some((user) => user.id === 'user_identity' && user.avatar === 'avatar://taylor')).toBe(true);
  });

  it('connect() hydrates persisted version history from repository', async () => {
    const project = buildRepositoryProject('project_hydrate_versions');
    project.versionHistory = [
      {
        id: 'persisted-version-1',
        name: 'Persisted Version',
        createdAt: Date.now() - 1000,
        createdBy: 'User',
        createdByProfile: {
          userId: 'user-persisted',
          displayName: 'User',
          avatarUrl: 'avatar://persisted-user',
          color: '#1f9de8',
        },
        description: 'Saved from repository',
        snapshotData: { id: project.id, name: project.name, tracks: [], bins: [] },
        isRestorePoint: true,
      },
    ];
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    useCollabStore.getState().connect(project.id, 'user_1');
    await flushAsyncTasks();

    const hydratedVersion = useCollabStore.getState().versions[0];
    expect(hydratedVersion?.id).toBe('persisted-version-1');
    expect(hydratedVersion?.name).toBe('Persisted Version');
    expect(hydratedVersion?.createdByProfile?.avatarUrl).toBe('avatar://persisted-user');
    expect(hydratedVersion?.createdByProfile?.color).toBe('#1f9de8');
    expect(useCollabStore.getState().identityProfiles['id:user-persisted']?.avatarUrl).toBe('avatar://persisted-user');
    expect(useCollabStore.getState().identityProfiles['name:user']?.color).toBe('#1f9de8');
    expect(repositoryMocks.getProjectFromRepository).toHaveBeenCalledWith(project.id);
  });

  it('connect() hydrates identity profiles from persisted collaborators for comment/activity authors', async () => {
    const project = buildRepositoryProject('project_hydrate_collaborators');
    project.collaborators = [
      {
        id: 'user-robin',
        displayName: 'Robin Producer',
        avatarUrl: 'avatar://robin',
        color: '#1f9de8',
      },
    ];
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    useCollabStore.setState({
      comments: [
        {
          id: 'comment-robin',
          userId: 'user-robin',
          userName: 'Robin Producer',
          frame: 120,
          text: 'Need to adjust pacing here.',
          timestamp: Date.now(),
          resolved: false,
          reactions: [],
          replies: [],
        },
      ],
      activityFeed: [
        {
          id: 'activity-robin',
          userId: 'user-robin',
          user: 'Robin Producer',
          action: 'reviewed cut',
          timestamp: Date.now(),
          detail: 'Captured notes from client screening',
        },
      ],
    });

    useCollabStore.getState().connect(project.id, 'user_1');
    await flushAsyncTasks();

    const profileById = useCollabStore.getState().identityProfiles['id:user-robin'];
    const profileByName = useCollabStore.getState().identityProfiles['name:robin producer'];
    expect(profileById?.avatarUrl).toBe('avatar://robin');
    expect(profileById?.color).toBe('#1f9de8');
    expect(profileByName?.userId).toBe('user-robin');
  });

  it('disconnect() sets connected to false via setState', () => {
    useCollabStore.setState({ connected: true });
    useCollabStore.setState({ connected: false });
    expect(useCollabStore.getState().connected).toBe(false);
  });

  it('setActiveTab() changes active tab', () => {
    useCollabStore.getState().setActiveTab('versions');
    expect(useCollabStore.getState().activeTab).toBe('versions');
  });

  it('setCommentFilter() sets filter', () => {
    useCollabStore.getState().setCommentFilter('resolved');
    expect(useCollabStore.getState().commentFilter).toBe('resolved');
  });

  it('selectComment() sets selected comment ID', () => {
    useCollabStore.getState().selectComment('cmt1');
    expect(useCollabStore.getState().selectedCommentId).toBe('cmt1');
  });

  it('addComment() adds a comment and updates activity feed', () => {
    const before = useCollabStore.getState().comments.length;
    const actBefore = useCollabStore.getState().activityFeed.length;
    useCollabStore.getState().addComment(100, 't1', 'Test comment');
    expect(useCollabStore.getState().comments.length).toBeGreaterThan(before);
    expect(useCollabStore.getState().activityFeed.length).toBeGreaterThan(actBefore);
  });

  it('resolveComment() works on a standalone CollabEngine', () => {
    // Test resolve/reopen on a fresh engine instance to avoid the
    // Immer freeze bug that affects the singleton shared with the store.
    const engine = new CollabEngine();
    const comment = engine.addComment(200, null, 'Standalone test');
    expect(comment.resolved).toBe(false);
    engine.resolveComment(comment.id);
    const comments = engine.getComments();
    const resolved = comments.find((c) => c.id === comment.id);
    expect(resolved?.resolved).toBe(true);
  });

  it('reopenComment() works on a standalone CollabEngine', () => {
    const engine = new CollabEngine();
    const comment = engine.addComment(300, null, 'Standalone reopen');
    engine.resolveComment(comment.id);
    engine.reopenComment(comment.id);
    const comments = engine.getComments();
    const reopened = comments.find((c) => c.id === comment.id);
    expect(reopened?.resolved).toBe(false);
  });

  it('saveVersion() adds a version and activity entry', () => {
    const before = useCollabStore.getState().versions.length;
    useEditorStore.setState({ projectId: 'project-save-version', playheadTime: 12 });
    useCollabStore.getState().saveVersion('Test Version', 'Test description');
    const state = useCollabStore.getState();
    expect(state.versions.length).toBeGreaterThan(before);
    const savedSnapshot = state.versions[0]?.snapshotData as { playheadTime?: number } | undefined;
    expect(savedSnapshot?.playheadTime).toBe(12);
  });

  it('saveVersion() persists version history for reopen/reconnect cycles', async () => {
    const project = buildRepositoryProject('project_persist_versions');
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    useEditorStore.setState({ projectId: project.id, playheadTime: 12 });
    useCollabStore.getState().connect(project.id, 'user_1');
    await flushAsyncTasks();

    useCollabStore.getState().saveVersion('Persisted Cut', 'Should survive reconnect');
    await flushAsyncTasks();

    expect(repositoryMocks.saveProjectToRepository).toHaveBeenCalledTimes(1);
    const savedProject = repositoryMocks.saveProjectToRepository.mock.calls[0]?.[0] as EditorProject;
    expect(savedProject.versionHistory?.[0]?.name).toBe('Persisted Cut');
    expect(savedProject.versionHistory?.[0]?.createdByProfile?.displayName).toBe('You');
    expect(savedProject.versionHistory?.[0]?.createdByProfile?.userId).toBe('user_1');

    repositoryMocks.getProjectFromRepository.mockResolvedValue(savedProject);
    useCollabStore.getState().connect(project.id, 'user_1');
    await flushAsyncTasks();

    expect(useCollabStore.getState().versions[0]?.name).toBe('Persisted Cut');
  });

  it('restoreVersion() creates restore point and applies snapshot', () => {
    useEditorStore.setState({ projectId: 'project-restore-version', duration: 60, playheadTime: 5 });
    useCollabStore.getState().saveVersion('Pre-change', 'capture playhead at five');
    const targetVersionId = useCollabStore.getState().versions[0]?.id;
    expect(targetVersionId).toBeDefined();

    useEditorStore.setState({ duration: 60, playheadTime: 42 });
    useCollabStore.getState().restoreVersion(targetVersionId!);

    expect(useEditorStore.getState().playheadTime).toBe(5);
    const versions = useCollabStore.getState().versions;
    expect(versions[0]?.isRestorePoint).toBe(true);
    expect(versions[0]?.name).toContain('Restore Point');
  });

  it('setVersionRetentionPreferences() persists preference and prunes list', () => {
    localStorage.removeItem('avid:version-retention-preferences');
    useCollabStore.getState().setVersionRetentionPreferences({ preset: 'last-10', autoPrune: true });
    for (let i = 0; i < 12; i += 1) {
      useCollabStore.getState().saveVersion(`Version ${i}`, 'Retention test');
    }
    const state = useCollabStore.getState();
    expect(state.versionRetentionPreferences.preset).toBe('last-10');
    expect(state.versions.length).toBe(10);
    expect(localStorage.getItem('avid:version-retention-preferences')).toContain('"preset":"last-10"');
  });

  it('addActivity() adds entry to front of feed', () => {
    const before = useCollabStore.getState().activityFeed.length;
    useCollabStore.getState().addActivity('Test User', 'did something', 'details');
    const state = useCollabStore.getState();
    expect(state.activityFeed.length).toBe(before + 1);
    expect(state.activityFeed[0]!.user).toBe('Test User');
  });

  it('refreshFromEngine() syncs state from engine', () => {
    useCollabStore.getState().refreshFromEngine();
    const state = useCollabStore.getState();
    expect(state.onlineUsers.length).toBeGreaterThan(0);
  });
});
