import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { playSfx } from '../services/sfx';

// ─── Assets ──────────────────────────────────────────────────────────────────

const CARDS = {
  rock:     require('../assets/minigame/minigame-images/rps_rock_final.png'),
  paper:    require('../assets/minigame/minigame-images/rps_paper_final.png'),
  scissors: require('../assets/minigame/minigame-images/rps_scissors_final.png'),
} as const;

const BYTE_SPRITES = {
  neutral: require('../assets/bytes/Circle/Circle-blink-bounce.gif'),
  happy:   require('../assets/bytes/Circle/Circle-idle.gif'),
  shocked: require('../assets/bytes/Circle/Circle-looklowerleft-right.gif'),
} as const;

type Choice = 'rock' | 'paper' | 'scissors';
type Phase  = 'choosing' | 'revealing' | 'result';

const ORDER: Choice[] = ['rock', 'paper', 'scissors'];

function resolve(player: Choice, byte: Choice): 'win' | 'lose' | 'draw' {
  if (player === byte) return 'draw';
  if (
    (player === 'rock'     && byte === 'scissors') ||
    (player === 'scissors' && byte === 'paper')    ||
    (player === 'paper'    && byte === 'rock')
  ) return 'win';
  return 'lose';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RPSGameProps {
  visible:   boolean;
  byteName:  string;
  onClose:   () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RPSGame({ visible, byteName, onClose }: RPSGameProps) {
  const [phase,        setPhase]        = useState<Phase>('choosing');
  const [cycleIndex,   setCycleIndex]   = useState(0);
  const [byteChoice,   setByteChoice]   = useState<Choice | null>(null);
  const [playerChoice, setPlayerChoice] = useState<Choice | null>(null);
  const [result,       setResult]       = useState<'win' | 'lose' | 'draw' | null>(null);
  const [byteEmotion,  setByteEmotion]  = useState<'neutral' | 'happy' | 'shocked'>('neutral');

  const cycleRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultFade  = useRef(new Animated.Value(0)).current;
  const cardScale   = useRef(new Animated.Value(1)).current;
  const byteScale   = useRef(new Animated.Value(1)).current;

  // Reset state when opened + play open SFX
  useEffect(() => {
    if (!visible) return;
    playSfx('mg_open', 0.8);
    playSfx('card_shuffle', 0.7);
    setPhase('choosing');
    setCycleIndex(0);
    setByteChoice(null);
    setPlayerChoice(null);
    setResult(null);
    setByteEmotion('neutral');
    resultFade.setValue(0);
    cardScale.setValue(1);
    byteScale.setValue(1);
  }, [visible, resultFade, cardScale, byteScale]);

  // Cycle byte card at 2 per second
  useEffect(() => {
    if (!visible || phase !== 'choosing') {
      if (cycleRef.current) clearInterval(cycleRef.current);
      return;
    }
    cycleRef.current = setInterval(() => {
      setCycleIndex((prev) => (prev + 1) % 3);
      playSfx('mg_tick', 0.35);
    }, 500);
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
    };
  }, [visible, phase]);

  const handlePlayerPick = useCallback((choice: Choice) => {
    if (phase !== 'choosing') return;

    // Stop cycle, lock player choice
    if (cycleRef.current) clearInterval(cycleRef.current);
    const byteRandom = ORDER[Math.floor(Math.random() * 3)];
    playSfx('card_deal', 0.8);
    playSfx('mg_reveal', 0.7);
    setPlayerChoice(choice);
    setByteChoice(byteRandom);
    setPhase('revealing');

    // Bounce the byte
    Animated.sequence([
      Animated.timing(byteScale, { toValue: 1.18, duration: 120, useNativeDriver: true }),
      Animated.spring(byteScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();

    // Short reveal pause, then show result
    setTimeout(() => {
      const outcome = resolve(choice, byteRandom);
      setResult(outcome);
      setByteEmotion(outcome === 'win' ? 'shocked' : outcome === 'lose' ? 'happy' : 'neutral');
      setPhase('result');

      // SFX
      if (outcome === 'win')       playSfx('mg_win',  0.9);
      else if (outcome === 'lose') playSfx('mg_lose', 0.9);
      else                         playSfx('mg_draw', 0.8);

      // Fade in result text
      Animated.timing(resultFade, { toValue: 1, duration: 280, useNativeDriver: true }).start();

      // Auto-close after 2.2s
      setTimeout(() => {
        Animated.timing(resultFade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onClose());
      }, 2200);
    }, 620);
  }, [phase, byteScale, resultFade, onClose]);

  const byteSprite = BYTE_SPRITES[byteEmotion];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>DATA DUEL</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>ROCK · PAPER · SCISSORS</Text>

          {/* Arena */}
          <View style={styles.arena}>

            {/* Byte side */}
            <View style={styles.side}>
              <View style={styles.byteFrame}>
                <Animated.Image
                  source={byteSprite}
                  style={[styles.byteSprite, { transform: [{ scale: byteScale }] }]}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.sideLabel}>{(byteName || 'BYTE').toUpperCase()}</Text>

              {/* Byte's card */}
              <View style={styles.cardSlot}>
                {phase === 'choosing' ? (
                  <Image
                    source={CARDS[ORDER[cycleIndex]]}
                    style={styles.cardImg}
                    resizeMode="contain"
                  />
                ) : byteChoice ? (
                  <Image
                    source={CARDS[byteChoice]}
                    style={styles.cardImg}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.cardPlaceholder} />
                )}
              </View>
            </View>

            {/* VS */}
            <View style={styles.vsBlock}>
              <Text style={styles.vs}>VS</Text>
            </View>

            {/* Player side */}
            <View style={styles.side}>
              <View style={[styles.byteFrame, styles.byteFramePlayer]}>
                <Text style={styles.playerIcon}>👤</Text>
              </View>
              <Text style={styles.sideLabel}>YOU</Text>

              {/* Player's revealed card */}
              <View style={styles.cardSlot}>
                {playerChoice ? (
                  <Image
                    source={CARDS[playerChoice]}
                    style={styles.cardImg}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.cardPlaceholder}>
                    <Text style={styles.placeholderText}>?</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Result banner */}
          <Animated.View style={[styles.resultBanner, { opacity: resultFade }]}>
            {result && (
              <Text style={[
                styles.resultText,
                result === 'win'  && styles.resultWin,
                result === 'lose' && styles.resultLose,
                result === 'draw' && styles.resultDraw,
              ]}>
                {result === 'win' ? '⚡ YOU WIN' : result === 'lose' ? '💀 YOU LOSE' : '🔄 DRAW'}
              </Text>
            )}
          </Animated.View>

          {/* Player card picker */}
          {phase === 'choosing' && (
            <View style={styles.picker}>
              <Text style={styles.pickerLabel}>CHOOSE YOUR MOVE</Text>
              <View style={styles.pickerRow}>
                {ORDER.map((choice) => (
                  <TouchableOpacity
                    key={choice}
                    onPress={() => { playSfx('rps_select', 0.6); handlePlayerPick(choice); }}
                    activeOpacity={0.8}
                    style={styles.pickerCard}
                  >
                    <Image
                      source={CARDS[choice]}
                      style={styles.pickerCardImg}
                      resizeMode="contain"
                    />
                    <Text style={styles.pickerCardLabel}>{choice.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {phase !== 'choosing' && (
            <View style={styles.pickerPlaceholder}>
              <Text style={styles.waitText}>
                {phase === 'revealing' ? 'Calculating...' : 'Closing shortly...'}
              </Text>
            </View>
          )}

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    width: '88%',
    backgroundColor: 'rgba(6,14,52,0.97)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(126,200,255,0.35)',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 20,
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  title:  { color: '#7ec8ff', fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,107,107,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeX: { color: '#ff6b6b', fontSize: 13, fontWeight: '900' },
  subtitle: { color: 'rgba(120,195,255,0.5)', fontSize: 9, letterSpacing: 2, fontWeight: '700', marginBottom: 14 },

  arena: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },

  side:  { flex: 1, alignItems: 'center', gap: 6 },
  byteFrame: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(20,40,100,0.6)',
    borderWidth: 1.5, borderColor: 'rgba(126,200,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  byteFramePlayer: { backgroundColor: 'rgba(40,20,60,0.6)', borderColor: 'rgba(200,150,255,0.3)' },
  byteSprite:   { width: 64, height: 64 },
  playerIcon:   { fontSize: 32 },
  sideLabel:    { color: 'rgba(180,220,255,0.7)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },

  cardSlot: { width: 72, height: 90, alignItems: 'center', justifyContent: 'center' },
  cardImg:  { width: 68, height: 86 },
  cardPlaceholder: {
    width: 68, height: 86,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(120,195,255,0.2)',
    backgroundColor: 'rgba(10,20,60,0.6)',
    alignItems: 'center', justifyContent: 'center',
    borderStyle: 'dashed',
  },
  placeholderText: { color: 'rgba(120,195,255,0.35)', fontSize: 22, fontWeight: '900' },

  vsBlock: { width: 36, alignItems: 'center', justifyContent: 'center', paddingTop: 24 },
  vs: { color: '#ffe08d', fontSize: 15, fontWeight: '900', letterSpacing: 2 },

  resultBanner: { alignItems: 'center', minHeight: 36, justifyContent: 'center', marginBottom: 6 },
  resultText: { fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  resultWin:  { color: '#7cffc0' },
  resultLose: { color: '#ff6b6b' },
  resultDraw: { color: '#ffe08d' },

  picker: { marginTop: 4 },
  pickerLabel: {
    color: 'rgba(120,195,255,0.55)', fontSize: 9, fontWeight: '800',
    letterSpacing: 2, textAlign: 'center', marginBottom: 10,
  },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  pickerCard: {
    flex: 1, alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(10,22,70,0.7)',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.25)',
    paddingVertical: 8,
  },
  pickerCardImg:   { width: 60, height: 76 },
  pickerCardLabel: { color: '#9bd7ff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  pickerPlaceholder: { height: 120, alignItems: 'center', justifyContent: 'center' },
  waitText: { color: 'rgba(120,195,255,0.45)', fontSize: 11, letterSpacing: 1.5 },
});
