// context/EvolutionContext.tsx
// Tracks the demo evolution stage globally.
// Stage 0 = egg, 1 = stage1, 2 = stage2

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useEffect } from 'react';
import { getByte, setDemoStage } from '../services/api';

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
  resetEvolutionProgress: () => Promise<void>;
}

const EvolutionContext = createContext<EvolutionContextType | null>(null);

export function EvolutionProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStage]         = useState<Stage>(0);
  const [hydrated, setHydrated] = useState(false);
  const [feedCount, setFeedCount] = useState(0);
  const [cleanCount, setCleanCount] = useState(0);
  const [battleCount, setBattleCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getByte();
        const apiStage = Number(data?.byte?.evolutionStage ?? 0);
        const clamped = Math.max(0, Math.min(2, Math.floor(apiStage))) as Stage;
        if (mounted) {
          setStage(clamped);
        }
      } catch {
        // Keep default local stage when API is unavailable.
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const advanceStage = useCallback(() => {
    setStage((prev) => {
      const next = Math.min(2, prev + 1) as Stage;
      if (next !== prev) {
        setFeedCount(0);
        setCleanCount(0);
        setBattleCount(0);
        setDemoStage(next).catch(() => {});
      }
      return next;
    });
  }, []);

  const resetEvolutionProgress = useCallback(async () => {
    setStage(0);
    setFeedCount(0);
    setCleanCount(0);
    setBattleCount(0);
    try {
      await setDemoStage(0);
    } catch {
      // Backend reset route may have already handled this.
    }
  }, []);

  // Egg → Stage 1: Feed 3x + Clean 1x
  const recordFeed = useCallback(() => {
    const next = feedCount + 1;
    setFeedCount(next);
    if (stage === 0 && next >= 3 && cleanCount >= 1) {
      return { evolved: true };
    }
    // Stage 1 → Stage 2: Feed 2x after battle
    if (stage === 1 && battleCount >= 1 && next >= 2) {
      return { evolved: true };
    }
    return { evolved: false };
  }, [feedCount, cleanCount, battleCount, stage]);

  const recordClean = useCallback(() => {
    const next = cleanCount + 1;
    setCleanCount(next);
    if (stage === 0 && feedCount >= 3 && next >= 1) {
      return { evolved: true };
    }
    return { evolved: false };
  }, [cleanCount, feedCount, stage]);

  const recordBattle = useCallback(() => {
    const next = battleCount + 1;
    setBattleCount(next);
    return { evolved: false }; // battle alone doesn't evolve, needs feeds after
  }, [battleCount]);

  return (
    <EvolutionContext.Provider value={{
      stage, hydrated, feedCount, cleanCount, battleCount,
      recordFeed, recordClean, recordBattle, advanceStage, resetEvolutionProgress,
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
