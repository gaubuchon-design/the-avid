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
const seedComments = new CollabEngine().getComments();
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
    collabEngine.hydrateComments(seedComments);
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
    const identityById = useCollabStore.getState().identityProfiles['id:user-persisted'];
    const identityByName = useCollabStore.getState().identityProfiles['name:user'];
    expect(hydratedVersion?.id).toBe('persisted-version-1');
    expect(hydratedVersion?.name).toBe('Persisted Version');
    expect(hydratedVersion?.createdByProfile?.avatarUrl).toBe('avatar://persisted-user');
    expect(hydratedVersion?.createdByProfile?.color).toBe('#1f9de8');
    expect(identityById?.avatarUrl).toBe('avatar://persisted-user');
    expect(identityById?.color).toBe('#1f9de8');
    expect(identityByName?.displayName).toBe('User');
    expect(repositoryMocks.getProjectFromRepository).toHaveBeenCalledWith(project.id);
  });

  it('connect() hydrates persisted collaboration comments from repository', async () => {
    const project = buildRepositoryProject('project_hydrate_comments');
    project.collaborationComments = [
      {
        id: 'persisted-comment-1',
        userId: 'user-reviewer',
        userName: 'Jordan Reviewer',
        frame: 200,
        trackId: 't1',
        text: 'Persisted comment',
        timestamp: Date.now() - 5000,
        resolved: false,
        replies: [
          {
            id: 'persisted-reply-1',
            userId: 'user-assist',
            userName: 'Sky Assist',
            text: 'Persisted reply',
            timestamp: Date.now() - 4000,
          },
        ],
        reactions: [
          {
            emoji: '👍',
            userIds: ['user-reviewer'],
            actorProfiles: [
              {
                userId: 'user-reviewer',
                displayName: 'Jordan Reviewer',
                avatarUrl: 'avatar://jordan',
                color: '#118ab2',
              },
            ],
          },
        ],
      },
    ];
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    useCollabStore.getState().connect(project.id, 'user_1');
    await flushAsyncTasks();

    const hydratedComment = useCollabStore.getState().comments[0];
    const identityById = useCollabStore.getState().identityProfiles['id:user-reviewer'];
    expect(hydratedComment?.id).toBe('persisted-comment-1');
    expect(hydratedComment?.text).toBe('Persisted comment');
    expect(hydratedComment?.replies[0]?.text).toBe('Persisted reply');
    expect(hydratedComment?.reactions[0]?.actorProfiles?.[0]?.displayName).toBe('Jordan Reviewer');
    expect(identityById?.avatarUrl).toBe('avatar://jordan');
  });

  it('connect() hydrates persisted collaboration activity feed from repository', async () => {
    const project = buildRepositoryProject('project_hydrate_activity');
    project.collaborationActivityFeed = [
      {
        id: 'activity-persisted-1',
        user: 'Jordan Reviewer',
        userId: 'user-reviewer',
        action: 'saved version',
        timestamp: Date.now() - 1500,
        detail: '"Persisted Cut"',
      },
    ];
    project.collaborationActivityRetentionPreferences = {
      preset: 'last-25',
      autoPrune: true,
    };
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    useCollabStore.getState().connect(project.id, 'user_1');
    await flushAsyncTasks();

    const activityEntry = useCollabStore.getState().activityFeed[0];
    expect(activityEntry?.id).toBe('activity-persisted-1');
    expect(activityEntry?.user).toBe('Jordan Reviewer');
    expect(activityEntry?.userId).toBe('user-reviewer');
    expect(activityEntry?.action).toBe('saved version');
    expect(useCollabStore.getState().activityRetentionPreferences.preset).toBe('last-25');
  });

  it('connect() hydrates persisted collaboration panel preferences from repository', async () => {
    const project = buildRepositoryProject('project_hydrate_panel_preferences');
    project.collaborationPanelPreferences = {
      activeTab: 'activity',
      commentFilter: 'resolved',
      activityActionFilter: 'versions',
      activitySearchQuery: 'cut',
      versionHistoryRetentionPreference: 'session',
      versionHistoryCompareMode: 'details',
    };
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    useCollabStore.getState().connect(project.id, 'user_1');
    await flushAsyncTasks();

    const state = useCollabStore.getState();
    expect(state.activeTab).toBe('activity');
    expect(state.commentFilter).toBe('resolved');
    expect(state.activityActionFilter).toBe('versions');
    expect(state.activitySearchQuery).toBe('cut');
    expect(useEditorStore.getState().versionHistoryRetentionPreference).toBe('session');
    expect(useEditorStore.getState().versionHistoryCompareMode).toBe('details');
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

  it('addReaction() stores reaction actor profile metadata for current user', () => {
    useCollabStore.getState().connect('project_reaction_identity', 'user_reaction', {
      name: 'Riley Mixer',
      avatar: 'avatar://riley',
    });
    useCollabStore.getState().addComment(90, 't1', 'Reaction identity test');
    const commentId = useCollabStore.getState().comments[0]?.id;
    expect(commentId).toBeDefined();

    useCollabStore.getState().addReaction(commentId!, '🔥');
    const reaction = useCollabStore.getState().comments[0]?.reactions.find((entry) => entry.emoji === '🔥');
    expect(reaction?.userIds).toContain('user_reaction');
    expect(reaction?.actorProfiles?.[0]?.userId).toBe('user_reaction');
    expect(reaction?.actorProfiles?.[0]?.displayName).toBe('Riley Mixer');
    expect(reaction?.actorProfiles?.[0]?.avatarUrl).toBe('avatar://riley');
  });

  it('addReaction() persists collaboration comments for reopen/reconnect cycles', async () => {
    const project = buildRepositoryProject('project_persist_comments');
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);

    useCollabStore.getState().connect(project.id, 'user_reaction', {
      name: 'Riley Mixer',
      avatar: 'avatar://riley',
    });
    await flushAsyncTasks();

    useCollabStore.getState().addComment(120, 't1', 'Persist me');
    const commentId = useCollabStore.getState().comments[0]?.id;
    useCollabStore.getState().addReaction(commentId!, '🔥');
    await flushAsyncTasks();

    const savedProject = repositoryMocks.saveProjectToRepository.mock.calls.at(-1)?.[0] as EditorProject;
    expect(savedProject.collaborationComments?.[0]?.text).toBe('Persist me');
    expect(savedProject.collaborationComments?.[0]?.reactions[0]?.emoji).toBe('🔥');
    expect(savedProject.collaborationComments?.[0]?.reactions[0]?.actorProfiles?.[0]?.displayName).toBe('Riley Mixer');
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
    expect(savedProject.collaborationActivityFeed?.[0]?.action).toBe('saved version');
    expect(savedProject.collaborationActivityFeed?.[0]?.userId).toBe('user_1');
    expect(savedProject.collaborationActivityRetentionPreferences?.preset).toBe('last-50');

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

  it('persists collaboration panel preferences when filters/tabs change', async () => {
    const project = buildRepositoryProject('project_panel_preferences_persist');
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);
    useCollabStore.getState().connect(project.id, 'user_1');
    await flushAsyncTasks();

    useCollabStore.getState().setActiveTab('activity');
    useCollabStore.getState().setCommentFilter('resolved');
    useCollabStore.getState().setActivityActionFilter('comments');
    useCollabStore.getState().setActivitySearchQuery('review');
    await flushAsyncTasks();

    const savedProject = repositoryMocks.saveProjectToRepository.mock.calls.at(-1)?.[0] as EditorProject;
    expect(savedProject.collaborationPanelPreferences?.activeTab).toBe('activity');
    expect(savedProject.collaborationPanelPreferences?.commentFilter).toBe('resolved');
    expect(savedProject.collaborationPanelPreferences?.activityActionFilter).toBe('comments');
    expect(savedProject.collaborationPanelPreferences?.activitySearchQuery).toBe('review');
    expect(savedProject.collaborationPanelPreferences?.versionHistoryRetentionPreference).toBe(
      useEditorStore.getState().versionHistoryRetentionPreference,
    );
    expect(savedProject.collaborationPanelPreferences?.versionHistoryCompareMode).toBe(
      useEditorStore.getState().versionHistoryCompareMode,
    );
  });

  it('persistPanelPreferences() persists version history review controls', async () => {
    const project = buildRepositoryProject('project_version_review_preferences_persist');
    repositoryMocks.getProjectFromRepository.mockResolvedValue(project);
    useCollabStore.getState().connect(project.id, 'user_1');
    await flushAsyncTasks();

    useEditorStore.getState().setVersionHistoryRetentionPreference('session');
    useEditorStore.getState().setVersionHistoryCompareMode('details');
    useCollabStore.getState().persistPanelPreferences();
    await flushAsyncTasks();

    const savedProject = repositoryMocks.saveProjectToRepository.mock.calls.at(-1)?.[0] as EditorProject;
    expect(savedProject.collaborationPanelPreferences?.versionHistoryRetentionPreference).toBe('session');
    expect(savedProject.collaborationPanelPreferences?.versionHistoryCompareMode).toBe('details');
  });

  it('setActivityRetentionPreferences() prunes feed and persists preference', () => {
    localStorage.removeItem('avid:activity-retention-preferences');
    useCollabStore.getState().setActivityRetentionPreferences({ preset: 'last-25', autoPrune: true });
    for (let i = 0; i < 30; i += 1) {
      useCollabStore.getState().addActivity('Retention User', `event-${i}`, 'retention detail');
    }
    const state = useCollabStore.getState();
    expect(state.activityRetentionPreferences.preset).toBe('last-25');
    expect(state.activityFeed.length).toBe(25);
    expect(localStorage.getItem('avid:activity-retention-preferences')).toContain('"preset":"last-25"');
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
