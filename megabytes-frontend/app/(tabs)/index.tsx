import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  Modal,
  PanResponder,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getByte, getPlayer, homeCleanByte, interactByte, praiseByte, scoldByte } from '../../services/api';
import { getHomeClutterClearedAt } from '../../services/homeRuntimeState';
import { useEvolution } from '../../context/EvolutionContext';

const { width, height } = Dimensions.get('window');

const SPRITES: Record<number, any> = {
  0: require('../../assets/bytes/egg.png'),
  1: require('../../assets/bytes/stage1.png'),
  2: require('../../assets/bytes/stage2.png'),
};

const HOME_ACTIONS = [
  { key: 'interact', label: 'INTERACT', icon: 'sparkles-outline', color: '#ffc84a' },
  { key: 'praise', label: 'PRAISE', icon: 'thumbs-up-outline', color: '#45d4ff' },
  { key: 'scold', label: 'SCOLD', icon: 'alert-circle-outline', color: '#bf6cff' },
  { key: 'clean', label: 'CLEAN', icon: 'layers-outline', color: '#6c93ff' },
];

const ROOM_MENU = [
  { key: 'kitchen', title: 'KITCHEN', subtitle: 'Feed and meals', icon: 'restaurant-outline', route: '/rooms/kitchen', color: '#ffcb58' },
  { key: 'bathroom', title: 'BATHROOM', subtitle: 'Clean and wash', icon: 'water-outline', route: '/rooms/bathroom', color: '#56d9ff' },
  { key: 'bedroom', title: 'BEDROOM', subtitle: 'Rest and calm', icon: 'bed-outline', route: '/rooms/bedroom', color: '#9d86ff' },
  { key: 'training', title: 'TRAINING', subtitle: 'Stat drills', icon: 'barbell-outline', route: '/rooms/training-center', color: '#d48fff' },
  { key: 'clinic', title: 'CLINIC', subtitle: 'Recovery support', icon: 'medkit-outline', route: '/rooms/clinic', color: '#8deac7' },
  { key: 'play', title: 'PLAY ROOM', subtitle: 'Mood support', icon: 'game-controller-outline', route: '/rooms/play-room', color: '#ff8dd2' },
  { key: 'market', title: 'SHOP', subtitle: 'Marketplace', icon: 'cart-outline', route: '/(tabs)/shop', color: '#5bdd7e' },
];

function NeedPips({ value, color }: { value: number; color: string }) {
  const active = Math.max(0, Math.min(5, Math.ceil(value / 20)));
  return (
    <View style={styles.pipRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={[styles.pip, { backgroundColor: i < active ? color : 'rgba(255,255,255,0.18)' }]} />
      ))}
    </View>
  );
}

