// context/EvolutionContext.tsx
// Tracks the demo evolution stage globally.
// Stage 0 = egg, 1 = stage1, 2 = stage2

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useEffect } from 'react';
import { getByte, evolveByte, setDemoStage } from '../services/api';

type Stage = 0 | 1 | 2;

interface EvolutionContextType {
  stage: Stage;
  hydrated: boolean;
  feedCount: number;
  cleanCount: number;
  battleCount: number;
  recordFeed: () => { evolved: boolean };
  recordClean: () => { evolved: boolean };
  recordBattle: () => { evolved: boolean };
  advanceStage: () => void;
  resetEvolutionProgress: (forcedStage?: number) => Promise<void>;
  reloadFromServer: () => Promise<void>;
}

const EvolutionContext = createContext<EvolutionContextType | null>(null);

export function EvolutionProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStage]         = useState<Stage>(0);
  const [hydrated, setHydrated] = useState(false);
  const [feedCount, setFeedCount] = useState(0);
  const [cleanCount, setCleanCount] = useState(0);
  const [battleCount, setBattleCount] = useState(0);

  const applyStage = useCallback((nextStage: number) => {
    const clamped = Math.max(0, Math.min(2, Math.floor(nextStage))) as Stage;
    setStage(clamped);
    setFeedCount(0);
    setCleanCount(0);
    setBattleCount(0);
  }, []);

  const reloadFromServer = useCallback(async () => {
    const data = await getByte();
    const apiStage = Number(data?.byte?.evolutionStage ?? 0);
    applyStage(apiStage);
  }, [applyStage]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getByte();
        const apiStage = Number(data?.byte?.evolutionStage ?? 0);
        if (mounted) applyStage(apiStage);
      } catch {
        // Keep default local stage when API is unavailable.
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [applyStage]);

  const advanceStage = useCallback(() => {
    // Call real evolve endpoint — backend checks level eligibility
    // isDevByte bypass handled server-side
    evolveByte().then(() => {
      setStage((prev) => {
        const next = Math.min(2, prev + 1) as Stage;
        if (next !== prev) {
          setFeedCount(0);
          setCleanCount(0);
          setBattleCount(0);
        }
        return next;
      });
    }).catch((err) => {
      // Backend rejected evolution — level requirement not met
      console.log('[Evolution] Backend rejected:', err?.message);
    });
  }, []);

  const resetEvolutionProgress = useCallback(async (forcedStage = 0) => {
    applyStage(forcedStage);
    try {
      await setDemoStage(forcedStage);
    } catch {
      // Backend reset route may have already handled this.
    }
  }, [applyStage]);

  // Demo progression counters disabled — evolution is backend-driven by real level requirements
  const recordFeed = useCallback(() => {
    const next = feedCount + 1;
    setFeedCount(next);
    return { evolved: false }; // Backend will determine evolution based on level
  }, [feedCount]);

  const recordClean = useCallback(() => {
    const next = cleanCount + 1;
    setCleanCount(next);
    return { evolved: false }; // Backend will determine evolution based on level
  }, [cleanCount]);

  const recordBattle = useCallback(() => {
    const next = battleCount + 1;
    setBattleCount(next);
    return { evolved: false }; // Backend will determine evolution based on level
  }, [battleCount]);

  return (
    <EvolutionContext.Provider value={{
      stage, hydrated, feedCount, cleanCount, battleCount,
      recordFeed, recordClean, recordBattle, advanceStage, resetEvolutionProgress, reloadFromServer,
    }}>
      {children}
    </EvolutionContext.Provider>
  );
}

export function useEvolution() {
  const ctx = useContext(EvolutionContext);
  if (!ctx) throw new Error('useEvolution must be used within EvolutionProvider');
  return ctx;
}
