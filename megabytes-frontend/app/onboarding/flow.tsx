import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getOnboardingProgress, advanceOnboarding, skipOnboarding } from '../../services/api';
import { getDemoSessionHeaders } from '../../services/demoSession';

export default function OnboardingFlowScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);

  // Navigation debounce to prevent accidental double-navigation
  const navLock = useRef(false);
  const safeNavigate = useCallback((fn: () => void, delay = 300) => {
    if (navLock.current) return;
    navLock.current = true;
    fn();
    setTimeout(() => { navLock.current = false; }, delay);
  }, []);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      setLoading(true);
      const data = await getOnboardingProgress();
      setProgress(data);
    } catch (err: any) {
      console.error('Failed to load onboarding progress:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdvance = async () => {
    try {
      setAdvancing(true);
      const data = await advanceOnboarding();
      setProgress(data);

      if (data.isComplete) {
        // Onboarding complete, go to home
        safeNavigate(() => router.replace('/(tabs)'), 300);
      } else if (data.currentStage === 'egg_select') {
        // Go to egg select screen
        safeNavigate(() => router.push('/onboarding/egg-select'), 300);
      }
    } catch (err: any) {
      console.error('Failed to advance:', err);
    } finally {
      setAdvancing(false);
    }
  };

  const handleSkip = async () => {
    try {
      const isDemo = getDemoSessionHeaders()['x-is-demo'] === 'true';
      if (!isDemo) return;

      setAdvancing(true);
      await skipOnboarding();
      safeNavigate(() => router.replace('/(tabs)'), 300);
    } catch (err: any) {
      console.error('Failed to skip:', err);
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) {
    return (
      <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
        <SafeAreaView style={styles.safe}>
          <ActivityIndicator size="large" color="#7ec8ff" />
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const stage = progress?.stageData;
  const isDemo = getDemoSessionHeaders()['x-is-demo'] === 'true';

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.container}>
          {/* Stage title */}
          <View style={styles.header}>
            <Text style={styles.stageLabel}>{progress?.currentStage.toUpperCase().replace(/_/g, ' ')}</Text>
            <Text style={styles.title}>{stage?.title}</Text>
          </View>

          {/* Stage content */}
          <View style={styles.contentBlock}>
            {stage?.speaker && <Text style={styles.speaker}>[{stage.speaker}]</Text>}
            <Text style={styles.text}>{stage?.text}</Text>
          </View>

          {/* Actions */}
          <View style={styles.actionBlock}>
            <TouchableOpacity
              style={[styles.btn, styles.continueBtn]}
              onPress={handleAdvance}
              disabled={advancing}
            >
              {advancing ? (
                <ActivityIndicator size="small" color="#d9efff" />
              ) : (
                <>
                  <Text style={styles.btnText}>CONTINUE</Text>
                  <Ionicons name="arrow-forward-outline" size={16} color="#d9efff" />
                </>
              )}
            </TouchableOpacity>

            {isDemo && (
              <TouchableOpacity
                style={[styles.btn, styles.skipBtn]}
                onPress={handleSkip}
                disabled={advancing}
              >
                <Text style={styles.skipBtnText}>SKIP (DEMO)</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Progress indicator */}
          <View style={styles.progressBar}>
            <Text style={styles.progressText}>
              Step {progress?.completedStages.length + 1} of 25
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 16, paddingVertical: 20, justifyContent: 'space-between' },

  header: { marginBottom: 30 },
  stageLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(212,238,255,0.6)', letterSpacing: 1, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '900', color: '#d9efff', letterSpacing: 1.5 },

  contentBlock: {
    backgroundColor: 'rgba(50,70,130,0.3)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.15)',
    padding: 16,
    minHeight: 200,
    justifyContent: 'center',
    marginBottom: 30,
  },
  speaker: { fontSize: 12, fontWeight: '800', color: '#7ec8ff', marginBottom: 12 },
  text: { fontSize: 14, fontWeight: '500', color: '#d9efff', lineHeight: 22 },

  actionBlock: { gap: 12, marginBottom: 20 },
  btn: {
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  continueBtn: {
    backgroundColor: 'rgba(126,200,255,0.2)',
    borderWidth: 1,
    borderColor: '#7ec8ff',
  },
  skipBtn: {
    backgroundColor: 'rgba(255,106,96,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,106,96,0.4)',
  },
  btnText: { fontSize: 13, fontWeight: '900', color: '#d9efff', letterSpacing: 1.2 },
  skipBtnText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,106,96,0.8)', letterSpacing: 1 },

  progressBar: { alignItems: 'center' },
  progressText: { fontSize: 11, fontWeight: '700', color: 'rgba(212,238,255,0.5)' },
});
