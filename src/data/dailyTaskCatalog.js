'use strict';

/**
 * dailyTaskCatalog.js
 * Source of truth for all daily care task definitions.
 * Spec: Dailycare.MD / Task.md / CARE_SYSTEM_IMPLEMENTATION.md
 *
 * Each task has:
 *   id         — unique string key
 *   type       — 'basic' | 'quality' | 'state' | 'variety' | 'consistency' | 'stretch'
 *   getTarget  — function(isEarlyGame) → number — allows scaling
 *   condition  — function(event) → true | 'fail' | false
 *
 * Condition receives the event object: { type, ...payload }
 * Returns true to increment progress, 'fail' to mark task failed, false to ignore.
 *
 * Note: 'condition' functions cannot be stored in MongoDB.
 * activeDailyTasks on the Byte stores only id/target/progress/completed/failed.
 * The catalog is required at runtime to evaluate events.
 */

const TASK_CATALOG = [

  // ─── BASIC ────────────────────────────────────────────────────────────────

  {
    id: 'feed_byte',
    type: 'basic',
    getTarget: (early) => early ? 2 : 3,
    condition: (event) => {
      return event.type === 'feed' && event.before < 70;
    }
  },

  {
    id: 'clean_byte',
    type: 'basic',
    getTarget: (early) => early ? 1 : 2,
    condition: (event) => {
      return event.type === 'clean' && event.before < 70;
    }
  },

  {
    id: 'play_with_byte',
    type: 'basic',
    getTarget: (early) => early ? 1 : 2,
    condition: (event) => {
      return event.type === 'minigame_result';
    }
  },

  {
    id: 'complete_sleep_cycle',
    type: 'basic',
    getTarget: () => 1,
    condition: (event) => {
      return (
        event.type === 'rest_complete' &&
        event.uninterrupted === true &&
        event.endEnergy >= 80
      );
    }
  },

  // ─── QUALITY ──────────────────────────────────────────────────────────────

  {
    id: 'perfect_actions',
    type: 'quality',
    getTarget: (early) => early ? 2 : 3,
    condition: (event) => {
      return event.optimal === true;
    }
  },

  {
    id: 'high_quality_play',
    type: 'quality',
    getTarget: (early) => early ? 1 : 2,
    condition: (event) => {
      return event.type === 'minigame_result' && (event.score || 0) >= 80;
    }
  },

  {
    id: 'no_wasted_actions',
    type: 'quality',
    getTarget: () => 3,
    condition: (event) => {
      // Counts each action that was NOT in waste range
      const careActions = ['feed', 'clean', 'play', 'rest'];
      if (!careActions.includes(event.type)) return false;
      if (event.timingWindow === 'waste') return false;
      return true;
    }
  },

  // ─── STATE / MAINTENANCE ──────────────────────────────────────────────────

  {
    id: 'maintain_high_needs',
    type: 'state',
    // Target is in seconds. Early: 480s (8 min), Late: 720s (12 min)
    getTarget: (early) => early ? 480 : 720,
    condition: (event) => {
      if (event.type !== 'need_tick') return false;
      if ((event.avgNeeds || 0) < 70) return false;
      // Returns deltaTime (seconds) to add to progress instead of +1
      return event.deltaTime || false;
    }
  },

  {
    id: 'avoid_critical',
    type: 'state',
    getTarget: () => true,
    condition: (event) => {
      if (event.type === 'need_tick' && (event.avgNeeds || 0) < 30) {
        return 'fail';
      }
      return false;
    }
  },

  {
    id: 'reach_happy_state',
    type: 'state',
    getTarget: (early) => early ? 2 : 3,
    condition: (event) => {
      return event.type === 'mood_change' && (event.avgNeeds || 0) >= 75;
    }
  },

  // ─── VARIETY / ANTI-SPAM ──────────────────────────────────────────────────

  {
    id: 'balanced_care',
    type: 'variety',
    // Target tracks distinct action types used. Needs custom accumulator (see dailyCareEngine).
    getTarget: () => 4,
    condition: (event) => {
      // Counts distinct action types seen (feed/clean/play/rest)
      const validTypes = ['feed', 'clean', 'play', 'rest_complete'];
      return validTypes.includes(event.type) ? event.type : false;
    }
  },

  {
    id: 'multi_action_sequence',
    type: 'variety',
    getTarget: () => 1,
    condition: (event) => {
      // Evaluated server-side in dailyCareEngine: 3 different actions within 60s
      return event.type === 'multi_action_sequence';
    }
  },

  // ─── CONSISTENCY ──────────────────────────────────────────────────────────

  {
    id: 'check_in_twice',
    type: 'consistency',
    getTarget: () => 2,
    condition: (event) => {
      return event.type === 'session_start' && (event.gapHours || 0) >= 1;
    }
  },

  {
    id: 'steady_care',
    type: 'consistency',
    getTarget: () => 5,
    condition: (event) => {
      const careActions = ['feed', 'clean', 'play', 'rest', 'rest_complete'];
      if (!careActions.includes(event.type)) return false;
      // Only counts if no stat is currently below 50
      return (event.minNeed || 100) >= 50;
    }
  },

  // ─── STRETCH / HARD ───────────────────────────────────────────────────────

  {
    id: 'perfect_cycle',
    type: 'stretch',
    getTarget: () => 1,
    condition: (event) => {
      return event.type === 'perfect_cycle_complete';
    }
  },

  {
    id: 'thriving_state',
    type: 'stretch',
    // Target in seconds: 300s (5 min)
    getTarget: () => 300,
    condition: (event) => {
      if (event.type !== 'need_tick') return false;
      if ((event.avgNeeds || 0) < 85) return false;
      return event.deltaTime || false;
    }
  },

  {
    id: 'zero_neglect',
    type: 'stretch',
    getTarget: () => true,
    condition: (event) => {
      if (event.type === 'need_tick' && (event.avgNeeds || 0) < 40) {
        return 'fail';
      }
      return false;
    }
  },

];

// Task pool by type for selection logic
const TASK_POOL = {
  basic:       TASK_CATALOG.filter(t => t.type === 'basic'),
  quality:     TASK_CATALOG.filter(t => t.type === 'quality'),
  state:       TASK_CATALOG.filter(t => t.type === 'state'),
  variety:     TASK_CATALOG.filter(t => t.type === 'variety'),
  consistency: TASK_CATALOG.filter(t => t.type === 'consistency'),
  stretch:     TASK_CATALOG.filter(t => t.type === 'stretch'),
};

const TASK_CATALOG_MAP = Object.fromEntries(TASK_CATALOG.map(t => [t.id, t]));

module.exports = { TASK_CATALOG, TASK_POOL, TASK_CATALOG_MAP };
