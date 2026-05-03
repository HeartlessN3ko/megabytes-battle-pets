/**
 * Pageant — v1 (care-first reframe).
 *
 * Slow-drip reveal of hidden state. One entry per lifespan stage, unlocks
 * at the stage midway level. Pure ceremony — no minigame, no input. Pulls
 * arbitrary stats (Cuteness/Talent/Charm/Discipline/Style), pet grade,
 * player grade, and 3 random facts derived from current byte + player
 * metrics.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { enterPageant, getPageantEligibility } from '../../services/api';
import { playSfx } from '../../services/sfx';

type Eligibility = {
  ok: boolean;
  reason?: string;
  stage?: string;
  midway?: number;
  level?: number;
  lifespanStage?: string;
  pageantsEntered?: string[];
};

type CeremonyStats = {
  cuteness: number;
  talent: number;
  charm: number;
  discipline: number;
  style: number;
};

type Ceremony = {
  stage: string;
  stats: CeremonyStats;
  petGrade: string;
  playerGrade: string;
  facts: string[];
  pageantsEntered: string[];
  lifespanStage: string;
};

const PLAYER_GRADE_LABEL: Record<string, string> = {
  perfect:    'PERFECT',
  good:       'GOOD',
  neutral:    'NEUTRAL',
  poor:       'POOR',
  neglectful: 'NEGLECTFUL',
};

const STAT_ORDER: { key: keyof CeremonyStats; label: string }[] = [
  { key: 'cuteness',   label: 'CUTENESS' },
  { key: 'talent',     label: 'TALENT' },
  { key: 'charm',      label: 'CHARM' },
  { key: 'discipline', label: 'DISCIPLINE' },
  { key: 'style',      label: 'STYLE' },
];

function statTier(v: number) {
  if (v >= 85) return 'Platinum';
  if (v >= 70) return 'Gold';
  if (v >= 55) return 'Silver';
  if (v >= 40) return 'Bronze';
  return '—';
}

function statColor(v: number) {
  if (v >= 85) return '#e8e0ff';
  if (v >= 70) return '#ffd770';
  if (v >= 55) return '#cfdcff';
  if (v >= 40) return '#d39c70';
  return 'rgba(255,255,255,0.4)';
}

export default function PageantScreen() {
  const router = useRouter();
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPageantEligibility();
      setEligibility(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load pageant info.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const handleEnter = useCallback(async () => {
    if (entering) return;
    setEntering(true);
    setError(null);
    try {
      playSfx('menu', 0.7);
      const data = await enterPageant();
      setCeremony(data);
      // Refresh eligibility so the locked state shows immediately.
      const after = await getPageantEligibility();
      setEligibility(after);
    } catch (err: any) {
      setError(err?.message || 'Pageant could not start.');
    } finally {
      setEntering(false);
    }
  }, [entering]);

  const stageLabel = useMemo(
    () => String(eligibility?.lifespanStage || 'baby').toUpperCase(),
    [eligibility?.lifespanStage]
  );

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>‹ BACK</Text>
            </TouchableOpacity>
            <Text style={styles.title}>PAGEANT</Text>
            <View style={{ width: 60 }} />
          </View>

          <Text style={styles.subtitle}>
            Once per life stage, your byte stands under the lights. Reveals what it has become.
          </Text>

          {loading && !ceremony ? (
            <View style={styles.center}>
              <ActivityIndicator color="#9fe3ff" />
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* CEREMONY RESULTS */}
          {ceremony ? (
            <View style={styles.card}>
              <Text style={styles.section}>{String(ceremony.stage).toUpperCase()} PAGEANT — RESULTS</Text>

              <View style={styles.gradeRow}>
                <View style={styles.gradeBlock}>
                  <Text style={styles.gradeLabel}>PET</Text>
                  <Text style={styles.gradeValue}>{ceremony.petGrade}</Text>
                </View>
                <View style={styles.gradeBlock}>
                  <Text style={styles.gradeLabel}>PLAYER</Text>
                  <Text style={styles.gradeValue}>
                    {PLAYER_GRADE_LABEL[ceremony.playerGrade] || ceremony.playerGrade}
                  </Text>
                </View>
              </View>

              <View style={{ height: 14 }} />

              {STAT_ORDER.map(({ key, label }) => {
                const v = ceremony.stats[key];
                return (
                  <View key={key} style={styles.statRow}>
                    <Text style={styles.statLabel}>{label}</Text>
                    <View style={styles.statTrack}>
                      <View style={[styles.statFill, { width: `${v}%`, backgroundColor: statColor(v) }]} />
                    </View>
                    <Text style={[styles.statTier, { color: statColor(v) }]}>{statTier(v)}</Text>
                    <Text style={styles.statValue}>{v}</Text>
                  </View>
                );
              })}

              <View style={{ height: 14 }} />

              <Text style={styles.factsHeader}>CARE NOTES</Text>
              {ceremony.facts.map((f, i) => (
                <Text key={i} style={styles.factLine}>• {f}</Text>
              ))}

              <View style={{ height: 14 }} />

              <Text style={styles.note}>
                Stages entered: {(ceremony.pageantsEntered || []).join(', ') || '—'}
              </Text>
            </View>
          ) : null}

          {/* ELIGIBILITY / ENTRY */}
          {eligibility && !ceremony ? (
            <View style={styles.card}>
              <Text style={styles.section}>{stageLabel} STAGE</Text>

              {eligibility.ok ? (
                <>
                  <Text style={styles.bodyText}>
                    Your byte is ready to enter the pageant for the {stageLabel.toLowerCase()} stage.
                    This is the only entry you get for this stage.
                  </Text>
                  <View style={{ height: 12 }} />
                  <TouchableOpacity
                    onPress={handleEnter}
                    style={[styles.enterBtn, entering && styles.enterBtnDisabled]}
                    disabled={entering}
                  >
                    <Text style={styles.enterBtnText}>{entering ? 'ENTERING…' : 'ENTER PAGEANT'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.bodyText}>{eligibility.reason || 'Pageant not available right now.'}</Text>
              )}

              <View style={{ height: 14 }} />
              <Text style={styles.note}>
                Stages entered: {(eligibility.pageantsEntered || []).join(', ') || '—'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: 14, gap: 12, paddingBottom: 26 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(159,227,255,0.4)', backgroundColor: 'rgba(8,18,62,0.84)' },
  backText: { color: '#9fe3ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1.8 },
  subtitle: { color: 'rgba(220,240,255,0.7)', fontSize: 12, fontStyle: 'italic', marginBottom: 4, paddingHorizontal: 4 },
  center: { paddingVertical: 30, alignItems: 'center' },
  card: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(120,195,255,0.28)', backgroundColor: 'rgba(8,18,62,0.84)', paddingHorizontal: 14, paddingVertical: 14, gap: 4 },
  section: { color: '#9fe3ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },

  bodyText: { color: 'rgba(220,240,255,0.84)', fontSize: 12, lineHeight: 17 },

  gradeRow: { flexDirection: 'row', justifyContent: 'space-around', gap: 8 },
  gradeBlock: { alignItems: 'center', flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(4,10,28,0.6)', borderWidth: 1, borderColor: 'rgba(120,195,255,0.18)' },
  gradeLabel: { color: 'rgba(220,240,255,0.55)', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  gradeValue: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 0.8 },

  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  statLabel: { color: 'rgba(220,240,255,0.85)', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, width: 78 },
  statTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  statFill: { height: '100%' },
  statTier: { fontSize: 10, fontWeight: '700', width: 60, textAlign: 'right' },
  statValue: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', width: 26, textAlign: 'right' },

  factsHeader: { color: '#9fe3ff', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  factLine: { color: 'rgba(220,240,255,0.85)', fontSize: 12, lineHeight: 18, paddingLeft: 4 },

  note: { color: 'rgba(220,240,255,0.5)', fontSize: 10, fontStyle: 'italic' },

  enterBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(126,200,255,0.22)', borderWidth: 1, borderColor: 'rgba(126,200,255,0.6)', alignItems: 'center' },
  enterBtnDisabled: { opacity: 0.5 },
  enterBtnText: { color: '#dff0ff', fontSize: 13, fontWeight: '900', letterSpacing: 1.4 },

  errorCard: { borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,140,140,0.4)', backgroundColor: 'rgba(40,8,8,0.6)', paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { color: '#ffb0b0', fontSize: 12 },
});
