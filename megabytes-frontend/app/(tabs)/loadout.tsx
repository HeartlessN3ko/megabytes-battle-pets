import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getByteMoves, updateByteLoadout } from '../../services/api';

type MoveDef = {
  id: string;
  name?: string;
  element?: string;
  function?: string;
  isUlt?: boolean;
  description?: string;
};

export default function LoadoutScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Syncing loadout...');
  const [equippedMoves, setEquippedMoves] = useState<string[]>([]);
  const [equippedUlt, setEquippedUlt] = useState<string | null>(null);
  const [equippedPassive, setEquippedPassive] = useState<string | null>(null);
  const [availableMoves, setAvailableMoves] = useState<MoveDef[]>([]);
  const [availableUlts, setAvailableUlts] = useState<MoveDef[]>([]);
  const [passiveOptions, setPassiveOptions] = useState<{ id: string; name: string }[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getByteMoves();
      setEquippedMoves(Array.isArray(data?.equippedMoves) ? data.equippedMoves : []);
      setEquippedUlt(data?.equippedUlt || null);
      setEquippedPassive(data?.equippedPassive || null);
      setAvailableMoves(Array.isArray(data?.availableMoves) ? data.availableMoves : []);
      setAvailableUlts(Array.isArray(data?.availableUlts) ? data.availableUlts : []);
      setPassiveOptions(Array.isArray(data?.passiveOptions) ? data.passiveOptions : []);
      setStatus('Loadout synchronized.');
    } catch (err: any) {
      setStatus(err?.message || 'Failed to load move data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedSet = useMemo(() => new Set(equippedMoves), [equippedMoves]);
  const moveLibrary = useMemo(
    () =>
      [...availableMoves, ...availableUlts].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))),
    [availableMoves, availableUlts]
  );

  const toggleMove = useCallback((moveId: string) => {
    setEquippedMoves((prev) => {
      if (prev.includes(moveId)) return prev.filter((id) => id !== moveId);
      if (prev.length >= 2) return [prev[1], moveId];
      return [...prev, moveId];
    });
  }, []);

  const save = useCallback(async () => {
    if (equippedMoves.length === 0) {
      setStatus('Select at least one move.');
      return;
    }
    setSaving(true);
    setStatus('Applying loadout...');
    try {
      const payload = {
        equippedMoves,
        equippedUlt,
        equippedPassive,
      };
      const res = await updateByteLoadout(payload);
      setEquippedMoves(Array.isArray(res?.equippedMoves) ? res.equippedMoves : equippedMoves);
      setEquippedUlt(res?.equippedUlt || null);
      setEquippedPassive(res?.equippedPassive || null);
      setStatus('Loadout updated.');
    } catch (err: any) {
      setStatus(err?.message || 'Loadout update failed.');
    } finally {
      setSaving(false);
    }
  }, [equippedMoves, equippedPassive, equippedUlt]);

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Text style={styles.title}>LOADOUT</Text>
        <Text style={styles.sub}>2 moves + 1 ult + 1 passive</Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>MOVES ({equippedMoves.length}/2)</Text>
          {availableMoves.map((move) => {
            const selected = selectedSet.has(move.id);
            return (
              <TouchableOpacity key={move.id} style={[styles.row, selected && styles.rowSelected]} onPress={() => toggleMove(move.id)} disabled={loading || saving}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle}>{move.name || move.id}</Text>
                  <Text style={styles.rowTag}>{move.element || 'Normal'} · {move.function || 'Damage'}</Text>
                </View>
                <Text style={styles.rowMeta}>{move.id}</Text>
              </TouchableOpacity>
            );
          })}

          <Text style={styles.sectionTitle}>ULT</Text>
          <TouchableOpacity
            style={[styles.row, equippedUlt === null && styles.rowSelected]}
            onPress={() => setEquippedUlt(null)}
            disabled={loading || saving}
          >
            <Text style={styles.rowTitle}>None</Text>
          </TouchableOpacity>
          {availableUlts.map((move) => (
            <TouchableOpacity
              key={move.id}
              style={[styles.row, equippedUlt === move.id && styles.rowSelected]}
              onPress={() => setEquippedUlt(move.id)}
              disabled={loading || saving}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>{move.name || move.id}</Text>
                <Text style={styles.rowTag}>{move.element || 'Normal'} · ULT</Text>
              </View>
              <Text style={styles.rowMeta}>{move.id}</Text>
            </TouchableOpacity>
          ))}

          <Text style={styles.sectionTitle}>PASSIVE</Text>
          <TouchableOpacity
            style={[styles.row, equippedPassive === null && styles.rowSelected]}
            onPress={() => setEquippedPassive(null)}
            disabled={loading || saving}
          >
            <Text style={styles.rowTitle}>None</Text>
          </TouchableOpacity>
          {passiveOptions.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.row, equippedPassive === p.id && styles.rowSelected]}
              onPress={() => setEquippedPassive(p.id)}
              disabled={loading || saving}
            >
              <Text style={styles.rowTitle}>{p.name}</Text>
            </TouchableOpacity>
          ))}

          <Text style={styles.sectionTitle}>MOVE LIBRARY ({moveLibrary.length})</Text>
          {moveLibrary.map((move) => (
            <View key={`lib-${move.id}`} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>{move.name || move.id}</Text>
                <Text style={styles.rowTag}>
                  {move.element || 'Normal'} · {move.isUlt ? 'ULT' : move.function || 'Damage'}
                </Text>
              </View>
              <Text style={styles.rowMeta}>{move.id}</Text>
              {move.description ? <Text style={styles.rowDesc}>{move.description}</Text> : null}
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity style={[styles.saveBtn, (saving || loading) && styles.saveBtnDisabled]} onPress={save} disabled={saving || loading}>
          <Text style={styles.saveText}>{saving ? 'APPLYING...' : 'APPLY LOADOUT'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 14 },
  title: { color: '#fff', fontSize: 23, fontWeight: '900', letterSpacing: 1.8, marginTop: 8 },
  sub: { color: 'rgba(200,228,255,0.68)', fontSize: 11, marginTop: 3 },
  statusCard: {
    marginTop: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.26)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  statusText: { color: '#dff2ff', fontSize: 11 },
  content: { paddingTop: 10, paddingBottom: 18, gap: 8 },
  sectionTitle: { color: '#9fd8ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginTop: 6 },
  row: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.24)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  rowSelected: {
    borderColor: 'rgba(138,238,176,0.56)',
    backgroundColor: 'rgba(18,60,40,0.68)',
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowTitle: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  rowTag: { color: '#ffe08d', fontSize: 9.4, fontWeight: '700' },
  rowMeta: { color: 'rgba(200,228,255,0.62)', fontSize: 9.6 },
  rowDesc: { color: 'rgba(216,236,255,0.75)', fontSize: 9.8, marginTop: 2 },
  saveBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,235,170,0.52)',
    backgroundColor: 'rgba(20,72,44,0.74)',
    alignItems: 'center',
    paddingVertical: 11,
    marginBottom: 10,
  },
  saveBtnDisabled: { opacity: 0.56 },
  saveText: { color: '#c8ffdd', fontSize: 11.3, fontWeight: '900', letterSpacing: 1.2 },
});
