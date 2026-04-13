import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  Animated, Dimensions, StatusBar, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { cheerBattle, getBattle, startBattle, suggestBattleUlt } from '../../services/api';
import { useEvolution } from '../../context/EvolutionContext';

const { width, height } = Dimensions.get('window');

// Flavor text pools
const PLAYER_LOGS = [
  'Byte slams forward with raw code force!',
  'Direct hit! No filters, just damage!',
  'A clean strike cuts through the data stream!',
  'Hard-coded hit!',
  'Raw execution!',
];
const ENEMY_LOGS = [
  'Corrupting target processes!',
  'System disruption in progress!',
  'Malware deployed!',
  'Background interference detected!',
  'Debilitating script injected!',
];
const HIT_LOGS   = ['Direct hit!', 'Clean connection!', 'Target struck!'];
const MISS_LOGS  = ['Packet dropped!', 'Execution failed!', 'Attack missed!'];
const LOW_HP     = ['WARNING: Integrity critical!', 'System near collapse!', 'Emergency state!'];
const CHEER_LOGS = ["LET'S GO BYTE!", 'BOOST THAT DAMAGE!', 'YOU GOT THIS!'];
const TAUNT_LOGS = ["That's your move?", 'Lagging hard!', 'Uninstall yourself!'];

function rnd(arr: string[]) { return arr[Math.floor(Math.random() * arr.length)]; }

const PLAYER_SPRITES: Record<number, any> = {
  0: require('../../assets/bytes/egg.png'),
  1: require('../../assets/bytes/stage1.png'),
  2: require('../../assets/bytes/stage2.png'),
};

const PLAYER_MOVES = [
  { key: 'fireball', name: 'Fireball', emoji: '🔥', power: 28, type: 'projectile' },
  { key: 'tackle',   name: 'Tackle',   emoji: '💥', power: 18, type: 'lunge' },
];
const ENEMY = { name: 'AdwareMonster', level: 6, maxHp: 120, moves: ['Corrupt Blast', 'Slop Wave', 'Data Drain'] };

function DamageNumber({ value, side }: { value: number; side: 'left' | 'right' }) {
  const y = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y,  { toValue: -70, duration: 1000, useNativeDriver: true }),
      Animated.timing(op, { toValue: 0,   duration: 1000, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.Text style={[styles.damageNum,
      { color: side === 'right' ? '#ff4422' : '#ff6644', transform: [{ translateY: y }], opacity: op }]}>
      -{value}
    </Animated.Text>
  );
}

