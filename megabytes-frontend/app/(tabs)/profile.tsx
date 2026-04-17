import React, { useEffect, useMemo, useState } from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPlayer } from '../../services/api';

export default function ProfileScreen() {
  const [player, setPlayer] = useState<any>(null);

  useEffect(() => {
    getPlayer().then(setPlayer).catch(() => setPlayer(null));
  }, []);

  const quickStats = useMemo(() => {
    const roomsOwned = Array.isArray(player?.unlockedRooms) ? player.unlockedRooms.length : 0;
    const battlesPlayed = Number(player?.arenaRecord?.wins || 0) + Number(player?.arenaRecord?.losses || 0);
    return [
      { label: 'BATTLES PLAYED', value: battlesPlayed },
      { label: 'BYTES TRAINED', value: Number(player?.totalGenerations || 0) },
      { label: 'ROOMS OWNED', value: roomsOwned },
      { label: 'ARENA RATING', value: Number(player?.battleRating || 1000) },
    ];
  }, [player]);

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>PROFILE</Text>
          <Text style={styles.sub}>Trainer overview</Text>

          <View style={styles.card}>
            <Text style={styles.name}>{player?.username || 'Trainer'}</Text>
            <Text style={styles.meta}>{player?.email || 'Email unavailable'}</Text>
            <Text style={styles.meta}>Player Icon: TBD</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>QUICK STATS</Text>
            {quickStats.map((entry) => (
              <View key={entry.label} style={styles.row}>
                <Text style={styles.label}>{entry.label}</Text>
                <Text style={styles.value}>{entry.value}</Text>
              </View>
            ))}
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
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 1.8 },
  sub: { color: 'rgba(200,228,255,0.68)', fontSize: 11 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  name: { color: '#fff', fontSize: 15, fontWeight: '800' },
  meta: { color: 'rgba(208,232,255,0.68)', fontSize: 11 },
  section: { color: '#9fe3ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: 'rgba(208,232,255,0.72)', fontSize: 10.5 },
  value: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
});
