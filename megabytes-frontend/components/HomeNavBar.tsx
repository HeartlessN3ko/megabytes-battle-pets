import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NAV_GATE_MS = 1500;

const LEFT_TABS = [
  { key: 'story',  label: 'STORY', icon: 'map-outline',   route: '/(tabs)/story' },
  { key: 'arena',  label: 'ARENA', icon: 'flash-outline',  route: '/(tabs)/arena' },
];
const RIGHT_TABS = [
  { key: 'achievements', label: 'ACHIEVE',  icon: 'trophy-outline',   route: '/(tabs)/achievements' },
  { key: 'settings',     label: 'SETTINGS', icon: 'settings-outline', route: '/(tabs)/collection' },
];

export default function HomeNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const lastNavAt = useRef(0);

  function gate(fn: () => void) {
    const now = Date.now();
    if (now - lastNavAt.current < NAV_GATE_MS) return;
    lastNavAt.current = now;
    fn();
  }

  function isActive(route: string) {
    const seg = route.replace('/(tabs)', '') || '/';
    return pathname === seg || pathname === route;
  }

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {LEFT_TABS.map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={styles.tab}
          onPress={() => gate(() => router.push(tab.route as any))}
          activeOpacity={0.7}
        >
          <Ionicons
            name={tab.icon as any}
            size={18}
            color={isActive(tab.route) ? '#7ec8ff' : 'rgba(255,255,255,0.4)'}
          />
          <Text style={[styles.label, isActive(tab.route) && styles.labelActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={styles.homeBtn}
        onPress={() => gate(() => router.replace('/(tabs)' as any))}
        activeOpacity={0.8}
      >
        <Ionicons name="home" size={22} color="#0a1840" />
      </TouchableOpacity>

      {RIGHT_TABS.map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={styles.tab}
          onPress={() => gate(() => router.push(tab.route as any))}
          activeOpacity={0.7}
        >
          <Ionicons
            name={tab.icon as any}
            size={18}
            color={isActive(tab.route) ? '#7ec8ff' : 'rgba(255,255,255,0.4)'}
          />
          <Text style={[styles.label, isActive(tab.route) && styles.labelActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(5,12,40,0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(80,160,255,0.2)',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  label: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.4)',
  },
  labelActive: {
    color: '#7ec8ff',
  },
  homeBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#7ec8ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
    marginTop: -20,
    shadowColor: '#7ec8ff',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
});
