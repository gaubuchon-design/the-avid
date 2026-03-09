import { useState, useEffect, useCallback } from 'react';
import type { KeyModifier } from '../../engine/KeyboardEngine';

export interface CapturedKey {
  key: string;
  modifiers: KeyModifier[];
}

/**
 * Hook for capturing a key combination from the user.
 * When active, listens for the next keydown and returns
 * the key + modifiers pressed.
 */
export function useKeyCaptureMode() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedKey, setCapturedKey] = useState<CapturedKey | null>(null);

  const startCapture = useCallback(() => {
    setCapturedKey(null);
    setIsCapturing(true);
  }, []);

  const cancelCapture = useCallback(() => {
    setCapturedKey(null);
    setIsCapturing(false);
  }, []);

  useEffect(() => {
    if (!isCapturing) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore bare modifier keys
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      const modifiers: KeyModifier[] = [];
      if (e.ctrlKey) modifiers.push('ctrl');
      if (e.shiftKey) modifiers.push('shift');
      if (e.altKey) modifiers.push('alt');
      if (e.metaKey) modifiers.push('meta');

      setCapturedKey({ key: e.key, modifiers });
      setIsCapturing(false);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isCapturing]);

  return { isCapturing, capturedKey, startCapture, cancelCapture };
}
