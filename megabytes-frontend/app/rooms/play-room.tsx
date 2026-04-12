import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function PlayRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Play room loaded. Engagement routines ready.');
  useEffect(() => {
    enterRoom('Play_Room', 1).catch(() => {});
  }, []);


  const runPlay = useCallback(async (name: string) => {
    setStatus(`${name} started...`);
    try {
      await careAction('feed');
    } catch {}
    setStatus(`${name} complete. Mood boost applied in demo flow.`);
  }, []);

  const actions: RoomAction[] = [
    {
      key: 'toy',
      title: 'TOY LOOP',
      subtitle: 'Mood and social boost',
      icon: 'game-controller-outline',
      color: '#ff93e2',
      onPress: () => runPlay('Toy Loop'),
    },
    {
      key: 'sync',
      title: 'SYNC GAME',
      subtitle: 'Engagement routine',
      icon: 'sync-outline',
      color: '#8ebdff',
      onPress: () => runPlay('Sync Game'),
    },
    {
      key: 'minigame',
      title: 'MINIGAME',
      subtitle: 'Placeholder for future gameplay',
      icon: 'extension-puzzle-outline',
      color: '#ffd57f',
      onPress: () => setStatus('Minigame slot reserved. Add gameplay module when ready.'),
    },
    {
      key: 'exit',
      title: 'EXIT',
      subtitle: 'Return to home',
      icon: 'arrow-back-outline',
      color: '#88b5ff',
      onPress: () => router.replace('/(tabs)'),
    },
  ];

  return (
    <RoomScene
      title="PLAY ROOM"
      subtitle="ENGAGEMENT SPACE"
      roomTag="MOOD SUPPORT"
      ambient="Play-focused interactions keep the Byte lively. This room can later host social and fun-focused minigames." 
      sceneTint="rgba(66,26,70,0.22)"
      accent="#ff8ed2"
      statusLine={status}
      actions={actions}
    />
  );
}

