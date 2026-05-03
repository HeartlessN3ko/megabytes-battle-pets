/**
 * TEST-CANDIDATE ASSET REGISTRY
 *
 * Single source of truth for the hand-picked candidate art that's living in
 * the build for Skye to evaluate. Every consumer (HazardOverlay, eventual
 * VFX layer, eventual UI feedback) reads from here — never direct require()
 * calls scattered through component files. That keeps the swap surface to
 * one file.
 *
 * SWAP PATTERN
 * ────────────
 * To swap which sprite a slot uses, edit one require() line in this file
 * (e.g., point `hazard.fire` at a different file under
 * `assets/test_candidates/hazard_picks/`). To revert, change it back.
 * No other code touches.
 *
 * To toggle the whole layer off, flip `TUNABLES.testCandidates.ENABLED`
 * to `false` in `tunables.ts` — every consumer falls back to its existing
 * default (emoji glyphs, no VFX, etc.). To toggle a single slot, set its
 * per-slot override in tunables to `null` — only that slot reverts.
 *
 * Loaded vs reference-only:
 *   - hazard / vfx / uiFeedback are loaded as game assets via require().
 *   - decor_tilesheets / death_picks / ui_overview are reference art
 *     copied into the tree but not imported. They live in
 *     `assets/test_candidates/` for Skye's review only.
 */

export const TEST_CANDIDATES = {
  hazard: {
    fire:        require('../assets/test_candidates/hazard_picks/HAZARD_fire_spark.png'),
    fire_alt:    require('../assets/test_candidates/hazard_picks/HAZARD_fire_lightning.png'),
    corrupt:     require('../assets/test_candidates/hazard_picks/HAZARD_corrupt_skullsmoke.png'),
    corrupt_alt: require('../assets/test_candidates/hazard_picks/HAZARD_corrupt_death.png'),
    leak:        require('../assets/test_candidates/hazard_picks/HAZARD_leak_warp.png'),
    warning:     require('../assets/test_candidates/hazard_picks/HAZARD_warning_alert.png'),
  },
  vfx: {
    comboFlash:     require('../assets/test_candidates/vfx_picks/VFX_combo_flash.png'),
    perfectImpact:  require('../assets/test_candidates/vfx_picks/VFX_perfect_impact.png'),
    cleanSparkle:   require('../assets/test_candidates/vfx_picks/VFX_clean_sparkle.png'),
    milestoneLight: require('../assets/test_candidates/vfx_picks/VFX_milestone_light.png'),
    affectionHeart: require('../assets/test_candidates/vfx_picks/VFX_affection_heart.png'),
    rewardCoin:     require('../assets/test_candidates/vfx_picks/VFX_reward_coin.png'),
    failSymbol:     require('../assets/test_candidates/vfx_picks/VFX_fail_symbol.png'),
    win1stPlace:    require('../assets/test_candidates/vfx_picks/VFX_win_1st_place.png'),
  },
  uiFeedback: {
    burstFail:        require('../assets/test_candidates/ui_feedback_named/burst_fail.png'),
    burstGood:        require('../assets/test_candidates/ui_feedback_named/burst_good.png'),
    burstPerfect:     require('../assets/test_candidates/ui_feedback_named/burst_perfect.png'),
    panelFrame:       require('../assets/test_candidates/ui_feedback_named/panel_frame.png'),
    pressRing:        require('../assets/test_candidates/ui_feedback_named/press_ring.png'),
    progressBarSheen: require('../assets/test_candidates/ui_feedback_named/progress_bar_sheen.png'),
    scanlineOverlay:  require('../assets/test_candidates/ui_feedback_named/scanline_overlay.png'),
    scorePopup:       require('../assets/test_candidates/ui_feedback_named/score_popup.png'),
    targetGlow:       require('../assets/test_candidates/ui_feedback_named/target_glow.png'),
  },
  // decor_tilesheets / death_picks / ui_overview are reference-only — copied
  // into assets/test_candidates/ for Skye but not loaded by any consumer.
} as const;

export type HazardSlotKey = keyof typeof TEST_CANDIDATES.hazard;
export type VfxSlotKey = keyof typeof TEST_CANDIDATES.vfx;
export type UiFeedbackSlotKey = keyof typeof TEST_CANDIDATES.uiFeedback;
