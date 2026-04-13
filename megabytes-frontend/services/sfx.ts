import { Audio } from 'expo-av';

const SFX = {
  menu: require('../assets/sfx/menusfx.mp3'),
  notify: require('../assets/sfx/notificationsfx.mp3'),
  tap: require('../assets/sfx/byte1.mp3'),
  chirp1: require('../assets/sfx/stage1chirp.mp3'),
  chirp2: require('../assets/sfx/stage1chrip2.mp3'),
  move: require('../assets/sfx/stage1btye-move.mp3'),
  yes: require('../assets/sfx/stage1btye-yes.mp3'),
  no: require('../assets/sfx/stage1btye-no.mp3'),
  positive: require('../assets/sfx/stage1btye-positive.mp3'),
  negative: require('../assets/sfx/stage1btye-negative.mp3'),
  alt: require('../assets/sfx/sfx.wav'),
} as const;

export type SfxKey = keyof typeof SFX;

let initialized = false;

export async function initSfx() {
  if (initialized) return;
  initialized = true;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // Ignore in demo mode if audio init fails on a platform.
  }
}

export async function playSfx(key: SfxKey, volume = 0.9) {
  try {
    await initSfx();
    const { sound } = await Audio.Sound.createAsync(SFX[key], { shouldPlay: true, volume });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {
    // Fail silently for non-critical demo audio.
  }
}
