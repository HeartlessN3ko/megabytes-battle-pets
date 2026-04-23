import React from 'react';
import {
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <ImageBackground
      source={require('../assets/backgrounds/bg916.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>‹ BACK</Text>
            </TouchableOpacity>
            <Text style={styles.title}>SETTINGS</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>GAMEPLAY</Text>
            <Text style={styles.placeholder}>No settings available yet.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: 14, gap: 12, paddingBottom: 26 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
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
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  section: {
    color: '#9fe3ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  placeholder: {
    color: 'rgba(208,232,255,0.72)',
    fontSize: 12,
    lineHeight: 16,
  },
});