export default function BattleScreen() {
  const router = useRouter();
  const { stage, recordBattle } = useEvolution();

  const PLAYER_MAX_HP = 100;
  const playerSprite  = PLAYER_SPRITES[stage] ?? PLAYER_SPRITES[2];

  const playerHpAnim  = useRef(new Animated.Value(1)).current;
  const enemyHpAnim   = useRef(new Animated.Value(1)).current;
  const playerX       = useRef(new Animated.Value(0)).current;
  const enemyX        = useRef(new Animated.Value(0)).current;
  const enemyGlow     = useRef(new Animated.Value(0)).current;
  const timerAnim     = useRef(new Animated.Value(1)).current;
  const fireballX     = useRef(new Animated.Value(0)).current;
  const fireballOp    = useRef(new Animated.Value(0)).current;
  const enemyOp       = useRef(new Animated.Value(1)).current;
  const overlayOp     = useRef(new Animated.Value(0)).current;
  const whiteFlash    = useRef(new Animated.Value(0)).current;

  const playerHpRef   = useRef(PLAYER_MAX_HP);
  const enemyHpRef    = useRef(ENEMY.maxHp);
  const battleOverRef = useRef(false);
  const busyRef       = useRef(false);
  const damageId      = useRef(0);
  const biasedMoveRef = useRef<number | null>(null);
  const rngSeedRef    = useRef(1337 + stage * 101);
  const turnRef       = useRef(0);

  const [playerHp, setPlayerHp]     = useState(PLAYER_MAX_HP);
  const [enemyHp, setEnemyHp]       = useState(ENEMY.maxHp);
  const [log, setLog]               = useState('Battle begins! MissingNo vs AdwareMonster!');
  const [damages, setDamages]       = useState<{ id: number; value: number; side: 'left'|'right' }[]>([]);
  const [victory, setVictory]       = useState<boolean | null>(null);
  const [biasedMove, setBiasedMove] = useState<number | null>(null);
  const [earnedBits, setEarnedBits] = useState(0);
  const [returningHome, setReturningHome] = useState(false);
  const [battleId, setBattleId] = useState<string | null>(null);

  const nextRand = useCallback(() => {
    // Deterministic LCG for repeatable demo battle outcomes.
    rngSeedRef.current = (rngSeedRef.current * 1664525 + 1013904223) % 4294967296;
    return rngSeedRef.current / 4294967296;
  }, []);

  const addDamage = useCallback((value: number, side: 'left'|'right') => {
    const id = damageId.current++;
    setDamages(d => [...d, { id, value, side }]);
    setTimeout(() => setDamages(d => d.filter(x => x.id !== id)), 1100);
  }, []);

  const lunge = useCallback((anim: Animated.Value, dir: number): Promise<void> =>
    new Promise(res => Animated.sequence([
      Animated.timing(anim, { toValue: dir * width * 0.26, duration: 180, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => res())), []);

  const fireballAttack = useCallback((): Promise<void> =>
    new Promise(res => {
      fireballX.setValue(0); fireballOp.setValue(1);
      Animated.parallel([
        Animated.timing(fireballX,  { toValue: width * 0.52, duration: 380, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(fireballOp, { toValue: 0, duration: 100, useNativeDriver: true }),
        ]),
      ]).start(() => res());
    }), []);

  const restoreBattleState = useCallback(() => {
    playerHpRef.current = PLAYER_MAX_HP;
    enemyHpRef.current  = ENEMY.maxHp;
    setPlayerHp(PLAYER_MAX_HP);
    setEnemyHp(ENEMY.maxHp);
    playerHpAnim.setValue(1);
    enemyHpAnim.setValue(1);
    enemyOp.setValue(1);
    busyRef.current = false;
    battleOverRef.current = false;
    setLog('Battle begins! MissingNo vs AdwareMonster!');
  }, [enemyHpAnim, enemyOp, playerHpAnim]);

  const endBattle = useCallback(async (won: boolean) => {
    battleOverRef.current = true;
    setVictory(won);

    if (won) {
      // Fade enemy
      Animated.timing(enemyOp, { toValue: 0, duration: 800, useNativeDriver: true }).start();
      // Call backend
      try {
        const res = await startBattle('ai');
        setBattleId(res?.battleId || null);
        setEarnedBits(res.earned || 34);
        if (res?.battleId) {
          try {
            await getBattle(res.battleId);
          } catch {}
        }
        setLog(`Battle synced. Winner: ${res?.winner || 'A'}.`);
      } catch {
        setEarnedBits(34);
        setLog('Battle ended in local fallback mode.');
      }
      // Record battle for evolution
      recordBattle();
    }

    setTimeout(() => {
      Animated.timing(overlayOp, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, won ? 900 : 300);
  }, [recordBattle]);

  const handleVictoryTap = useCallback(() => {
    if (returningHome) return;
    setReturningHome(true);
    setLog('Finalizing battle results...');

    // Let battle state settle before navigation so battle-end logic completes.
    setTimeout(() => {
      setVictory(null);
      overlayOp.setValue(0);
      restoreBattleState();
      setReturningHome(false);
      router.replace('/(tabs)');
    }, 450);
  }, [overlayOp, restoreBattleState, returningHome, router]);

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(enemyGlow, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(enemyGlow, { toValue: 0, duration: 900, useNativeDriver: true }),
    ])).start();
    Animated.timing(timerAnim, { toValue: 0, duration: 60000, useNativeDriver: false }).start();
  }, []);

  useEffect(() => {
    const killSwitch = setTimeout(() => {
      if (battleOverRef.current) return;
      const won = playerHpRef.current >= enemyHpRef.current;
      setLog('Battle timeout reached. Resolving by remaining integrity.');
      endBattle(won);
    }, 70000);
    return () => clearTimeout(killSwitch);
  }, [endBattle]);

  // Player auto-attack every 3s
  useEffect(() => {
    const interval = setInterval(async () => {
      if (busyRef.current || battleOverRef.current) return;
      busyRef.current = true;

      const moveIdx = biasedMoveRef.current !== null ? biasedMoveRef.current : Math.floor(nextRand() * PLAYER_MOVES.length);
      biasedMoveRef.current = null;
      setBiasedMove(null);
      const move = PLAYER_MOVES[moveIdx];

      const hitRoll = nextRand();
      if (hitRoll < 0.85) {
        setLog(`MissingNo uses ${move.name}! ${rnd(PLAYER_LOGS)}`);
        if (move.type === 'projectile') await fireballAttack();
        else await lunge(playerX, 1);

        const dmg = move.power + Math.floor(nextRand() * 10);
        addDamage(dmg, 'right');
        const next = Math.max(0, enemyHpRef.current - dmg);
        enemyHpRef.current = next;
        setEnemyHp(next);
        Animated.timing(enemyHpAnim, { toValue: next / ENEMY.maxHp, duration: 400, useNativeDriver: false }).start();
        if (next <= 0) { endBattle(true); busyRef.current = false; return; }
        if (next < ENEMY.maxHp * 0.3) setLog(rnd(LOW_HP));
      } else {
        setLog(`MissingNo attacks! ${rnd(MISS_LOGS)}`);
      }
      busyRef.current = false;
    }, 3000);
    return () => clearInterval(interval);
  }, [addDamage, endBattle, enemyHpAnim, fireballAttack, lunge, nextRand, playerX]);

  // Enemy auto-attack every 4.5s
  useEffect(() => {
    const interval = setInterval(async () => {
      if (busyRef.current || battleOverRef.current) return;
      busyRef.current = true;

      const move = ENEMY.moves[turnRef.current % ENEMY.moves.length];
      turnRef.current += 1;
      setLog(`${ENEMY.name} uses ${move}! ${rnd(ENEMY_LOGS)}`);
      await lunge(enemyX, -1);

      const dmg = Math.floor(nextRand() * 15) + 8;
      addDamage(dmg, 'left');
      const next = Math.max(0, playerHpRef.current - dmg);
      playerHpRef.current = next;
      setPlayerHp(next);
      Animated.timing(playerHpAnim, { toValue: next / PLAYER_MAX_HP, duration: 400, useNativeDriver: false }).start();
      if (next <= 0) { endBattle(false); busyRef.current = false; return; }
      if (next < PLAYER_MAX_HP * 0.3) setLog(rnd(LOW_HP));
      busyRef.current = false;
    }, 4500);
    return () => clearInterval(interval);
  }, [addDamage, endBattle, enemyX, lunge, nextRand, playerHpAnim]);

  const handleBiasMove = (idx: number) => {
    if (battleOverRef.current) return;
    biasedMoveRef.current = idx;
    setBiasedMove(idx);
  };

  const glowOp     = enemyGlow.interpolate({ inputRange: [0,1], outputRange: [0, 0.5] });
  const pHpColor   = playerHpAnim.interpolate({ inputRange: [0,0.3,1], outputRange: ['#ff2222','#ffaa00','#44ff44'] });
  const eHpColor   = enemyHpAnim.interpolate({ inputRange: [0,0.3,1], outputRange: ['#ff2222','#ffaa00','#ff6622'] });
  const timerColor = timerAnim.interpolate({ inputRange: [0,0.3,1], outputRange: ['#ff2222','#ffaa00','#44aaff'] });
  const pHpWidth   = playerHpAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const eHpWidth   = enemyHpAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const timerWidth = timerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <ImageBackground source={require('../../assets/backgrounds/battleground.png')} style={styles.bg} resizeMode="cover">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['top','bottom']}>

        <View style={styles.timerTrack}>
          <Animated.View style={[styles.timerFill, { width: timerWidth, backgroundColor: timerColor }]} />
        </View>

        <View style={styles.hpSection}>
          <View style={styles.hpRow}>
            <Text style={styles.hpLabel}>MissingNo Lv.{stage + 1}</Text>
            <Text style={styles.hpVal}>{playerHp}/{PLAYER_MAX_HP}</Text>
          </View>
          <View style={styles.hpTrack}>
            <Animated.View style={[styles.hpFill, { width: pHpWidth, backgroundColor: pHpColor }]} />
          </View>
          <View style={styles.hpRow}>
            <Text style={styles.hpLabel}>{ENEMY.name} Lv.{ENEMY.level}</Text>
            <Text style={styles.hpVal}>{enemyHp}/{ENEMY.maxHp}</Text>
          </View>
          <View style={styles.hpTrack}>
            <Animated.View style={[styles.hpFill, { width: eHpWidth, backgroundColor: eHpColor }]} />
          </View>
        </View>

        <View style={styles.field}>
          <View style={styles.byteSlot}>
            <Animated.View style={{ transform: [{ translateX: playerX }] }}>
              <Image source={playerSprite} style={styles.sprite} resizeMode="contain" />
            </Animated.View>
            {damages.filter(d => d.side === 'left').map(d => <DamageNumber key={d.id} value={d.value} side="left" />)}
          </View>

          <Animated.Image
            source={require('../../assets/abilities/fireball.png')}
            style={[styles.fireball, { transform: [{ translateX: fireballX }], opacity: fireballOp }]}
            resizeMode="contain"
          />

          <View style={styles.byteSlot}>
            <Animated.View style={[styles.glowRing, { opacity: glowOp }]} />
            <Animated.View style={{ transform: [{ translateX: enemyX }], opacity: enemyOp }}>
              <Image
                source={require('../../assets/enemies/adwaremonster.png')}
                style={[styles.sprite, { transform: [{ scaleX: -1 }] }]}
                resizeMode="contain"
              />
            </Animated.View>
            {damages.filter(d => d.side === 'right').map(d => <DamageNumber key={d.id} value={d.value} side="right" />)}
          </View>
        </View>

        <View style={styles.movesRow}>
          {PLAYER_MOVES.map((move, i) => (
            <TouchableOpacity
              key={move.key}
              style={[styles.moveBtn, biasedMove === i && styles.moveBiased]}
              onPress={() => handleBiasMove(i)}
              activeOpacity={0.75}
            >
              <Text style={styles.moveEmoji}>{move.emoji}</Text>
              <Text style={styles.moveName}>{move.name}</Text>
              {biasedMove === i && <Text style={styles.moveQueued}>NEXT</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.logBox}>
          <Text style={styles.logText}>{log}</Text>
        </View>

        <View style={styles.controls}>
          {[
            {
              label: '✳️ Cheer',
              cb: async () => {
                setLog(rnd(CHEER_LOGS));
                if (battleId) {
                  try {
                    const res = await cheerBattle(battleId);
                    setLog(`Cheer sent. Crowd energy ${res?.cheers || 1}.`);
                  } catch {}
                }
              },
            },
            { label: '🗡️ Taunt',       cb: () => setLog(rnd(TAUNT_LOGS)) },
            {
              label: '⚡ Suggest Ult',
              cb: async () => {
                setLog('MissingNo is charging up something big...');
                if (battleId) {
                  try {
                    await suggestBattleUlt(battleId);
                  } catch {}
                }
              },
            },
            { label: '🎒 Items', cb: () => router.push('/(tabs)/shop') },
          ].map(btn => (
            <TouchableOpacity key={btn.label} style={styles.controlBtn} onPress={btn.cb} activeOpacity={0.7}>
              <Text style={styles.controlLabel}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </SafeAreaView>

      {victory !== null && (
        <Animated.View style={[styles.overlay, { opacity: overlayOp }]}>
          <TouchableOpacity style={styles.overlayInner} onPress={handleVictoryTap} activeOpacity={0.9}>
            <Text style={[styles.overlayTitle, { color: victory ? '#ffe566' : '#ff4444' }]}>
              {victory ? '🏆 VICTORY!' : '💀 DEFEATED'}
            </Text>
            <Text style={styles.overlaySub}>
              {victory ? `+25 rating  •  +${earnedBits} bits` : '-20 rating  •  +8 bits'}
            </Text>
            {victory && <Text style={styles.overlayFlavor}>{rnd(['Target deleted!', 'System dominance achieved!', 'Battle resolved!'])}</Text>}
            {!victory && <Text style={styles.overlayFlavor}>{rnd(['Byte crashed!', 'System failure!', 'Connection lost!'])}</Text>}
            <Text style={styles.overlayTap}>Tap to return home</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <Animated.View style={[styles.whiteFlash, { opacity: whiteFlash }]} pointerEvents="none" />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg:   { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1 },
  timerTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row' },
  timerFill:  { height: 4 },
  hpSection: { paddingHorizontal: 14, paddingTop: 8, gap: 3 },
  hpRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  hpLabel:{ color: '#cce4ff', fontSize: 11, fontWeight: '700' },
  hpVal:  { color: 'rgba(255,255,255,0.45)', fontSize: 10 },
  hpTrack:{ height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', overflow: 'hidden', marginBottom: 5 },
  hpFill: { borderRadius: 5 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 10 },
  byteSlot: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  sprite: { width: width * 0.36, height: width * 0.36, backgroundColor: 'transparent' },
  glowRing: { position: 'absolute', width: width * 0.38, height: width * 0.38, borderRadius: 999, backgroundColor: '#ff5500' },
  fireball: { position: 'absolute', width: 48, height: 48, left: width * 0.18, backgroundColor: 'transparent' },
  damageNum: { position: 'absolute', top: -10, fontSize: 26, fontWeight: '900', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  movesRow: { flexDirection: 'row', paddingHorizontal: 10, gap: 8, marginBottom: 6 },
  moveBtn: { flex: 1, backgroundColor: 'rgba(10,25,70,0.88)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(80,160,255,0.35)', paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  moveBiased: { borderColor: '#ffcc00', backgroundColor: 'rgba(40,35,10,0.9)' },
  moveEmoji:  { fontSize: 18 },
  moveName:   { flex: 1, color: '#cce4ff', fontSize: 12, fontWeight: '700' },
  moveQueued: { color: '#ffcc00', fontSize: 9, fontWeight: '800' },
  logBox: { marginHorizontal: 14, marginBottom: 8, backgroundColor: 'rgba(8,20,60,0.88)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(80,160,255,0.3)', padding: 10, minHeight: 40, justifyContent: 'center' },
  logText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  controls: { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 8, gap: 6 },
  controlBtn: { flex: 1, backgroundColor: 'rgba(10,25,70,0.88)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(80,160,255,0.3)', paddingVertical: 10, alignItems: 'center' },
  controlLabel: { color: '#cce4ff', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,20,0.85)', alignItems: 'center', justifyContent: 'center' },
  overlayInner: { alignItems: 'center', gap: 12, padding: 40 },
  overlayTitle: { fontSize: 48, fontWeight: '900', letterSpacing: 2, textShadowColor: '#000', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 8 },
  overlaySub:   { color: '#aaddff', fontSize: 16, fontWeight: '600' },
  overlayFlavor:{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontStyle: 'italic' },
  overlayTap:   { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 20 },
  whiteFlash:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff' },
});



