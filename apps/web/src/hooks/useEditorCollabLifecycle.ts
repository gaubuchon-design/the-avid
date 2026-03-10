import { useEffect } from 'react';
import { useAuthStore } from '../store/auth.store';
import { useCollabStore } from '../store/collab.store';

export function useEditorCollabLifecycle(projectId?: string): void {
  const connect = useCollabStore((state) => state.connect);
  const disconnect = useCollabStore((state) => state.disconnect);
  const userId = useAuthStore((state) => state.user?.id ?? 'u_self');

  useEffect(() => {
    if (!projectId || projectId === 'new') {
      disconnect();
      return;
    }

    connect(projectId, userId);
    return () => {
      disconnect();
    };
  }, [connect, disconnect, projectId, userId]);
}
