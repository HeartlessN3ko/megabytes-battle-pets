import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { consumeItem, equipDecor, getByte, getDecorCatalog, getInventory, getPlayer, getShopItems, unequipDecor } from '../../services/api';
import { playSfx } from '../../services/sfx';
import { PALETTE, RADIUS, SPACING, TYPE } from '../../constants/theme';

type InventoryRow = {
  id: string;
  name: string;
  type: string;
  description: string;
  quantity: number;
  layer?: string;
};

const TYPE_ORDER = ['treat', 'recovery', 'clutch', 'utility', 'decor', 'stat_boost', 'evolution', 'battle_only'];

const TYPE_COLOR: Record<string, string> = {
  treat:       '#ffe08d',
  recovery:    '#7cffc0',
  clutch:      '#ff9a72',
  utility:     '#9bd7ff',
  stat_boost:  '#ffe08d',
  evolution:   '#d4a8ff',
  battle_only: '#ff6b6b',
  decor:       '#f9c0e8',
};

const TYPE_LABEL: Record<string, string> = {
  treat:       'TREAT',
  recovery:    'RECOVERY',
  clutch:      'CLUTCH',
  utility:     'UTILITY',
  stat_boost:  'STAT BOOST',
  evolution:   'EVOLUTION',
  battle_only: 'BATTLE',
  decor:       'DECOR',
};

// 2D — group display by category. Underlying TYPE values stay the same so
// shop catalog + backend contracts are untouched; this is presentation-only.
type Category = 'treats' | 'care' | 'decor' | 'battle';
const CATEGORY_ORDER: Category[] = ['treats', 'care', 'decor', 'battle'];
const TYPE_TO_CATEGORY: Record<string, Category> = {
  treat:       'treats',
  recovery:    'care',
  clutch:      'care',
  utility:     'care',
  decor:       'decor',
  stat_boost:  'battle',
  evolution:   'battle',
  battle_only: 'battle',
};
const CATEGORY_LABEL: Record<Category, string> = {
  treats: 'TREATS',
  care:   'CARE PROGRAMS',
  decor:  'ROOM DECOR',
  battle: 'BATTLE-LOCKED',
};
const CATEGORY_HINT: Record<Category, string> = {
  treats: 'Snack packets and quick-feeds.',
  care:   'Mood, hygiene, energy, recovery routines.',
  decor:  'Furniture and room layer items.',
  battle: 'Stat boosts and battle gear — unlocks with Expansion 1.',
};
const CATEGORY_ACCENT: Record<Category, string> = {
  treats: '#ffe08d',
  care:   '#7cffc0',
  decor:  '#f9c0e8',
  battle: '#ff6b6b',
};

function typeColor(type: string) {
  return TYPE_COLOR[type] || PALETTE.accentBlue;
}

function categoryFor(type: string): Category {
  return TYPE_TO_CATEGORY[type] || 'care';
}

