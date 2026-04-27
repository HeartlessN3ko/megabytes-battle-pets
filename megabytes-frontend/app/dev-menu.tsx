/**
 * DEV MENU — internal tuning + state inspection surface.
 *
 * Covers care actions, progression, direct need/corruption/byteBits mutation,
 * and a full reset-to-egg. All dev endpoints bypass normal game rules — do
 * not expose this screen in a public build.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  careAction,
  clinicRepair,
  devAdjustByteBits,
  devAdjustCorruption,
  devAdjustNeed,
  devResetByte,
  devSetLifespanStage,
  evolveByte,
  powerNap,
  praiseByte,
  resetDailyTasks,
  scoldByte,
  syncByte,
} from '../services/api';

const NEEDS = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'] as const;

// Defense in depth — even if someone deeplinks to /dev-menu, this gate kills
// the screen in public builds. Open in dev builds (__DEV__) automatically;
// production builds require EXPO_PUBLIC_DEV_MENU=1. Backend requireDevMode
// middleware is the second layer (DEV_MODE + x-dev-key).
const DEV_MENU_ENABLED = __DEV__ || String(process.env.EXPO_PUBLIC_DEV_MENU || '') === '1';

export default function DevMenuScreen() {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string>('Ready.');

  // Gate AFTER hooks (Rules of Hooks). Public builds with EXPO_PUBLIC_DEV_MENU
  // unset see only the disabled placeholder.
  if (!DEV_MENU_ENABLED) {
    return (
      <ImageBackground source={require('../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Text style={{ color: '#9fe3ff', fontSize: 14, fontWeight: '800' }}>DEV MENU DISABLED</Text>
            <Text style={{ color: 'rgba(220,240,255,0.6)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
              Set EXPO_PUBLIC_DEV_MENU=1 to enable.
            </Text>
            <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(8,18,62,0.84)', borderWidth: 1, borderColor: 'rgba(159,227,255,0.4)' }}>
              <Text style={{ color: '#9fe3ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }}>BACK</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const run = async (key: string, label: string, fn: () => Promise<any>) => {
    if (busyKey) return;
    setBusyKey(key);
    try {
      const res = await fn();
      const msg = res?.message || res?.status || 'OK';
      setLastResult(`[${label}] ${typeof msg === 'string' ? msg : 'OK'}`);
    } catch (err: any) {
      setLastResult(`[${label}] FAILED: ${err?.message || 'unknown'}`);
      Alert.alert(label, err?.message || 'Request failed');
    } finally {
      setBusyKey(null);
    }
  };

  const Btn = ({
    k, label, onPress,
  }: { k: string; label: string; onPress: () => void }) => (
    <TouchableOpacity
      disabled={!!busyKey}
      onPress={onPress}
      style={[styles.btn, busyKey === k && styles.btnBusy]}
    >
      {busyKey === k ? (
        <ActivityIndicator size="small" color="#9fe3ff" />
      ) : (
        <Text style={styles.btnText}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <ImageBackground
      source={require('../assets/backgrounds/bg916.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>‹ BACK</Text>
            </TouchableOpacity>
            <Text style={styles.title}>DEV MENU</Text>
          </View>

          <View style={styles.resultBar}>
            <Text style={styles.resultText}>{lastResult}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>CARE ACTIONS</Text>
            <View style={styles.row}>
              <Btn k="feed"  label="FEED"  onPress={() => run('feed',  'Feed',  () => careAction('feed',  'good'))} />
              <Btn k="clean" label="CLEAN" onPress={() => run('clean', 'Clean', () => careAction('clean', 'good'))} />
            </View>
            <View style={styles.row}>
              <Btn k="play" label="PLAY" onPress={() => run('play', 'Play', () => careAction('play', 'good'))} />
              <Btn k="rest" label="REST" onPress={() => run('rest', 'Rest', () => careAction('rest', 'good'))} />
            </View>
            <View style={styles.row}>
              <Btn k="praise" label="PRAISE" onPress={() => run('praise', 'Praise', () => praiseByte())} />
              <Btn k="scold"  label="SCOLD"  onPress={() => run('scold',  'Scold',  () => scoldByte())}  />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>CORRUPTION / SLEEP</Text>
            <Btn k="clinic"  label="CLINIC REPAIR (-30 corruption)" onPress={() => run('clinic',  'Clinic',   () => clinicRepair())} />
            <Btn k="nap"     label="POWER NAP (+Bandwidth)"          onPress={() => run('nap',     'Nap',      () => powerNap())} />
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>PROGRESSION</Text>
            <Btn k="evolve" label="FORCE EVOLVE (if eligible)" onPress={() => run('evolve', 'Evolve', () => evolveByte())} />
            <Btn k="resetDaily" label="RESET DAILY TASKS" onPress={() => run('resetDaily', 'Daily Reset', () => resetDailyTasks())} />
            <Btn k="sync" label="FORCE SYNC" onPress={() => run('sync', 'Sync', () => syncByte())} />
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>NEEDS ±10</Text>
            {NEEDS.map((n) => (
              <View key={n} style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>{n.toUpperCase()}</Text>
                <View style={styles.sliderBtns}>
                  <Btn k={`need-${n}-dn`} label="-10" onPress={() => run(`need-${n}-dn`, `${n} -10`, () => devAdjustNeed(n, -10))} />
                  <Btn k={`need-${n}-up`} label="+10" onPress={() => run(`need-${n}-up`, `${n} +10`, () => devAdjustNeed(n,  10))} />
                </View>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>CORRUPTION ±10</Text>
            <View style={styles.row}>
              <Btn k="corr-dn" label="-10" onPress={() => run('corr-dn', 'Corruption -10', () => devAdjustCorruption(-10))} />
              <Btn k="corr-up" label="+10" onPress={() => run('corr-up', 'Corruption +10', () => devAdjustCorruption( 10))} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>BYTE BITS</Text>
            <View style={styles.row}>
              <Btn k="bits-dn100"  label="-100"  onPress={() => run('bits-dn100',  'Bits -100',  () => devAdjustByteBits(-100))} />
              <Btn k="bits-up100"  label="+100"  onPress={() => run('bits-up100',  'Bits +100',  () => devAdjustByteBits( 100))} />
              <Btn k="bits-up1000" label="+1000" onPress={() => run('bits-up1000', 'Bits +1000', () => devAdjustByteBits(1000))} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>LIFESPAN STAGE</Text>
            <View style={styles.row}>
              <Btn k="stage-baby"  label="BABY"  onPress={() => run('stage-baby',  'Stage Baby',  () => devSetLifespanStage('baby'))} />
              <Btn k="stage-child" label="CHILD" onPress={() => run('stage-child', 'Stage Child', () => devSetLifespanStage('child'))} />
              <Btn k="stage-teen"  label="TEEN"  onPress={() => run('stage-teen',  'Stage Teen',  () => devSetLifespanStage('teen'))} />
            </View>
            <View style={[styles.row, { marginTop: 6 }]}>
              <Btn k="stage-adult" label="ADULT" onPress={() => run('stage-adult', 'Stage Adult', () => devSetLifespanStage('adult'))} />
              <Btn k="stage-elder" label="ELDER" onPress={() => run('stage-elder', 'Stage Elder', () => devSetLifespanStage('elder'))} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>RESET</Text>
            <Btn
              k="reset"
              label="RESET BYTE TO EGG"
              onPress={() => {
                Alert.alert(
                  'Reset byte?',
                  'Returns byte to Stage 0 egg. Needs → 100, corruption → 0, level/xp → 1/0. Cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: async () => {
                        await run('reset', 'Reset', () => devResetByte());
                        router.replace('/(tabs)');
                      },
                    },
                  ]
                );
              }}
            />
          </View>

          <Text style={styles.footer}>All dev endpoints bypass normal game rules. Use sparingly.</Text>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: 14, gap: 12, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(159,227,255,0.4)',
    backgroundColor: 'rgba(8,18,62,0.84)',
  },
  backText: { color: '#9fe3ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1.8 },

  resultBar: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.22)',
    backgroundColor: 'rgba(4,10,28,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resultText: { color: 'rgba(198,236,255,0.9)', fontSize: 11, fontFamily: 'monospace' },

  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  section: {
    color: '#9fe3ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },

  row: { flexDirection: 'row', gap: 8 },

  btn: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.4)',
    backgroundColor: 'rgba(14,30,74,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  btnBusy: { opacity: 0.6 },
  btnText: { color: '#cfe9ff', fontSize: 12, fontWeight: '800', letterSpacing: 1.0 },

  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sliderLabel: {
    color: '#cfe9ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.0,
    width: 90,
  },
  sliderBtns: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },

  footer: {
    color: 'rgba(170,218,245,0.55)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.6,
  },
});
