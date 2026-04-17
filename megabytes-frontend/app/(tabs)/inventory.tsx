import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { consumeItem, getInventory, getPlayer, getShopItems } from '../../services/api';

type InventoryRow = {
  id: string;
  name: string;
  type: string;
  description: string;
  quantity: number;
};

const TYPE_ORDER = ['recovery', 'clutch', 'utility', 'stat_boost', 'evolution', 'battle_only'];

export default function InventoryScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [status, setStatus] = useState('Syncing inventory...');

  const load = useCallback(async () => {
    try {
      const [catalog, inv, player] = await Promise.all([getShopItems(), getInventory(), getPlayer()]);
      const catalogById = new Map((catalog || []).map((item: any) => [item.id, item]));

      const inventoryList = Array.isArray(inv?.itemInventory)
        ? inv.itemInventory
        : (Array.isArray(player?.itemInventory) ? player.itemInventory : []);
      const inventoryMap = Object.fromEntries(
        inventoryList.map((entry: any) => [entry.itemId, Number(entry.quantity || 0)])
      );

      const legacyOwned = Array.isArray(inv?.unlockedItems) ? inv.unlockedItems : (player?.unlockedItems || []);
      const keys = new Set<string>([...Object.keys(inventoryMap || {}), ...legacyOwned]);

      const built: InventoryRow[] = [];
      keys.forEach((id) => {
        const qty = Number(inventoryMap?.[id] || 0) || (legacyOwned.includes(id) ? 1 : 0);
        if (qty <= 0) return;
        const c = catalogById.get(id) || {};
        built.push({
          id,
          name: c.name || id,
          type: c.type || 'utility',
          description: c.description || 'System item.',
          quantity: qty,
        });
      });

      built.sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.type);
        const bi = TYPE_ORDER.indexOf(b.type);
        const aOrder = ai === -1 ? 999 : ai;
        const bOrder = bi === -1 ? 999 : bi;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });

      setRows(built);
      setStatus(`Inventory synced: ${built.length} item types loaded.`);
    } catch (err: any) {
      const msg = err?.message || '';
      setStatus(msg.toLowerCase().includes('waking up') ? 'Server is waking up... inventory will sync soon.' : 'Inventory sync failed.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const typeOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.type));
    return ['all', ...Array.from(set).sort()];
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (typeFilter === 'all') return rows;
    return rows.filter((r) => r.type === typeFilter);
  }, [rows, typeFilter]);

  const consumeInventoryItem = useCallback(async (id: string) => {
    setStatus(`Using ${id}...`);
    try {
      const res = await consumeItem(id);
      setRows((prev) =>
        prev
          .map((r) => (r.id === id ? { ...r, quantity: Math.max(0, Number(res?.quantityRemaining ?? r.quantity - 1)) } : r))
          .filter((r) => r.quantity > 0)
      );
      setStatus(`${id} used.`);
    } catch (err: any) {
      setStatus(err?.message || `Failed to use ${id}.`);
    }
  }, []);

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
            <Ionicons name="arrow-back-outline" size={22} color="#7ec8ff" />
          </TouchableOpacity>
          <Text style={styles.title}>INVENTORY</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {typeOptions.map((t) => {
            const active = typeFilter === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setTypeFilter(t)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{t.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView contentContainerStyle={styles.list}>
          {visibleRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No items in this filter yet.</Text>
            </View>
          ) : (
            visibleRows.map((row) => (
              <View key={row.id} style={styles.rowCard}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName}>{row.name}</Text>
                  <Text style={styles.qty}>x{row.quantity}</Text>
                </View>
                <Text style={styles.rowDesc}>{row.description}</Text>
                <TouchableOpacity style={styles.useBtn} onPress={() => consumeInventoryItem(row.id)} activeOpacity={0.85}>
                  <Text style={styles.useText}>USE ITEM</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },
  backBtn: { width: 40, alignItems: 'flex-start' },
  title: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  statusCard: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.3)',
    backgroundColor: 'rgba(8,18,62,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusText: { color: '#d9efff', fontSize: 11 },
  filterRow: { gap: 8, paddingVertical: 10, paddingRight: 8 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.8)',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterChipActive: { borderColor: 'rgba(255,214,114,0.62)', backgroundColor: 'rgba(88,64,20,0.74)' },
  filterText: { color: '#9ccfff', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  filterTextActive: { color: '#ffe08d' },
  list: { gap: 10, paddingBottom: 24 },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    padding: 14,
  },
  emptyText: { color: 'rgba(220,240,255,0.78)', fontSize: 12 },
  rowCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { color: '#fff', fontSize: 13, fontWeight: '800' },
  qty: { color: '#ffe08d', fontSize: 12, fontWeight: '900' },
  rowDesc: { color: 'rgba(220,240,255,0.8)', fontSize: 11 },
  useBtn: {
    marginTop: 4,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(107,188,255,0.45)',
    backgroundColor: 'rgba(26,44,88,0.6)',
    alignItems: 'center',
    paddingVertical: 8,
  },
  useText: { color: '#9bd7ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
});
