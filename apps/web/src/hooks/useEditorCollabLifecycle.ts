import { useEffect } from 'react';
import { useAuthStore } from '../store/auth.store';
import { useCollabStore } from '../store/collab.store';

export function useEditorCollabLifecycle(projectId?: string): void {
  const connect = useCollabStore((state) => state.connect);
  const disconnect = useCollabStore((state) => state.disconnect);
  const authUser = useAuthStore((state) => state.user);
  const userId = authUser?.id ?? 'u_self';
  const userName = authUser?.name ?? 'You';
  const userAvatar = authUser?.avatarUrl;

  useEffect(() => {
    if (!projectId || projectId === 'new') {
      disconnect();
      return;
    }

    connect(projectId, userId, { name: userName, avatar: userAvatar });
    return () => {
      disconnect();
    };
  }, [connect, disconnect, projectId, userAvatar, userId, userName]);
}
