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
import { careAction, getByte, getPlayer, trainStat } from '../../services/api';
import { useEvolution } from '../../context/EvolutionContext';

const { width, height } = Dimensions.get('window');

const SPRITES: Record<number, any> = {
  0: require('../../assets/bytes/egg.png'),
  1: require('../../assets/bytes/stage1.png'),
  2: require('../../assets/bytes/stage2.png'),
};

const CARE_ACTIONS = [
  { key: 'feed', label: 'FEED', icon: 'restaurant-outline', color: '#ffc84a' },
  { key: 'clean', label: 'CLEAN', icon: 'water-outline', color: '#45d4ff' },
  { key: 'train', label: 'TRAIN', icon: 'barbell-outline', color: '#bf6cff' },
  { key: 'rest', label: 'REST', icon: 'bed-outline', color: '#6c93ff' },
];

const ROOM_MENU = [
  { key: 'kitchen', title: 'KITCHEN', subtitle: 'Feed and meals', icon: 'restaurant-outline', route: '/rooms/kitchen', color: '#ffcb58' },
  { key: 'bathroom', title: 'BATHROOM', subtitle: 'Clean and wash', icon: 'water-outline', route: '/rooms/bathroom', color: '#56d9ff' },
  { key: 'bedroom', title: 'BEDROOM', subtitle: 'Rest and calm', icon: 'bed-outline', route: '/rooms/bedroom', color: '#9d86ff' },
  { key: 'training', title: 'TRAINING', subtitle: 'Stat drills', icon: 'barbell-outline', route: '/rooms/training-center', color: '#d48fff' },
  { key: 'clinic', title: 'CLINIC', subtitle: 'Recovery support', icon: 'medkit-outline', route: '/rooms/clinic', color: '#8deac7' },
  { key: 'play', title: 'PLAY ROOM', subtitle: 'Mood support', icon: 'game-controller-outline', route: '/rooms/play-room', color: '#ff8dd2' },
  { key: 'market', title: 'SHOP', subtitle: 'Items and rooms', icon: 'cart-outline', route: '/(tabs)/shop', color: '#5bdd7e' },
  { key: 'battle', title: 'BATTLE', subtitle: 'Deploy Byte', icon: 'flash-outline', route: '/(tabs)/battle', color: '#ff6f7b' },
  { key: 'pageant', title: 'PAGEANT', subtitle: 'Mock review', icon: 'trophy-outline', route: '/(tabs)/pageant', color: '#ff7acc' },
  { key: 'options', title: 'OPTIONS', subtitle: 'Achievements and gallery', icon: 'settings-outline', route: '/(tabs)/collection', color: '#79b8ff' },
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
  const { stage, recordFeed, recordClean, advanceStage } = useEvolution();
  const atFinalStage = stage >= 2;

  const roamX = useRef(new Animated.Value(0)).current;
  const roamY = useRef(new Animated.Value(0)).current;
  const hoverY = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const tapScale = useRef(new Animated.Value(1)).current;
  const whiteFlash = useRef(new Animated.Value(0)).current;
  const drawerAnim = useRef(new Animated.Value(height)).current;

  const [byteData, setByteData] = useState<any>(null);
  const [playerData, setPlayerData] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statusText, setStatusText] = useState('Byte is active and exploring.');
  const [evolutionPromptOpen, setEvolutionPromptOpen] = useState(false);
  const [evolutionToast, setEvolutionToast] = useState<string | null>(null);
  const [evolvingNow, setEvolvingNow] = useState(false);
  const [pendingEvolution, setPendingEvolution] = useState(false);
  const [transitionBusy, setTransitionBusy] = useState(false);

  const petSprite = SPRITES[stage] ?? SPRITES[2];
  const needs = byteData?.byte?.needs || {
    Hunger: 80,
    Bandwidth: 80,
    Hygiene: 80,
    Social: 80,
    Fun: 80,
    Mood: 80,
  };

  const refreshData = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([getByte(), getPlayer()]);
      setByteData(b);
      setPlayerData(p);
    } catch {
      setStatusText('Sync issue. Retrying on next action.');
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

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

  const beginEvolutionPrompt = useCallback(() => {
    if (atFinalStage || evolvingNow) return;
    setPendingEvolution(true);
    setEvolutionPromptOpen(true);
    setStatusText('Evolution is ready. Confirm when you want to proceed.');
  }, [atFinalStage, evolvingNow]);

  const triggerEvolution = useCallback(() => {
    if (atFinalStage || evolvingNow || !pendingEvolution) return;

    const nextStage = Math.min(stage + 1, 2);
    const evolvedName = byteData?.byte?.name || 'Your Byte';

    setEvolutionPromptOpen(false);
    setEvolvingNow(true);
    setTransitionBusy(true);

    Animated.sequence([
      Animated.delay(420),
      Animated.timing(whiteFlash, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.delay(520),
      Animated.timing(whiteFlash, { toValue: 0, duration: 1000, useNativeDriver: true }),
    ]).start(() => {
      advanceStage();
      setPendingEvolution(false);
      setEvolutionToast(`${evolvedName} has evolved to Stage ${nextStage + 1}.`);
      setStatusText('Evolution complete. Stats and growth profile updated.');
      setEvolvingNow(false);
      setTransitionBusy(false);
      setTimeout(() => setEvolutionToast(null), 2800);
      refreshData();
    });
  }, [advanceStage, atFinalStage, byteData?.byte?.name, evolvingNow, pendingEvolution, refreshData, stage, whiteFlash]);

  const handleCareAction = useCallback(
    async (key: string) => {
      if (transitionBusy) return;

      try {
        if (key === 'feed') {
          setStatusText('Feeding protocol running...');
          await careAction('feed');
          const evo = recordFeed();
          if (evo.evolved) beginEvolutionPrompt();
        } else if (key === 'clean') {
          setStatusText('Cleanup protocol running...');
          await careAction('clean');
          const evo = recordClean();
          if (evo.evolved) beginEvolutionPrompt();
        } else if (key === 'rest') {
          setStatusText('Sleep mode engaged...');
          await careAction('rest');
        } else if (key === 'train') {
          setStatusText('Training simulation complete.');
          await trainStat('Power', 'good');
        }
      } catch {
        setStatusText('Action completed in demo mode. Sync update pending.');
      }

      await refreshData();
    },
    [beginEvolutionPrompt, recordClean, recordFeed, refreshData, transitionBusy]
  );

  const handleRoomOpen = useCallback(
    (route: string) => {
      if (transitionBusy) return;
      setTransitionBusy(true);
      closeDrawer();
      setStatusText('Loading room...');
      setTimeout(() => {
        router.push(route as any);
        setTransitionBusy(false);
      }, 220);
    },
    [closeDrawer, router, transitionBusy]
  );

  const handleByteTap = useCallback(() => {
    Animated.sequence([
      Animated.timing(tapScale, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(tapScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    setStatusText('Byte acknowledges your ping.');
  }, [tapScale]);

  const currency = playerData?.byteBits ?? 0;
  const moodVal = needs.Mood || 0;
  const moodLabel = moodVal >= 75 ? 'Happy' : moodVal >= 40 ? 'Stable' : 'Needs care';
  const byteName = byteData?.byte?.name || 'BYTE';

  const NEED_SUMMARY = [
    { label: 'HEALTH', color: '#ff4f66', val: needs.Hunger || 0 },
    { label: 'ENERGY', color: '#52e58f', val: needs.Bandwidth || 0 },
    { label: 'MOOD', color: '#b87cff', val: needs.Mood || 0 },
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
        </View>

        <View style={styles.field}>
          <Animated.View
            style={[
              styles.byteStage,
              {
                transform: [{ translateX: roamX }, { translateY: roamY }, { translateY: hoverY }, { scale: breathe }, { scale: tapScale }],
              },
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
        </View>

        {pendingEvolution && !atFinalStage && (
          <TouchableOpacity style={styles.evolveReadyBtn} onPress={() => setEvolutionPromptOpen(true)} activeOpacity={0.86}>
            <Ionicons name="sparkles-outline" size={15} color="#ffe566" />
            <Text style={styles.evolveReadyText}>EVOLVE READY</Text>
          </TouchableOpacity>
        )}

        <View style={styles.careActionsRow}>
          {CARE_ACTIONS.map((item) => (
            <TouchableOpacity key={item.key} style={styles.careBtn} onPress={() => handleCareAction(item.key)} activeOpacity={0.86}>
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
            <Text style={styles.swipeLabel}>SWIPE UP TO CHANGE ROOMS</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {drawerOpen && (
        <TouchableOpacity style={styles.drawerOverlay} onPress={closeDrawer} activeOpacity={1}>
          <Animated.View style={[styles.drawer, { transform: [{ translateY: drawerAnim }] }]}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.drawerHandle} />
              <Text style={styles.drawerTitle}>ROOM NAVIGATION</Text>
              <Text style={styles.drawerSub}>SELECT A ROOM</Text>
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
                <TouchableOpacity style={styles.drawerStats} onPress={() => setStatsOpen(true)} activeOpacity={0.85}>
                  <Text style={styles.drawerStatsText}>VIEW STATS</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.drawerClose} onPress={closeDrawer} activeOpacity={0.85}>
                  <Text style={styles.drawerCloseText}>CLOSE</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      )}

      <StatsModal visible={statsOpen} onClose={() => setStatsOpen(false)} byteData={byteData} />
      <Animated.View style={[styles.whiteFlash, { opacity: whiteFlash }]} pointerEvents="none" />

      <Modal visible={evolutionPromptOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.modalBg} onPress={() => setEvolutionPromptOpen(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.evolveCard}>
            <Text style={styles.evolveTitle}>EVOLUTION READY</Text>
            <Text style={styles.evolveBody}>Your Byte is ready to evolve. Proceed now?</Text>
            <View style={styles.evolveActions}>
              <TouchableOpacity style={styles.evolveNoBtn} onPress={() => setEvolutionPromptOpen(false)} activeOpacity={0.8}>
                <Text style={styles.evolveNoText}>NOT YET</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.evolveYesBtn} onPress={triggerEvolution} activeOpacity={0.8}>
                <Text style={styles.evolveYesText}>EVOLVE</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {evolutionToast && (
        <View style={styles.evolveToast}>
          <Text style={styles.evolveToastText}>{evolutionToast}</Text>
        </View>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingTop: 8 },
  currencyBlock: {
    backgroundColor: 'rgba(9,14,52,0.75)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.26)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    minWidth: 102,
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
  statusText: { flex: 1, color: 'rgba(255,255,255,0.82)', fontSize: 11.5, fontWeight: '600' },
  statusMood: { color: '#7bd9ff', fontSize: 10.5, fontWeight: '700' },
  evolveReadyBtn: {
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: 'rgba(80,64,20,0.9)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,229,102,0.55)',
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  evolveReadyText: { color: '#ffe566', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
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
  drawerStats: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(104,192,255,0.35)',
    backgroundColor: 'rgba(26,36,88,0.72)',
  },
  drawerStatsText: { color: '#8fd9ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  drawerClose: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  drawerCloseText: { color: 'rgba(255,255,255,0.56)', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  whiteFlash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff' },
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
  evolveCard: {
    backgroundColor: 'rgba(8,20,60,0.98)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.3)',
    padding: 24,
    width: width * 0.82,
    gap: 14,
  },
  evolveTitle: { color: '#ffe566', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  evolveBody: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 21 },
  evolveActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  evolveNoBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  evolveNoText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  evolveYesBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,229,102,0.22)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,229,102,0.55)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  evolveYesText: { color: '#ffe566', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  evolveToast: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 90,
    backgroundColor: 'rgba(6,14,48,0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,229,102,0.45)',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  evolveToastText: { color: '#ffe566', fontSize: 13, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
});
