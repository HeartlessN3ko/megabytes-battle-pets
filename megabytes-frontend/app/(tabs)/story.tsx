import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCampaignProgress, startCampaign, getCurrentCommunityEvent, getCommunityEventStatus, claimCommunityEventReward } from '../../services/api';

export default function StoryScreen() {
  const router = useRouter();
  const [campaign, setCampaign] = useState<any>(null);
  const [communityEvent, setCommunityEvent] = useState<any>(null);
  const [eventStatus, setEventStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claimingReward, setClaimingReward] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigation debounce to prevent accidental double-navigation
  const navLock = useRef(false);
  const safeNavigate = useCallback((fn: () => void, delay = 300) => {
    if (navLock.current) return;
    navLock.current = true;
    fn();
    setTimeout(() => { navLock.current = false; }, delay);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadCampaign();
    }, [])
  );

  const loadCampaign = async () => {
    try {
      setLoading(true);
      setError(null);
      const [campaignData, eventData] = await Promise.all([
        getCampaignProgress(),
        getCurrentCommunityEvent()
      ]);
      setCampaign(campaignData.campaign);
      if (eventData.event) {
        setCommunityEvent(eventData.event);
        const statusData = await getCommunityEventStatus(eventData.event._id);
        setEventStatus(statusData);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimReward = async () => {
    if (!communityEvent) return;
    try {
      setClaimingReward(true);
      await claimCommunityEventReward(communityEvent._id);
      // Reload event status after claiming
      const statusData = await getCommunityEventStatus(communityEvent._id);
      setEventStatus(statusData);
    } catch (err: any) {
      setError(err?.message || 'Failed to claim reward');
    } finally {
      setClaimingReward(false);
    }
  };

  const handleStartCampaign = async () => {
    try {
      const data = await startCampaign();
      setCampaign(data.campaign);
    } catch (err: any) {
      setError(err?.message || 'Failed to start campaign');
    }
  };

  const handleSelectNode = (nodeId: number) => {
    safeNavigate(() => {
      router.push({
        pathname: '/campaign/node',
        params: { nodeId },
      });
    }, 300);
  };

  if (loading) {
    return (
      <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <ActivityIndicator size="large" color="#7ec8ff" />
        </SafeAreaView>
      </ImageBackground>
    );
  }

  if (!campaign) {
    return (
      <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
          <ScrollView showsVerticalScrollIndicator={false} style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.title}>CAMPAIGN</Text>
              <Text style={styles.subtitle}>Packet City Defense</Text>
            </View>

            <View style={styles.introBlock}>
              <Text style={styles.introText}>
                Slopitron.exe is corrupting Packet City. Rise as a defender and clear the network.
              </Text>
            </View>

            <TouchableOpacity style={styles.startBtn} onPress={handleStartCampaign}>
              <Ionicons name="play-outline" size={18} color="#d9efff" />
              <Text style={styles.startBtnText}>START CAMPAIGN</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const progressPercent = (campaign.highestNodeReached / 100) * 100;

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ScrollView showsVerticalScrollIndicator={false} style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>CAMPAIGN</Text>
            <Text style={styles.subtitle}>Packet City Defense</Text>
          </View>

          {communityEvent && eventStatus && (
            <View style={[styles.eventBanner, communityEvent.status === 'completed' && styles.eventBannerComplete]}>
              <View style={styles.eventHeader}>
                <Ionicons name="earth-outline" size={16} color={communityEvent.status === 'completed' ? '#7cffb2' : '#ffd45a'} />
                <Text style={styles.eventTitle}>{communityEvent.name}</Text>
              </View>
              <Text style={styles.eventDesc}>{communityEvent.description}</Text>

              <View style={styles.eventProgressContainer}>
                <View style={styles.eventProgressTrack}>
                  <View style={[styles.eventProgressFill, { width: `${eventStatus.progressPercent}%` }]} />
                </View>
                <Text style={styles.eventProgressText}>
                  {communityEvent.currentProgress} / {communityEvent.targetProgress}
                </Text>
              </View>

              {communityEvent.status === 'completed' && !eventStatus.claimedCount && (
                <TouchableOpacity
                  style={styles.claimBtn}
                  onPress={handleClaimReward}
                  disabled={claimingReward}
                >
                  <Ionicons name="gift-outline" size={14} color="#7cffb2" />
                  <Text style={styles.claimBtnText}>{claimingReward ? 'CLAIMING...' : 'CLAIM REWARD'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.progressBlock}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>PROGRESS</Text>
              <Text style={styles.progressValue}>{campaign.highestNodeReached}/100</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.progressHint}>
              {campaign.challengeModeUnlocked ? 'Challenge Mode Unlocked' : 'Challenge Mode at Node 50'}
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>COMPLETED</Text>
              <Text style={styles.statValue}>{campaign.nodesCompleted}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>FAILED</Text>
              <Text style={styles.statValue}>{campaign.nodesFailed}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>WIN STREAK</Text>
              <Text style={styles.statValue}>{campaign.currentWinStreak}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>BEST STREAK</Text>
              <Text style={styles.statValue}>{campaign.longestWinStreak}</Text>
            </View>
          </View>

          <View style={styles.nodeMapBlock}>
            <Text style={styles.nodeMapTitle}>NODE MAP</Text>
            <Text style={styles.nodeMapHint}>Tap a node to attempt. Placeholder graphics.</Text>

            <View style={styles.nodeGridContainer}>
              {Array.from({ length: 100 }, (_, i) => {
                const nodeNum = i + 1;
                const isCleared = campaign.nodeHistory.some((h: any) => h.nodeId === nodeNum && h.completedAt);
                const isAccessible = nodeNum === 1; // TEMP: Only node 1 available for demo
                const isAvailable = nodeNum === 1;

                return (
                  <TouchableOpacity
                    key={nodeNum}
                    style={[
                      styles.nodeCell,
                      isCleared && styles.nodeCellCleared,
                      !isAccessible && styles.nodeCellLocked,
                      isAvailable && styles.nodeCellActive,
                    ]}
                    onPress={() => isAccessible && handleSelectNode(nodeNum)}
                    disabled={!isAccessible}
                  >
                    <Text style={[styles.nodeCellText, isAccessible && styles.nodeCellTextActive]}>
                      {nodeNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '900', color: '#d9efff', letterSpacing: 2 },
  subtitle: { fontSize: 12, color: 'rgba(212,238,255,0.7)', marginTop: 2, letterSpacing: 1 },

  introBlock: {
    backgroundColor: 'rgba(80,160,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.2)',
    padding: 14,
    marginBottom: 16,
  },
  introText: { fontSize: 13, color: 'rgba(212,238,255,0.85)', lineHeight: 18 },

  startBtn: {
    backgroundColor: 'rgba(126,200,255,0.2)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7ec8ff',
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  startBtnText: { fontSize: 13, fontWeight: '900', color: '#d9efff', letterSpacing: 1.2 },

  progressBlock: {
    backgroundColor: 'rgba(30,50,100,0.4)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(212,238,255,0.7)', letterSpacing: 1 },
  progressValue: { fontSize: 13, fontWeight: '900', color: '#7ec8ff' },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%', backgroundColor: '#7ec8ff' },
  progressHint: { fontSize: 10, color: 'rgba(212,238,255,0.6)' },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: 'rgba(50,70,130,0.3)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(126,200,255,0.15)',
    padding: 12,
    alignItems: 'center',
  },
  statLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(212,238,255,0.6)', letterSpacing: 0.8 },
  statValue: { fontSize: 18, fontWeight: '900', color: '#7ec8ff', marginTop: 4 },

  nodeMapBlock: { marginBottom: 20 },
  nodeMapTitle: { fontSize: 13, fontWeight: '900', color: '#d9efff', marginBottom: 6, letterSpacing: 1 },
  nodeMapHint: { fontSize: 10, color: 'rgba(212,238,255,0.6)', marginBottom: 10 },

  nodeGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  nodeCell: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeCellActive: {
    borderColor: '#7ec8ff',
    backgroundColor: 'rgba(126,200,255,0.1)',
  },
  nodeCellCleared: {
    borderColor: '#7cffb2',
    backgroundColor: 'rgba(124,255,178,0.1)',
  },
  nodeCellLocked: {
    opacity: 0.4,
  },
  nodeCellText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
  },
  nodeCellTextActive: {
    color: '#7ec8ff',
  },

  eventBanner: {
    backgroundColor: 'rgba(255,212,90,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,212,90,0.25)',
    padding: 14,
    marginBottom: 16,
  },
  eventBannerComplete: {
    backgroundColor: 'rgba(124,255,178,0.1)',
    borderColor: 'rgba(124,255,178,0.25)',
  },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  eventTitle: { fontSize: 13, fontWeight: '900', color: '#ffd45a', letterSpacing: 1 },
  eventDesc: { fontSize: 11, color: 'rgba(212,238,255,0.8)', marginBottom: 12, lineHeight: 16 },

  eventProgressContainer: { marginBottom: 12 },
  eventProgressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  eventProgressFill: { height: '100%', backgroundColor: '#ffd45a' },
  eventProgressText: { fontSize: 10, fontWeight: '700', color: 'rgba(212,238,255,0.7)', textAlign: 'right' },

  claimBtn: {
    backgroundColor: 'rgba(124,255,178,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7cffb2',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  claimBtnText: { fontSize: 12, fontWeight: '800', color: '#7cffb2', letterSpacing: 0.8 },

  errorText: { color: '#ff6060', fontSize: 12, marginTop: 10, textAlign: 'center' },
});
