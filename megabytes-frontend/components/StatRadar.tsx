/**
 * StatRadar
 *
 * SVG radar chart for showing 3-8 stat values on a normalized scale (default
 * 0-100). The chart is purely presentational — it draws the polygon, rings,
 * spokes, and vertex markers, and overlays each axis label as a native Text
 * box so labels stay crisp at any size.
 *
 * Used by:
 *  - training-center room (6 stats: Power / Speed / Accuracy / Defense / Special / Stamina)
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';

export type StatRadarStat = { label: string; value: number };

export type StatRadarProps = {
  /** 3-8 stats. Order is preserved (vertex 0 starts at the top). */
  stats: StatRadarStat[];
  /** Outer SVG dimension (square). Default 280. */
  size?: number;
  /** Value that fills the chart to the outer ring. Default 100. */
  maxValue?: number;
  /** Filled polygon + vertex marker color. */
  accent?: string;
  /** Ring + spoke color. */
  trackColor?: string;
  /** Axis label text color. */
  labelColor?: string;
  /** Axis value text color. */
  valueColor?: string;
};

const RING_LEVELS = [0.25, 0.5, 0.75, 1.0];
const LABEL_BOX_WIDTH = 70;

export function StatRadar({
  stats,
  size = 280,
  maxValue = 100,
  accent = '#d893ff',
  trackColor = 'rgba(136,210,255,0.22)',
  labelColor = '#9bdfff',
  valueColor = '#ffffff',
}: StatRadarProps) {
  if (!stats || stats.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 38; // padding for labels
  const n = stats.length;

  const angleFor = (i: number) =>
    (-90 + (360 / n) * i) * (Math.PI / 180);

  const pointFor = (i: number, frac: number) => {
    const a = angleFor(i);
    return {
      x: cx + Math.cos(a) * radius * frac,
      y: cy + Math.sin(a) * radius * frac,
    };
  };

  const labelPointFor = (i: number) => {
    const a = angleFor(i);
    return {
      x: cx + Math.cos(a) * (radius + 22),
      y: cy + Math.sin(a) * (radius + 22),
    };
  };

  const valuePolygon = stats
    .map((s, i) => {
      const frac = clamp01(s.value / maxValue);
      const p = pointFor(i, frac);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {RING_LEVELS.map((level) => {
          const points = stats
            .map((_, i) => {
              const p = pointFor(i, level);
              return `${p.x},${p.y}`;
            })
            .join(' ');
          return (
            <Polygon
              key={`ring-${level}`}
              points={points}
              fill="none"
              stroke={trackColor}
              strokeWidth={1}
            />
          );
        })}

        {stats.map((_, i) => {
          const tip = pointFor(i, 1);
          return (
            <Line
              key={`spoke-${i}`}
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              stroke={trackColor}
              strokeWidth={1}
            />
          );
        })}

        <Polygon
          points={valuePolygon}
          fill={accent}
          fillOpacity={0.32}
          stroke={accent}
          strokeWidth={1.5}
        />

        {stats.map((s, i) => {
          const frac = clamp01(s.value / maxValue);
          const p = pointFor(i, frac);
          return (
            <Circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill={accent}
            />
          );
        })}
      </Svg>

      {stats.map((s, i) => {
        const lp = labelPointFor(i);
        return (
          <View
            key={`label-${i}`}
            pointerEvents="none"
            style={[
              styles.labelBox,
              {
                left: lp.x - LABEL_BOX_WIDTH / 2,
                top: lp.y - 16,
              },
            ]}
          >
            <Text style={[styles.labelText, { color: labelColor }]} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={[styles.valueText, { color: valueColor }]}>
              {Math.round(Number(s.value || 0))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBox: {
    position: 'absolute',
    width: LABEL_BOX_WIDTH,
    alignItems: 'center',
    gap: 1,
  },
  labelText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  valueText: {
    fontSize: 13,
    fontWeight: '900',
  },
});
