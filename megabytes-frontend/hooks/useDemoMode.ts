import { useCallback, useEffect, useState } from 'react';
import { hydrateDemoSession, isDemoModeActive, setDemoModeActive } from '../services/demoSession';

export function useDemoMode() {
  const [demoMode, setDemoMode] = useState<boolean>(isDemoModeActive());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    hydrateDemoSession()
      .then((active) => {
        if (mounted) {
          setDemoMode(Boolean(active));
          setHydrated(true);
        }
      })
      .catch(() => {
        if (mounted) setHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const enableDemoMode = useCallback(async () => {
    const next = await setDemoModeActive(true);
    setDemoMode(Boolean(next));
    return Boolean(next);
  }, []);

  const disableDemoMode = useCallback(async () => {
    const next = await setDemoModeActive(false);
    setDemoMode(Boolean(next));
    return Boolean(next);
  }, []);

  return { demoMode, hydrated, enableDemoMode, disableDemoMode };
}
