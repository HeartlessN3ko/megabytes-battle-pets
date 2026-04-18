import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getPlayerAchievements } from '../../services/api';
import { getDemoSessionHeaders } from '../../services/demoSession';
import { playSfx } from '../../services/sfx';

const RARITY_COLORS: Record<string, string> = {
  common:    '#7ec8ff',
  uncommon:  '#7cffb2',
  rare:      '#ffd45a',
  epic:      '#ff9ef5',
  legendary: '#ff6060',
};

interface AchievementItem {
  _id: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  reward: { byteBits: number; xp: number };
  unlocked: boolean;
}

export default function AchievementsScreen() {
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [unlockedCount, setUnlockedCount] = useState(0);
  const isDemo = getDemoSessionHeaders()['x-is-demo'] === 'true';
  const twinkleFired = React.useRef(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPlayerAchievements();
      setAchievements(data.achievements || []);
      const count = data.unlockedCount || 0;
      setUnlockedCount(count);
      if (count > 0 && !twinkleFired.current) {
        twinkleFired.current = true;
        playSfx('ui_twinkle', 0.7);
        playSfx('confetti', 0.6);
      }
    } catch {
      // silent — empty state shown
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unlocked = achievements.filter(a => a.unlocked);
  const locked   = achievements.filter(a => !a.unlocked);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={styles.header}>
        <Text style={styles.title}>ACHIEVEMENTS</Text>
      </View>

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
            {achievements.length > 0
              ? Math.round((unlockedCount / achievements.length) * 100)
              : 0}%
          </Text>
        </View>
      </View>

      {isDemo && (
        <View style={styles.demoNotice}>
          <Ionicons name="alert-circle-outline" size={14} color="#ffe18e" />
          <Text style={styles.demoNoticeText}>
            Achievements do not track in demo mode
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#7ec8ff" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {unlocked.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>UNLOCKED ({unlocked.length})</Text>
              {unlocked.map(a => (
                <AchievementCard key={a._id} achievement={a} unlocked />
              ))}
            </View>
          )}
          {locked.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>LOCKED ({locked.length})</Text>
              {locked.map(a => (
                <AchievementCard key={a._id} achievement={a} unlocked={false} />
              ))}
            </View>
          )}
          {/* Bottom spacer clears HomeNavBar */}
          <View style={{ height: 90 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function AchievementCard({
  achievement,
  unlocked,
}: {
  achievement: AchievementItem;
  unlocked: boolean;
}) {
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
          <Text
            style={[
              styles.cardName,
              { color: unlocked ? rarityColor : 'rgba(212,238,255,0.6)' },
            ]}
          >
            {achievement.name}
          </Text>
          <Text style={[styles.cardRarity, { color: rarityColor }]}>
            {achievement.rarity.toUpperCase()}
          </Text>
        </View>
        <Text
          style={[
            styles.cardDesc,
            { color: unlocked ? 'rgba(212,238,255,0.8)' : 'rgba(212,238,255,0.5)' },
          ]}
        >
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

  header: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(80,160,255,0.15)',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#d9efff', letterSpacing: 1.5 },

  statsBlock: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 14,
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(80,160,255,0.15)',
  },
  statItem:    { alignItems: 'center' },
  statLabel:   { fontSize: 10, fontWeight: '700', color: 'rgba(212,238,255,0.6)', letterSpacing: 0.8, marginBottom: 4 },
  statValue:   { fontSize: 18, fontWeight: '900', color: '#7ec8ff' },
  statDivider: { width: 1, backgroundColor: 'rgba(80,160,255,0.2)', alignSelf: 'stretch' },

  demoNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,225,142,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,225,142,0.2)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    margin: 14,
  },
  demoNoticeText: { fontSize: 11, fontWeight: '600', color: '#ffe18e', flexShrink: 1 },

  list:        { flex: 1, paddingHorizontal: 14, paddingTop: 16 },
  section:     { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(212,238,255,0.7)',
    letterSpacing: 1,
    marginBottom: 12,
  },

  card:        { borderRadius: 10, padding: 12, marginBottom: 10, flexDirection: 'row', gap: 12, borderWidth: 1 },
  cardUnlocked: { backgroundColor: 'rgba(126,200,255,0.08)', borderColor: 'rgba(126,200,255,0.2)' },
  cardLocked:   { backgroundColor: 'rgba(50,70,130,0.2)',    borderColor: 'rgba(50,70,130,0.3)' },
  cardIcon:     { width: 48, height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  cardContent:  { flex: 1, justifyContent: 'center' },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardName:     { fontSize: 13, fontWeight: '800', flex: 1 },
  cardRarity:   { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  cardDesc:     { fontSize: 11, fontWeight: '500', lineHeight: 16, marginBottom: 6 },
  cardReward:   { flexDirection: 'row', gap: 8 },
  rewardText:   { fontSize: 10, fontWeight: '700', color: '#7cffb2' },
});
