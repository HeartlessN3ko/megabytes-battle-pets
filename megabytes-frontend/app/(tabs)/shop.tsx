import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buyItem, consumeItem, getPlayer, getShopItems } from '../../services/api';

const FALLBACK_ITEMS = [
  { id: 'clean_meat.pkg', name: 'Clean Meat', cost: 25, description: 'Hunger up with small hygiene tradeoff.' },
  { id: 'green_stack.pkg', name: 'Green Stack', cost: 20, description: 'Balanced clean intake.' },
  { id: 'synth_meal.pkg', name: 'Synth Meal', cost: 40, description: 'Large hunger restore with energy tradeoff.' },
  { id: 'glitch_snack.pkg', name: 'Glitch Snack', cost: 35, description: 'Mood spike with corruption risk.' },
  { id: 'nano_wipe.pkg', name: 'Nano Wipe', cost: 20, description: 'Fast hygiene cleanup.' },
  { id: 'deep_scrub.sys', name: 'Deep Scrub', cost: 35, description: 'Heavy clean cycle.' },
  { id: 'vibe_patch.pkg', name: 'Vibe Patch', cost: 20, description: 'Mood recovery support.' },
  { id: 'quick_charge.pkg', name: 'Quick Charge', cost: 20, description: 'Bandwidth restore with mood dip.' },
  { id: 'comfort_pack.pkg', name: 'Comfort Pack', cost: 35, description: 'Multi-need support item.' },
  { id: 'fire_core.pkg', name: 'Fire Core', cost: 75, description: 'Element progression core.' },
  { id: 'wing_module.pkg', name: 'Wing Module', cost: 120, description: 'Feature progression module.' },
  { id: 'battlepatch.exe', name: 'Battle Patch', cost: 250, description: 'Branch lock progression item.' },
];

export default function ShopScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [bits, setBits] = useState(0);
  const [status, setStatus] = useState('Loading shop inventory...');

  const load = useCallback(async () => {
    try {
      const [shopItems, player] = await Promise.all([getShopItems(), getPlayer()]);
      setItems(Array.isArray(shopItems) && shopItems.length ? shopItems : FALLBACK_ITEMS);
      setBits(player?.byteBits || 0);
      setStatus('Shop synchronized.');
    } catch {
      setItems(FALLBACK_ITEMS);
      setStatus('Shop running in local fallback mode.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const affordableCount = useMemo(() => items.filter((i) => bits >= (i.cost || 0)).length, [bits, items]);

  const handleBuy = useCallback(async (itemId: string, cost: number) => {
    if (bits < cost) {
      setStatus('Not enough ByteBits for that item.');
      return;
    }

    setStatus(`Purchasing ${itemId}...`);
    try {
      await buyItem(itemId);
      setStatus(`${itemId} purchased.`);
    } catch {
      setStatus(`${itemId} purchased in demo mode.`);
    }

    setBits((prev) => Math.max(0, prev - cost));
  }, [bits]);

  const handleUse = useCallback(async (itemId: string) => {
    setStatus(`Using ${itemId}...`);
    try {
      await consumeItem(itemId);
      setStatus(`${itemId} used successfully.`);
    } catch {
      setStatus(`${itemId} usage mocked for demo flow.`);
    }
  }, []);

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>SHOP</Text>
          <View style={styles.bitsCard}>
            <Ionicons name="logo-bitcoin" size={14} color="#ffd45a" />
            <Text style={styles.bitsVal}>{bits.toLocaleString()} ByteBits</Text>
          </View>
          <Text style={styles.sub}>{affordableCount} items affordable now</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {items.map((item) => {
            const cost = Number(item.cost || 0);
            const canBuy = bits >= cost;
            const name = item.name || item.id;
            const desc = item.description || 'System item.';
            const itemId = item.id;

            return (
              <View key={itemId} style={styles.itemCard}>
                <View style={styles.itemTop}>
                  <Text style={styles.itemName}>{name}</Text>
                  <Text style={styles.itemCost}>{cost} BB</Text>
                </View>
                <Text style={styles.itemId}>{itemId}</Text>
                <Text style={styles.itemDesc}>{desc}</Text>
                <View style={styles.itemActions}>
                  <TouchableOpacity
                    style={[styles.buyBtn, !canBuy && styles.buyBtnDisabled]}
                    onPress={() => handleBuy(itemId, cost)}
                    activeOpacity={0.85}
                    disabled={!canBuy}
                  >
                    <Text style={styles.buyText}>{canBuy ? 'BUY' : 'LOCKED'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.useBtn} onPress={() => handleUse(itemId)} activeOpacity={0.85}>
                    <Text style={styles.useText}>USE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  header: { paddingHorizontal: 14, paddingTop: 8, gap: 6 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  bitsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.3)',
    backgroundColor: 'rgba(8,18,62,0.85)',
  },
  bitsVal: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sub: { color: 'rgba(200,228,255,0.66)', fontSize: 11 },
  statusCard: {
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.3)',
    backgroundColor: 'rgba(8,18,62,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusText: { color: '#d9efff', fontSize: 11 },
  list: { padding: 14, gap: 10, paddingBottom: 26 },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { color: '#fff', fontSize: 13, fontWeight: '800' },
  itemCost: { color: '#ffd45a', fontSize: 12, fontWeight: '800' },
  itemId: { color: 'rgba(188,220,255,0.64)', fontSize: 10 },
  itemDesc: { color: 'rgba(220,240,255,0.8)', fontSize: 11 },
  itemActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  buyBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(107,235,164,0.45)',
    backgroundColor: 'rgba(20,72,44,0.6)',
  },
  buyBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(40,44,62,0.55)',
  },
  buyText: { color: '#c2ffd9', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  useBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(107,188,255,0.45)',
    backgroundColor: 'rgba(26,44,88,0.6)',
  },
  useText: { color: '#9bd7ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
});
