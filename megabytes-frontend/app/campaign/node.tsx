import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { startCampaignNode, startBattle } from '../../services/api';

export default function CampaignNodeScreen() {
  const router = useRouter();
  const { nodeId } = useLocalSearchParams<{ nodeId: string }>();
  const [nodeConfig, setNodeConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation debounce to prevent accidental double-navigation
  const navLock = useRef(false);
  const safeNavigate = useCallback((fn: () => void, delay = 300) => {
    if (navLock.current) return;
    navLock.current = true;
    fn();
    setTimeout(() => { navLock.current = false; }, delay);
  }, []);

  const loadNode = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await startCampaignNode(parseInt(nodeId || '1', 10));
      setNodeConfig(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load node');
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    loadNode();
  }, [loadNode]);

  useFocusEffect(
    React.useCallback(() => {
      loadNode();
    }, [loadNode])
  );

  const handleStartBattle = async () => {
    try {
      setLoading(true);
      // Start campaign battle (Slopitron.exe hard mode)
      const battleData = await startBattle('campaign');
      safeNavigate(() => {
        router.push({
          pathname: '/(tabs)/battle',
          params: {
            campaignBattle: 'true',
            campaignNodeId: nodeId,
            battleId: battleData?.battleId || '',
          },
        });
      }, 300);
    } catch (err: any) {
      setError(err?.message || 'Failed to start battle');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <ActivityIndicator size="large" color="#7ec8ff" />
        </SafeAreaView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back-outline" size={20} color="#7ec8ff" />
            </TouchableOpacity>
            <Text style={styles.title}>NODE {nodeId}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.nodeInfoBlock}>
            <Text style={styles.nodeType}>{nodeConfig?.nodeType || 'PLACEHOLDER'}</Text>
            <Text style={styles.nodeDesc}>Battle Configuration</Text>
          </View>

          <View style={styles.enemiesBlock}>
            <Text style={styles.blockTitle}>ENEMIES</Text>
            {nodeConfig?.enemies?.map((enemy: any, idx: number) => (
              <View key={idx} style={styles.enemyCard}>
                <Text style={styles.enemyName}>{enemy.name}</Text>
                <Text style={styles.enemyLevel}>Level {enemy.level}</Text>
              </View>
            ))}
          </View>

          <View style={styles.rewardBlock}>
            <Text style={styles.blockTitle}>REWARD</Text>
            <View style={styles.rewardContent}>
              <Text style={styles.rewardText}>XP: {nodeConfig?.reward?.xp || 0}</Text>
              <Text style={styles.rewardText}>Bits: {nodeConfig?.reward?.byteBits || 0}</Text>
            </View>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity style={styles.startBattleBtn} onPress={handleStartBattle}>
            <Ionicons name="flash-outline" size={18} color="#d9efff" />
            <Text style={styles.startBattleBtnText}>ENTER BATTLE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: '#d9efff', letterSpacing: 1.5 },

  nodeInfoBlock: {
    backgroundColor: 'rgba(80,160,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.2)',
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  nodeType: { fontSize: 14, fontWeight: '900', color: '#7ec8ff', letterSpacing: 1 },
  nodeDesc: { fontSize: 11, color: 'rgba(212,238,255,0.7)', marginTop: 4 },

  enemiesBlock: {
    backgroundColor: 'rgba(50,70,130,0.3)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.15)',
    padding: 12,
    marginBottom: 16,
  },
  blockTitle: { fontSize: 11, fontWeight: '900', color: 'rgba(212,238,255,0.8)', letterSpacing: 1, marginBottom: 8 },
  enemyCard: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  enemyName: { fontSize: 12, fontWeight: '800', color: '#d9efff' },
  enemyLevel: { fontSize: 10, color: 'rgba(212,238,255,0.6)', marginTop: 2 },

  rewardBlock: {
    backgroundColor: 'rgba(124,255,178,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124,255,178,0.2)',
    padding: 12,
    marginBottom: 16,
  },
  rewardContent: { gap: 6 },
  rewardText: { fontSize: 12, fontWeight: '700', color: '#7cffb2' },

  startBattleBtn: {
    backgroundColor: 'rgba(126,200,255,0.2)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7ec8ff',
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  startBattleBtnText: { fontSize: 13, fontWeight: '900', color: '#d9efff', letterSpacing: 1.2 },

  errorText: { color: '#ff6060', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
});