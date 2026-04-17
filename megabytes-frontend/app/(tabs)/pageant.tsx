import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { enterPageant, getByte, getPageantLeaderboard, submitPageantScore } from '../../services/api';
import { initSfx, playSfx } from '../../services/sfx';

function grade(v: number) {
  if (v >= 85) return 'S';
  if (v >= 70) return 'A';
  if (v >= 55) return 'B';
  if (v >= 40) return 'C';
  return 'D';
}

export default function PageantScreen() {
  const [byteData, setByteData] = useState<any>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [leaderTop, setLeaderTop] = useState<string>('-');
  const [review, setReview] = useState('Run a mock pageant review to evaluate your Byte profile.');

  const runReview = useCallback(() => {
    playSfx('menu', 0.55);
    const stats = byteData?.byte?.stats || {};
    const needs = byteData?.byte?.needs || {};

    const styleScore = Math.round(((stats.Special || 0) + (needs.Mood || 0)) / 2);
    const presenceScore = Math.round(((stats.Accuracy || 0) + (stats.Speed || 0)) / 2);
    const stabilityScore = Math.round(((needs.Hygiene || 0) + (needs.Bandwidth || 0)) / 2);

    const top = [
      { key: 'Style', val: styleScore },
      { key: 'Presence', val: presenceScore },
      { key: 'Stability', val: stabilityScore },
    ].sort((a, b) => b.val - a.val)[0];

    const avg = Math.round((styleScore + presenceScore + stabilityScore) / 3);
    const placement = avg >= 85 ? 'first' : avg >= 70 ? 'second' : avg >= 55 ? 'third' : 'participation';
    const perfectHits = Math.max(1, Math.round(avg / 18));
    const goodHits = Math.max(2, Math.round(avg / 12));
    const maxCombo = Math.max(2, Math.round((styleScore + presenceScore) / 30));

    const baseReview =
      `${byteData?.byte?.name || 'Your Byte'} received a ${grade(avg)} review. ` +
      `Best category: ${top.key} (${top.val}). Keep mood high and hygiene stable before the next showcase.`;

    setReview(baseReview);

    (async () => {
      try {
        await enterPageant();
        const result = await submitPageantScore(placement, top.key.toLowerCase(), {
          perfectHits,
          goodHits,
          maxCombo,
          pageantStat: styleScore,
        });
        setLastResult(result);
        const score = Number(result?.scoring?.cutenessScore || 0);
        setReview(`${baseReview} Placement: ${placement.toUpperCase()} (Score: ${score}, +${result?.earned || 0} BB, +${result?.xpGain || 0} XP).`);
        playSfx('notify', 0.62);
      } catch {
        // Keep local mock review when backend is unavailable.
        playSfx('tap', 0.5);
      }
    })();
  }, [byteData]);

  useEffect(() => {
    initSfx().catch(() => {});
    (async () => {
      try {
        const data = await getByte();
        setByteData(data);

        const board = await getPageantLeaderboard();
        if (Array.isArray(board) && board.length > 0) {
          setLeaderTop(`${board[0]?.name || 'Unknown'} Lv.${board[0]?.level || 1}`);
        }
      } catch (err: any) {
        const msg = err?.message || '';
        setReview(msg.toLowerCase().includes('waking up') ? 'Server is waking up... pageant sync will resume shortly.' : 'Could not sync Byte stats. Pageant is in local demo mode.');
      }
    })();
  }, []);

  const summary = useMemo(() => {
    const stats = byteData?.byte?.stats || {};
    return [
      { label: 'Special', val: stats.Special || 0 },
      { label: 'Accuracy', val: stats.Accuracy || 0 },
      { label: 'Speed', val: stats.Speed || 0 },
      { label: 'Stamina', val: stats.Stamina || 0 },
    ];
  }, [byteData]);

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>PAGEANT</Text>
          <Text style={styles.sub}>Mock judge mode</Text>
        </View>

        <View style={styles.statsCard}>
          {summary.map((s) => (
            <View key={s.label} style={styles.statRow}>
              <Text style={styles.statLabel}>{s.label.toUpperCase()}</Text>
              <Text style={styles.statVal}>{s.val}</Text>
            </View>
          ))}
        </View>

        <View style={styles.reviewCard}>
          <Text style={styles.reviewText}>{review}</Text>
          {lastResult ? <Text style={styles.resultText}>Last reward: +{lastResult.earned} BB, +{lastResult.xpGain} XP</Text> : null}
        </View>

        <View style={styles.leaderCard}>
          <Text style={styles.leaderTitle}>LEADERBOARD TOP</Text>
          <Text style={styles.leaderValue}>{leaderTop}</Text>
        </View>

        <TouchableOpacity style={styles.btn} onPress={runReview} activeOpacity={0.85}>
          <Text style={styles.btnText}>RUN PAGEANT REVIEW</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 14 },
  header: { paddingTop: 10, gap: 4 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  sub: { color: 'rgba(200,228,255,0.66)', fontSize: 11 },
  statsCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.3)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    padding: 12,
    gap: 6,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { color: 'rgba(208,232,255,0.72)', fontSize: 11, letterSpacing: 1 },
  statVal: { color: '#fff', fontSize: 12, fontWeight: '800' },
  reviewCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.3)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    padding: 12,
    minHeight: 110,
    justifyContent: 'center',
  },
  reviewText: { color: '#d8efff', fontSize: 12, lineHeight: 18 },
  resultText: { color: '#9bffbf', fontSize: 11, marginTop: 10, fontWeight: '700' },
  leaderCard: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.3)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leaderTitle: { color: 'rgba(208,232,255,0.72)', fontSize: 10.5, letterSpacing: 1 },
  leaderValue: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  btn: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,214,114,0.5)',
    backgroundColor: 'rgba(78,58,18,0.7)',
    alignItems: 'center',
    paddingVertical: 11,
  },
  btnText: { color: '#ffe38a', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
});
