import React from 'react';
import { ImageBackground, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const CREDIT_ROWS = [
  { role: 'Creative Direction', name: 'Skye / ChaosDesigned' },
  { role: 'Game Design', name: 'Skye / ChaosDesigned' },
  { role: 'World / Byte Concept', name: 'Voidworks' },
  { role: 'System Support', name: 'Claude + Codex' },
  { role: 'Prototype Build', name: 'Voidworks Interactive' },
];

export default function CreditsScreen() {
  const router = useRouter();

  return (
    <ImageBackground source={require('../assets/images/titlebg.png')} style={styles.bg} resizeMode="cover">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={styles.backText}>BACK</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>CREDITS</Text>
          <Text style={styles.sub}>Prototype credit roll</Text>
        </View>

        <ScrollView contentContainerStyle={styles.roll} showsVerticalScrollIndicator={false}>
          {CREDIT_ROWS.map((row) => (
            <View key={`${row.role}-${row.name}`} style={styles.card}>
              <Text style={styles.role}>{row.role}</Text>
              <Text style={styles.name}>{row.name}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1, paddingHorizontal: 16 },
  backBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.22)',
    backgroundColor: 'rgba(4,18,40,0.48)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backText: {
    color: '#dff4ff',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  header: {
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 16,
    gap: 4,
  },
  title: {
    color: '#eef8ff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  sub: {
    color: 'rgba(180,220,245,0.78)',
    fontSize: 11,
    letterSpacing: 1.4,
  },
  roll: {
    paddingBottom: 28,
    gap: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.22)',
    backgroundColor: 'rgba(4,18,40,0.54)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  role: {
    color: '#8edcff',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  name: {
    color: '#f5fbff',
    fontSize: 15,
    fontWeight: '800',
  },
});
