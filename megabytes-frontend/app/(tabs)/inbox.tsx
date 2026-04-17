import React, { useCallback, useEffect, useState } from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { claimInboxMessage, getInboxMessages, markInboxRead } from '../../services/api';

export default function InboxScreen() {
  const [messages, setMessages] = useState<any[]>([]);
  const [status, setStatus] = useState('Checking inbox...');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await getInboxMessages();
      const list = Array.isArray(rows) ? rows : [];
      setMessages(list);
      setStatus(list.length ? 'Inbox synchronized.' : 'Inbox is empty.');
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      setStatus(msg.includes('waking up') ? 'Server is waking up... inbox sync retry soon.' : 'Inbox sync failed.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openMessage = useCallback(async (message: any) => {
    if (!message?.readAt) {
      try {
        await markInboxRead(message.id);
      } catch {}
      setMessages((prev) => prev.map((entry) => (entry.id === message.id ? { ...entry, readAt: new Date().toISOString() } : entry)));
    }
  }, []);

  const claimMessage = useCallback(async (message: any) => {
    setBusyId(message.id);
    setStatus(`Claiming ${message.subject}...`);
    try {
      const result = await claimInboxMessage(message.id);
      setStatus(`Claim complete. +${Number(result?.grantedBits || 0)} BB delivered.`);
      await refresh();
    } catch (err: any) {
      setStatus(err?.message || 'Claim failed.');
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Text style={styles.title}>INBOX</Text>
        <Text style={styles.sub}>Game mail, deliveries, and rewards</Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {messages.map((message) => {
            const claimable = !message.claimed && Array.isArray(message.attachments) && message.attachments.length > 0;
            const isBusy = busyId === message.id;
            return (
              <TouchableOpacity key={message.id} style={styles.card} activeOpacity={0.9} onPress={() => openMessage(message)}>
                <Text style={styles.subject}>{message.subject}</Text>
                <Text style={styles.meta}>{message.kind.toUpperCase()} · {new Date(message.createdAt).toLocaleString()}</Text>
                <Text style={styles.body}>{message.body || 'No message body.'}</Text>

                <View style={styles.attachRow}>
                  {(message.attachments || []).map((attachment: any, idx: number) => (
                    <Text key={`${message.id}-${idx}`} style={styles.attachment}>
                      {attachment.type === 'item'
                        ? `Item: ${attachment.itemName || attachment.itemId} x${Number(attachment.quantity || 0)}`
                        : `Currency: ${Number(attachment.byteBits || 0)} ByteBits`}
                    </Text>
                  ))}
                </View>

                <View style={styles.footer}>
                  <Text style={[styles.stateTag, message.claimed ? styles.claimed : styles.unclaimed]}>
                    {message.claimed ? 'CLAIMED' : claimable ? 'READY TO CLAIM' : 'MESSAGE'}
                  </Text>
                  {claimable ? (
                    <TouchableOpacity style={[styles.claimBtn, isBusy && styles.disabled]} onPress={() => claimMessage(message)} disabled={isBusy}>
                      <Text style={styles.claimText}>{isBusy ? 'CLAIMING...' : 'CLAIM'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 14 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 1.8, marginTop: 8 },
  sub: { color: 'rgba(200,228,255,0.68)', fontSize: 11, marginTop: 3 },
  statusCard: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.26)',
    backgroundColor: 'rgba(8,18,62,0.84)',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  statusText: { color: '#dff2ff', fontSize: 11 },
  list: { paddingTop: 10, paddingBottom: 26, gap: 10 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.26)',
    backgroundColor: 'rgba(8,18,62,0.86)',
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 5,
  },
  subject: { color: '#fff', fontSize: 13, fontWeight: '800' },
  meta: { color: '#9fe3ff', fontSize: 9.8, fontWeight: '700' },
  body: { color: 'rgba(220,240,255,0.8)', fontSize: 10.8, lineHeight: 16 },
  attachRow: { gap: 4, marginTop: 2 },
  attachment: { color: '#ffd96d', fontSize: 10, fontWeight: '700' },
  footer: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stateTag: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    overflow: 'hidden',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  claimed: { color: '#9bffbf', borderColor: 'rgba(95,231,149,0.45)', backgroundColor: 'rgba(20,72,44,0.55)' },
  unclaimed: { color: '#ffe18e', borderColor: 'rgba(255,214,114,0.45)', backgroundColor: 'rgba(88,62,22,0.6)' },
  claimBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(130,238,170,0.48)',
    backgroundColor: 'rgba(22,74,52,0.74)',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  claimText: { color: '#dff2ff', fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  disabled: { opacity: 0.58 },
});
