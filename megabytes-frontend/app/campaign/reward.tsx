import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function CampaignRewardScreen() {
  const router = useRouter();
  const { nodeId, grade } = useLocalSearchParams<{ nodeId: string; grade: string }>();

  const gradeColors: Record<string, string> = {
    perfect: '#7cffb2',
    good: '#7ec8ff',
    ok: '#ffba47',
    fail: '#ff6060',
  };

  const gradeEmoji: Record<string, string> = {
    perfect: '🌟',
    good: '⭐',
    ok: '✓',
    fail: '✗',
  };

  const handleContinue = () => {
    router.replace('/(tabs)/story');
  };

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.container}>
          <View style={styles.gradeBlock}>
            <Text style={styles.gradeEmoji}>{gradeEmoji[grade || 'ok']}</Text>
            <Text style={[styles.gradeText, { color: gradeColors[grade || 'ok'] }]}>
              {(grade || 'ok').toUpperCase()}
            </Text>
          </View>

          <View style={styles.rewardCardsContainer}>
            <View style={styles.rewardCard}>
              <Ionicons name="flash-outline" size={24} color="#ffd45a" />
              <Text style={styles.rewardLabel}>XP EARNED</Text>
              <Text style={styles.rewardAmount}>+125</Text>
            </View>

            <View style={styles.rewardCard}>
              <Ionicons name="logo-bitcoin" size={24} color="#ffd45a" />
              <Text style={styles.rewardLabel}>BYTEBITS</Text>
              <Text style={styles.rewardAmount}>+50</Text>
            </View>

            <View style={styles.rewardCard}>
              <Ionicons name="cube-outline" size={24} color="#7ec8ff" />
              <Text style={styles.rewardLabel}>ITEMS</Text>
              <Text style={styles.rewardAmount}>0</Text>
            </View>
          </View>

          <View style={styles.nextNodeBlock}>
            <Text style={styles.nextNodeLabel}>NEXT NODE</Text>
            <Text style={styles.nextNodeValue}>{parseInt(nodeId || '1', 10) + 1}</Text>
          </View>

          <TouchableOpacity style={styles.continueBtn} onPress={handleContinue}>
            <Text style={styles.continueBtnText}>CONTINUE</Text>
            <Ionicons name="arrow-forward-outline" size={16} color="#d9efff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' },
  gradeBlock: { alignItems: 'center', marginBottom: 30 },
  gradeEmoji: { fontSize: 60, marginBottom: 10 },
  gradeText: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },

  rewardCardsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 30,
  },
  rewardCard: {
    flex: 1,
    backgroundColor: 'rgba(50,70,130,0.3)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.15)',
    padding: 12,
    alignItems: 'center',
  },
  rewardLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(212,238,255,0.6)', marginTop: 6, letterSpacing: 0.8 },
  rewardAmount: { fontSize: 16, fontWeight: '900', color: '#7ec8ff', marginTop: 4 },

  nextNodeBlock: {
    backgroundColor: 'rgba(80,160,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.2)',
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  nextNodeLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(212,238,255,0.7)', letterSpacing: 1 },
  nextNodeValue: { fontSize: 22, fontWeight: '900', color: '#7ec8ff', marginTop: 4 },

  continueBtn: {
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
  continueBtnText: { fontSize: 13, fontWeight: '900', color: '#d9efff', letterSpacing: 1.2 },
});
