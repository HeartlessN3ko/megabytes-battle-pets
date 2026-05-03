/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

/**
 * v1 design tokens — pulled in by HomeNavBar + inventory + (eventually) every
 * chrome surface. Inline magic numbers (paddingVertical: 4, fontSize: 11) get
 * replaced with these so spacing + type stay coherent across the app.
 *
 * Grow this list cautiously. New tokens land when a value gets repeated in
 * 3+ places. Don't pre-design tokens for screens that don't exist yet.
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const TYPE = {
  micro:    { fontSize: 8.5, fontWeight: '700' as const, letterSpacing: 1.2 },
  caption:  { fontSize: 9.5, fontWeight: '700' as const, letterSpacing: 0.6 },
  body:     { fontSize: 11,  fontWeight: '600' as const },
  bodyBold: { fontSize: 11,  fontWeight: '800' as const, letterSpacing: 0.6 },
  label:    { fontSize: 12,  fontWeight: '900' as const, letterSpacing: 1.2 },
  title:    { fontSize: 14,  fontWeight: '900' as const, letterSpacing: 0.5 },
  hero:     { fontSize: 18,  fontWeight: '900' as const, letterSpacing: 3 },
} as const;

export const PALETTE = {
  // Nav
  navActive:   '#7ec8ff',
  navInactive: 'rgba(255,255,255,0.4)',
  navBg:       'rgba(5,12,40,0.97)',
  navBorder:   'rgba(80,160,255,0.2)',
  // Accents
  accentBlue:  '#7ec8ff',
  accentDark:  '#0a1840',
  // Text
  textHi:  '#fff',
  textMid: 'rgba(220,240,255,0.65)',
  textLo:  'rgba(160,210,255,0.5)',
  // Panels
  panelBg:     'rgba(6,14,50,0.88)',
  panelBgSoft: 'rgba(8,18,62,0.7)',
  panelBorder: 'rgba(120,195,255,0.18)',
  panelBorderSoft: 'rgba(120,195,255,0.15)',
  // Status bar / chip
  chipBg:     'rgba(8,18,62,0.6)',
  chipBorder: 'rgba(120,195,255,0.2)',
  chipText:   'rgba(160,210,255,0.5)',
  // Status row
  statusBg:     'rgba(4,12,40,0.7)',
  statusBorder: 'rgba(74,158,255,0.2)',
  statusText:   'rgba(160,210,255,0.7)',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
