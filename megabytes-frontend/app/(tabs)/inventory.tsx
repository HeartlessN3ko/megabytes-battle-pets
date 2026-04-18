import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { consumeItem, getInventory, getPlayer, getShopItems } from '../../services/api';
import { playSfx } from '../../services/sfx';

type InventoryRow = {
  id: string;
  name: string;
  type: string;
  description: string;
  quantity: number;
};

const TYPE_ORDER = ['recovery', 'clutch', 'utility', 'stat_boost', 'evolution', 'battle_only', 'decor'];

const TYPE_COLOR: Record<string, string> = {
  recovery:    '#7cffc0',
  clutch:      '#ff9a72',
  utility:     '#9bd7ff',
  stat_boost:  '#ffe08d',
  evolution:   '#d4a8ff',
  battle_only: '#ff6b6b',
  decor:       '#f9c0e8',
};

const TYPE_LABEL: Record<string, string> = {
  recovery:    'RECOVERY',
  clutch:      'CLUTCH',
  utility:     'UTILITY',
  stat_boost:  'STAT BOOST',
  evolution:   'EVOLUTION',
  battle_only: 'BATTLE',
  decor:       'DECOR',
};

function typeColor(type: string) {
  return TYPE_COLOR[type] || '#9bd7ff';
}

export default function InventoryScreen() {
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
      setStatus(`${built.length} item${built.length !== 1 ? 's' : ''} loaded across ${new Set(built.map(r => r.type)).size} categories.`);
    } catch (err: any) {
      const msg = err?.message || '';
      setStatus(msg.toLowerCase().includes('waking up') ? 'Server waking up — inventory syncing soon.' : 'Inventory sync failed.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    playSfx('inventory_open', 0.7);
    load();
  }, [load]);

  const typeOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.type));
    return ['all', ...Array.from(set).sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a);
      const bi = TYPE_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })];
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (typeFilter === 'all') return rows;
    return rows.filter((r) => r.type === typeFilter);
  }, [rows, typeFilter]);

  const consumeInventoryItem = useCallback(async (id: string) => {
    setStatus(`Using ${id}...`);
    try {
      const res = await consumeItem(id);
      playSfx('item_use', 0.8);
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
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Compact top bar: title + status + filters */}
        <View style={styles.topBar}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>INVENTORY</Text>
            <Text style={styles.subtitle}>ITEM STORAGE SYSTEM</Text>
          </View>
          <View style={styles.statusBar}>
            <Ionicons name="server-outline" size={10} color="#4a9eff" style={{ marginRight: 5 }} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {typeOptions.map((t) => {
              const active = typeFilter === t;
              const accent = t === 'all' ? '#7ec8ff' : typeColor(t);
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.filterChip,
                    active && { borderColor: accent, backgroundColor: `${accent}22` },
                  ]}
                  onPress={() => setTypeFilter(t)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterText, active && { color: accent }]}>
                    {t === 'all' ? 'ALL' : (TYPE_LABEL[t] || t.toUpperCase())}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Item list — fills remaining space */}
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {visibleRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={28} color="rgba(120,195,255,0.3)" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>NO ITEMS</Text>
              <Text style={styles.emptySub}>Nothing in this category yet.</Text>
            </View>
          ) : (
            visibleRows.map((row) => {
              const accent = typeColor(row.type);
              const isDecor = row.type === 'decor';
              return (
                <View key={row.id} style={styles.rowCard}>
                  {/* Type accent bar */}
                  <View style={[styles.accentBar, { backgroundColor: accent }]} />

                  <View style={styles.rowInner}>
                    {/* Top row: name + qty */}
                    <View style={styles.rowTop}>
                      <Text style={styles.rowName}>{row.name}</Text>
                      <View style={[styles.qtyBadge, { borderColor: `${accent}66` }]}>
                        <Text style={[styles.qtyText, { color: accent }]}>×{row.quantity}</Text>
                      </View>
                    </View>

                    {/* Type badge */}
                    <Text style={[styles.typeBadge, { color: accent }]}>
                      {TYPE_LABEL[row.type] || row.type.toUpperCase()}
                    </Text>

                    {/* Description */}
                    <Text style={styles.rowDesc}>{row.description}</Text>

                    {/* Action */}
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: `${accent}55`, backgroundColor: `${accent}14` }]}
                      onPress={() => !isDecor && consumeInventoryItem(row.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.actionText, { color: accent }]}>
                        {isDecor ? 'PLACE IN ROOM' : 'USE ITEM'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 90 }} />
        </ScrollView>

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg:   { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 14 },

  topBar: {
    gap: 4,
    paddingTop: 8,
    paddingBottom: 6,
  },
  titleRow: { alignItems: 'center', marginBottom: 2 },
  title:    { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  subtitle: { color: 'rgba(120,195,255,0.6)', fontSize: 8.5, fontWeight: '700', letterSpacing: 2, marginTop: 1 },

  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(4,12,40,0.7)',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: { color: 'rgba(160,210,255,0.7)', fontSize: 9.5, fontFamily: 'monospace' },

  filterRow: { gap: 5, paddingVertical: 4, paddingRight: 8, alignItems: 'center' },
  filterChip: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.2)',
    backgroundColor: 'rgba(8,18,62,0.6)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  filterText: {
    color: 'rgba(160,210,255,0.5)',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  listScroll: { flex: 1 },
  list: { gap: 10, paddingTop: 4 },

  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.15)',
    backgroundColor: 'rgba(8,18,62,0.7)',
    paddingVertical: 40,
    marginTop: 20,
  },
  emptyTitle: { color: 'rgba(220,240,255,0.5)', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  emptySub:   { color: 'rgba(160,210,255,0.35)', fontSize: 10, marginTop: 4 },

  rowCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.18)',
    backgroundColor: 'rgba(6,14,50,0.88)',
    overflow: 'hidden',
  },
  accentBar: { width: 4, borderRadius: 0 },
  rowInner:  { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },

  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.5, flex: 1 },
  qtyBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  qtyText: { fontSize: 11, fontWeight: '900' },

  typeBadge: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, opacity: 0.85 },
  rowDesc:   { color: 'rgba(200,230,255,0.65)', fontSize: 11, lineHeight: 15 },

  actionBtn: {
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  actionText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
});
