import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { HOME_ROOM_DECOR_SLOTS } from '../services/homeRoomLayout';

type HomeRoomStageProps = {
  showSlotDebug?: boolean;
};

export default function HomeRoomStage({ showSlotDebug = false }: HomeRoomStageProps) {
  const slots = useMemo(() => HOME_ROOM_DECOR_SLOTS, []);

  return (
    <View pointerEvents="none" style={styles.stage}>
      <View style={styles.backPlate} />
      <View style={styles.rearGlow} />
      <View style={styles.floorGlow} />
      <View style={styles.floorLine} />
      <View style={[styles.sideWall, styles.sideWallLeft]} />
      <View style={[styles.sideWall, styles.sideWallRight]} />
      <View style={[styles.baseBlock, styles.baseBlockLeft]} />
      <View style={[styles.baseBlock, styles.baseBlockRight]} />

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
  backPlate: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '10%',
    bottom: '12%',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(104,170,255,0.12)',
    backgroundColor: 'rgba(7,18,48,0.18)',
  },
  rearGlow: {
    position: 'absolute',
    width: '70%',
    height: '42%',
    top: '18%',
    borderRadius: 999,
    backgroundColor: 'rgba(74,96,255,0.10)',
  },
  floorGlow: {
    position: 'absolute',
    bottom: '10%',
    width: '78%',
    height: '16%',
    borderRadius: 999,
    backgroundColor: 'rgba(84,183,255,0.18)',
  },
  floorLine: {
    position: 'absolute',
    left: '16%',
    right: '16%',
    bottom: '20%',
    height: 2,
    backgroundColor: 'rgba(114,206,255,0.22)',
  },
  sideWall: {
    position: 'absolute',
    top: '16%',
    bottom: '18%',
    width: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(89,150,255,0.10)',
  },
  sideWallLeft: {
    left: '9%',
  },
  sideWallRight: {
    right: '9%',
  },
  baseBlock: {
    position: 'absolute',
    bottom: '4%',
    width: '18%',
    height: '16%',
    borderRadius: 16,
    backgroundColor: 'rgba(8,16,42,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(88,154,255,0.12)',
  },
  baseBlockLeft: {
    left: '4%',
  },
  baseBlockRight: {
    right: '4%',
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
