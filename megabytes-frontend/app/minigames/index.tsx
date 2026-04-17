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
        <Text style={styles.title}>MINIGAME HUB</Text>
        <Text style={styles.sub}>Testing build: short, forgiving, replayable</Text>
        {room ? <Text style={styles.scope}>Room scope: {room}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {list.map((game) => (
          <TouchableOpacity
            key={game.id}
            style={[styles.card, { borderColor: `${game.accent}88`, backgroundColor: `${game.accent}22` }]}
            onPress={() => router.push({ pathname: '/minigames/[id]', params: { id: game.id } })}
            activeOpacity={0.85}
          >
            <Text style={styles.cardTitle}>{game.title}</Text>
            <Text style={styles.cardSub}>{game.subtitle}</Text>
            <Text style={styles.cardMeta}>{game.room === 'training-center' ? 'Training drill' : `Room: ${game.room}`}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
        <Text style={styles.backText}>BACK</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#071223', paddingHorizontal: 14 },
  header: { paddingTop: 10, gap: 3 },
  title: { color: '#e8f3ff', fontSize: 22, fontWeight: '900', letterSpacing: 1.4 },
  sub: { color: 'rgba(162,205,241,0.9)', fontSize: 11 },
  scope: { color: '#9ce7ff', fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  list: { paddingTop: 12, paddingBottom: 80, gap: 10 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardTitle: { color: '#e8f3ff', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  cardSub: { color: 'rgba(203,227,248,0.9)', fontSize: 11, marginTop: 2 },
  cardMeta: { color: 'rgba(145,209,255,0.95)', fontSize: 10, marginTop: 4, fontWeight: '700' },
  backBtn: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.35)',
    backgroundColor: 'rgba(8,18,62,0.9)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  backText: { color: '#d9efff', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
});
