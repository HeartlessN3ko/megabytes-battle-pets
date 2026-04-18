import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { resetDemoData } from '../../services/api';
import { useEvolution } from '../../context/EvolutionContext';
import { setSfxEnabled, isSfxEnabled } from '../../services/sfx';

const SETTINGS_KEY = '@megabytes_settings';

interface Settings {
  sfx: boolean;
  notifications: boolean;
  reducedMotion: boolean;
  showCorruption: boolean;
  demoSpeedFast: boolean;
}

const DEFAULTS: Settings = {
  sfx: true,
  notifications: true,
  reducedMotion: false,
  showCorruption: true,
  demoSpeedFast: true,
};

async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

async function saveSettings(s: Settings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

// Export for other screens to read
export { loadSettings };

export default function SettingsScreen() {
  const router = useRouter();
  const { resetEvolutionProgress, reloadFromServer } = useEvolution();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setSfxEnabled(s.sfx);
    });
  }, []);

  const update = useCallback(async (key: keyof Settings, val: boolean) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    await saveSettings(next);

    // Apply immediate effects
    if (key === 'sfx') setSfxEnabled(val);

    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }, [settings]);

  const handleResetDemo = () => {
    Alert.alert(
      'Reset Demo',
      'Resets Byte progress, stats, currency, and behavior metrics to fresh egg state.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const reset = await resetDemoData();
              await resetEvolutionProgress(Number(reset?.evolutionStage ?? 1));
              await reloadFromServer();
              router.replace('/(tabs)');
            } catch (err: any) {
              Alert.alert('Reset failed', err?.message || 'Unable to reset right now.');
            }
          },
        },
      ]
    );
  };

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={s.bg} resizeMode="cover">
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          <View style={s.titleRow}>
            <Text style={s.title}>SETTINGS</Text>
            {saved && <Text style={s.savedBadge}>SAVED</Text>}
          </View>

          {/* ── Audio ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>AUDIO</Text>
            <SettingRow
              label="Sound Effects"
              desc="UI, battle, care, and minigame sounds"
              value={settings.sfx}
              onToggle={(v) => update('sfx', v)}
            />
          </View>

          {/* ── Display ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>DISPLAY</Text>
            <SettingRow
              label="Show Corruption Meter"
              desc="Show corruption tier and value in home and battle screens"
              value={settings.showCorruption}
              onToggle={(v) => update('showCorruption', v)}
            />
            <SettingRow
              label="Reduced Motion"
              desc="Disable non-essential animations and particle effects"
              value={settings.reducedMotion}
              onToggle={(v) => update('reducedMotion', v)}
            />
          </View>

          {/* ── Notifications ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>NOTIFICATIONS</Text>
            <SettingRow
              label="Care Reminders"
              desc="Alerts when your Byte's needs are getting low"
              value={settings.notifications}
              onToggle={(v) => update('notifications', v)}
            />
            <Text style={s.hint}>Push notification delivery requires device permissions.</Text>
          </View>

          {/* ── Demo Tools ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>DEMO TOOLS</Text>
            <SettingRow
              label="Fast Demo Speed"
              desc="Decay and XP run at 24× speed for playtesting"
              value={settings.demoSpeedFast}
              onToggle={(v) => update('demoSpeedFast', v)}
            />
            <TouchableOpacity style={s.secondaryBtn} onPress={() => router.push('/(tabs)/loadout')} activeOpacity={0.85}>
              <Text style={s.secondaryBtnText}>CONFIGURE LOADOUT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.resetBtn} onPress={handleResetDemo} activeOpacity={0.85}>
              <Text style={s.resetBtnText}>RESET DEMO DATA</Text>
            </TouchableOpacity>
            <Text style={s.hint}>Reset returns Byte to a fresh state for repeatable test runs.</Text>
          </View>

          <View style={{ height: 90 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function SettingRow({
  label,
  desc,
  value,
  onToggle,
}: {
  label: string;
  desc: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View style={s.row}>
      <View style={s.rowText}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#7ec8ff' }}
        thumbColor={value ? '#fff' : 'rgba(255,255,255,0.4)'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  bg:   { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 14, gap: 12 },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  savedBadge: {
    color: '#7cffb2',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    borderWidth: 1,
    borderColor: 'rgba(124,255,178,0.35)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.2)',
    backgroundColor: 'rgba(8,18,62,0.86)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  cardTitle: { color: '#7ec8ff', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(130,200,255,0.15)',
    backgroundColor: 'rgba(22,34,84,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowText: { flex: 1 },
  rowLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rowDesc:  { color: 'rgba(180,220,255,0.55)', fontSize: 10, marginTop: 2, lineHeight: 14 },

  hint: { color: 'rgba(180,220,255,0.5)', fontSize: 10, lineHeight: 15 },

  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.4)',
    backgroundColor: 'rgba(20,44,86,0.6)',
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#b9e5ff', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },

  resetBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,110,110,0.5)',
    backgroundColor: 'rgba(120,20,28,0.5)',
    paddingVertical: 11,
    alignItems: 'center',
  },
  resetBtnText: { color: '#ffd4d4', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
});
