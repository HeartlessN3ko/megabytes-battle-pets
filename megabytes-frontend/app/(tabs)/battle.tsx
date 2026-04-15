import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { cheerBattle, getByte, getByteMoves, startBattle, suggestBattleUlt, completeCampaignNode } from '../../services/api';
import { useEvolution } from '../../context/EvolutionContext';
import { resolveByteSprite } from '../../services/byteSprites';

const { width } = Dimensions.get('window');

const CORRUPTION_TIER_COLOR: Record<string, string> = {
  none: '#888888', light: '#ffe666', medium: '#ff9c44', heavy: '#ff6060', critical: '#bf44ff',
};

const PHYSICAL_LOGS = [
  'Byte slams forward with raw code force!',
  'Direct hit! No filters, just damage!',
  'A clean strike cuts through the data stream!',
  'Impact registered! That one hurt!',
  'Brute force override!',
  'Collision detected!',
  'Heavy packet transfer!',
  'Raw execution!',
  'Hard-coded hit!',
  'No optimization, just violence!',
];
const ELEMENTAL_LOGS = [
  'Elemental protocols engaged!',
  'System channels elemental data!',
  'Element output surges!',
  'Energy spikes across the grid!',
  'Typed damage incoming!',
  'Element sync achieved!',
  'Overload imminent!',
  'Digital element cascade!',
  'Signal infused with power!',
  'Elemental burst deployed!',
];
const STATUS_LOGS = [
  'Corrupting target processes!',
  'Status applied!',
  'System disruption in progress!',
  'Target flagged!',
  'Debilitating script injected!',
  'Background interference detected!',
  'Malware deployed!',
  'Soft-lock attempt!',
  'Behavior altered!',
  'Status queue updated!',
];
const MOVE_FLAVOR: Record<string, string[]> = {
  'fireball.py': ['A compressed fire packet launches!', 'Flame data erupts outward!', 'Heat spike detected!'],
  'flame_wall.sys': ['Firewall deployed!', 'Barrier of heat stabilizes!', 'Thermal shield active!'],
  'burn_stack.exe': ['Burn protocol stacking!', 'Heat damage accumulating!', 'Target overheating!'],
  'heat_drain.dll': ['Thermal siphon initiated!', 'Energy draining via heat!', 'Target cooling down rapidly!'],
  'ember_restore.bin': ['Residual heat restores integrity!', 'Warmth stabilizes Byte!', 'Recovery through combustion!'],
  'inferno.exe': ['SYSTEM OVERHEAT MAXIMUM!', 'Inferno protocol unleashed!', 'Everything burns!'],
  'aqua_blast.py': ['Pressurized stream fired!', 'Water data surges forward!', 'Impact through fluid force!'],
  'flow_state.sys': ['Flow state achieved!', 'Smooth execution boost!', 'Latency reduced!'],
  'soak_leak.exe': ['Target saturated!', 'Leaks forming!', 'Integrity compromised!'],
  'pressure_sink.dll': ['Pressure drop initiated!', 'Crushing force applied!', 'Compression engaged!'],
  'refresh_stream.bin': ['Cooling stream restores systems!', 'Data refreshed!', 'Clean cycle active!'],
  'tsunami.sys': ['FULL WAVE DEPLOYED!', 'System flood imminent!', 'Overwhelming surge!'],
};
const VICTORY_LOGS = ['Target deleted!', 'Battle resolved!', 'System dominance achieved!'];
const DEFEAT_LOGS = ['Byte crashed!', 'System failure!', 'Connection lost!'];
const CHEER_LOGS = ["LET'S GO BYTE!", 'BOOST THAT DAMAGE!', 'YOU GOT THIS!'];
const TAUNT_LOGS = ["That's your move?", 'Lagging hard!', 'Uninstall yourself!'];

