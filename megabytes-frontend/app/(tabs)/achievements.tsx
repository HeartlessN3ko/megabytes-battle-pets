import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import AchievementsSheet from './achievements-sheet';

export default function AchievementsTab() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  return (
    <AchievementsSheet
      visible={visible}
      onClose={() => {
        setVisible(false);
        router.replace('/(tabs)');
      }}
    />
  );
}
