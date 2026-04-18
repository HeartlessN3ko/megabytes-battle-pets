import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const SFX = {
  // ── Byte sounds ──────────────────────────────────────────────────
  tap:      require('../assets/sfx/byte/byte1.mp3'),
  chirp1:   require('../assets/sfx/byte/stage1chirp.mp3'),
  chirp2:   require('../assets/sfx/byte/stage1chrip2.mp3'),
  move:     require('../assets/sfx/byte/stage1btye-move.mp3'),
  yes:      require('../assets/sfx/byte/stage1btye-yes.mp3'),
  no:       require('../assets/sfx/byte/stage1btye-no.mp3'),
  positive: require('../assets/sfx/byte/stage1btye-positive.mp3'),
  negative: require('../assets/sfx/byte/stage1btye-negative.mp3'),

  // ── Menu / UI ─────────────────────────────────────────────────────
  menu:         require('../assets/sfx/menusfx.mp3'),
  menu_press:   require('../assets/sfx/menu_press.mp3'),
  menu_close:   require('../assets/sfx/menu_close.mp3'),
  press_start:  require('../assets/sfx/press_start.mp3'),
  notify:       require('../assets/sfx/notificationsfx.mp3'),
  confirm:      require('../assets/sfx/confirm.mp3'),
  error:        require('../assets/sfx/error.mp3'),
  stats_open:   require('../assets/sfx/stats.mp3'),
  ui_accept:    require('../assets/sfx/ui_accept.wav'),
  ui_deny:      require('../assets/sfx/ui_deny.wav'),
  ui_back:      require('../assets/sfx/ui_back.wav'),
  ui_snap:      require('../assets/sfx/ui_snap.wav'),
  ui_pop:       require('../assets/sfx/ui_pop.wav'),
  ui_happy:     require('../assets/sfx/ui_happy.wav'),
  ui_twinkle:   require('../assets/sfx/ui_twinkle.wav'),
  game_entry:   require('../assets/sfx/game_entry.wav'),

  // ── Items / Economy ───────────────────────────────────────────────
  inventory_open: require('../assets/sfx/inventory.mp3'),
  item_open:      require('../assets/sfx/item_open.wav'),
  item_collect:   require('../assets/sfx/item_collect.wav'),
  item_use:       require('../assets/sfx/item_use.wav'),
  coins:          require('../assets/sfx/coins.wav'),
  coin_flip:      require('../assets/sfx/coin_flip.wav'),

  // ── Progression ───────────────────────────────────────────────────
  level_up:        require('../assets/sfx/level_up.wav'),
  egg_hatch:       require('../assets/sfx/egg_hatch.wav'),
  evolve_complete: require('../assets/sfx/evolve_complete.wav'),
  stage_evolve:    require('../assets/sfx/stage_evolve.wav'),
  xp_gain:         require('../assets/sfx/xp_gain.wav'),
  confetti:        require('../assets/sfx/confetti.wav'),

  // ── Byte lifecycle ────────────────────────────────────────────────
  byte_sleep: require('../assets/sfx/byte_sleep.wav'),
  byte_wake:  require('../assets/sfx/byte_wake.wav'),
  byte_death: require('../assets/sfx/byte_death.wav'),

  // ── Care actions ──────────────────────────────────────────────────
  feed:   require('../assets/sfx/feed.wav'),
  clean:  require('../assets/sfx/clean.wav'),
  play:   require('../assets/sfx/play.wav'),
  praise: require('../assets/sfx/praise.wav'),
  scold:  require('../assets/sfx/scold.wav'),

  // ── Battle ────────────────────────────────────────────────────────
  battle_hit:   require('../assets/sfx/battle_hit.wav'),
  defeat:       require('../assets/sfx/defeat.wav'),
  win_big:      require('../assets/sfx/win_big.wav'),
  electric_arc: require('../assets/sfx/electric_arc.wav'),

  // ── Corruption ────────────────────────────────────────────────────
  corrupt_event:   require('../assets/sfx/corrupt_event.wav'),
  corrupt_glitch:  require('../assets/sfx/corrupt_glitch.wav'),
  corrupt_tick:    require('../assets/sfx/corrupt_tick.wav'),
  corrupt_warning: require('../assets/sfx/corrupt_warning.wav'),

  // ── Navigation / alerts ───────────────────────────────────────────
  alert_ping:     require('../assets/sfx/alert_ping.wav'),
  transition_in:  require('../assets/sfx/transition_in.wav'),
  transition_out: require('../assets/sfx/transition_out.wav'),

  // ── Training ──────────────────────────────────────────────────────
  power_up: require('../assets/sfx/power_up.wav'),
  mutation: require('../assets/sfx/mutation.wav'),

  // ── Minigame: RPS / shared ────────────────────────────────────────
  mg_open:    require('../assets/minigame/minigame-sfx/minigame_ui_open.wav'),
  mg_close:   require('../assets/minigame/minigame-sfx/minigame_ui_close.wav'),
  mg_win:     require('../assets/minigame/minigame-sfx/minigame_score_perfect.wav'),
  mg_good:    require('../assets/minigame/minigame-sfx/minigame_score_good.wav'),
  mg_lose:    require('../assets/minigame/minigame-sfx/minigame_score_fail.wav'),
  mg_draw:    require('../assets/minigame/minigame-sfx/minigame_emote_match.wav'),
  mg_tick:    require('../assets/minigame/minigame-sfx/minigame_score_tick.wav'),
  mg_reveal:  require('../assets/minigame/minigame-sfx/minigame_sync_connect.wav'),
  mg_return:  require('../assets/minigame/minigame-sfx/minigame_return_room.wav'),
  mg_signal:  require('../assets/minigame/minigame-sfx/minigame_signal_trace.wav'),

  // ── Minigame: care actions ────────────────────────────────────────
  mg_feed:          require('../assets/minigame/minigame-sfx/minigame_feed_upload.wav'),
  mg_clean:         require('../assets/minigame/minigame-sfx/minigame_cleanup_scrub.wav'),
  mg_process_loop:  require('../assets/minigame/minigame-sfx/minigame_process_loop.wav'),
  mg_process_done:  require('../assets/minigame/minigame-sfx/minigame_process_done.wav'),

  // ── Minigame: target / tap ────────────────────────────────────────
  mg_hit:   require('../assets/minigame/minigame-sfx/minigame_target_hit.wav'),
  mg_miss:  require('../assets/minigame/minigame-sfx/minigame_target_miss.wav'),
  mg_spawn: require('../assets/minigame/minigame-sfx/minigame_target_spawn.wav'),

  // ── Minigame: RPS cards ───────────────────────────────────────────
  card_deal:    require('../assets/sfx/card_deal.wav'),
  card_shuffle: require('../assets/sfx/card_shuffle.wav'),
  rps_select:   require('../assets/sfx/rps_select.wav'),

  // ── Training stat SFX ─────────────────────────────────────────────
  train_power:    require('../assets/minigame/minigame-sfx/training_power_hit.wav'),
  train_speed:    require('../assets/minigame/minigame-sfx/training_speed_step.wav'),
  train_defense:  require('../assets/minigame/minigame-sfx/training_defense_merge.wav'),
  train_stamina:  require('../assets/minigame/minigame-sfx/training_stamina_mash.wav'),
  train_special:  require('../assets/minigame/minigame-sfx/training_special_charge.wav'),
  train_accuracy: require('../assets/minigame/minigame-sfx/training_accuracy_lock.wav'),
  train_agility:  require('../assets/minigame/minigame-sfx/training_agility_ping.wav'),
} as const;

export type SfxKey = keyof typeof SFX;

let sfxEnabled = true;
export function setSfxEnabled(enabled: boolean) { sfxEnabled = enabled; }
export function isSfxEnabled() { return sfxEnabled; }

let initialized = false;

export async function initSfx() {
  if (initialized) return;
  initialized = true;
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // Ignore in demo mode if audio init fails on a platform.
  }
}

const MAX_SFX_DURATION_MS = 8000; // safety cap — kills any player that hasn't finished (e.g. loop files)

export async function playSfx(key: SfxKey, volume = 0.9) {
  if (!sfxEnabled) return;
  try {
    await initSfx();
    const player = createAudioPlayer(SFX[key], { keepAudioSessionActive: true, updateInterval: 120 });
    player.volume = Math.max(0, Math.min(1, Number(volume || 0)));

    const cleanup = () => {
      sub?.remove();
      clearTimeout(killTimer);
      try { player.remove(); } catch {}
    };

    const killTimer = setTimeout(cleanup, MAX_SFX_DURATION_MS);

    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (!status?.didJustFinish) return;
      cleanup();
    });

    player.play();
  } catch {
    // Fail silently for non-critical demo audio.
  }
}
