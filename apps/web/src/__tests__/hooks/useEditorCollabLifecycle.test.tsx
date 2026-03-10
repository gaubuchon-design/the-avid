import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const collabMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  user: { id: 'user-alpha', name: 'Alex Editor', avatarUrl: 'avatar://alex' },
}));

vi.mock('../../store/collab.store', () => ({
  useCollabStore: (selector: (state: { connect: typeof collabMocks.connect; disconnect: typeof collabMocks.disconnect }) => unknown) =>
    selector({
      connect: collabMocks.connect,
      disconnect: collabMocks.disconnect,
    }),
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { id: string; name: string; avatarUrl?: string } | null }) => unknown) =>
    selector({
      user: authState.user,
    }),
}));

import { useEditorCollabLifecycle } from '../../hooks/useEditorCollabLifecycle';

function Harness({ projectId }: { projectId?: string }) {
  useEditorCollabLifecycle(projectId);
  return null;
}

describe('useEditorCollabLifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    collabMocks.connect.mockReset();
    collabMocks.disconnect.mockReset();
    authState.user = { id: 'user-alpha', name: 'Alex Editor', avatarUrl: 'avatar://alex' };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('connects collaboration state when a project is opened', async () => {
    await act(async () => {
      root.render(<Harness projectId="project-123" />);
    });

    expect(collabMocks.connect).toHaveBeenCalledWith(
      'project-123',
      'user-alpha',
      { name: 'Alex Editor', avatar: 'avatar://alex' },
    );
    expect(collabMocks.disconnect).not.toHaveBeenCalled();
  });

  it('switches collaboration sessions when the active project changes', async () => {
    await act(async () => {
      root.render(<Harness projectId="project-a" />);
    });
    await act(async () => {
      root.render(<Harness projectId="project-b" />);
    });

    expect(collabMocks.connect).toHaveBeenNthCalledWith(
      1,
      'project-a',
      'user-alpha',
      { name: 'Alex Editor', avatar: 'avatar://alex' },
    );
    expect(collabMocks.connect).toHaveBeenNthCalledWith(
      2,
      'project-b',
      'user-alpha',
      { name: 'Alex Editor', avatar: 'avatar://alex' },
    );
    expect(collabMocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects collaboration when project is unset or new', async () => {
    await act(async () => {
      root.render(<Harness projectId="project-a" />);
    });
    await act(async () => {
      root.render(<Harness projectId="new" />);
    });
    await act(async () => {
      root.render(<Harness />);
    });

    expect(collabMocks.connect).toHaveBeenCalledTimes(1);
    expect(collabMocks.disconnect).toHaveBeenCalledTimes(3);
  });

  it('disconnects collaboration session on unmount', async () => {
    await act(async () => {
      root.render(<Harness projectId="project-a" />);
    });
    await act(async () => {
      root.unmount();
    });

    expect(collabMocks.connect).toHaveBeenCalledTimes(1);
    expect(collabMocks.disconnect).toHaveBeenCalledTimes(1);
  });
});
