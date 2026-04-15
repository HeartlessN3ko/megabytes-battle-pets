import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ImageBackground, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { buyMarketplaceNow, getMarketplaceListings, getPlayer, placeMarketplaceBid } from '../../services/api';

function listingEmoji(listing: any) {
  const name = String(listing?.itemName || listing?.title || '').toLowerCase();
  const text = `${name} ${String(listing?.description || '').toLowerCase()}`;
  if (text.includes('meat') || text.includes('meal') || text.includes('snack') || text.includes('food')) return '🍖';
  if (text.includes('wipe') || text.includes('scrub') || text.includes('clean') || text.includes('purge')) return '🧽';
  if (text.includes('charge') || text.includes('energy') || text.includes('bandwidth') || text.includes('overclock')) return '🔋';
  if (text.includes('vibe') || text.includes('mood') || text.includes('comfort') || text.includes('hype')) return '✨';
  if (text.includes('evo') || text.includes('core') || text.includes('kernel') || text.includes('module')) return '💠';
  if (text.includes('teach') || text.includes('move') || text.includes('combat')) return '📀';
  if (text.includes('field') || text.includes('protocol') || text.includes('utility')) return '🧩';
  return '📦';
}

export default function MarketplaceScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<any[]>([]);
  const [bits, setBits] = useState(0);
  const [playerId, setPlayerId] = useState('');
  const [status, setStatus] = useState('Syncing marketplace feed...');
  const [bidMap, setBidMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rows, player] = await Promise.all([getMarketplaceListings('open'), getPlayer()]);
      setListings(Array.isArray(rows) ? rows : []);
      setBits(Number(player?.byteBits || 0));
      setPlayerId(String(player?._id || ''));
      setStatus('Marketplace synchronized.');
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      setStatus(msg.includes('waking up') ? 'Server is waking up... marketplace sync retry soon.' : 'Marketplace sync failed.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalOpen = useMemo(() => listings.filter((row) => row.status === 'open').length, [listings]);

  const runBid = useCallback(
    async (listing: any) => {
      const text = bidMap[listing.id] || '';
      const amount = Number(text);
      if (!Number.isFinite(amount) || amount <= 0) {
        setStatus('Enter a valid bid amount.');
        return;
      }
      setBusyId(listing.id);
      setStatus(`Submitting bid for ${listing.itemName}...`);
      try {
        const result = await placeMarketplaceBid(listing.id, amount);
        setBits(Number(result?.byteBitsRemaining || bits));
        setStatus(`Bid accepted at ${amount} BB.`);
        await refresh();
      } catch (err: any) {
        setStatus(err?.message || 'Bid failed.');
      } finally {
        setBusyId(null);
      }
    },
    [bidMap, bits, refresh]
  );

  const runBuyNow = useCallback(
    async (listing: any) => {
      if (!listing.buyNowPrice || listing.buyNowPrice <= 0) {
        setStatus('Buy-now is not available for this listing.');
        return;
      }

      Alert.alert('Buy Now', `Buy ${listing.itemName} for ${listing.buyNowPrice} BB?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          onPress: async () => {
            setBusyId(listing.id);
            setStatus(`Purchasing ${listing.itemName}...`);
            try {
              const result = await buyMarketplaceNow(listing.id);
              setBits(Number(result?.byteBitsRemaining || bits));
              setStatus(
                result?.deliveryQueued === false
                  ? `${listing.itemName} purchased. Existing delivery already in Inbox.`
                  : `${listing.itemName} purchased. Delivery sent to Inbox.`
              );
              await refresh();
            } catch (err: any) {
              setStatus(err?.message || 'Buy-now failed.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [bits, refresh]
  );

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={styles.backText}>BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>MARKETPLACE</Text>
        <Text style={styles.sub}>Auction + buy-now exchange</Text>
        <Text style={styles.bits}>{bits.toLocaleString()} ByteBits</Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusText}>{status}</Text>
          <Text style={styles.statusMeta}>{totalOpen} active listings</Text>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.grid}>
          {listings.map((listing) => {
            const isBusy = busyId === listing.id;
            return (
              <View key={listing.id} style={styles.card}>
                <View style={styles.itemArt}>
                  <Text style={styles.itemEmoji}>{listingEmoji(listing)}</Text>
                </View>
                <Text style={styles.itemName}>{listing.itemName}</Text>
                <Text style={styles.itemMeta}>{listing.title}</Text>
                <Text style={styles.itemDesc}>{listing.description || 'Auction listing.'}</Text>
                {playerId && listing.highestBidderId === playerId ? (
                  <Text style={styles.leadingTag}>YOU ARE CURRENTLY LEADING</Text>
                ) : null}
                <View style={styles.priceRow}>
                  <Text style={styles.priceText}>Current: {Number(listing.currentBid || 0)} BB</Text>
                  <Text style={styles.priceText}>Min: {Number(listing.nextMinBid || 0)} BB</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceText}>Buy now: {Number(listing.buyNowPrice || 0)} BB</Text>
                  <Text style={styles.endsText}>Ends: {new Date(listing.endsAt).toLocaleString()}</Text>
                </View>
                <Text style={styles.bidMeta}>Bids: {Number(listing.bidCount || 0)}</Text>
                {Array.isArray(listing.recentBids) && listing.recentBids.length > 0 ? (
                  <View style={styles.bidHistory}>
                    {listing.recentBids.map((bid: any, idx: number) => (
                      <Text key={`${listing.id}-bid-${idx}`} style={styles.bidHistoryText}>
                        {new Date(bid.placedAt).toLocaleTimeString()} - {Number(bid.amount || 0)} BB
                      </Text>
                    ))}
                  </View>
                ) : null}

                <View style={styles.bidRow}>
                  <TextInput
                    value={bidMap[listing.id] || ''}
                    onChangeText={(val) => setBidMap((prev) => ({ ...prev, [listing.id]: val.replace(/[^0-9]/g, '') }))}
                    keyboardType="number-pad"
                    placeholder={`Bid >= ${Number(listing.nextMinBid || 0)}`}
                    placeholderTextColor="rgba(210,230,255,0.42)"
                    style={styles.bidInput}
                  />
                  <TouchableOpacity style={[styles.btn, styles.bidBtn, isBusy && styles.btnDisabled]} onPress={() => runBid(listing)} disabled={isBusy}>
                    <Text style={styles.btnText}>BID</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.buyBtn, isBusy && styles.btnDisabled]} onPress={() => runBuyNow(listing)} disabled={isBusy}>
                    <Text style={styles.btnText}>BUY NOW</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 14 },
  backBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.86)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backText: { color: '#dff2ff', fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 1.8, marginTop: 8 },
  sub: { color: 'rgba(200,228,255,0.68)', fontSize: 11, marginTop: 3 },
  bits: { color: '#ffd96d', fontSize: 12, fontWeight: '800', marginTop: 6 },
  statusCard: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.26)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 4,
  },
  statusText: { color: '#dff2ff', fontSize: 11 },
  statusMeta: { color: 'rgba(180,220,255,0.72)', fontSize: 10 },
  list: { paddingTop: 10, paddingBottom: 26 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  card: {
    width: '48.5%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.26)',
    backgroundColor: 'rgba(8,18,62,0.86)',
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 5,
  },
  itemArt: {
    height: 82,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.22)',
    backgroundColor: 'rgba(18,32,84,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  itemEmoji: { fontSize: 34 },
  itemName: { color: '#fff', fontSize: 13, fontWeight: '800' },
  itemMeta: { color: '#9fe3ff', fontSize: 10.5, fontWeight: '700' },
  itemDesc: { color: 'rgba(220,240,255,0.8)', fontSize: 10.2, minHeight: 42 },
  leadingTag: { color: '#8bffc0', fontSize: 9.8, fontWeight: '800' },
  priceRow: { gap: 2 },
  priceText: { color: '#ffd96d', fontSize: 10.5, fontWeight: '700' },
  endsText: { color: 'rgba(190,230,255,0.65)', fontSize: 9.8 },
  bidMeta: { color: 'rgba(175,221,255,0.78)', fontSize: 9.8 },
  bidHistory: { gap: 2 },
  bidHistoryText: { color: 'rgba(168,211,246,0.72)', fontSize: 9.3 },
  bidRow: { gap: 8, marginTop: 6 },
  bidInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.26)',
    backgroundColor: 'rgba(18,32,84,0.72)',
    color: '#fff',
    fontSize: 10.5,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  btn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidBtn: {
    borderColor: 'rgba(110,220,255,0.48)',
    backgroundColor: 'rgba(20,52,94,0.74)',
  },
  buyBtn: {
    borderColor: 'rgba(130,238,170,0.48)',
    backgroundColor: 'rgba(22,74,52,0.74)',
  },
  btnText: { color: '#dff2ff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  btnDisabled: { opacity: 0.58 },
});