export default function InventoryScreen() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [equipped, setEquipped] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [status, setStatus] = useState('Syncing inventory...');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [catalog, decor, inv, player, byteRes] = await Promise.all([
        getShopItems(),
        getDecorCatalog().catch(() => []),
        getInventory(),
        getPlayer(),
        getByte().catch(() => null),
      ]);
      const catalogById = new Map<string, any>((catalog || []).map((item: any) => [item.id, item]));
      // Decor catalog overrides shop entries so type='decor' wins for the PLACE IN ROOM affordance
      (Array.isArray(decor) ? decor : []).forEach((d: any) => {
        catalogById.set(d.id, { ...d, type: 'decor' });
      });

      const inventoryList = Array.isArray(inv?.itemInventory)
        ? inv.itemInventory
        : (Array.isArray(player?.itemInventory) ? player.itemInventory : []);
      const inventoryMap = Object.fromEntries(
        inventoryList.map((entry: any) => [entry.itemId, Number(entry.quantity || 0)])
      );

      const legacyOwned = Array.isArray(inv?.unlockedItems) ? inv.unlockedItems : (player?.unlockedItems || []);
      const keys = new Set<string>([...Object.keys(inventoryMap || {}), ...legacyOwned]);

      const byteData = (byteRes as any)?.byte || byteRes;
      const decorEquipped = new Set<string>(
        Array.isArray(byteData?.decorItems)
          ? byteData.decorItems.map((e: any) => (e?.id || e))
          : []
      );
      setEquipped(decorEquipped);

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
          layer: c.layer,
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

  // Group visible rows by display category. Order honors CATEGORY_ORDER and
  // skips empty categories so the layout stays compact under filtering.
  const grouped = useMemo(() => {
    const map: Record<Category, InventoryRow[]> = { treats: [], care: [], decor: [], battle: [] };
    visibleRows.forEach((r) => {
      map[categoryFor(r.type)].push(r);
    });
    return CATEGORY_ORDER
      .map((cat) => ({ cat, items: map[cat] }))
      .filter((g) => g.items.length > 0);
  }, [visibleRows]);

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

  const toggleDecorPlacement = useCallback(async (row: InventoryRow) => {
    const id = row.id;
    const isEquipped = equipped.has(id);
    setBusyId(id);
    setStatus(isEquipped ? `Removing ${row.name} from room...` : `Placing ${row.name} in ${row.layer || 'room'}...`);
    try {
      const res: any = isEquipped ? await unequipDecor(id) : await equipDecor(id);
      playSfx(isEquipped ? 'tap' : 'positive', 0.6);
      const nextIds = Array.isArray(res?.decorItems)
        ? res.decorItems.map((e: any) => (e?.id || e))
        : [];
      setEquipped(new Set(nextIds));
      setStatus(isEquipped ? `${row.name} removed.` : `${row.name} placed on ${row.layer || 'room'}.`);
    } catch (err: any) {
      setStatus(err?.message || `Failed to ${isEquipped ? 'remove' : 'place'} ${row.name}.`);
      playSfx('no', 0.5);
    } finally {
      setBusyId(null);
    }
  }, [equipped]);

  const renderRow = (row: InventoryRow) => {
    const accent = typeColor(row.type);
    const isDecor = row.type === 'decor';
    const isEquipped = isDecor && equipped.has(row.id);
    const isBusy = busyId === row.id;
    const actionLabel = isDecor
      ? (isEquipped ? 'REMOVE FROM ROOM' : `PLACE IN ${(row.layer || 'ROOM').toUpperCase()}`)
      : 'USE ITEM';
    const onAction = isDecor
      ? () => toggleDecorPlacement(row)
      : () => consumeInventoryItem(row.id);
    return (
      <View key={row.id} style={styles.rowCard}>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />
        <View style={styles.rowInner}>
          <View style={styles.rowTop}>
            <Text style={styles.rowName}>{row.name}</Text>
            <View style={[styles.qtyBadge, { borderColor: `${accent}66` }]}>
              <Text style={[styles.qtyText, { color: accent }]}>x{row.quantity}</Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            <Text style={[styles.typeBadge, { color: accent }]}>
              {TYPE_LABEL[row.type] || row.type.toUpperCase()}
            </Text>
            {isEquipped ? (
              <Text style={styles.equippedTag}>EQUIPPED</Text>
            ) : null}
          </View>
          <Text style={styles.rowDesc}>{row.description}</Text>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { borderColor: `${accent}55`, backgroundColor: `${accent}14` },
              isBusy && styles.actionBtnDisabled,
            ]}
            onPress={onAction}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionText, { color: accent }]}>
              {isBusy ? '...' : actionLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Compact top bar: title + status + filters */}
        <View style={styles.topBar}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>BYTE STORAGE</Text>
            <Text style={styles.subtitle}>OWNED PROGRAMS, TREATS, AND DECOR</Text>
          </View>
          <View style={styles.statusBar}>
            <Ionicons name="server-outline" size={10} color={PALETTE.accentBlue} style={{ marginRight: SPACING.xs }} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {typeOptions.map((t) => {
              const active = typeFilter === t;
              const accent = t === 'all' ? PALETTE.accentBlue : typeColor(t);
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

        {/* Grouped item list — fills remaining space */}
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {grouped.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={28} color={PALETTE.panelBorderSoft} style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.emptyTitle}>STORAGE EMPTY</Text>
              <Text style={styles.emptySub}>Programs you collect or buy land here. Visit the shop or marketplace to fill it up.</Text>
            </View>
          ) : (
            grouped.map(({ cat, items }) => (
              <View key={cat} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionAccent, { backgroundColor: CATEGORY_ACCENT[cat] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{CATEGORY_LABEL[cat]}</Text>
                    <Text style={styles.sectionHint}>{CATEGORY_HINT[cat]}</Text>
                  </View>
                  <Text style={styles.sectionCount}>{items.length}</Text>
                </View>
                {items.map(renderRow)}
              </View>
            ))
          )}
          <View style={{ height: 90 }} />
        </ScrollView>

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg:   { flex: 1 },
  safe: { flex: 1, paddingHorizontal: SPACING.md },

  topBar: {
    gap: SPACING.xs,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs + 2,
  },
  titleRow: { alignItems: 'center', marginBottom: 2 },
  title:    { ...TYPE.hero, color: PALETTE.textHi },
  subtitle: { ...TYPE.micro, color: PALETTE.textLo, marginTop: 1 },

  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.statusBg,
    borderRadius: RADIUS.sm + 1,
    borderWidth: 1,
    borderColor: PALETTE.statusBorder,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  statusText: { ...TYPE.caption, color: PALETTE.statusText, fontFamily: 'monospace' },

  filterRow: { gap: 5, paddingVertical: SPACING.xs, paddingRight: SPACING.sm, alignItems: 'center' },
  filterChip: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: PALETTE.chipBorder,
    backgroundColor: PALETTE.chipBg,
    paddingHorizontal: SPACING.sm - 1,
    paddingVertical: 3,
  },
  filterText: { ...TYPE.micro, color: PALETTE.chipText },

  listScroll: { flex: 1 },
  list: { gap: SPACING.md, paddingTop: SPACING.xs },

  section: { gap: SPACING.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    paddingTop: SPACING.xs,
  },
  sectionAccent: {
    width: 3,
    height: 22,
    borderRadius: 2,
  },
  sectionTitle: { ...TYPE.label, color: PALETTE.textHi },
  sectionHint:  { ...TYPE.micro, color: PALETTE.textMid, marginTop: 1, fontWeight: '600' as const, letterSpacing: 0 },
  sectionCount: { ...TYPE.label, color: PALETTE.textLo },

  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: PALETTE.panelBorderSoft,
    backgroundColor: PALETTE.panelBgSoft,
    paddingVertical: 40,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  emptyTitle: { ...TYPE.title, color: PALETTE.textLo, letterSpacing: 2 },
  emptySub:   { ...TYPE.body, color: PALETTE.textMid, marginTop: SPACING.xs, textAlign: 'center' },

  rowCard: {
    flexDirection: 'row',
    borderRadius: RADIUS.md + 2,
    borderWidth: 1,
    borderColor: PALETTE.panelBorder,
    backgroundColor: PALETTE.panelBg,
    overflow: 'hidden',
  },
  accentBar: { width: 4, borderRadius: 0 },
  rowInner:  { flex: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2, gap: SPACING.xs },

  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { ...TYPE.title, color: PALETTE.textHi, flex: 1 },
  qtyBadge: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  qtyText: { fontSize: 11, fontWeight: '900' as const },

  badgeRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  typeBadge:   { ...TYPE.micro, opacity: 0.85 },
  equippedTag: { ...TYPE.micro, color: '#9bffbf', fontWeight: '900' as const },
  rowDesc:     { ...TYPE.body, color: PALETTE.textMid, lineHeight: 15 },

  actionBtn: {
    marginTop: SPACING.xs + 2,
    borderRadius: RADIUS.md - 2,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  actionBtnDisabled: { opacity: 0.55 },
  actionText: { ...TYPE.body, fontWeight: '900' as const, letterSpacing: 1.2 },
});
