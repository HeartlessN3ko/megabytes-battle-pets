import React, { useEffect, useMemo, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Dimensions, Image, ImageBackground, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEvolution } from '../context/EvolutionContext';

const { width } = Dimensions.get('window');

export interface RoomAction {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  onPress: () => void;
}

interface RoomSceneProps {
  title: string;
  subtitle: string;
  ambient: string;
  roomTag: string;
  sceneTint: string;
  accent: string;
  actions: RoomAction[];
  statusLine: string;
}

export default function RoomScene({
  title,
  subtitle,
  ambient,
  roomTag,
  sceneTint,
  accent,
  actions,
  statusLine,
}: RoomSceneProps) {
  const { stage } = useEvolution();
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;
  const bobY = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;

  const petSprite = useMemo(() => {
    if (stage <= 0) return require('../assets/bytes/egg.png');
    if (stage === 1) return require('../assets/bytes/stage1.png');
    return require('../assets/bytes/stage2.png');
  }, [stage]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bobY, { toValue: -6, duration: 1600, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.04, duration: 1700, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1700, useNativeDriver: true }),
      ])
    ).start();

    let active = true;
    const roam = () => {
      if (!active) return;
      const nextX = (Math.random() - 0.5) * (width * 0.36);
      const nextY = (Math.random() - 0.5) * 26;
      Animated.parallel([
        Animated.timing(driftX, { toValue: nextX, duration: 1700 + Math.random() * 1300, useNativeDriver: true }),
        Animated.timing(driftY, { toValue: nextY, duration: 1700 + Math.random() * 1300, useNativeDriver: true }),
      ]).start(() => {
        if (!active) return;
        setTimeout(roam, 500 + Math.random() * 900);
      });
    };
    roam();

    return () => {
      active = false;
    };
  }, [bobY, breathe, driftX, driftY]);

  return (
    <ImageBackground source={require('../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.sceneTint, { backgroundColor: sceneTint }]} />

        <View style={styles.header}>
          <Text style={styles.roomTitle}>{title}</Text>
          <Text style={styles.roomSubtitle}>{subtitle}</Text>
        </View>

        <View style={styles.stage}>
          <View style={[styles.roomHalo, { borderColor: `${accent}66` }]} />
          <View style={styles.roomMetaWrap}>
            <View style={[styles.roomTag, { borderColor: `${accent}66` }]}>
              <Text style={[styles.roomTagText, { color: accent }]}>{roomTag}</Text>
            </View>
            <Text style={styles.ambientBody}>{ambient}</Text>
          </View>

          <Animated.View
            style={[
              styles.petWrap,
              { transform: [{ translateX: driftX }, { translateY: driftY }, { translateY: bobY }, { scale: breathe }] },
            ]}
          >
            <Image source={petSprite} style={styles.petSprite} resizeMode="contain" />
          </Animated.View>
        </View>

        <View style={styles.statusDock}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{statusLine}</Text>
        </View>

        <View style={styles.actionsRow}>
          {actions.map((action) => (
            <TouchableOpacity key={action.key} style={styles.actionBtn} onPress={action.onPress} activeOpacity={0.85}>
              <View style={[styles.actionIcon, { borderColor: `${action.color}88`, backgroundColor: `${action.color}22` }]}>
                <Ionicons name={action.icon as any} size={18} color={action.color} />
              </View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionSub}>{action.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1, paddingHorizontal: 14 },
  sceneTint: { ...StyleSheet.absoluteFillObject },
  header: { paddingTop: 14, alignItems: 'center', gap: 4 },
  roomTitle: { color: '#e1f1ff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  roomSubtitle: { color: 'rgba(152,218,255,0.86)', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  roomHalo: {
    position: 'absolute',
    bottom: 26,
    width: width * 0.56,
    height: width * 0.22,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(20,60,140,0.2)',
  },
  roomMetaWrap: {
    position: 'absolute',
    top: 32,
    left: 8,
    right: 8,
    alignItems: 'center',
    gap: 8,
  },
  roomTag: {
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(10,20,60,0.75)',
  },
  roomTagText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  ambientBody: {
    color: 'rgba(224,243,255,0.78)',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    maxWidth: width * 0.8,
  },
  petWrap: { position: 'absolute', bottom: 10 },
  petSprite: { width: width * 0.34, height: width * 0.34 },
  statusDock: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(100,192,255,0.23)',
    backgroundColor: 'rgba(8,18,64,0.78)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#59ff90' },
  statusText: { color: 'rgba(230,244,255,0.88)', fontSize: 11.5, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, paddingBottom: 14 },
  actionBtn: {
    width: (width - 38) / 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(98,188,255,0.22)',
    backgroundColor: 'rgba(8,18,62,0.88)',
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 5,
  },
  actionIcon: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: '#dff2ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  actionSub: { color: 'rgba(210,232,255,0.58)', fontSize: 9.5, textAlign: 'center' },
});
