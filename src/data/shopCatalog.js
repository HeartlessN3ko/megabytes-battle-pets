const SHOP_ITEMS = [
  { id: 'clean_meat.pkg', name: 'Clean Meat', type: 'recovery', cost: 25, restoreNeeds: { Hunger: 35, Mood: 5, Hygiene: -5 }, description: 'High-density protein block with cleanup tradeoff.' },
  { id: 'green_stack.pkg', name: 'Green Stack', type: 'recovery', cost: 20, restoreNeeds: { Hunger: 25, Hygiene: 10, Mood: -5 }, description: 'Balanced clean intake.' },
  { id: 'synth_meal.pkg', name: 'Synth Meal', type: 'recovery', cost: 40, restoreNeeds: { Hunger: 50, Bandwidth: -10, Mood: -5 }, description: 'Strong hunger restore with energy drain.' },
  { id: 'glitch_snack.pkg', name: 'Glitch Snack', type: 'clutch', cost: 35, restoreNeeds: { Hunger: 15, Mood: 15 }, description: 'Risky mood-boosting treat.' },

  { id: 'nano_wipe.pkg', name: 'Nano Wipe', type: 'recovery', cost: 20, restoreNeeds: { Hygiene: 20, Mood: -5 }, description: 'Quick-clean patch.' },
  { id: 'deep_scrub.sys', name: 'Deep Scrub', type: 'recovery', cost: 35, restoreNeeds: { Hygiene: 40, Bandwidth: -10 }, description: 'Heavy clean cycle.' },
  { id: 'purge_patch.pkg', name: 'Purge Patch', type: 'utility', cost: 45, restoreNeeds: { Hygiene: 15, Mood: -10 }, description: 'Corruption cleanse protocol.' },

  { id: 'vibe_patch.pkg', name: 'Vibe Patch', type: 'recovery', cost: 20, restoreNeeds: { Mood: 25, Bandwidth: -5 }, description: 'Mood stabilization patch.' },
  { id: 'hype_burst.pkg', name: 'Hype Burst', type: 'clutch', cost: 30, restoreNeeds: { Mood: 30 }, description: 'High mood spike for performance.' },

  { id: 'quick_charge.pkg', name: 'Quick Charge', type: 'recovery', cost: 20, restoreNeeds: { Bandwidth: 25, Mood: -5 }, description: 'Fast energy recovery.' },
  { id: 'full_charge.sys', name: 'Full Charge', type: 'recovery', cost: 40, restoreNeeds: { Bandwidth: 50, Hunger: -15 }, description: 'Heavy energy recovery.' },
  { id: 'overclock_snack.pkg', name: 'Overclock Snack', type: 'clutch', cost: 60, restoreNeeds: { Bandwidth: 35 }, description: 'Risky overclock booster.' },

  { id: 'comfort_pack.pkg', name: 'Comfort Pack', type: 'recovery', cost: 35, restoreNeeds: { Mood: 15, Hygiene: 15, Hunger: 10, Bandwidth: -5 }, description: 'Balanced care bundle.' },
  { id: 'recovery_bundle.pkg', name: 'Recovery Bundle', type: 'recovery', cost: 38, restoreNeeds: { Hunger: 20, Bandwidth: 20, Mood: -10 }, description: 'Emergency recovery set.' },

  { id: 'fire_core.pkg', name: 'Fire Core', type: 'evolution', cost: 75, unlocksStage: 'element', description: 'Element progression core.' },
  { id: 'water_core.pkg', name: 'Water Core', type: 'evolution', cost: 75, unlocksStage: 'element', description: 'Element progression core.' },
  { id: 'wing_module.pkg', name: 'Wing Module', type: 'evolution', cost: 120, unlocksStage: 'feature', description: 'Feature progression module.' },
  { id: 'battlepatch.exe', name: 'Battle Patch', type: 'evolution', cost: 250, unlocksStage: 'branch', description: 'Battle branch lock item.' },

  { id: 'fire_amp.sys', name: 'Fire Amplifier', type: 'stat_boost', cost: 60, useType: 'battle_only', description: 'Temporary fire damage boost.' },
  { id: 'null_field.pkg', name: 'Null Field', type: 'utility', cost: 150, useType: 'battle_only', description: 'Temporarily nullifies elemental bonuses.' },
];

const SHOP_ROOMS = [
  {
    id: 'Bedroom',
    name: 'Bedroom',
    category: 'core',
    availableActions: ['rest', 'sleep', 'calm'],
    unlockCost: 0,
    unlockLevel: 1,
    description: 'Recovery and mood restoration room.',
  },
  {
    id: 'Kitchen',
    name: 'Kitchen',
    category: 'core',
    availableActions: ['feed', 'meal', 'snack'],
    unlockCost: 0,
    unlockLevel: 1,
    description: 'Feeding and meal management room.',
  },
  {
    id: 'Bathroom',
    name: 'Bathroom',
    category: 'core',
    availableActions: ['clean', 'deep_clean', 'quick_wash'],
    unlockCost: 0,
    unlockLevel: 1,
    description: 'Hygiene and corruption cleanup room.',
  },
  {
    id: 'Training_Center',
    name: 'Training Center',
    category: 'active',
    availableActions: ['power_drill', 'speed_drill', 'defense_drill'],
    unlockCost: 80,
    unlockLevel: 2,
    description: 'Focused combat stat development room.',
  },
  {
    id: 'Clinic',
    name: 'Clinic',
    category: 'active',
    availableActions: ['stabilize', 'patch_cleanse', 'diagnostics'],
    unlockCost: 110,
    unlockLevel: 2,
    description: 'Recovery and support room.',
  },
  {
    id: 'Play_Room',
    name: 'Play Room',
    category: 'active',
    availableActions: ['toy_loop', 'sync_game', 'minigame_slot'],
    unlockCost: 95,
    unlockLevel: 2,
    description: 'Mood-focused engagement room.',
  },
];

function asMapObject(value) {
  return value && typeof value === 'object' ? value : {};
}

module.exports = { SHOP_ITEMS, SHOP_ROOMS, asMapObject };
