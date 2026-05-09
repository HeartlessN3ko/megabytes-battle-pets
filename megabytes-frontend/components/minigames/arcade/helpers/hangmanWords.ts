/**
 * Hangman / DECODE word catalog. Data + system + byte vocabulary.
 *
 * Starter list of 24 entries from the design doc. ChatGPT-domain extension
 * to 50-80 entries planned per AI_PROTOCOL (lore / FT). Keep this list pure
 * uppercase A-Z; the keyboard component assumes that shape.
 */

export const HANGMAN_WORDS: readonly string[] = [
  'FIREWALL', 'BANDWIDTH', 'PIXEL', 'PROTOCOL', 'BYTE', 'CACHE',
  'CORRUPTION', 'BUFFER', 'DAEMON', 'KERNEL', 'PACKET', 'SOCKET',
  'OVERFLOW', 'PARSE', 'COMPILE', 'REGISTRY', 'PINGBACK', 'CHECKSUM',
  'MAINFRAME', 'TERMINAL', 'BOOTLOADER', 'HANDSHAKE', 'LATENCY', 'DEFRAG',
];

export function pickRandomWord(): string {
  return HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
}
