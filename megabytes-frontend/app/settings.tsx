import React from 'react';
import {
  ImageBackground,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useDemoMode } from '../hooks/useDemoMode';
import { playSfx } from '../services/sfx';

export default function SettingsScreen() {
  const router = useRouter();
  const { demoMode, hydrated, enableDemoMode, disableDemoMode } = useDemoMode();
  const [busy, setBusy] = React.useState(false);

  const onToggleDemo = React.useCallback(
    async (next: boolean) => {
      if (!hydrated || busy) return;
      setBusy(true);
      try {
        playSfx('ui_snap', 0.6);
        if (next) await enableDemoMode();
        else await disableDemoMode();
      } finally {
        setBusy(false);
      }
    },
    [busy, disableDemoMode, enableDemoMode, hydrated]
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
            <Text style={styles.title}>SETTINGS</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>GAMEPLAY</Text>

            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.label}>Accelerated Demo Mode</Text>
                <Text style={styles.desc}>
                  Compresses time so needs decay, XP, and timers tick faster.
                  Turn off for normal-paced play.
                </Text>
              </View>
              <Switch
                value={demoMode}
                onValueChange={onToggleDemo}
                disabled={!hydrated || busy}
                trackColor={{ false: '#3a3f55', true: '#3ab0ff' }}
                thumbColor={demoMode ? '#9fe3ff' : '#cfd4e2'}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: 14, gap: 12, paddingBottom: 26 },
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
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  section: {
    color: '#9fe3ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  rowText: { flex: 1 },
  label: { color: '#fff', fontSize: 13, fontWeight: '800' },
  desc: {
    color: 'rgba(208,232,255,0.72)',
    fontSize: 10.5,
    marginTop: 3,
    lineHeight: 14,
  },
});
