import { useCallback, useRef, useState } from 'react';

type ActionFn = () => void | Promise<void>;

export function useActionGate(defaultCooldownMs = 650) {
  const cooldownUntilRef = useRef<Record<string, number>>({});
  const pendingRef = useRef<Record<string, boolean>>({});
  const [, setTick] = useState(0);

  const isLocked = useCallback((key: string) => {
    const now = Date.now();
    return Boolean(pendingRef.current[key]) || (cooldownUntilRef.current[key] || 0) > now;
  }, []);

  const runAction = useCallback(
    async (key: string, action: ActionFn, cooldownMs = defaultCooldownMs) => {
      const now = Date.now();
      if (Boolean(pendingRef.current[key])) return false;
      if ((cooldownUntilRef.current[key] || 0) > now) return false;

      pendingRef.current[key] = true;
      cooldownUntilRef.current[key] = now + cooldownMs;
      setTick((v) => v + 1);

      try {
        await action();
      } finally {
        const remaining = Math.max(0, (cooldownUntilRef.current[key] || 0) - Date.now());
        setTimeout(() => {
          pendingRef.current[key] = false;
          setTick((v) => v + 1);
        }, remaining);
      }

      return true;
    },
    [defaultCooldownMs]
  );

  return { isLocked, runAction };
}
