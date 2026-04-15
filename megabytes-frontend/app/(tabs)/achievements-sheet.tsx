import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPlayerAchievements } from '../../services/api';
import { getDemoSessionHeaders } from '../../services/demoSession';

const RARITY_COLORS: Record<string, string> = {
  common: '#7ec8ff',
  uncommon: '#7cffb2',
  rare: '#ffd45a',
  epic: '#ff9ef5',
  legendary: '#ff6060'
};

interface AchievementItem {
  _id: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  reward: { byteBits: number; xp: number };
  unlocked: boolean;
  unlockedAt?: string;
}

interface AchievementsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function AchievementsSheet({ visible, onClose }: AchievementsSheetProps) {
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [unlockedCount, setUnlockedCount] = useState(0);

  useEffect(() => {
    if (visible) {
      loadAchievements();
    }
  }, [visible]);

  const loadAchievements = async () => {
    try {
      setLoading(true);
      const data = await getPlayerAchievements();
      setAchievements(data.achievements || []);
      setUnlockedCount(data.unlockedCount || 0);
    } catch (err: any) {
      console.error('Failed to load achievements:', err);
    } finally {
      setLoading(false);
    }
  };

  const unlockedAchievements = achievements.filter((a) => a.unlocked);
  const lockedAchievements = achievements.filter((a) => !a.unlocked);
  const isDemo = getDemoSessionHeaders()['x-is-demo'] === 'true';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn}>
              <Ionicons name="arrow-back-outline" size={20} color="#7ec8ff" />
            </TouchableOpacity>
            <Text style={styles.title}>ACHIEVEMENTS</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Progress stats */}
          <View style={styles.statsBlock}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>UNLOCKED</Text>
              <Text style={styles.statValue}>{unlockedCount}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>TOTAL</Text>
              <Text style={styles.statValue}>{achievements.length}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>PROGRESS</Text>
              <Text style={styles.statValue}>
                {achievements.length > 0 ? Math.round((unlockedCount / achievements.length) * 100) : 0}%
              </Text>
            </View>
          </View>

          {isDemo && (
            <View style={styles.demoNotice}>
              <Ionicons name="alert-circle-outline" size={14} color="#ffe18e" />
              <Text style={styles.demoNoticeText}>Achievements do not track in demo mode</Text>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#7ec8ff" />
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {/* Unlocked section */}
              {unlockedAchievements.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>UNLOCKED ({unlockedAchievements.length})</Text>
                  {unlockedAchievements.map((achievement) => (
                    <AchievementCard key={achievement._id} achievement={achievement} unlocked />
                  ))}
                </View>
              )}

              {/* Locked section */}
              {lockedAchievements.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>LOCKED ({lockedAchievements.length})</Text>
                  {lockedAchievements.map((achievement) => (
                    <AchievementCard key={achievement._id} achievement={achievement} unlocked={false} />
                  ))}
                </View>
              )}

              <View style={styles.bottomSpacer} />
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function AchievementCard({ achievement, unlocked }: { achievement: AchievementItem; unlocked: boolean }) {
  const rarityColor = RARITY_COLORS[achievement.rarity] || '#7ec8ff';

  return (
    <View style={[styles.card, unlocked ? styles.cardUnlocked : styles.cardLocked]}>
      <View style={styles.cardIcon}>
        <Ionicons
          name={unlocked ? 'star' : 'lock-closed-outline'}
          size={24}
          color={unlocked ? rarityColor : 'rgba(212,238,255,0.4)'}
        />
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardName, { color: unlocked ? rarityColor : 'rgba(212,238,255,0.6)' }]}>
            {achievement.name}
          </Text>
          <Text style={[styles.cardRarity, { color: rarityColor }]}>
            {achievement.rarity.toUpperCase()}
          </Text>
        </View>

        <Text style={[styles.cardDesc, { color: unlocked ? 'rgba(212,238,255,0.8)' : 'rgba(212,238,255,0.5)' }]}>
          {achievement.description}
        </Text>

        {(achievement.reward.byteBits > 0 || achievement.reward.xp > 0) && (
          <View style={styles.cardReward}>
            {achievement.reward.byteBits > 0 && (
              <Text style={styles.rewardText}>+{achievement.reward.byteBits} BB</Text>
            )}
            {achievement.reward.xp > 0 && (
              <Text style={styles.rewardText}>+{achievement.reward.xp} XP</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'rgba(5,12,40,0.98)' },
  container: { flex: 1, paddingHorizontal: 14 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(80,160,255,0.15)' },
  title: { fontSize: 20, fontWeight: '900', color: '#d9efff', letterSpacing: 1.5 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },

  statsBlock: { flexDirection: 'row', paddingVertical: 16, justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: 'rgba(80,160,255,0.15)' },
  statItem: { alignItems: 'center' },
  statLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(212,238,255,0.6)', letterSpacing: 0.8, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '900', color: '#7ec8ff' },
  statDivider: { width: 1, backgroundColor: 'rgba(80,160,255,0.2)', alignSelf: 'stretch' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  list: { flex: 1, paddingVertical: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: 'rgba(212,238,255,0.7)', letterSpacing: 1, marginBottom: 12, paddingHorizontal: 2 },

  card: { borderRadius: 10, padding: 12, marginBottom: 10, flexDirection: 'row', gap: 12, borderWidth: 1 },
  cardUnlocked: { backgroundColor: 'rgba(126,200,255,0.08)', borderColor: 'rgba(126,200,255,0.2)' },
  cardLocked: { backgroundColor: 'rgba(50,70,130,0.2)', borderColor: 'rgba(50,70,130,0.3)' },

  cardIcon: { width: 48, height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },

  cardContent: { flex: 1, justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardName: { fontSize: 13, fontWeight: '800', flex: 1 },
  cardRarity: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  cardDesc: { fontSize: 11, fontWeight: '500', lineHeight: 16, marginBottom: 6 },

  cardReward: { flexDirection: 'row', gap: 8 },
  rewardText: { fontSize: 10, fontWeight: '700', color: '#7cffb2' },

  demoNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,225,142,0.12)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,225,142,0.2)', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
  demoNoticeText: { fontSize: 11, fontWeight: '600', color: '#ffe18e', flex: 1 },

  bottomSpacer: { height: 20 },
});
