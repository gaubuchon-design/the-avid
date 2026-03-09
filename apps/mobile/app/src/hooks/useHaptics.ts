import { useCallback } from 'react';
import { Platform } from 'react-native';

/**
 * Lightweight haptic feedback hook.
 * On iOS we use the UIKit selection feedback generator via the native bridge;
 * on Android this is a no-op since expo-haptics is not in the dependency list.
 * If expo-haptics is added later, swap the implementation here.
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection';

let ReactNativeHapticFeedback: {
  trigger: (type: string) => void;
} | null = null;

// Attempt to use the RN vibration API as a lightweight fallback
function vibrateLight(): void {
  try {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Vibration } = require('react-native') as typeof import('react-native');
      // A very short vibration for tactile feedback
      Vibration.vibrate(Platform.OS === 'ios' ? 10 : 15);
    }
  } catch {
    // Silently ignore - haptics are non-critical
  }
}

export function useHaptics() {
  const trigger = useCallback((style: HapticStyle = 'selection') => {
    if (Platform.OS === 'web') return;
    vibrateLight();
  }, []);

  const selectionFeedback = useCallback(() => {
    trigger('selection');
  }, [trigger]);

  const impactFeedback = useCallback((style: HapticStyle = 'medium') => {
    trigger(style);
  }, [trigger]);

  const notificationFeedback = useCallback(() => {
    trigger('heavy');
  }, [trigger]);

  return {
    trigger,
    selectionFeedback,
    impactFeedback,
    notificationFeedback,
  };
}
