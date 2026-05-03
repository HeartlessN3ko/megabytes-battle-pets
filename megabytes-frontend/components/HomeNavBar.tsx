import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSfx } from '../services/sfx';
import { PALETTE, RADIUS, SPACING, TYPE } from '../constants/theme';

const NAV_GATE_MS = 1500;

// v1 nav: STORY (campaign) → PAGEANT, ARENA (PvP) → MARKETPLACE. Both
// Expansion 1 tabs swapped out 2026-04-26.
const LEFT_TABS = [
  { key: 'pageant',     label: 'PAGEANT', icon: 'ribbon-outline',     route: '/(tabs)/pageant' },
  { key: 'marketplace', label: 'MARKET',  icon: 'storefront-outline', route: '/(tabs)/marketplace' },
];
const RIGHT_TABS = [
  { key: 'achievements', label: 'ACHIEVE',  icon: 'trophy-outline',   route: '/(tabs)/achievements' },
  { key: 'settings',     label: 'SETTINGS', icon: 'settings-outline', route: '/settings' },
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
    playSfx('menu_press', 0.6);
    fn();
  }

  function isActive(route: string) {
    const seg = route.replace('/(tabs)', '') || '/';
    return pathname === seg || pathname === route;
  }

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
      {LEFT_TABS.map(tab => {
        const active = isActive(tab.route);
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => gate(() => router.push(tab.route as any))}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon as any}
              size={ICON_SIZE}
              color={active ? PALETTE.navActive : PALETTE.navInactive}
            />
            <Text style={[styles.label, active && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={styles.homeBtn}
        onPress={() => gate(() => router.replace('/(tabs)' as any))}
        activeOpacity={0.8}
      >
        <Ionicons name="home" size={ICON_SIZE_HOME} color={PALETTE.accentDark} />
      </TouchableOpacity>

      {RIGHT_TABS.map(tab => {
        const active = isActive(tab.route);
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => gate(() => router.push(tab.route as any))}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon as any}
              size={ICON_SIZE}
              color={active ? PALETTE.navActive : PALETTE.navInactive}
            />
            <Text style={[styles.label, active && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const ICON_SIZE = 18;
const ICON_SIZE_HOME = 22;

const HOME_BTN_SIZE = 54;
const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: PALETTE.navBg,
    borderTopWidth: 1,
    borderTopColor: PALETTE.navBorder,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  label: {
    ...TYPE.micro,
    color: PALETTE.navInactive,
  },
  labelActive: {
    color: PALETTE.navActive,
  },
  homeBtn: {
    width: HOME_BTN_SIZE,
    height: HOME_BTN_SIZE,
    borderRadius: HOME_BTN_SIZE / 2,
    backgroundColor: PALETTE.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.sm,
    marginTop: -SPACING.xl,
    shadowColor: PALETTE.accentBlue,
    shadowOpacity: 0.5,
    shadowRadius: RADIUS.md,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
});
