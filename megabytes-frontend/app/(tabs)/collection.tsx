import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ImageBackground, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getPlayer, resetDemoData } from '../../services/api';
import { useEvolution } from '../../context/EvolutionContext';

const DEMO_ACHIEVEMENTS = [
  { id: 'first_hatch', title: 'First Hatch', desc: 'Successfully hatch your first Byte.' },
  { id: 'care_cycle', title: 'Care Cycle', desc: 'Complete feed, clean, and rest in one session.' },
  { id: 'battle_ready', title: 'Battle Ready', desc: 'Complete a full demo battle sequence.' },
  { id: 'system_steward', title: 'System Steward', desc: 'Keep hygiene and mood high for a full care cycle.' },
];

export default function OptionsScreen() {
  const router = useRouter();
  const { resetEvolutionProgress } = useEvolution();
  const [achievements, setAchievements] = useState<string[]>([]);
  const [audioOn, setAudioOn] = useState(true);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const player = await getPlayer();
        setAchievements(player?.achievements || []);

        if (player?.settings) {
          setAudioOn(Boolean(player.settings.audio));
          setNotificationsOn(Boolean(player.settings.notifications));
          setReducedMotion(Boolean(player.settings.reducedMotion));
        }
      } catch {
        setAchievements([]);
      }
    })();
  }, []);

  const unlockedCount = useMemo(
    () => DEMO_ACHIEVEMENTS.filter((a) => achievements.includes(a.id)).length,
    [achievements]
  );

  const handleResetDemo = () => {
    Alert.alert(
      'Reset Demo Data',
      'This will reset Byte progress, evolution stage, stats, currency, and behavior metrics for playtesting.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetDemoData();
              await resetEvolutionProgress();
              setAchievements([]);
              router.replace('/egg');
            } catch (err: any) {
              Alert.alert('Reset failed', err?.message || 'Unable to reset demo data right now.');
            }
          },
        },
      ]
    );
  };

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>OPTIONS</Text>
          <Text style={styles.sub}>Settings and progression overview</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>SYSTEM SETTINGS</Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Audio</Text>
              <Switch value={audioOn} onValueChange={setAudioOn} trackColor={{ true: '#67d0ff' }} />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Notifications</Text>
              <Switch value={notificationsOn} onValueChange={setNotificationsOn} trackColor={{ true: '#67d0ff' }} />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Reduced Motion</Text>
              <Switch value={reducedMotion} onValueChange={setReducedMotion} trackColor={{ true: '#67d0ff' }} />
            </View>

            <Text style={styles.hint}>These toggles are currently local demo controls.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>ACHIEVEMENTS</Text>
            <Text style={styles.progressText}>{unlockedCount}/{DEMO_ACHIEVEMENTS.length} unlocked</Text>

            {DEMO_ACHIEVEMENTS.map((a) => {
              const unlocked = achievements.includes(a.id);
              return (
                <View key={a.id} style={styles.achievementRow}>
                  <Text style={[styles.badge, unlocked ? styles.badgeOn : styles.badgeOff]}>{unlocked ? 'UNLOCKED' : 'LOCKED'}</Text>
                  <View style={styles.achievementBody}>
                    <Text style={styles.achievementTitle}>{a.title}</Text>
                    <Text style={styles.achievementDesc}>{a.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>MEMORY GALLERY</Text>
            <Text style={styles.bodyText}>You have no past Bytes yet. This section will store retired Byte profiles, snapshots, and memory notes.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>PLAYTEST TOOLS</Text>
            <TouchableOpacity style={styles.resetBtn} activeOpacity={0.85} onPress={handleResetDemo}>
              <Text style={styles.resetBtnText}>RESET DEMO DATA</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>Resets progress to fresh egg state for repeatable test runs.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: 14, gap: 10, paddingBottom: 26 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  sub: { color: 'rgba(200,228,255,0.66)', fontSize: 11 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  cardTitle: { color: '#dff2ff', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(130,200,255,0.2)',
    backgroundColor: 'rgba(22,34,84,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  settingLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  hint: { color: 'rgba(205,230,255,0.62)', fontSize: 10.5 },
  progressText: { color: '#8fd8ff', fontSize: 11, fontWeight: '700' },
  achievementRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  badge: {
    width: 74,
    textAlign: 'center',
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 9,
    fontWeight: '900',
    paddingVertical: 5,
    overflow: 'hidden',
  },
  badgeOn: {
    color: '#9bffbf',
    borderColor: 'rgba(95,231,149,0.45)',
    backgroundColor: 'rgba(20,72,44,0.55)',
  },
  badgeOff: {
    color: 'rgba(255,255,255,0.5)',
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(35,42,64,0.55)',
  },
  achievementBody: { flex: 1, gap: 2 },
  achievementTitle: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  achievementDesc: { color: 'rgba(208,232,255,0.68)', fontSize: 10.5 },
  bodyText: { color: 'rgba(220,240,255,0.8)', fontSize: 11, lineHeight: 17 },
  resetBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,110,110,0.55)',
    backgroundColor: 'rgba(120,20,28,0.55)',
    paddingVertical: 11,
    alignItems: 'center',
  },
  resetBtnText: { color: '#ffd4d4', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
});
