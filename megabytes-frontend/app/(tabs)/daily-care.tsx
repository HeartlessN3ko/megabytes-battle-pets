import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getDailyCareStatus } from '../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyTask {
  id: string;
  target: number | boolean;
  progress: number;
  completed: boolean;
  failed: boolean;
}

interface DailyCareData {
  activeDailyTasks: DailyTask[];
  dailyCareScore: number;
  dailyCareStreak: number;
  lastCareDate: string | null;
  fullSetComplete: boolean;
}

// ─── Task Display Labels ───────────────────────────────────────────────────────

const TASK_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  feed_byte:            { label: 'Feed Your Byte',         icon: 'fast-food-outline',      desc: 'Feed when hunger is below 70%' },
  clean_byte:           { label: 'Clean Your Byte',        icon: 'water-outline',           desc: 'Clean when hygiene is below 70%' },
  play_with_byte:       { label: 'Play Session',           icon: 'game-controller-outline', desc: 'Complete a minigame' },
  complete_sleep_cycle: { label: 'Sleep Cycle',            icon: 'moon-outline',            desc: 'Uninterrupted sleep to 80%+ energy' },
  perfect_actions:      { label: 'Perfect Timing',         icon: 'star-outline',            desc: 'Perform actions in the optimal window' },
  high_quality_play:    { label: 'High Score',             icon: 'trophy-outline',          desc: 'Score 80+ in a minigame' },
  no_wasted_actions:    { label: 'No Waste',               icon: 'checkmark-circle-outline',desc: 'Avoid caring when stat is already high' },
  maintain_high_needs:  { label: 'Thriving Time',          icon: 'heart-outline',           desc: 'Keep average needs above 70%' },
  avoid_critical:       { label: 'No Crisis',              icon: 'shield-checkmark-outline',desc: 'Keep all needs above 30%' },
  reach_happy_state:    { label: 'Happy State',            icon: 'happy-outline',           desc: 'Reach 75%+ average needs' },
  balanced_care:        { label: 'Balanced Care',          icon: 'grid-outline',            desc: 'Use feed, clean, play, and rest today' },
  multi_action_sequence:{ label: 'Quick Care Burst',       icon: 'flash-outline',           desc: '3 different actions within 60 seconds' },
  check_in_twice:       { label: 'Check In Twice',         icon: 'time-outline',            desc: 'Return at least 1 hour after first visit' },
  steady_care:          { label: 'Steady Care',            icon: 'trending-up-outline',     desc: 'Care 5 times without any need falling below 50%' },
  perfect_cycle:        { label: 'Perfect Cycle',          icon: 'sync-outline',            desc: 'Feed, play, and rest all in optimal windows' },
  thriving_state:       { label: 'Thriving State',         icon: 'sunny-outline',           desc: 'Keep average needs above 85% for 5 minutes' },
  zero_neglect:         { label: 'Zero Neglect',           icon: 'eye-outline',             desc: 'Keep all needs above 40% all day' },
};

