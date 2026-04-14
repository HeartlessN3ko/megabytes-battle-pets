import React, { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { HOME_ROOM_DECOR_SLOTS } from '../services/homeRoomLayout';

type HomeRoomStageProps = {
  showSlotDebug?: boolean;
};

export default function HomeRoomStage({ showSlotDebug = false }: HomeRoomStageProps) {
  const slots = useMemo(() => HOME_ROOM_DECOR_SLOTS, []);

  return (
    <View pointerEvents="none" style={styles.stage}>
      <Image source={require('../assets/backgrounds/home_concept.png')} style={styles.roomImage} resizeMode="contain" />

      {showSlotDebug ? (
        <View style={styles.slotLayer}>
          {slots.map((slot) => (
            <View
              key={slot.id}
              style={[
                styles.slotBox,
                {
                  left: `${slot.x}%`,
                  top: `${slot.y}%`,
                  width: `${slot.width}%`,
                  height: `${slot.height}%`,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  roomImage: {
    width: '100%',
    height: '100%',
  },
  slotLayer: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '2%',
    bottom: '4%',
  },
  slotBox: {
    position: 'absolute',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(93,219,255,0.58)',
    backgroundColor: 'rgba(49,130,255,0.12)',
  },
});
