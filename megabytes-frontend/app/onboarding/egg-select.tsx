import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  ImageBackground,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { selectOnboardingEgg, advanceOnboarding } from '../../services/api';

// v1: only Circle ships. Other 4 shapes are [LOCKED] until art is produced.
// `locked` shapes render as disabled tiles with a lock icon.
const SHAPES = [
  {
    id: 'circle',
    name: 'Circle',
    description: 'Balanced and adaptive.\nStable growth across all systems.\nResponds well to consistent interaction.',
    icon: 'ellipse',
    locked: false,
  },
  {
    id: 'square',
    name: 'Square',
    description: 'Defensive and grounded.\nLocked — coming in a future release.',
    icon: 'square',
    locked: true,
  },
  {
    id: 'triangle',
    name: 'Triangle',
    description: 'Aggressive and fast.\nLocked — coming in a future release.',
    icon: 'triangle',
    locked: true,
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'Precise and focused.\nLocked — coming in a future release.',
    icon: 'diamond',
    locked: true,
  },
  {
    id: 'hexagon',
    name: 'Hexagon',
    description: 'Stable and efficient.\nLocked — coming in a future release.',
    icon: 'shapes',
    locked: true,
  },
];

export default function EggSelectScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Navigation debounce to prevent accidental double-navigation
  const navLock = useRef(false);
  const safeNavigate = useCallback((fn: () => void, delay = 300) => {
    if (navLock.current) return;
    navLock.current = true;
    fn();
    setTimeout(() => { navLock.current = false; }, delay);
  }, []);

  const handleSelect = async (shapeId: string) => {
    try {
      setLoading(true);
      await selectOnboardingEgg(shapeId);
      setSelected(shapeId);

      // After selection, advance to confirm stage
      await advanceOnboarding();
      // Then advance again to continue tutorial
      await advanceOnboarding();

      // Go back to flow screen
      safeNavigate(() => router.back(), 300);
    } catch (err: any) {
      console.error('Failed to select egg:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={20} color="#7ec8ff" />
            </TouchableOpacity>
            <Text style={styles.title}>SELECT SHAPE</Text>
            <View style={{ width: 20 }} />
          </View>

          {SHAPES.map((shape) => (
            <TouchableOpacity
              key={shape.id}
              style={[
                styles.shapeCard,
                selected === shape.id && styles.shapeCardSelected,
                shape.locked && styles.shapeCardLocked,
              ]}
              onPress={() => { if (!shape.locked) handleSelect(shape.id); }}
              disabled={loading || shape.locked}
              activeOpacity={shape.locked ? 1 : 0.7}
            >
              <View style={styles.shapeTop}>
                <Ionicons
                  name={shape.icon as any}
                  size={32}
                  color={shape.locked ? '#5a6a85' : (selected === shape.id ? '#7cffb2' : '#7ec8ff')}
                />
                <Text style={[styles.shapeName, shape.locked && styles.shapeNameLocked]}>{shape.name}</Text>
                {shape.locked && (
                  <Ionicons name="lock-closed" size={16} color="#5a6a85" style={{ marginLeft: 'auto' }} />
                )}
              </View>
              <Text style={[styles.shapeDesc, shape.locked && styles.shapeDescLocked]}>{shape.description}</Text>
              {selected === shape.id && !shape.locked && (
                <View style={styles.selectedIndicator}>
                  <Ionicons name="checkmark-circle" size={20} color="#7cffb2" />
                </View>
              )}
            </TouchableOpacity>
          ))}

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#7ec8ff" />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  container: { flex: 1 },
  contentContainer: { paddingHorizontal: 14, paddingVertical: 20 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '900', color: '#d9efff', letterSpacing: 1.5 },

  shapeCard: {
    backgroundColor: 'rgba(50,70,130,0.3)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.15)',
    padding: 14,
    marginBottom: 12,
  },
  shapeCardSelected: {
    borderColor: '#7cffb2',
    backgroundColor: 'rgba(124,255,178,0.1)',
  },
  shapeCardLocked: {
    opacity: 0.45,
    borderColor: 'rgba(126,200,255,0.08)',
  },
  shapeTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  shapeName: { fontSize: 16, fontWeight: '800', color: '#d9efff' },
  shapeNameLocked: { color: '#7a8aa0' },
  shapeDesc: { fontSize: 12, fontWeight: '500', color: 'rgba(212,238,255,0.7)', lineHeight: 18 },
  shapeDescLocked: { color: 'rgba(212,238,255,0.4)' },

  selectedIndicator: { position: 'absolute', top: 12, right: 12 },

  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
});