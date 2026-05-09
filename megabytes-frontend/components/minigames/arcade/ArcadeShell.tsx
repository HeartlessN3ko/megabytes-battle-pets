/**
 * ArcadeShell — common chrome used by every arcade minigame screen.
 *
 * Wraps the play surface in a SafeAreaView with a tight header (title,
 * subtitle, exit X), a status line, and a result modal that shows the
 * server's reward response when the game ends. Each game owns its own
 * play surface; this shell just handles navigation + reward presentation.
 */

import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ArcadeOutcome } from './helpers/arcadeRewards';

export type ArcadeShellProps = {
  title: string;
  subtitle: string;
  accent: string;
  status: string;
  result: ArcadeResultModalState | null;
  onDismissResult: () => void;
  children: React.ReactNode;
};

export type ArcadeResultModalState = {
  outcome: ArcadeOutcome;
  applied: { mood: number; affection: number; bits: number } | null;
  capRemaining: number | null;
  capTotal: number | null;
  message?: string | null;
};

export function ArcadeShell({ title, subtitle, accent, status, result, onDismissResult, children }: ArcadeShellProps) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.header, { borderColor: `${accent}55` }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: accent }]}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <TouchableOpacity
          // expo-router's generated route typings will pick up /rooms/arcade
          // on the next dev start; cast keeps the compile clean before then.
          onPress={() => router.replace('/rooms/arcade' as never)}
          style={styles.exitBtn}
          activeOpacity={0.8}
          accessibilityLabel="Exit to arcade"
        >
          <Ionicons name="close" size={20} color="#ff8aa0" />
        </TouchableOpacity>
      </View>

      <Text style={styles.status} numberOfLines={2}>{status}</Text>

      <View style={styles.body}>{children}</View>

      <Modal visible={!!result} transparent animationType="fade" onRequestClose={onDismissResult}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, outcomeColor(result?.outcome)]}>
              {result?.outcome === 'win' ? '⚡ YOU WIN' : result?.outcome === 'tie' ? '🔄 TIE' : '💀 YOU LOSE'}
            </Text>
            {result?.message ? <Text style={styles.modalMessage}>{result.message}</Text> : null}
            {result?.applied ? (
              <View style={styles.rewardBlock}>
                <RewardLine label="Mood"      value={`+${result.applied.mood}`} />
                <RewardLine label="Affection" value={`+${result.applied.affection}`} />
                <RewardLine
                  label="ByteBits"
                  value={`+${result.applied.bits}${result.applied.bits === 0 ? ' (cap reached)' : ''}`}
                />
                {result.capTotal != null && result.capRemaining != null ? (
                  <Text style={styles.capLine}>
                    Daily bit cap: {result.capTotal - result.capRemaining} / {result.capTotal}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.offlineLine}>Sync offline — reward will apply on reconnect.</Text>
            )}
            <TouchableOpacity onPress={onDismissResult} style={styles.modalBtn} activeOpacity={0.85}>
              <Text style={styles.modalBtnText}>BACK TO ARCADE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function RewardLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rewardRow}>
      <Text style={styles.rewardLabel}>{label}</Text>
      <Text style={styles.rewardValue}>{value}</Text>
    </View>
  );
}

function outcomeColor(o: ArcadeOutcome | undefined) {
  if (o === 'win') return { color: '#7cffc0' };
  if (o === 'tie') return { color: '#ffe08d' };
  return { color: '#ff6b6b' };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070b1f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title:    { fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  subtitle: { color: 'rgba(180,200,255,0.55)', fontSize: 9, fontWeight: '700', letterSpacing: 2, marginTop: 2 },
  exitBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  status: {
    color: 'rgba(160,200,255,0.6)',
    fontSize: 11, letterSpacing: 1,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  body: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', padding: 14 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCard: {
    width: '86%',
    backgroundColor: 'rgba(8,16,52,0.97)',
    borderRadius: 18,
    borderWidth: 1.5, borderColor: 'rgba(126,200,255,0.35)',
    padding: 20,
  },
  modalTitle: { fontSize: 22, fontWeight: '900', letterSpacing: 3, textAlign: 'center', marginBottom: 12 },
  modalMessage: { color: '#cbe1ff', fontSize: 12, textAlign: 'center', marginBottom: 14 },
  rewardBlock: { gap: 6, marginBottom: 14 },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rewardLabel: { color: 'rgba(180,210,255,0.7)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  rewardValue: { color: '#7cffc0', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  capLine: { color: 'rgba(180,210,255,0.5)', fontSize: 10, marginTop: 6, textAlign: 'right' },
  offlineLine: { color: 'rgba(255,200,140,0.7)', fontSize: 11, textAlign: 'center', marginBottom: 14 },

  modalBtn: {
    backgroundColor: '#1d2a55',
    borderWidth: 1, borderColor: 'rgba(126,200,255,0.4)',
    paddingVertical: 11, borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnText: { color: '#9bd7ff', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
});
