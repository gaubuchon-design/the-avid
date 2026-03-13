import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';

export interface PointerScrubUpdate {
  clientX: number;
  phase: 'start' | 'move' | 'end';
  isDragging: boolean;
}

interface UsePointerScrubOptions {
  disabled?: boolean;
  onScrub: (update: PointerScrubUpdate) => void;
}

interface PointerScrubHandlers {
  onMouseDown: React.MouseEventHandler<HTMLElement>;
  onPointerDown: React.PointerEventHandler<HTMLElement>;
}

interface PointerScrubSession {
  cleanup: (() => void) | null;
  lastClientX: number | null;
  pendingUpdate: PointerScrubUpdate | null;
  rafId: number | null;
}

export function usePointerScrub(options: UsePointerScrubOptions): PointerScrubHandlers {
  const optionsRef = useRef(options);
  const sessionRef = useRef<PointerScrubSession>({
    cleanup: null,
    lastClientX: null,
    pendingUpdate: null,
    rafId: null,
  });

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const flushPendingUpdate = useCallback(() => {
    const session = sessionRef.current;
    session.rafId = null;

    if (!session.pendingUpdate) {
      return;
    }

    const update = session.pendingUpdate;
    session.pendingUpdate = null;
    optionsRef.current.onScrub(update);
  }, []);

  const scheduleUpdate = useCallback((update: PointerScrubUpdate) => {
    const session = sessionRef.current;
    session.lastClientX = update.clientX;
    session.pendingUpdate = update;

    if (session.rafId !== null) {
      return;
    }

    session.rafId = globalThis.requestAnimationFrame(flushPendingUpdate);
  }, [flushPendingUpdate]);

  const clearSession = useCallback((emitEnd: boolean) => {
    const session = sessionRef.current;

    if (session.cleanup) {
      session.cleanup();
      session.cleanup = null;
    }

    if (session.rafId !== null) {
      globalThis.cancelAnimationFrame(session.rafId);
      session.rafId = null;
    }

    const finalClientX = session.pendingUpdate?.clientX ?? session.lastClientX;
    session.pendingUpdate = null;
    session.lastClientX = null;

    if (emitEnd && finalClientX !== null) {
      optionsRef.current.onScrub({
        clientX: finalClientX,
        phase: 'end',
        isDragging: false,
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      clearSession(false);
    };
  }, [clearSession]);

  const onPointerDown = useCallback<React.PointerEventHandler<HTMLElement>>((event) => {
    if (optionsRef.current.disabled) {
      return;
    }

    clearSession(false);
    event.preventDefault();

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture?.(pointerId);

    scheduleUpdate({
      clientX: event.clientX,
      phase: 'start',
      isDragging: true,
    });

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }

      scheduleUpdate({
        clientX: moveEvent.clientX,
        phase: 'move',
        isDragging: true,
      });
    };

    const handleEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) {
        return;
      }

      clearSession(true);
      target.releasePointerCapture?.(pointerId);
    };

    target.addEventListener('pointermove', handleMove);
    target.addEventListener('pointerup', handleEnd, { once: true });
    target.addEventListener('pointercancel', handleEnd, { once: true });
    target.addEventListener('lostpointercapture', handleEnd, { once: true });

    sessionRef.current.cleanup = () => {
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', handleEnd);
      target.removeEventListener('pointercancel', handleEnd);
      target.removeEventListener('lostpointercapture', handleEnd);
    };
  }, [clearSession, scheduleUpdate]);

  const onMouseDown = useCallback<React.MouseEventHandler<HTMLElement>>((event) => {
    if (optionsRef.current.disabled || typeof globalThis.PointerEvent === 'function') {
      return;
    }

    clearSession(false);
    event.preventDefault();

    scheduleUpdate({
      clientX: event.clientX,
      phase: 'start',
      isDragging: true,
    });

    const handleMove = (moveEvent: MouseEvent) => {
      scheduleUpdate({
        clientX: moveEvent.clientX,
        phase: 'move',
        isDragging: true,
      });
    };

    const handleEnd = () => {
      clearSession(true);
    };

    globalThis.addEventListener('mousemove', handleMove);
    globalThis.addEventListener('mouseup', handleEnd, { once: true });

    sessionRef.current.cleanup = () => {
      globalThis.removeEventListener('mousemove', handleMove);
      globalThis.removeEventListener('mouseup', handleEnd);
    };
  }, [clearSession, scheduleUpdate]);

  return {
    onMouseDown,
    onPointerDown,
  };
}
