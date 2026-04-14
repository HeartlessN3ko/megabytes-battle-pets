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

  // Element evolution cores — one per element type, any unlocks stage 2
  { id: 'fire_evo_core.pkg',     name: 'Fire Evo Core',     type: 'evolution', cost: 75,  unlocksStage: 'element', description: 'Fire element progression core.' },
  { id: 'water_evo_core.pkg',    name: 'Water Evo Core',    type: 'evolution', cost: 75,  unlocksStage: 'element', description: 'Water element progression core.' },
  { id: 'earth_evo_core.pkg',    name: 'Earth Evo Core',    type: 'evolution', cost: 75,  unlocksStage: 'element', description: 'Earth element progression core.' },
  { id: 'air_evo_core.pkg',      name: 'Air Evo Core',      type: 'evolution', cost: 75,  unlocksStage: 'element', description: 'Air element progression core.' },
  { id: 'electric_evo_core.pkg', name: 'Electric Evo Core', type: 'evolution', cost: 80,  unlocksStage: 'element', description: 'Electric element progression core.' },
  { id: 'nature_evo_core.pkg',   name: 'Nature Evo Core',   type: 'evolution', cost: 75,  unlocksStage: 'element', description: 'Nature element progression core.' },
  { id: 'shadow_evo_core.pkg',   name: 'Shadow Evo Core',   type: 'evolution', cost: 90,  unlocksStage: 'element', description: 'Shadow element progression core.' },
  { id: 'holy_evo_core.pkg',     name: 'Holy Evo Core',     type: 'evolution', cost: 90,  unlocksStage: 'element', description: 'Holy element progression core.' },
  // Feature and branch evolution items
  { id: 'wing_module.pkg',   name: 'Wing Module',   type: 'evolution', cost: 120, unlocksStage: 'feature', description: 'Feature progression module.' },
  { id: 'battlepatch.exe',   name: 'Battle Patch',  type: 'evolution', cost: 250, unlocksStage: 'branch',  description: 'Locks Battle branch at evolution.' },
  { id: 'carepatch.exe',     name: 'Care Patch',    type: 'evolution', cost: 250, unlocksStage: 'branch',  description: 'Locks Nurture branch at evolution.' },

  { id: 'fire_amp.sys', name: 'Fire Amplifier', type: 'stat_boost', cost: 60, useType: 'battle_only', description: 'Temporary fire damage boost.' },
  { id: 'null_field.pkg', name: 'Null Field', type: 'utility', cost: 150, useType: 'battle_only', description: 'Temporarily nullifies elemental bonuses.' },

  // Move-teach and combat ability items (phase 1 implementation placeholders from MD specs)
  { id: 'fire_core.pkg', name: 'Fire Core Teach Pack', type: 'move_teach', cost: 80, teachesMove: ['fireball.py', 'flame_wall.sys'], description: 'Teaches core fire move set.' },
  { id: 'water_core.pkg', name: 'Water Core Teach Pack', type: 'move_teach', cost: 80, teachesMove: ['aqua_blast.py', 'flow_state.sys'], description: 'Teaches core water move set.' },
  { id: 'earth_core.pkg', name: 'Earth Core Teach Pack', type: 'move_teach', cost: 85, teachesMove: ['rock_crash.py', 'fortify_shell.sys'], description: 'Teaches core earth move set.' },
  { id: 'air_core.pkg', name: 'Air Core Teach Pack', type: 'move_teach', cost: 80, teachesMove: ['air_slash.py', 'haste_wind.sys'], description: 'Teaches core air move set.' },
  { id: 'electric_core.pkg', name: 'Electric Core Teach Pack', type: 'move_teach', cost: 85, teachesMove: ['shock_burst.py', 'overclock.sys'], description: 'Teaches core electric move set.' },
  { id: 'nature_core.pkg', name: 'Nature Core Teach Pack', type: 'move_teach', cost: 80, teachesMove: ['vine_whip.py', 'growth_bloom.sys'], description: 'Teaches core nature move set.' },
  { id: 'shadow_core.pkg', name: 'Shadow Core Teach Pack', type: 'move_teach', cost: 90, teachesMove: ['shadow_strike.py', 'weaken_signal.dll'], description: 'Teaches core shadow move set.' },
  { id: 'holy_core.pkg', name: 'Holy Core Teach Pack', type: 'move_teach', cost: 90, teachesMove: ['light_beam.py', 'bless_up.sys'], description: 'Teaches core holy move set.' },
  { id: 'combat_core.pkg', name: 'Combat Core Teach Pack', type: 'move_teach', cost: 95, teachesMove: ['guard_break.dll', 'focus_stance.sys'], description: 'Teaches neutral combat utility moves.' },
  { id: 'ult_unlock.pkg', name: 'Ult Unlock Pack', type: 'move_teach', cost: 120, teachesMove: ['Inferno.exe'], description: 'Unlocks a first ultimate option for testing.' },
  { id: 'hybrid_key_alpha.pkg', name: 'Hybrid Key Alpha', type: 'move_teach', cost: 130, teachesMove: ['inferno_chain.py'], description: 'Unlocks a hybrid move prototype.' },
  { id: 'hybrid_key_beta.pkg', name: 'Hybrid Key Beta', type: 'move_teach', cost: 130, teachesMove: ['thunder_lock.exe'], description: 'Unlocks an alternate hybrid move prototype.' },
  { id: 'rewrite_kernel.pkg', name: 'Rewrite Kernel', type: 'utility', cost: 90, useType: 'overworld_only', description: 'Placeholder reroll utility for learned move refresh.' },
  { id: 'swap_protocol.pkg', name: 'Swap Protocol', type: 'utility', cost: 70, useType: 'overworld_only', description: 'Placeholder loadout swap helper.' },
  { id: 'ult_boost.sys', name: 'Ult Boost', type: 'stat_boost', cost: 110, useType: 'battle_only', appliesEffect: 'special_up.sys', description: 'Temporary ult scaling boost placeholder.' },
  { id: 'ult_reset.pkg', name: 'Ult Reset', type: 'clutch', cost: 140, useType: 'battle_only', description: 'Placeholder second-cast unlock token.' },
  { id: 'passive_seed.pkg', name: 'Passive Seed', type: 'utility', cost: 115, useType: 'overworld_only', description: 'Placeholder random passive grant token.' },
  { id: 'passive_override.pkg', name: 'Passive Override', type: 'utility', cost: 160, useType: 'overworld_only', description: 'Placeholder passive replacement token.' },
  { id: 'cleanse_patch.pkg', name: 'Cleanse Patch', type: 'move_teach', cost: 60, teachesMove: ['refresh_stream.bin'], description: 'Teaches cleanse utility move.' },
  { id: 'regen_patch.pkg', name: 'Regen Patch', type: 'move_teach', cost: 60, teachesMove: ['healing_sap.bin'], description: 'Teaches regen utility move.' },
  { id: 'disrupt_patch.pkg', name: 'Disrupt Patch', type: 'move_teach', cost: 60, teachesMove: ['circuit_break.dll'], description: 'Teaches disruption debuff move.' },
  { id: 'burst_override.pkg', name: 'Burst Override', type: 'clutch', cost: 95, useType: 'battle_only', description: 'Placeholder: next move crit override.' },
  { id: 'precision_lock.pkg', name: 'Precision Lock', type: 'clutch', cost: 80, useType: 'battle_only', description: 'Placeholder: next move cannot miss.' },
  { id: 'panic_patch.pkg', name: 'Panic Patch', type: 'clutch', cost: 100, useType: 'battle_only', description: 'Placeholder: auto-heal at low HP.' },
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
