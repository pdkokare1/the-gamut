// apps/web/src/hooks/use-haptic.ts
import { useCallback } from 'react';

/**
 * Provides a simple vibration feedback method.
 * respecting device capabilities and user settings.
 */
export function useHaptic() {
  const vibrate = useCallback(() => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      // Light vibration for UI interactions (10ms)
      navigator.vibrate(10);
    }
  }, []);

  return vibrate;
}