function rnd(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMoveFlavor(moveId: string | undefined, fn: string | undefined, isUlt = false) {
  const key = String(moveId || '').toLowerCase();
  if (MOVE_FLAVOR[key]) return rnd(MOVE_FLAVOR[key]);
  if (isUlt) return rnd(ELEMENTAL_LOGS);
  const kind = String(fn || 'Damage').toLowerCase();
  if (kind === 'status' || kind === 'debuff') return rnd(STATUS_LOGS);
  if (kind === 'buff' || kind === 'utility') return rnd(ELEMENTAL_LOGS);
  return rnd(PHYSICAL_LOGS);
}

type MoveDef = {
  id: string;
  name?: string;
  function?: string;
  power?: number;
  accuracy?: number;
  isUlt?: boolean;
};

// Default shell — replaced at mount with real backend opponent data from startBattle('ai').
const DEFAULT_ENEMY_MOVES = ['Corrupt Blast', 'Slop Wave', 'Data Drain'];
const INITIAL_ENEMY = { name: '...', level: 1, maxHp: 120, moves: DEFAULT_ENEMY_MOVES };

// Tick pacing — matches backend BATTLE_DURATION (60 ticks / 60s).
const TICK_MS = 1000;

type BattleEvent = {
  type: string;
  actor?: string;
  target?: string;
  move?: string;
  damage?: number;
  heal?: number;
  isUlt?: boolean;
  effect?: string;
  status?: string;
  duration?: number;
  passive?: string;
};
type BattleTick = { tick: number; events: BattleEvent[] };

function DamageNumber({ value, side }: { value: number; side: 'left' | 'right' }) {
  const y = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: -70, duration: 1000, useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 1000, useNativeDriver: true }),
    ]).start();
  }, [op, y]);
  return (
    <Animated.Text
      style={[
        styles.damageNum,
        { color: side === 'right' ? '#ff4422' : '#ff6644', transform: [{ translateY: y }], opacity: op },
      ]}
    >
      -{value}
    </Animated.Text>
  );
}

function FloatingText({ text, emoji }: { text: string; emoji: string }) {
  const y = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: -100, duration: 1200, useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 1200, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1.3, duration: 1200, useNativeDriver: true }),
    ]).start();
  }, [op, y, scale]);
  return (
    <Animated.View
      style={[
        styles.floatingText,
        { transform: [{ translateY: y }, { scale }], opacity: op },
      ]}
    >
      <Text style={styles.floatingEmoji}>{emoji}</Text>
      <Text style={styles.floatingTextLabel}>{text}</Text>
    </Animated.View>
  );
}

