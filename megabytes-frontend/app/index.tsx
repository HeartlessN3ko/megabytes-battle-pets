import React, { useEffect, useRef } from 'react';
import {
  View, Text, ImageBackground, Image,
  StyleSheet, Animated, Dimensions, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getOnboardingProgress } from '../services/api';
import appConfig from '../app.json';
const BUILD_VERSION = appConfig.expo.version;

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const router    = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeIn    = useRef(new Animated.Value(0)).current;
  const logoY     = useRef(new Animated.Value(-30)).current;
  const routed    = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.spring(logoY,  { toValue: 0, friction: 6, tension: 40, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [fadeIn, logoY, pulseAnim]);

  useEffect(() => {
    let cancelled = false;
    const routeAfterSplash = async () => {
      // Hold splash visible for ~1.6s so the animation reads.
      await new Promise((r) => setTimeout(r, 1600));
      let target = '/(tabs)';
      try {
        const progress = await getOnboardingProgress();
        if (progress && progress.isComplete === false) {
          target = '/onboarding/flow';
        }
      } catch {
        // Offline or server cold — send them to tabs; tabs handles its own error states.
      }
      if (cancelled || routed.current) return;
      routed.current = true;
      Animated.timing(fadeIn, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        router.replace(target as any);
      });
    };
    routeAfterSplash();
    return () => { cancelled = true; };
  }, [fadeIn, router]);

  return (
    <ImageBackground
      source={require('../assets/images/titlebg.png')}
      style={styles.bg}
      resizeMode="cover"
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <Animated.View style={[styles.container, { opacity: fadeIn }]}>
        <View style={styles.heroBlock}>
          <Animated.View style={[styles.logoWrap, { transform: [{ translateY: logoY }] }]}>
            <Image
              source={require('../assets/images/titlelogo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.Text style={[styles.loadingText, { opacity: pulseAnim }]}>
            LOADING...
          </Animated.Text>
        </View>

        <View style={styles.infoBlock}>
          <View style={styles.scanlines} pointerEvents="none" />
          <Text style={styles.infoPrimary}>BUILD {BUILD_VERSION}</Text>
          <Text style={styles.infoSecondary}>VOIDWORKS INTERACTIVE</Text>
        </View>
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg:        { flex: 1, width: '100%', height: '100%' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 48 },
  heroBlock: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  logoWrap:  { width: '100%', alignItems: 'center', justifyContent: 'center' },
  logo:      { width: width * 1.22, height: height * 0.5 },

  loadingText: {
    color: '#7ec8ff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: 24,
    textShadowColor: '#00aaff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  infoBlock: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    minWidth: width * 0.72,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.22)',
    backgroundColor: 'rgba(4,18,40,0.38)',
    overflow: 'hidden',
  },
  scanlines: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.25,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(126,200,255,0.08)',
  },
  infoPrimary: {
    color: 'rgba(198,236,255,0.95)',
    fontSize: 12,
    letterSpacing: 2.4,
    fontWeight: '800',
    textShadowColor: 'rgba(0,170,255,0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  infoSecondary: {
    color: 'rgba(170,218,245,0.72)',
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '600',
  },
});
