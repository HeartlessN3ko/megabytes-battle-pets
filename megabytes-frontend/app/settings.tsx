/**
 * Settings screen — minimal for now. Hosts the DEVELOPER card which
 * routes to the in-app dev menu.
 */

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

          <View style={styles.card}>
            <Text style={styles.section}>DEVELOPER</Text>
            <TouchableOpacity
              onPress={() => router.push('/dev-menu')}
              style={styles.devBtn}
            >
              <Text style={styles.devBtnText}>DEV MENU</Text>
            </TouchableOpacity>
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
    gap: 8,
  },
  section: {
    color: '#9fe3ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  placeholder: {
    color: 'rgba(198,236,255,0.7)',
    fontSize: 12,
  },
  devBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,160,100,0.55)',
    backgroundColor: 'rgba(60,20,10,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  devBtnText: {
    color: '#ffc89a',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.0,
  },
});
