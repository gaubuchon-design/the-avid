import React, { act } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { ProjectVersion } from '../../collab/CollabEngine';
import { CollabPanel } from '../../components/CollabPanel/CollabPanel';
import { useCollabStore } from '../../store/collab.store';
import { useEditorStore } from '../../store/editor.store';

const initialCollabState = useCollabStore.getState();
const initialEditorState = useEditorStore.getState();

function makeVersion(createdBy: string): ProjectVersion {
  return {
    id: 'version-identity',
    name: 'Identity Snapshot',
    createdAt: Date.now(),
    createdBy,
    createdByProfile: {
      displayName: createdBy,
      color: '#f59e0b',
    },
    description: 'Identity check',
    kind: 'restore-point',
    isRestorePoint: true,
    retentionPolicy: 'manual',
    snapshotSummary: {
      trackCount: 1,
      clipCount: 1,
      binCount: 1,
      duration: 4,
    },
    compareSummary: null,
    compareBaselineName: null,
    compareMetrics: [],
    snapshotData: {
      id: 'project-identity-ui',
      tracks: [],
      bins: [],
      editorialState: {},
      workstationState: {},
    },
  };
}

describe('phase 1 collab identity UI', () => {
  beforeEach(() => {
    useCollabStore.setState(initialCollabState, true);
    useEditorStore.setState(initialEditorState, true);
  });

  it('renders authenticated avatar in version cards for current user entries', async () => {
    useCollabStore.setState({
      activeTab: 'versions',
      currentUserName: 'Alex Editor',
      currentUserAvatar: 'avatar://alex',
      versions: [makeVersion('Alex Editor')],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    expect(container.querySelector('img[alt="Alex Editor avatar"]')).toBeTruthy();
    expect(container.textContent).toContain('by Alex Editor');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders persisted author avatar in version cards for non-current users', async () => {
    useCollabStore.setState({
      activeTab: 'versions',
      currentUserName: 'Alex Editor',
      currentUserAvatar: 'avatar://alex',
      versions: [
        {
          ...makeVersion('Jordan Reviewer'),
          id: 'version-jordan',
          createdByProfile: {
            userId: 'user-jordan',
            displayName: 'Jordan Reviewer',
            avatarUrl: 'avatar://jordan',
            color: '#118ab2',
          },
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    expect(container.querySelector('img[alt="Jordan Reviewer avatar"]')).toBeTruthy();
    expect(container.textContent).toContain('by Jordan Reviewer');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders authenticated avatar in activity feed rows', async () => {
    useCollabStore.setState({
      activeTab: 'activity',
      currentUserName: 'Alex Editor',
      currentUserAvatar: 'avatar://alex',
      activityFeed: [
        {
          id: 'activity-1',
          userId: 'user-alex',
          user: 'Alex Editor',
          action: 'saved version',
          timestamp: Date.now(),
          detail: 'Identity Snapshot',
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    expect(container.querySelector('img[alt="Alex Editor avatar"]')).toBeTruthy();
    expect(container.textContent).toContain('Alex Editor');
    expect(container.textContent).toContain('saved version');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('updates activity retention preferences from activity tab controls', async () => {
    useCollabStore.setState({
      activeTab: 'activity',
      activityRetentionPreferences: {
        preset: 'last-50',
        autoPrune: true,
      },
      activityFeed: Array.from({ length: 30 }, (_, index) => ({
        id: `activity-${index}`,
        user: 'Alex Editor',
        userId: 'user-alex',
        action: 'edited timeline',
        timestamp: Date.now() - (index * 1000),
        detail: `event-${index}`,
      })),
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const presetSelect = container.querySelector('select[aria-label="Activity retention preset"]') as HTMLSelectElement | null;
    expect(presetSelect).toBeTruthy();
    await act(async () => {
      if (!presetSelect) return;
      presetSelect.value = 'last-25';
      presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const autoPruneToggle = container.querySelector('input[aria-label="Activity retention auto prune"]') as HTMLInputElement | null;
    expect(autoPruneToggle).toBeTruthy();
    await act(async () => {
      if (!autoPruneToggle) return;
      autoPruneToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const actionFilterSelect = container.querySelector('select[aria-label="Activity action filter"]') as HTMLSelectElement | null;
    expect(actionFilterSelect).toBeTruthy();
    await act(async () => {
      if (!actionFilterSelect) return;
      actionFilterSelect.value = 'versions';
      actionFilterSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useCollabStore.getState().activityRetentionPreferences.preset).toBe('last-25');
    expect(useCollabStore.getState().activityRetentionPreferences.autoPrune).toBe(false);
    expect(useCollabStore.getState().activityActionFilter).toBe('versions');
    expect(useCollabStore.getState().activityFeed.length).toBe(25);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders restored activity context summary chips', async () => {
    useCollabStore.setState({
      activeTab: 'activity',
      activityActionFilter: 'versions',
      activitySearchQuery: 'cut',
      activityFeed: [
        {
          id: 'activity-version',
          user: 'Alex Editor',
          userId: 'user-alex',
          action: 'saved version',
          timestamp: Date.now(),
          detail: 'Rough Cut v3',
        },
        {
          id: 'activity-comment',
          user: 'Jordan Reviewer',
          userId: 'user-jordan',
          action: 'added comment',
          timestamp: Date.now(),
          detail: 'needs tighter pacing',
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const summary = container.querySelector('[aria-label="Activity context summary"]');
    expect(summary).toBeTruthy();
    expect(summary?.textContent).toContain('Filter: versions');
    expect(summary?.textContent).toContain('Search: cut');
    expect(summary?.textContent).toContain('1/2 shown');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders restored comments context summary indicators', async () => {
    useCollabStore.setState({
      activeTab: 'comments',
      commentFilter: 'resolved',
      comments: [
        {
          id: 'comment-open',
          userId: 'user-alex',
          userName: 'Alex Editor',
          frame: 100,
          text: 'Open thread',
          timestamp: Date.now(),
          resolved: false,
          reactions: [],
          replies: [],
        },
        {
          id: 'comment-resolved',
          userId: 'user-jordan',
          userName: 'Jordan Reviewer',
          frame: 200,
          text: 'Resolved thread',
          timestamp: Date.now(),
          resolved: true,
          reactions: [],
          replies: [],
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const summary = container.querySelector('[aria-label="Comments context summary"]');
    expect(summary).toBeTruthy();
    expect(summary?.textContent).toContain('Filter: resolved');
    expect(summary?.textContent).toContain('1/2 shown');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders restored selected comment focus indicators', async () => {
    useCollabStore.setState({
      activeTab: 'comments',
      selectedCommentId: 'comment-focus',
      comments: [
        {
          id: 'comment-focus',
          userId: 'user-alex',
          userName: 'Alex Editor',
          frame: 120,
          text: 'Focus thread',
          timestamp: Date.now(),
          resolved: false,
          reactions: [],
          replies: [],
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const summary = container.querySelector('[aria-label="Comments focus summary"]');
    expect(summary).toBeTruthy();
    expect(summary?.textContent).toContain('Selected: comment-focus');
    expect(summary?.textContent).toContain('Focus at 00:00:05:00');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders restored comments composer draft and active reply context', async () => {
    useCollabStore.setState({
      activeTab: 'comments',
      commentsComposerVisible: true,
      commentsComposerDraft: 'Need alt b-roll after this line.',
      commentsActiveReplyCommentId: 'comment-reply-target',
      commentsReplyDrafts: {
        'comment-reply-target': 'This beat needs a tighter response.',
      },
      comments: [
        {
          id: 'comment-reply-target',
          userId: 'user-jordan',
          userName: 'Jordan Reviewer',
          frame: 180,
          text: 'Can we tighten this section?',
          timestamp: Date.now(),
          resolved: false,
          reactions: [],
          replies: [],
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const composerTextarea = container.querySelector('textarea[placeholder="Type your comment..."]') as HTMLTextAreaElement | null;
    const replyInput = container.querySelector('input[placeholder="Write a reply..."]') as HTMLInputElement | null;
    const composerSummary = container.querySelector('[aria-label="Comments composer context summary"]');
    expect(composerTextarea?.value).toBe('Need alt b-roll after this line.');
    expect(replyInput).toBeTruthy();
    expect(replyInput?.value).toBe('This beat needs a tighter response.');
    expect(composerSummary).toBeTruthy();
    expect(composerSummary?.textContent).toContain('Draft: Need alt b-roll after this line.');
    expect(composerSummary?.textContent).toContain('Replying to: comment-reply-target');
    expect(container.textContent).toContain('Draft reply: This beat needs a tighter response.');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders restored versions context summary chips', async () => {
    useCollabStore.setState({
      activeTab: 'versions',
    });
    useEditorStore.setState({
      versionHistoryRetentionPreference: 'session',
      versionHistoryCompareMode: 'details',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const summary = container.querySelector('[aria-label="Versions context summary"]');
    expect(summary).toBeTruthy();
    expect(summary?.textContent).toContain('Retention: Session retention');
    expect(summary?.textContent).toContain('Compare: Detailed compare');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders restored version compare panel selections', async () => {
    useCollabStore.setState({
      activeTab: 'versions',
      versions: [
        {
          ...makeVersion('Alex Editor'),
          id: 'version-target',
          name: 'Target Version',
        },
        {
          ...makeVersion('Jordan Reviewer'),
          id: 'version-baseline',
          name: 'Baseline Version',
        },
      ],
      versionCompareTargetVersionId: 'version-target',
      versionCompareBaselineMode: 'custom',
      versionCompareCustomBaselineId: 'version-baseline',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const targetSelect = container.querySelector('select[aria-label="Version compare target"]') as HTMLSelectElement | null;
    const baselineModeSelect = container.querySelector('select[aria-label="Version compare baseline mode"]') as HTMLSelectElement | null;
    const customBaselineSelect = container.querySelector('select[aria-label="Version compare custom baseline"]') as HTMLSelectElement | null;
    const compareContextSummary = container.querySelector('[aria-label="Version compare context summary"]');
    expect(targetSelect?.value).toBe('version-target');
    expect(baselineModeSelect?.value).toBe('custom');
    expect(customBaselineSelect?.value).toBe('version-baseline');
    expect(compareContextSummary).toBeTruthy();
    expect(compareContextSummary?.textContent).toContain('Target: Target Version');
    expect(compareContextSummary?.textContent).toContain('Baseline: Baseline Version');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders avatar-aware identity chips in users tab rows', async () => {
    useCollabStore.setState({
      activeTab: 'users',
      onlineUsers: [
        {
          id: 'user-alex',
          name: 'Alex Editor',
          avatar: 'avatar://alex',
          color: '#f59e0b',
          cursorFrame: 120,
          cursorTrackId: 't-v1',
          isOnline: true,
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    expect(container.querySelector('img[alt="Alex Editor avatar"]')).toBeTruthy();
    expect(container.textContent).toContain('Alex Editor');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders authenticated avatar in comment and reply threads', async () => {
    useCollabStore.setState({
      activeTab: 'comments',
      currentUserName: 'Alex Editor',
      currentUserAvatar: 'avatar://alex',
      comments: [
        {
          id: 'comment-1',
          userId: 'user-alex',
          userName: 'Alex Editor',
          frame: 100,
          text: 'Identity comment',
          timestamp: Date.now(),
          resolved: false,
          reactions: [],
          replies: [
            {
              id: 'reply-1',
              userId: 'user-alex',
              userName: 'Alex Editor',
              text: 'Identity reply',
              timestamp: Date.now(),
            },
          ],
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const avatars = container.querySelectorAll('img[alt="Alex Editor avatar"]');
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain('Identity comment');
    expect(container.textContent).toContain('Identity reply');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders hydrated non-current collaborator avatar in comments and activity rows', async () => {
    useCollabStore.setState({
      activeTab: 'comments',
      currentUserName: 'Alex Editor',
      currentUserAvatar: 'avatar://alex',
      identityProfiles: {
        'id:user-jordan': {
          userId: 'user-jordan',
          displayName: 'Jordan Reviewer',
          avatarUrl: 'avatar://jordan',
          color: '#118ab2',
        },
        'name:jordan reviewer': {
          userId: 'user-jordan',
          displayName: 'Jordan Reviewer',
          avatarUrl: 'avatar://jordan',
          color: '#118ab2',
        },
      },
      comments: [
        {
          id: 'comment-jordan',
          userId: 'user-jordan',
          userName: 'Jordan Reviewer',
          frame: 80,
          text: 'Needs one more pass.',
          timestamp: Date.now(),
          resolved: false,
          reactions: [],
          replies: [
            {
              id: 'reply-jordan',
              userId: 'user-jordan',
              userName: 'Jordan Reviewer',
              text: 'I can handle this.',
              timestamp: Date.now(),
            },
          ],
        },
      ],
      activityFeed: [
        {
          id: 'activity-jordan',
          userId: 'user-jordan',
          user: 'Jordan Reviewer',
          action: 'replied to comment',
          timestamp: Date.now(),
          detail: 'I can handle this.',
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const commentTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Comments');
    expect(commentTab).toBeTruthy();
    await act(async () => {
      commentTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const jordanCommentAvatars = container.querySelectorAll('img[alt="Jordan Reviewer avatar"]');
    expect(jordanCommentAvatars.length).toBeGreaterThanOrEqual(2);

    const activityTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Activity');
    expect(activityTab).toBeTruthy();
    await act(async () => {
      activityTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('img[alt="Jordan Reviewer avatar"]')).toBeTruthy();
    expect(container.textContent).toContain('replied to comment');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders reaction actor identity labels for non-current collaborators', async () => {
    useCollabStore.setState({
      activeTab: 'comments',
      currentUserName: 'Alex Editor',
      currentUserAvatar: 'avatar://alex',
      identityProfiles: {
        'id:user-jordan': {
          userId: 'user-jordan',
          displayName: 'Jordan Reviewer',
          avatarUrl: 'avatar://jordan',
          color: '#118ab2',
        },
      },
      comments: [
        {
          id: 'comment-reaction',
          userId: 'user-alex',
          userName: 'Alex Editor',
          frame: 64,
          text: 'Looks good.',
          timestamp: Date.now(),
          resolved: false,
          reactions: [
            {
              emoji: '👍',
              userIds: ['user-jordan'],
            },
          ],
          replies: [],
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    const reactionButton = Array
      .from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('👍'));
    expect(reactionButton).toBeTruthy();
    expect(reactionButton?.getAttribute('title')).toContain('Jordan Reviewer');
    expect(reactionButton?.textContent).toContain('👍');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