function StatsModal({ visible, onClose, byteData }: { visible: boolean; onClose: () => void; byteData: any }) {
  const byte = byteData?.byte;
  const stats = byte?.stats || {};
  const needs = byte?.needs || {};
  const statKeys = ['Power', 'Speed', 'Defense', 'Special', 'Stamina', 'Accuracy'];
  const needKeys = ['Hunger', 'Bandwidth', 'Mood', 'Hygiene', 'Social', 'Fun'];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.modalBg} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity activeOpacity={1} style={styles.statsCard}>
          <Text style={styles.statsTitle}>SYSTEM REPORT</Text>
          <Text style={styles.statsName}>{byte?.name || 'Byte'} Lv.{byte?.level || 1}</Text>

          <Text style={styles.statsSection}>STATS</Text>
          {statKeys.map((k) => (
            <View key={k} style={styles.statsRow}>
              <Text style={styles.statsKey}>{k.toUpperCase()}</Text>
              <View style={styles.statsBarTrack}>
                <View style={[styles.statsBarFill, { width: `${Math.min(100, stats[k] || 0)}%` }]} />
              </View>
              <Text style={styles.statsVal}>{Math.round(stats[k] || 0)}</Text>
            </View>
          ))}

          <Text style={styles.statsSection}>NEEDS</Text>
          {needKeys.map((k) => (
            <View key={k} style={styles.statsRow}>
              <Text style={styles.statsKey}>{k.toUpperCase()}</Text>
              <View style={styles.statsBarTrack}>
                <View style={[styles.statsBarFill, { width: `${Math.min(100, needs[k] || 0)}%`, backgroundColor: '#8de2ff' }]} />
              </View>
              <Text style={styles.statsVal}>{Math.round(needs[k] || 0)}</Text>
            </View>
          ))}

          <TouchableOpacity style={styles.statsClose} onPress={onClose}>
            <Text style={styles.statsCloseText}>CLOSE</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { stage } = useEvolution();

  const roamX = useRef(new Animated.Value(0)).current;
  const roamY = useRef(new Animated.Value(0)).current;
  const hoverY = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const tapScale = useRef(new Animated.Value(1)).current;
  const drawerAnim = useRef(new Animated.Value(height)).current;
  const stickyUntilRef = useRef(0);
  const clutterSyncRef = useRef(0);

  const [byteData, setByteData] = useState<any>(null);
  const [playerData, setPlayerData] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statusText, setStatusText] = useState('BYTE is scanning the network.');
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [clutter, setClutter] = useState(0);

  const petSprite = SPRITES[stage] ?? SPRITES[2];
  const needs = byteData?.byte?.needs || {
    Hunger: 80,
    Bandwidth: 80,
    Hygiene: 80,
    Social: 80,
    Fun: 80,
    Mood: 80,
  };

  const clutterPenalty = Math.min(10, clutter * 2);
  const effectiveMood = Math.max(0, (needs.Mood || 0) - clutterPenalty);

  const clutterLabel = useMemo(() => {
    if (clutter >= 5) return 'Crowded';
    if (clutter >= 3) return 'Messy';
    if (clutter >= 1) return 'Minor clutter';
    return 'Clean';
  }, [clutter]);

  const refreshData = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([getByte(), getPlayer()]);
      setByteData(b);
      setPlayerData(p);
    } catch {
      setStatusText('Sync issue detected. Retrying on next refresh.');
    }
  }, []);

  const setTransientStatus = useCallback((message: string, holdMs = 3400) => {
    stickyUntilRef.current = Date.now() + holdMs;
    setStatusText(message);
  }, []);

  const randomThought = useCallback(() => {
    const byteName = byteData?.byte?.name || 'BYTE';
    const thoughts = [
      `${byteName} is wandering the network corridors.`,
      `${byteName} is scanning packets for hidden memes.`,
      `${byteName} is exploring old data archives.`,
      `${byteName} is chasing signal ghosts in the uplink.`,
      `${byteName} is mapping new routes through cyberspace.`,
      `${byteName} is watching debug windows like a movie.`,
    ];
    const pick = thoughts[Math.floor(Math.random() * thoughts.length)];
    if (clutter >= 3) return `${pick} Home looks ${clutterLabel.toLowerCase()}.`;
    return pick;
  }, [byteData?.byte?.name, clutter, clutterLabel]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useFocusEffect(
    useCallback(() => {
      const clearedAt = getHomeClutterClearedAt();
      if (clearedAt > clutterSyncRef.current) {
        clutterSyncRef.current = clearedAt;
        setClutter(0);
        setTransientStatus('Clutter was cleared in another room. Home is clean.', 2300);
      }
    }, [setTransientStatus])
  );

  useEffect(() => {
    const thoughtTicker = setInterval(() => {
      if (Date.now() >= stickyUntilRef.current) {
        setStatusText(randomThought());
      }
    }, 5200);

    return () => clearInterval(thoughtTicker);
  }, [randomThought]);

  useEffect(() => {
    const clutterTicker = setInterval(() => {
      const hygieneLow = (needs.Hygiene || 0) < 40;
      const spawnChance = hygieneLow ? 0.45 : 0.14;
      if (Math.random() < spawnChance) {
        setClutter((prev) => Math.min(5, prev + 1));
      }
    }, 18000);

    return () => clearInterval(clutterTicker);
  }, [needs.Hygiene]);

  useEffect(() => {
    let active = true;

    Animated.loop(
      Animated.sequence([
        Animated.timing(hoverY, { toValue: -8, duration: 1800, useNativeDriver: true }),
        Animated.timing(hoverY, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.04, duration: 1700, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1700, useNativeDriver: true }),
      ])
    ).start();

    const roam = () => {
      if (!active) return;
      const nextX = (Math.random() - 0.5) * width * 0.4;
      const nextY = (Math.random() - 0.5) * 30;
      const duration = 1900 + Math.floor(Math.random() * 1300);

      Animated.parallel([
        Animated.timing(roamX, { toValue: nextX, duration, useNativeDriver: true }),
        Animated.timing(roamY, { toValue: nextY, duration, useNativeDriver: true }),
      ]).start(() => {
        if (!active) return;
        setTimeout(roam, 550 + Math.floor(Math.random() * 900));
      });
    };

    roam();
    return () => {
      active = false;
    };
  }, [breathe, hoverY, roamX, roamY]);

  const openDrawer = useCallback(() => {
    if (drawerOpen || transitionBusy) return;
    setDrawerOpen(true);
    Animated.spring(drawerAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
  }, [drawerAnim, drawerOpen, transitionBusy]);

  const closeDrawer = useCallback(() => {
    Animated.timing(drawerAnim, { toValue: height, duration: 240, useNativeDriver: true }).start(() => setDrawerOpen(false));
  }, [drawerAnim]);

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 9 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -42) openDrawer();
        },
      }),
    [openDrawer]
  );

  const handleHomeAction = useCallback(async (key: string) => {
    if (transitionBusy) return;

    if (key === 'clean') {
      try {
        await homeCleanByte();
      } catch {}
      setClutter(0);
      await refreshData();
      setTransientStatus('Home cleanup complete. Clutter removed.', 2600);
      return;
    }

    if (key === 'interact') {
      try {
        await interactByte();
      } catch {}
      await refreshData();
      setTransientStatus('You pinged BYTE. It replied with a happy chirp.', 2600);
      return;
    }

    if (key === 'praise') {
      try {
        await praiseByte();
      } catch {}
      await refreshData();
      setTransientStatus('Praise logged. BYTE mood and social confidence increased.', 2800);
      return;
    }

    if (key === 'scold') {
      try {
        await scoldByte();
      } catch {}
      await refreshData();
      setTransientStatus('Scold logged. BYTE is re-evaluating behavior routines.', 2800);
    }
  }, [refreshData, setTransientStatus, transitionBusy]);

  const handleRoomOpen = useCallback(
    (route: string) => {
      if (transitionBusy) return;
      setTransitionBusy(true);
      closeDrawer();
      setTransientStatus('Loading room interface...', 1200);
      setTimeout(() => {
        router.push(route as any);
        setTransitionBusy(false);
      }, 220);
    },
    [closeDrawer, router, setTransientStatus, transitionBusy]
  );

  const handleByteTap = useCallback(() => {
    Animated.sequence([
      Animated.timing(tapScale, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(tapScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    setTransientStatus('BYTE is humming while it explores...', 2000);
  }, [setTransientStatus, tapScale]);

  const currency = playerData?.byteBits ?? 0;
  const moodLabel = effectiveMood >= 75 ? 'Happy' : effectiveMood >= 40 ? 'Stable' : 'Needs care';
  const byteName = byteData?.byte?.name || 'BYTE';

  const NEED_SUMMARY = [
    { label: 'HEALTH', color: '#ff4f66', val: needs.Hunger || 0 },
    { label: 'ENERGY', color: '#52e58f', val: needs.Bandwidth || 0 },
    { label: 'MOOD', color: '#b87cff', val: effectiveMood },
    { label: 'HYGIENE', color: '#ffba47', val: needs.Hygiene || 0 },
  ];

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <View style={styles.currencyBlock}>
            <View style={styles.currencyRow}>
              <Ionicons name="logo-bitcoin" size={14} color="#ffd45a" />
              <Text style={styles.currencyVal}>{currency.toLocaleString()}</Text>
            </View>
            <Text style={styles.currencyLabel}>BYTEBITS</Text>
          </View>

          <View style={styles.needSummary}>
            {NEED_SUMMARY.map((n) => (
              <View key={n.label} style={styles.needChip}>
                <Text style={styles.needChipLabel}>{n.label}</Text>
                <NeedPips value={n.val} color={n.color} />
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.statsFab} onPress={() => setStatsOpen(true)} activeOpacity={0.85}>
            <Ionicons name="stats-chart-outline" size={16} color="#8fd9ff" />
            <Text style={styles.statsFabText}>STATS</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Animated.View
            style={[
              styles.byteStage,
              { transform: [{ translateX: roamX }, { translateY: roamY }, { translateY: hoverY }, { scale: breathe }, { scale: tapScale }] },
            ]}
          >
            <TouchableOpacity onPress={handleByteTap} activeOpacity={1}>
              <Image source={petSprite} style={styles.byteSprite} resizeMode="contain" />
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View style={styles.statusCardSolo}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{statusText}</Text>
          <Text style={styles.statusMood}>{byteName} - {moodLabel}</Text>
          <Text style={styles.statusClutter}>Home: {clutterLabel}</Text>
        </View>

        <View style={styles.careActionsRow}>
          {HOME_ACTIONS.map((item) => (
            <TouchableOpacity key={item.key} style={styles.careBtn} onPress={() => handleHomeAction(item.key)} activeOpacity={0.86}>
              <View style={[styles.careBtnIcon, { borderColor: `${item.color}99`, backgroundColor: `${item.color}22` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.careLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.swipeZone} {...swipeResponder.panHandlers}>
          <TouchableOpacity onPress={openDrawer} activeOpacity={0.8} style={styles.swipePrompt}>
            <Ionicons name="chevron-up" size={16} color="#72ceff" />
            <Text style={styles.swipeLabel}>SWIPE UP FOR ROOMS</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {drawerOpen && (
        <TouchableOpacity style={styles.drawerOverlay} onPress={closeDrawer} activeOpacity={1}>
          <Animated.View style={[styles.drawer, { transform: [{ translateY: drawerAnim }] }]}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.drawerHandle} />
              <Text style={styles.drawerTitle}>ROOM NAVIGATION</Text>
              <Text style={styles.drawerSub}>ROOMS AND SHOP</Text>
              <View style={styles.roomGrid}>
                {ROOM_MENU.map((room) => (
                  <TouchableOpacity key={room.key} style={styles.roomBtn} onPress={() => handleRoomOpen(room.route)} activeOpacity={0.82}>
                    <View style={[styles.roomIcon, { borderColor: `${room.color}99`, backgroundColor: `${room.color}1e` }]}>
                      <Ionicons name={room.icon as any} size={18} color={room.color} />
                    </View>
                    <Text style={styles.roomTitle}>{room.title}</Text>
                    <Text style={styles.roomSub}>{room.subtitle}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.drawerFooter}>
                <TouchableOpacity style={styles.drawerClose} onPress={closeDrawer} activeOpacity={0.85}>
                  <Text style={styles.drawerCloseText}>CLOSE</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      )}

      <StatsModal visible={statsOpen} onClose={() => setStatsOpen(false)} byteData={byteData} />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingTop: 8, alignItems: 'stretch' },
  currencyBlock: {
    backgroundColor: 'rgba(9,14,52,0.75)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.26)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    minWidth: 96,
  },
  currencyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencyVal: { color: '#fff', fontWeight: '800', fontSize: 15 },
  currencyLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 8, letterSpacing: 1.2, fontWeight: '700' },
  needSummary: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'rgba(9,14,52,0.75)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.26)',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  statsFab: {
    width: 62,
    backgroundColor: 'rgba(9,14,52,0.75)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statsFabText: { color: '#8fd9ff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7 },
  needChip: { width: '48%', gap: 2 },
  needChipLabel: { color: 'rgba(230,245,255,0.8)', fontSize: 8, letterSpacing: 1, fontWeight: '700' },
  pipRow: { flexDirection: 'row', gap: 2 },
  pip: { width: 8, height: 6, borderRadius: 2 },
  field: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  byteStage: { position: 'absolute', bottom: 10, zIndex: 2 },
  byteSprite: { width: width * 0.3, height: width * 0.3 },
  statusCardSolo: {
    marginHorizontal: 14,
    backgroundColor: 'rgba(10,15,52,0.84)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(111,198,255,0.24)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: '#5dff93' },
  statusText: { flex: 1, color: 'rgba(255,255,255,0.82)', fontSize: 11.2, fontWeight: '600' },
  statusMood: { color: '#7bd9ff', fontSize: 10.2, fontWeight: '700' },
  statusClutter: { color: 'rgba(255,202,132,0.84)', fontSize: 9.8, fontWeight: '700' },
  careActionsRow: { marginTop: 8, marginHorizontal: 10, flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  careBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(8,18,62,0.84)',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  careBtnIcon: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  careLabel: { color: 'rgba(220,236,255,0.84)', fontSize: 8, fontWeight: '800', letterSpacing: 0.7, textAlign: 'center' },
  swipeZone: { paddingTop: 6, paddingBottom: 8 },
  swipePrompt: { alignItems: 'center', gap: 2 },
  swipeLabel: { color: '#72ceff', fontSize: 9.5, fontWeight: '800', letterSpacing: 2 },
  drawerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  drawer: {
    backgroundColor: 'rgba(6,14,48,0.985)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(95,177,255,0.28)',
    paddingHorizontal: 18,
    paddingBottom: 24,
    paddingTop: 11,
  },
  drawerHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'center', marginBottom: 14 },
  drawerTitle: { color: '#fff', fontSize: 17, letterSpacing: 2, fontWeight: '900' },
  drawerSub: { color: 'rgba(255,255,255,0.42)', fontSize: 10, letterSpacing: 2, marginBottom: 14 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  roomBtn: {
    width: (width - 54) / 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(108,187,255,0.2)',
    backgroundColor: 'rgba(11,22,70,0.8)',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 4,
  },
  roomIcon: { width: 42, height: 42, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  roomTitle: { color: '#dff1ff', fontSize: 11, letterSpacing: 1.1, fontWeight: '800' },
  roomSub: { color: 'rgba(255,255,255,0.55)', fontSize: 9.5 },
  drawerFooter: { marginTop: 14, flexDirection: 'row', gap: 10 },
  drawerClose: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  drawerCloseText: { color: 'rgba(255,255,255,0.56)', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,20,0.88)', justifyContent: 'flex-end', alignItems: 'center' },
  statsCard: {
    backgroundColor: 'rgba(6,14,48,0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.2)',
    padding: 24,
    gap: 8,
    width: '100%',
  },
  statsTitle: { color: '#7ec8ff', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  statsName: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 4 },
  statsSection: { color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginTop: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statsKey: { color: 'rgba(255,255,255,0.55)', fontSize: 9, letterSpacing: 1, width: 66, fontWeight: '700' },
  statsBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  statsBarFill: { height: 6, borderRadius: 3, backgroundColor: '#7ec8ff' },
  statsVal: { color: '#fff', fontSize: 11, fontWeight: '700', width: 26, textAlign: 'right' },
  statsClose: { marginTop: 12, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statsCloseText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
});
