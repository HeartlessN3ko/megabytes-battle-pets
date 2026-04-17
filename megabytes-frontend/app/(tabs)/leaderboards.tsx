import React from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LeaderboardsScreen() {
  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.card}>
          <Text style={styles.title}>LEADERBOARDS</Text>
          <Text style={styles.sub}>Global rankings</Text>
          <Text style={styles.body}>Leaderboard surface is reserved and ready. Ranked ladders and event boards will plug in here.</Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 14, justifyContent: 'center' },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 8,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1.6 },
  sub: { color: '#9fe3ff', fontSize: 11, fontWeight: '800' },
  body: { color: 'rgba(220,240,255,0.84)', fontSize: 11, lineHeight: 17 },
});
