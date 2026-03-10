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

  it('hydrates non-current collaborator avatars from persisted identity profiles', async () => {
    useCollabStore.setState({
      activeTab: 'comments',
      currentUserName: 'Alex Editor',
      currentUserAvatar: 'avatar://alex',
      identityProfiles: {
        'id:user-robin': {
          userId: 'user-robin',
          displayName: 'Robin Producer',
          avatarUrl: 'avatar://robin',
          color: '#1f9de8',
        },
        'name:robin producer': {
          userId: 'user-robin',
          displayName: 'Robin Producer',
          avatarUrl: 'avatar://robin',
          color: '#1f9de8',
        },
      },
      comments: [
        {
          id: 'comment-robin',
          userId: 'user-robin',
          userName: 'Robin Producer',
          frame: 80,
          text: 'Persisted profile comment',
          timestamp: Date.now(),
          resolved: false,
          reactions: [],
          replies: [
            {
              id: 'reply-robin',
              userId: 'user-robin',
              userName: 'Robin Producer',
              text: 'Persisted profile reply',
              timestamp: Date.now(),
            },
          ],
        },
      ],
      activityFeed: [
        {
          id: 'activity-robin',
          userId: 'user-robin',
          user: 'Robin Producer',
          action: 'reviewed cut',
          timestamp: Date.now(),
          detail: 'Persisted profile activity',
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CollabPanel />);
    });

    expect(container.querySelector('img[alt="Robin Producer avatar"]')).toBeTruthy();
    expect(container.textContent).toContain('Persisted profile comment');

    useCollabStore.setState({ activeTab: 'activity' });
    await act(async () => {
      root.render(<CollabPanel />);
    });

    expect(container.querySelector('img[alt="Robin Producer avatar"]')).toBeTruthy();
    expect(container.textContent).toContain('Persisted profile activity');

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
});
