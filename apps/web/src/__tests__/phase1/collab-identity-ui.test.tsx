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

  it('renders authenticated avatar in activity feed rows', async () => {
    useCollabStore.setState({
      activeTab: 'activity',
      currentUserName: 'Alex Editor',
      currentUserAvatar: 'avatar://alex',
      activityFeed: [
        {
          id: 'activity-1',
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
});