export default function BattleScreen() {
  const router = useRouter();
  const { stage, recordBattle } = useEvolution();
  const params = useLocalSearchParams<{ campaignBattle?: string; campaignNodeId?: string }>();
  const isCampaignBattle = params.campaignBattle === 'true';
  const campaignNodeId = params.campaignNodeId ? parseInt(params.campaignNodeId, 10) : null;

  // Navigation debounce to prevent accidental double-navigation
  const navLock = useRef(false);
  const safeNavigate = useCallback((fn: () => void, delay = 300) => {
    if (navLock.current) return;
    navLock.current = true;
    fn();
    setTimeout(() => { navLock.current = false; }, delay);
  }, []);

  const PLAYER_MAX_HP = 100;
  const [battleNeeds, setBattleNeeds] = useState<any>(null);
  const playerSprite = resolveByteSprite(stage, { needs: battleNeeds, preferAnimatedIdle: false });

  const playerHpAnim = useRef(new Animated.Value(1)).current;
  const enemyHpAnim = useRef(new Animated.Value(1)).current;
  const playerX = useRef(new Animated.Value(0)).current;
  const enemyX = useRef(new Animated.Value(0)).current;
  const enemyGlow = useRef(new Animated.Value(0)).current;
  const timerAnim = useRef(new Animated.Value(1)).current;
  const fireballX = useRef(new Animated.Value(0)).current;
  const fireballOp = useRef(new Animated.Value(0)).current;
  const enemyOp = useRef(new Animated.Value(1)).current;
  const overlayOp = useRef(new Animated.Value(0)).current;

  const [enemy, setEnemy] = useState(INITIAL_ENEMY);

  const playerHpRef = useRef(PLAYER_MAX_HP);
  const enemyHpRef = useRef(enemy.maxHp);
  const battleOverRef = useRef(false);
  const damageId = useRef(0);
  const ultUsedRef = useRef(false);
  const queuedUltRef = useRef(false);
  // Tick-log playback refs (backend-authoritative)
  const battleLogRef = useRef<BattleTick[]>([]);
  const selfByteIdRef = useRef<string>('');
  const opponentByteIdRef = useRef<string>('');
  const playbackCursorRef = useRef(0);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const battleResolvedRef = useRef<{ winner: 'A' | 'B' | 'draw'; earned: number } | null>(null);

  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [enemyHp, setEnemyHp] = useState(enemy.maxHp);
  const [log, setLog] = useState('Battle begins! MissingNo vs AdwareMonster!');
  const [damages, setDamages] = useState<{ id: number; value: number; side: 'left' | 'right' }[]>([]);
  const [victory, setVictory] = useState<boolean | null>(null);
  const [earnedBits, setEarnedBits] = useState(0);
  const [returningHome, setReturningHome] = useState(false);
  const [battleId, setBattleId] = useState<string | null>(null);
  const [readinessText, setReadinessText] = useState('Readiness: syncing...');
  const [corruptionDisplay, setCorruptionDisplay] = useState<{ value: number; tier: string } | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<{ id: number; text: string; emoji: string }[]>([]);
  const floatingTextId = useRef(0);
  const lastCheerTauntTime = useRef(0);

  const [equippedMoves, setEquippedMoves] = useState<MoveDef[]>([
    { id: 'fireball.py', name: 'Fireball', function: 'Damage', power: 28, accuracy: 0.88 },
    { id: 'tackle.exe', name: 'Tackle', function: 'Damage', power: 18, accuracy: 0.93 },
  ]);
  const [equippedUlt, setEquippedUlt] = useState<MoveDef | null>(null);
  const [equippedPassive, setEquippedPassive] = useState<string | null>(null);

  const addDamage = useCallback((value: number, side: 'left' | 'right') => {
    const id = damageId.current++;
    setDamages((d) => [...d, { id, value, side }]);
    setTimeout(() => setDamages((d) => d.filter((x) => x.id !== id)), 1100);
  }, []);

  const addFloatingText = useCallback((text: string, emoji: string) => {
    const now = Date.now();
    if (now - lastCheerTauntTime.current < 1000) return; // 1s cooldown
    lastCheerTauntTime.current = now;

    const id = floatingTextId.current++;
    setFloatingTexts((f) => [...f, { id, text, emoji }]);
    setTimeout(() => setFloatingTexts((f) => f.filter((x) => x.id !== id)), 1300);
  }, []);

  const lunge = useCallback(
    (anim: Animated.Value, dir: number): Promise<void> =>
      new Promise((res) =>
        Animated.sequence([
          Animated.timing(anim, { toValue: dir * width * 0.26, duration: 180, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start(() => res())
      ),
    []
  );

  const projectileAttack = useCallback(
    (): Promise<void> =>
      new Promise((res) => {
        fireballX.setValue(0);
        fireballOp.setValue(1);
        Animated.parallel([
          Animated.timing(fireballX, { toValue: width * 0.52, duration: 380, useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(300),
            Animated.timing(fireballOp, { toValue: 0, duration: 100, useNativeDriver: true }),
          ]),
        ]).start(() => res());
      }),
    [fireballOp, fireballX]
  );

  const restoreBattleState = useCallback(() => {
    playerHpRef.current = PLAYER_MAX_HP;
    enemyHpRef.current = enemy.maxHp;
    setPlayerHp(PLAYER_MAX_HP);
    setEnemyHp(enemy.maxHp);
    playerHpAnim.setValue(1);
    enemyHpAnim.setValue(1);
    enemyOp.setValue(1);
    battleOverRef.current = false;
    ultUsedRef.current = false;
    queuedUltRef.current = false;
    playbackCursorRef.current = 0;
    battleResolvedRef.current = null;
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setLog('Awaiting next battle...');
  }, [enemy.maxHp, enemyHpAnim, enemyOp, playerHpAnim]);

  const loadBattleProfile = useCallback(async () => {
    try {
      const [data, byteData] = await Promise.all([getByteMoves(), getByte()]);
      const availableMoves = Array.isArray(data?.availableMoves) ? data.availableMoves : [];
      const availableUlts = Array.isArray(data?.availableUlts) ? data.availableUlts : [];
      const eqMoveIds = Array.isArray(data?.equippedMoves) ? data.equippedMoves : [];
      const byId = new Map<string, MoveDef>([...availableMoves, ...availableUlts].map((m: MoveDef) => [m.id, m]));

      const resolvedMoves = eqMoveIds
        .map((id: string) => byId.get(id))
        .filter(Boolean)
        .slice(0, 2) as MoveDef[];

      if (resolvedMoves.length > 0) {
        setEquippedMoves(
          resolvedMoves.map((m) => ({
            id: m.id,
            name: m.name || m.id,
            function: m.function || 'Damage',
            power: Number(m.power || 20),
            accuracy: Number(m.accuracy || 0.9),
          }))
        );
      }

      const ultId = data?.equippedUlt || null;
      if (ultId && byId.has(ultId)) {
        const ult = byId.get(ultId) as MoveDef;
        setEquippedUlt({
          id: ult.id,
          name: ult.name || ult.id,
          function: ult.function || 'Damage',
          power: Number(ult.power || 40),
          accuracy: Number(ult.accuracy || 0.85),
          isUlt: true,
        });
      } else {
        setEquippedUlt(null);
      }

      setEquippedPassive(data?.equippedPassive || null);

      const needs = byteData?.byte?.needs || {};
      setBattleNeeds(needs);
      const tier = byteData?.corruptionTier || 'none';
      setCorruptionDisplay({ value: Math.round(Number(byteData?.byte?.corruption || 0)), tier });
      const avgNeed =
        (Number(needs.Hunger || 0) +
          Number(needs.Bandwidth || 0) +
          Number(needs.Hygiene || 0) +
          Number(needs.Social || 0) +
          Number(needs.Fun || 0) +
          Number(needs.Mood || 0)) /
        6;
      if (avgNeed >= 70) setReadinessText('Readiness: optimal');
      else if (avgNeed >= 50) setReadinessText('Readiness: stable');
      else if (avgNeed >= 35) setReadinessText('Readiness: strained');
      else setReadinessText('Readiness: critical care needed');
    } catch {
      // Keep fallback move profile.
      setReadinessText('Readiness: fallback profile');
    }
  }, []);

  const endBattle = useCallback(
    (won: boolean) => {
      if (battleOverRef.current) return;
      battleOverRef.current = true;
      setVictory(won);
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      if (won) {
        setLog(rnd(VICTORY_LOGS));
        Animated.timing(enemyOp, { toValue: 0, duration: 800, useNativeDriver: true }).start();
        recordBattle();
      } else {
        setLog(rnd(DEFEAT_LOGS));
      }
      setTimeout(() => {
        Animated.timing(overlayOp, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      }, won ? 900 : 300);
    },
    [enemyOp, overlayOp, recordBattle]
  );

  const handleVictoryTap = useCallback(() => {
    if (returningHome) return;
    setReturningHome(true);
    setLog('Finalizing battle results...');

    const finalize = async () => {
      // If campaign battle and victory, mark node as complete
      if (isCampaignBattle && victory && campaignNodeId) {
        try {
          await completeCampaignNode(campaignNodeId, 'good');
        } catch (err) {
          console.error('Failed to mark campaign node complete:', err);
        }
      }

      setTimeout(() => {
        setVictory(null);
        overlayOp.setValue(0);
        restoreBattleState();
        setReturningHome(false);
        safeNavigate(() => {
          if (isCampaignBattle) {
            router.back();
          } else {
            router.replace('/(tabs)');
          }
        }, 300);
      }, 450);
    };

    finalize();
  }, [overlayOp, restoreBattleState, returningHome, safeNavigate, isCampaignBattle, victory, campaignNodeId]);

  // Tick-log playback: consume each entry in battleLogRef, apply events to UI.
  const playTick = useCallback((tickEntry: BattleTick) => {
    if (!tickEntry || !Array.isArray(tickEntry.events)) return;
    const selfId = selfByteIdRef.current;
    const enemyName = enemy.name;
    const enemyMax = Math.max(1, enemy.maxHp);
    for (const ev of tickEntry.events) {
      switch (ev.type) {
        case 'damage': {
          const dmg = Math.round(Number(ev.damage || 0));
          const targetIsSelf = ev.target === selfId;
          if (targetIsSelf) {
            const next = Math.max(0, playerHpRef.current - dmg);
            playerHpRef.current = next;
            setPlayerHp(next);
            Animated.timing(playerHpAnim, { toValue: next / PLAYER_MAX_HP, duration: 400, useNativeDriver: false }).start();
            addDamage(dmg, 'left');
            lunge(enemyX, -1);
            setLog(`${enemyName} strikes${ev.isUlt ? ' with ULT' : ''}! -${dmg}`);
          } else {
            const next = Math.max(0, enemyHpRef.current - dmg);
            enemyHpRef.current = next;
            setEnemyHp(next);
            Animated.timing(enemyHpAnim, { toValue: next / enemyMax, duration: 400, useNativeDriver: false }).start();
            addDamage(dmg, 'right');
            projectileAttack();
            setLog(`${ev.isUlt ? 'ULT unleashed! ' : ''}${pickMoveFlavor(ev.move, 'Damage', ev.isUlt)} -${dmg}`);
          }
          break;
        }
        case 'miss':
          setLog(`${ev.actor === selfId ? 'Your attack' : enemyName + "'s attack"} missed.`);
          break;
        case 'dodge':
          setLog(`${ev.target === selfId ? 'You dodged' : enemyName + ' dodged'}! (${ev.passive || 'passive'})`);
          break;
        case 'hot':
        case 'passive_heal': {
          const heal = Math.round(Number(ev.heal || 0));
          if (ev.target === selfId) {
            const next = Math.min(PLAYER_MAX_HP, playerHpRef.current + heal);
            playerHpRef.current = next;
            setPlayerHp(next);
            Animated.timing(playerHpAnim, { toValue: next / PLAYER_MAX_HP, duration: 220, useNativeDriver: false }).start();
          } else {
            const next = Math.min(enemyMax, enemyHpRef.current + heal);
            enemyHpRef.current = next;
            setEnemyHp(next);
            Animated.timing(enemyHpAnim, { toValue: next / enemyMax, duration: 220, useNativeDriver: false }).start();
          }
          if (ev.type === 'passive_heal') setLog(`${ev.passive || 'Passive'} regen: +${heal}`);
          break;
        }
        case 'dot': {
          const dmg = Math.round(Number(ev.damage || 0));
          if (ev.target === selfId) {
            const next = Math.max(0, playerHpRef.current - dmg);
            playerHpRef.current = next;
            setPlayerHp(next);
            Animated.timing(playerHpAnim, { toValue: next / PLAYER_MAX_HP, duration: 300, useNativeDriver: false }).start();
            addDamage(dmg, 'left');
          } else {
            const next = Math.max(0, enemyHpRef.current - dmg);
            enemyHpRef.current = next;
            setEnemyHp(next);
            Animated.timing(enemyHpAnim, { toValue: next / enemyMax, duration: 300, useNativeDriver: false }).start();
            addDamage(dmg, 'right');
          }
          setLog('Status damage ticks.');
          break;
        }
        case 'self_dot': {
          const dmg = Math.round(Number(ev.damage || 0));
          if (ev.actor === selfId) {
            const next = Math.max(0, playerHpRef.current - dmg);
            playerHpRef.current = next;
            setPlayerHp(next);
            Animated.timing(playerHpAnim, { toValue: next / PLAYER_MAX_HP, duration: 250, useNativeDriver: false }).start();
          }
          setLog(`Corrupt backlash: -${dmg}`);
          break;
        }
        case 'status_applied':
          setLog(`Status: ${ev.status || 'applied'} (${ev.duration || '?'}t)`);
          break;
        case 'buff':
          setLog(`Buff applied: ${ev.effect || ''}`);
          break;
        case 'debuff':
          setLog(`Debuff applied: ${ev.effect || ''}`);
          break;
        case 'cleanse':
          setLog('Status cleansed.');
          break;
        case 'passive_buff':
          setLog(`${ev.passive || 'Passive'} buff: ${ev.effect || ''}`);
          break;
        case 'shocked':
          setLog(ev.actor === selfId ? 'Shocked!' : `${enemyName} shocked!`);
          break;
        case 'stunned':
          setLog(ev.actor === selfId ? 'Stunned!' : `${enemyName} is stunned.`);
          break;
        case 'action_delay':
          setLog('Hesitation delays action.');
          break;
        case 'confused_fail':
          setLog('Confused — attack faltered.');
          break;
        case 'mercy_proc':
          setLog('Mercy proc! Survived lethal blow.');
          break;
        default:
          break;
      }
    }
  }, [addDamage, enemy.maxHp, enemy.name, enemyHpAnim, enemyX, lunge, playerHpAnim, projectileAttack]);

  // Mount: load loadout, run backend battle, start tick playback.
  useEffect(() => {
    let cancelled = false;
    loadBattleProfile().catch(() => {});
    Animated.loop(
      Animated.sequence([
        Animated.timing(enemyGlow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(enemyGlow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    Animated.timing(timerAnim, { toValue: 0, duration: 60000, useNativeDriver: false }).start();

    (async () => {
      try {
        const res: any = await startBattle('ai');
        if (cancelled) return;
        const maxHpB = Math.round(Number(res?.maxHpB || 120));
        const opp = res?.opponent || {};
        setEnemy({
          name: opp.name || 'Rogue.exe',
          level: Number(opp.level || 1),
          maxHp: maxHpB,
          moves: Array.isArray(opp.equippedMoves) && opp.equippedMoves.length
            ? opp.equippedMoves
            : DEFAULT_ENEMY_MOVES,
        });
        enemyHpRef.current = maxHpB;
        setEnemyHp(maxHpB);
        selfByteIdRef.current = res?.self?.byteId || '';
        opponentByteIdRef.current = opp.byteId || '';
        setBattleId(res?.battleId || null);
        battleLogRef.current = Array.isArray(res?.battleLog) ? res.battleLog : [];
        battleResolvedRef.current = {
          winner: (res?.winner as 'A' | 'B' | 'draw') || 'draw',
          earned: Number(res?.earned || 0),
        };
        setEarnedBits(Number(res?.earned || 34));
        setLog(`Battle begins! ${res?.self?.name || 'MissingNo'} vs ${opp.name || 'Rogue.exe'}!`);

        playbackCursorRef.current = 0;
        if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = setInterval(() => {
          if (battleOverRef.current) return;
          const cursor = playbackCursorRef.current;
          const logArr = battleLogRef.current;
          if (cursor >= logArr.length) {
            const resolved = battleResolvedRef.current;
            endBattle(resolved ? resolved.winner === 'A' : playerHpRef.current >= enemyHpRef.current);
            return;
          }
          playTick(logArr[cursor]);
          playbackCursorRef.current = cursor + 1;
        }, TICK_MS);
      } catch {
        if (cancelled) return;
        setLog('Battle sync failed. Fallback mode.');
        setEarnedBits(34);
      }
    })();

    return () => {
      cancelled = true;
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety net — if playback hangs, force resolve from backend winner.
  useEffect(() => {
    const killSwitch = setTimeout(() => {
      if (battleOverRef.current) return;
      const resolved = battleResolvedRef.current;
      setLog('Battle timeout. Resolving from backend result.');
      endBattle(resolved ? resolved.winner === 'A' : playerHpRef.current >= enemyHpRef.current);
    }, 70000);
    return () => clearTimeout(killSwitch);
  }, [endBattle]);

  const queueUlt = async () => {
    if (!equippedUlt || ultUsedRef.current) {
      setLog('No ult available for this loadout.');
      return;
    }
    queuedUltRef.current = true;
    setLog(`Ult suggestion queued: ${equippedUlt.name || equippedUlt.id}.`);
    if (battleId) {
      try {
        await suggestBattleUlt(battleId);
      } catch {}
    }
  };

  const glowOp = enemyGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });
  const pHpColor = playerHpAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: ['#ff2222', '#ffaa00', '#44ff44'] });
  const eHpColor = enemyHpAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: ['#ff2222', '#ffaa00', '#ff6622'] });
  const timerColor = timerAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: ['#ff2222', '#ffaa00', '#44aaff'] });
  const pHpWidth = playerHpAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const eHpWidth = enemyHpAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const timerWidth = timerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <ImageBackground source={require('../../assets/backgrounds/battleground.png')} style={styles.bg} resizeMode="cover">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
            <Text style={styles.hpLabel}>{enemy.name} Lv.{enemy.level}</Text>
            <Text style={styles.hpVal}>{enemyHp}/{enemy.maxHp}</Text>
          </View>
          <View style={styles.hpTrack}>
            <Animated.View style={[styles.hpFill, { width: eHpWidth, backgroundColor: eHpColor }]} />
          </View>
          <Text style={styles.passiveText}>Passive: {equippedPassive || 'None'} | Ult: {equippedUlt?.name || 'None'}</Text>
          <Text style={styles.readinessText}>{readinessText}</Text>
          {corruptionDisplay && corruptionDisplay.tier !== 'none' && (
            <Text style={[styles.readinessText, { color: CORRUPTION_TIER_COLOR[corruptionDisplay.tier] || '#888' }]}>
              Corruption: {corruptionDisplay.value} — {corruptionDisplay.tier.toUpperCase()}
            </Text>
          )}
        </View>

        <View style={styles.field}>
          <View style={styles.byteSlot}>
            <Animated.View style={{ transform: [{ translateX: playerX }] }}>
              <Image source={playerSprite} style={styles.sprite} resizeMode="contain" />
            </Animated.View>
            {damages.filter((d) => d.side === 'left').map((d) => <DamageNumber key={d.id} value={d.value} side="left" />)}
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
            {damages.filter((d) => d.side === 'right').map((d) => <DamageNumber key={d.id} value={d.value} side="right" />)}
          </View>

          {floatingTexts.map((ft) => (
            <FloatingText key={ft.id} text={ft.text} emoji={ft.emoji} />
          ))}
        </View>

        <View style={styles.movesRow}>
          {equippedMoves.slice(0, 2).map((move, i) => (
            <View key={move.id} style={[styles.moveBtn, styles.moveDisplay]}>
              <Text style={styles.moveName}>{move.name || move.id}</Text>
            </View>
          ))}
        </View>

        <View style={styles.logBox}>
          <Text style={styles.logText}>{log}</Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={async () => {
              const cheer = rnd(CHEER_LOGS);
              setLog(cheer);
              addFloatingText(cheer, '📢');
              if (battleId) {
                try {
                  const res = await cheerBattle(battleId);
                } catch {}
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.controlLabel}>Cheer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => {
              const taunt = rnd(TAUNT_LOGS);
              setLog(taunt);
              addFloatingText(taunt, '😤');
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.controlLabel}>Taunt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={queueUlt} activeOpacity={0.7}>
            <Text style={styles.controlLabel}>Suggest Ult</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={() => router.push('/(tabs)/inventory')} activeOpacity={0.7}>
            <Text style={styles.controlLabel}>Items</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {victory !== null && (
        <Animated.View style={[styles.overlay, { opacity: overlayOp }]}>
          <TouchableOpacity style={styles.overlayInner} onPress={handleVictoryTap} activeOpacity={0.9}>
            <Text style={[styles.overlayTitle, { color: victory ? '#ffe566' : '#ff4444' }]}>
              {victory ? 'VICTORY' : 'DEFEATED'}
            </Text>
            <Text style={styles.overlaySub}>{victory ? `+25 rating  +${earnedBits} bits` : '-20 rating  +8 bits'}</Text>
            <Text style={styles.overlayTap}>Tap to return home</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1 },
  timerTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row' },
  timerFill: { height: 4 },
  hpSection: { paddingHorizontal: 14, paddingTop: 8, gap: 3 },
  hpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hpLabel: { color: '#cce4ff', fontSize: 11, fontWeight: '700' },
  hpVal: { color: 'rgba(255,255,255,0.45)', fontSize: 10 },
  hpTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 5,
  },
  hpFill: { borderRadius: 5 },
  passiveText: { color: '#9edcff', fontSize: 10, marginTop: 2 },
  readinessText: { color: 'rgba(208,236,255,0.82)', fontSize: 9.5, marginTop: 1 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 10 },
  byteSlot: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  sprite: { width: width * 0.36, height: width * 0.36, backgroundColor: 'transparent' },
  glowRing: { position: 'absolute', width: width * 0.38, height: width * 0.38, borderRadius: 999, backgroundColor: '#ff5500' },
  fireball: { position: 'absolute', width: 48, height: 48, left: width * 0.18, backgroundColor: 'transparent' },
  damageNum: {
    position: 'absolute',
    top: -10,
    fontSize: 26,
    fontWeight: '900',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  movesRow: { flexDirection: 'row', paddingHorizontal: 10, gap: 8, marginBottom: 6 },
  moveBtn: {
    flex: 1,
    backgroundColor: 'rgba(10,25,70,0.88)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.35)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moveName: { flex: 1, color: '#cce4ff', fontSize: 12, fontWeight: '700' },
  moveDisplay: { opacity: 0.6, borderColor: 'rgba(80,160,255,0.15)' },
  floatingText: { position: 'absolute', alignItems: 'center', gap: 4, top: width * 0.15 },
  floatingEmoji: { fontSize: 36 },
  floatingTextLabel: { fontSize: 13, fontWeight: '800', color: '#ffd45a', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  logBox: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(8,20,60,0.88)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.3)',
    padding: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  logText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  controls: { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 8, gap: 6 },
  controlBtn: {
    flex: 1,
    backgroundColor: 'rgba(10,25,70,0.88)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.3)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  controlLabel: { color: '#cce4ff', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,20,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayInner: { alignItems: 'center', gap: 12, padding: 40 },
  overlayTitle: { fontSize: 48, fontWeight: '900', letterSpacing: 2 },
  overlaySub: { color: '#aaddff', fontSize: 16, fontWeight: '600' },
  overlayTap: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 20 },
});