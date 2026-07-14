/**
 * AgedByteRender
 *
 * Renders a byte sprite with an optional "old" overlay. Used by the home
 * stage and any room screen that displays the byte. When `isOld` is false,
 * collapses to a plain Image. When `isOld` is true, layers a tinted clone
 * of the same sprite on top to read as desaturated/aged, scaled per
 * TUNABLES.oldOverlay.SCALE for a slight wither.
 *
 * Why an Image-on-Image stack: React Native's core Image doesn't support
 * CSS-style filters. The dual-Image trick uses `tintColor` on the second
 * Image, which preserves the alpha mask of the sprite, so the gray tone
 * lands only on the byte itself — no square box around transparent areas.
 */

import React from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { TUNABLES } from '../config/tunables';

export type AgedByteRenderProps = {
  /** Sprite source (Image require result). */
  source: any;
  /** Apply the old overlay treatment when true. */
  isOld: boolean;
  /** Container width (matches sprite footprint). */
  width: number;
  /** Container height (matches sprite footprint). */
  height: number;
  /** Optional style overrides for the underlying Image. */
  imageStyle?: StyleProp<ImageStyle>;
  /** Optional style overrides for the wrapping View. */
  containerStyle?: StyleProp<ViewStyle>;
};

export function AgedByteRender({
  source,
  isOld,
  width,
  height,
  imageStyle,
  containerStyle,
}: AgedByteRenderProps) {
  const scale = isOld ? TUNABLES.oldOverlay.SCALE : 1;
  // Mild fade on the base sprite so the gray overlay reads as muted, not pasted.
  const baseOpacity = isOld ? 1 - TUNABLES.oldOverlay.TINT_OPACITY / 200 : 1;

  return (
    <View style={[{ width, height }, containerStyle]} collapsable={false}>
      <Image
        source={source}
        style={[
          { width, height },
          imageStyle,
          isOld && { opacity: baseOpacity, transform: [{ scale }] },
        ]}
        resizeMode="contain"
      />
      {isOld ? (
        <Image
          source={source}
          // RN's Image typings omit pointerEvents even though the native view
          // honors it — cast keeps the overlay tap-through without a wrapper.
          {...({ pointerEvents: 'none' } as any)}
          style={[
            StyleSheet.absoluteFillObject,
            {
              width,
              height,
              tintColor: TUNABLES.oldOverlay.TINT_COLOR,
              opacity: TUNABLES.oldOverlay.TINT_OPACITY / 100,
              transform: [{ scale }],
            },
          ]}
          resizeMode="contain"
        />
      ) : null}
    </View>
  );
}
