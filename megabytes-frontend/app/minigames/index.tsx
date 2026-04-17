import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MINI_GAME_DEFS, getMiniGamesForRoom } from '../../services/minigames';

export default function MiniGameHubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ room?: string }>();
  const room = typeof params.room === 'string' ? params.room : '';

  const list = useMemo(() => {
    const scoped = getMiniGamesForRoom(room);
    return scoped.length ? scoped : MINI_GAME_DEFS;
  }, [room]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>SIMULATION SELECT</Text>
        <Text style={styles.title}>MINIGAME HUB</Text>
        <Text style={styles.sub}>Short drills, larger touch targets, cleaner read.</Text>
        <View style={styles.metaRow}>
          {room ? <Text style={styles.scope}>Room scope: {room}</Text> : <Text style={styles.scope}>All rooms</Text>}
          <Text style={styles.scope}>Modules: {list.length}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {list.map((game) => (
          <TouchableOpacity
            key={game.id}
            style={[styles.card, { borderColor: `${game.accent}88`, backgroundColor: `${game.accent}1f` }]}
            onPress={() => router.push({ pathname: '/minigames/[id]', params: { id: game.id } })}
            activeOpacity={0.85}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{game.title}</Text>
              <View style={[styles.badge, { borderColor: `${game.accent}88`, backgroundColor: `${game.accent}26` }]}>
                <Text style={styles.badgeText}>{game.kind.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.cardSub}>{game.subtitle}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>{game.room === 'training-center' ? 'Training drill' : `Room: ${game.room}`}</Text>
              <Text style={styles.cardLaunch}>OPEN</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
        <Text style={styles.backText}>BACK</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#071223', paddingHorizontal: 14 },
  header: { paddingTop: 12, gap: 4 },
  eyebrow: { color: '#8fdfff', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: '#e8f3ff', fontSize: 24, fontWeight: '900', letterSpacing: 1.4 },
  sub: { color: 'rgba(162,205,241,0.9)', fontSize: 11.5, lineHeight: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 },
  scope: { color: '#9ce7ff', fontSize: 10.5, fontWeight: '700' },
  list: { paddingTop: 14, paddingBottom: 90, gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  cardTitle: { flex: 1, color: '#e8f3ff', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: { color: '#f4fbff', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  cardSub: { color: 'rgba(203,227,248,0.9)', fontSize: 11.5, lineHeight: 16 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  cardMeta: { color: 'rgba(145,209,255,0.95)', fontSize: 10, fontWeight: '700' },
  cardLaunch: { color: '#f6fbff', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  backBtn: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.35)',
    backgroundColor: 'rgba(8,18,62,0.9)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: '#d9efff', fontSize: 11.5, fontWeight: '800', letterSpacing: 1.2 },
});
