/**
 * Settings screen — game settings + DEVELOPER card.
 * Recovered 2026-04-26 after collection.tsx was wrongly deleted as a duplicate.
 */

import React, { useCallback, useEffect, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { setSfxEnabled } from '../services/sfx';

const SETTINGS_KEY = '@megabytes_settings';

interface Settings {
  sfx: boolean;
  notifications: boolean;
  reducedMotion: boolean;
  showCorruption: boolean;
}

const DEFAULTS: Settings = {
  sfx: true,
  notifications: true,
  reducedMotion: false,
  showCorruption: true,
};

async function loadSettingsFromStorage(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

async function saveSettingsToStorage(s: Settings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

// Export for other screens (e.g. home) to read settings.
export { loadSettingsFromStorage as loadSettings };

// Dev menu visible in dev builds (__DEV__ true) OR when EXPO_PUBLIC_DEV_MENU=1
// is set on a production build. Backend dev routes still require DEV_MODE_KEY
// header (see middleware/auth.requireDevMode), so visibility ≠ functionality.
const DEV_MENU_ENABLED = __DEV__ || String(process.env.EXPO_PUBLIC_DEV_MENU || '') === '1';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettingsFromStorage().then((s) => {
      setSettings(s);
      setSfxEnabled(s.sfx);
    });
  }, []);

  const update = useCallback(async (key: keyof Settings, val: boolean) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    await saveSettingsToStorage(next);
    if (key === 'sfx') setSfxEnabled(val);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }, [settings]);

  return (
    <ImageBackground source={require('../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>‹ BACK</Text>
            </TouchableOpacity>
            <Text style={styles.title}>SETTINGS</Text>
            {saved ? <Text style={styles.savedBadge}>SAVED</Text> : <View style={{ width: 60 }} />}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>AUDIO</Text>
            <SettingRow
              label="Sound Effects"
              desc="UI, care, and minigame sounds"
              value={settings.sfx}
              onToggle={(v) => update('sfx', v)}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>DISPLAY</Text>
            <SettingRow
              label="Show Corruption Meter"
              desc="Show corruption tier and value in home and room screens"
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

          <View style={styles.card}>
            <Text style={styles.cardTitle}>NOTIFICATIONS</Text>
            <SettingRow
              label="Care Reminders"
              desc="Alerts when your byte's needs are getting low"
              value={settings.notifications}
              onToggle={(v) => update('notifications', v)}
            />
            <Text style={styles.hint}>Push notification delivery requires device permissions.</Text>
          </View>

          {DEV_MENU_ENABLED ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>DEVELOPER</Text>
              <TouchableOpacity onPress={() => router.push('/dev-menu')} style={styles.devBtn}>
                <Text style={styles.devBtnText}>DEV MENU</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ height: 60 }} />
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
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
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

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: 14, gap: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
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
  rowDesc: { color: 'rgba(180,220,255,0.55)', fontSize: 10, marginTop: 2, lineHeight: 14 },

  hint: { color: 'rgba(180,220,255,0.5)', fontSize: 10, lineHeight: 15 },

  devBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,160,100,0.55)',
    backgroundColor: 'rgba(60,20,10,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  devBtnText: { color: '#ffc89a', fontSize: 12, fontWeight: '800', letterSpacing: 1.0 },
});