const TYPE_COLORS: Record<string, string> = {
  basic:       '#7ec8ff',
  quality:     '#ffd45a',
  state:       '#7cffb2',
  variety:     '#ff9ef5',
  consistency: '#a8c8ff',
  stretch:     '#ff6b6b',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProgressLabel(task: DailyTask): string {
  if (task.failed) return 'FAILED';
  if (task.completed) return 'DONE';
  if (task.target === true) return 'ACTIVE';
  const target = task.target as number;
  // Time-based tasks (target > 60): show as time
  if (target >= 60) {
    const mins = Math.floor(target / 60);
    const progMins = Math.floor((task.progress || 0) / 60);
    return `${progMins}m / ${mins}m`;
  }
  return `${task.progress || 0} / ${task.target}`;
}

function getProgressPct(task: DailyTask): number {
  if (task.completed || task.target === true) return 100;
  if (task.failed) return 0;
  const target = task.target as number;
  if (!target) return 0;
  return Math.min(100, Math.round(((task.progress || 0) / target) * 100));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DailyCareScreen() {
  const router = useRouter();
  const [data, setData] = useState<DailyCareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getDailyCareStatus();
      setData(res);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tasks = data?.activeDailyTasks || [];
  const completed = tasks.filter(t => t.completed).length;
  const total = tasks.filter(t => !t.failed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.exitBtn} activeOpacity={0.85}>
          <Ionicons name="arrow-back-outline" size={15} color="#fff" />
          <Text style={s.exitText}>EXIT</Text>
        </TouchableOpacity>
        <Text style={s.title}>DAILY CARE</Text>
        <View style={s.exitBtn} />
      </View>

      {loading && <ActivityIndicator color="#7ec8ff" style={{ marginTop: 40 }} />}
      {error && <Text style={s.errorText}>{error}</Text>}

      {!loading && data && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Progress Summary */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <View style={s.summaryBlock}>
                <Text style={s.summaryVal}>{completed}/{total}</Text>
                <Text style={s.summaryLbl}>TASKS</Text>
              </View>
              <View style={s.summaryBlock}>
                <Text style={[s.summaryVal, { color: pct >= 80 ? '#7cffb2' : pct >= 50 ? '#ffd45a' : '#ff6b6b' }]}>
                  {pct}%
                </Text>
                <Text style={s.summaryLbl}>COMPLETE</Text>
              </View>
              <View style={s.summaryBlock}>
                <Text style={[s.summaryVal, { color: '#ffd45a' }]}>{data.dailyCareStreak || 0}</Text>
                <Text style={s.summaryLbl}>STREAK</Text>
              </View>
            </View>

            {/* Overall progress bar */}
            <View style={s.overallBarWrap}>
              <View style={[s.overallBarFill, { width: `${pct}%` as any }]} />
              <Text style={s.overallBarPct}>{pct}%</Text>
            </View>

            {data.fullSetComplete && (
              <Text style={s.fullSetBadge}>✦ FULL SET COMPLETE +50 XP BONUS ✦</Text>
            )}
          </View>

          {/* Task List */}
          {tasks.length === 0 && (
            <Text style={s.emptyText}>No tasks assigned yet — sync your Byte to generate today's tasks.</Text>
          )}

          {tasks.map((task) => {
            const info = TASK_LABELS[task.id] || { label: task.id, icon: 'checkmark-outline', desc: '' };
            const pctFill = getProgressPct(task);

            return (
              <View
                key={task.id}
                style={[
                  s.taskCard,
                  task.completed && s.taskComplete,
                  task.failed && s.taskFailed,
                ]}
              >
                <View style={s.taskTop}>
                  <Ionicons
                    name={info.icon as any}
                    size={18}
                    color={task.completed ? '#7cffb2' : task.failed ? '#ff6b6b' : '#7ec8ff'}
                    style={{ marginRight: 8, marginTop: 1 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      s.taskLabel,
                      task.completed && { color: '#7cffb2' },
                      task.failed && { color: '#ff6b6b' },
                    ]}>
                      {info.label}
                    </Text>
                    <Text style={s.taskDesc}>{info.desc}</Text>
                  </View>
                  <Text style={[
                    s.taskProgress,
                    task.completed && { color: '#7cffb2' },
                    task.failed && { color: '#ff6b6b' },
                  ]}>
                    {getProgressLabel(task)}
                  </Text>
                </View>

                {/* Progress bar (hide for boolean target and completed) */}
                {task.target !== true && !task.completed && !task.failed && (
                  <View style={s.barWrap}>
                    <View style={[s.barFill, { width: `${pctFill}%` as any }]} />
                  </View>
                )}
              </View>
            );
          })}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#050c28',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(80,160,255,0.15)',
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 9,
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 64,
    justifyContent: 'center',
  },
  exitText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#7ec8ff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  scroll: {
    padding: 14,
    gap: 10,
  },
  errorText: {
    color: '#ff6b6b',
    textAlign: 'center',
    marginTop: 24,
    fontSize: 13,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    fontSize: 13,
    marginTop: 24,
    lineHeight: 20,
  },

  // Summary card
  summaryCard: {
    backgroundColor: 'rgba(30,50,100,0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.2)',
    padding: 14,
    marginBottom: 4,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryBlock: {
    alignItems: 'center',
    gap: 3,
  },
  summaryVal: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  summaryLbl: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  overallBarWrap: {
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  overallBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#7ec8ff',
    borderRadius: 6,
  },
  overallBarPct: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    zIndex: 1,
  },
  fullSetBadge: {
    color: '#ffd45a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
  },

  // Task cards
  taskCard: {
    backgroundColor: 'rgba(20,35,80,0.7)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.18)',
    padding: 12,
    gap: 8,
  },
  taskComplete: {
    borderColor: 'rgba(124,255,178,0.3)',
    backgroundColor: 'rgba(20,60,40,0.5)',
  },
  taskFailed: {
    borderColor: 'rgba(255,107,107,0.2)',
    backgroundColor: 'rgba(60,20,20,0.4)',
    opacity: 0.7,
  },
  taskTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  taskDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  taskProgress: {
    color: '#7ec8ff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginLeft: 8,
    marginTop: 2,
  },
  barWrap: {
    height: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#7ec8ff',
    borderRadius: 3,
  },
});
