import React, { useEffect, useRef } from 'react';
import {
  View, Text, ImageBackground, Image, TouchableOpacity,
  StyleSheet, Animated, Dimensions, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDemoMode } from '../hooks/useDemoMode';
import { playSfx } from '../services/sfx';
import appConfig from '../app.json';
const BUILD_VERSION = appConfig.expo.version;

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const router    = useRouter();
  const { enableDemoMode, hydrated: demoHydrated } = useDemoMode();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeIn    = useRef(new Animated.Value(0)).current;
  const logoY     = useRef(new Animated.Value(-30)).current;

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

  const fadeOut = (cb: () => void) => {
    Animated.timing(fadeIn, { toValue: 0, duration: 400, useNativeDriver: true }).start(cb);
  };

  const handleDemo = async () => {
    if (!demoHydrated) return;
    playSfx('press_start', 0.8);
    await enableDemoMode();
    fadeOut(() => router.replace('/(tabs)' as any));
  };

  const handleNewPlayer = () => {
    if (!demoHydrated) return;
    playSfx('press_start', 0.8);
    fadeOut(() => router.replace('/onboarding/flow' as any));
  };

  const handleCredits = () => {
    router.push('/credits');
  };

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

          {demoHydrated ? (
            <View style={styles.choiceBlock}>
              <TouchableOpacity onPress={handleDemo} activeOpacity={0.8} style={styles.demoBtn}>
                <Animated.Text style={[styles.demoBtnText, { opacity: pulseAnim }]}>
                  DEMO MODE
                </Animated.Text>
                <Text style={styles.btnSub}>Jump in with a test profile</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleNewPlayer} activeOpacity={0.8} style={styles.newPlayerBtn}>
                <Text style={styles.newPlayerText}>NEW PLAYER</Text>
                <Text style={styles.btnSub}>Full onboarding + egg selection</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.demoBtnText, { opacity: 0.5 }]}>SYNCING...</Text>
          )}

          <TouchableOpacity onPress={handleCredits} activeOpacity={0.85} style={styles.creditsBtn}>
            <Text style={styles.creditsText}>CREDITS</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBlock}>
          <View style={styles.scanlines} pointerEvents="none" />
          <Text style={styles.infoPrimary}>DEMO BUILD {BUILD_VERSION}</Text>
          <Text style={styles.infoSecondary}>VOIDWORKS INTERACTIVE</Text>
          <Text style={styles.infoSecondary}>INTERNAL SHOWCASE BRANCH</Text>
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

  choiceBlock: {
    width: '78%',
    gap: 14,
    marginTop: -8,
  },

  demoBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#7ec8ff',
    backgroundColor: 'rgba(4,18,40,0.72)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  demoBtnText: {
    color: '#7ec8ff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 4,
    textShadowColor: '#00aaff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  newPlayerBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(126,200,255,0.38)',
    backgroundColor: 'rgba(4,18,40,0.52)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  newPlayerText: {
    color: 'rgba(210,238,255,0.92)',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
  },

  btnSub: {
    color: 'rgba(170,218,245,0.55)',
    fontSize: 9.5,
    letterSpacing: 1,
    marginTop: 4,
  },

  creditsBtn: {
    marginTop: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.24)',
    backgroundColor: 'rgba(4,18,40,0.46)',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  creditsText: {
    color: 'rgba(210,238,255,0.88)',
    fontSize: 11.2,
    fontWeight: '800',
    letterSpacing: 1.8,
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
