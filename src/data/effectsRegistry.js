/**
 * EFFECTS REGISTRY — Single Source of Truth
 * All moves, items, and temperament passives must reference this file.
 * No inline effect definitions anywhere else in the codebase.
 */

// --- BUFF EFFECTS (.sys) ---
const BUFFS = {
  'power_up.sys':    { type: 'buff', stat: 'Power',    value: 0.20, duration: 8 },
  'speed_up.sys':    { type: 'buff', stat: 'Speed',    value: 0.20, duration: 8 },
  'defense_up.sys':  { type: 'buff', stat: 'Defense',  value: 0.20, duration: 8 },
  'special_up.sys':  { type: 'buff', stat: 'Special',  value: 0.20, duration: 8 },
  'accuracy_up.sys': { type: 'buff', stat: 'Accuracy', value: 0.20, duration: 8 },
  'regen.sys':       { type: 'hot',  effectType: 'healing_over_time', value: 0.03, duration: 8 },
  'haste.sys':       { type: 'buff', effectType: 'attack_rate_bonus', value: 0.20, duration: 8 },
  'cleanse.sys':     { type: 'utility', effectType: 'cleanse', removes: ['debuffs', 'negative_status'], isInstant: true }
};

// --- DEBUFF EFFECTS (.sys) ---
const DEBUFFS = {
  'power_down.sys':    { type: 'debuff', stat: 'Power',    value: 0.20, duration: 8 },
  'speed_down.sys':    { type: 'debuff', stat: 'Speed',    value: 0.20, duration: 8 },
  'defense_down.sys':  { type: 'debuff', stat: 'Defense',  value: 0.20, duration: 8 },
  'special_down.sys':  { type: 'debuff', stat: 'Special',  value: 0.20, duration: 8 },
  'accuracy_down.sys': { type: 'debuff', stat: 'Accuracy', value: 0.20, duration: 8 },
  'slow.sys':     { type: 'debuff', effectType: 'attack_rate_reduction',  value: 0.20, duration: 8 },
  'weaken.sys':   { type: 'debuff', effectType: 'damage_output_reduction', value: 0.20, duration: 8 },
  'fragile.sys':  { type: 'debuff', effectType: 'increase_damage_taken',   value: 0.20, duration: 8 },
  'anti_heal.sys':{ type: 'debuff', effectType: 'reduce_healing_received', value: 0.50, duration: 8 },
  'energy_drain.sys': { type: 'debuff', effectType: 'reduce_bandwidth', value: 0.25, isInstant: true }
};

// --- STATUS EFFECTS (.tmp) — max 1 active, new overwrites old ---
const STATUSES = {
  'burn.status':    { type: 'status', effectType: 'damage_over_time',       value: 0.05, duration: 8 },
  'poison.status':  { type: 'status', effectType: 'damage_over_time',       value: 0.07, duration: 8 },
  'stun.status':    { type: 'status', effectType: 'skip_actions',           value: 1.0,  duration: 2 },
  'blind.status':   { type: 'status', effectType: 'reduced_hit_chance',     value: 0.30, duration: 8 },
  'confuse.status': { type: 'status', effectType: 'random_action_failure',  value: 0.30, duration: 8 },
  'freeze.status':  { type: 'status', effectType: 'attack_rate_reduction',  value: 0.50, duration: 6 },
  'shock.status':   { type: 'status', effectType: 'intermittent_stun',      value: 0.25, duration: 6 },
  'fear.status':    { type: 'status', effectType: 'reduced_damage_output',  value: 0.25, duration: 8 },
  'silence.status': { type: 'status', effectType: 'disable_ult',            value: 1.0,  duration: 8 }
};

// --- TEMPERAMENT PASSIVES (.cfg) ---
const PASSIVES = {
  'Noble':      { statMod: { Defense: 0.10 }, specialRule: 'reduced_damage_at_low_hp' },
  'Kind':       { effectType: 'healing_over_time', value: 0.02 },
  'Calm':       { specialRule: 'reduce_negative_status_duration', value: 0.25 },
  'Focused':    { statMod: { Accuracy: 0.10 } },
  'Proud':      { statMod: { Power: 0.10 }, condition: 'hp_above_75_percent' },
  'Fierce':     { statMod: { Power: 0.15, Defense: -0.05 } },
  'Energetic':  { statMod: { Speed: 0.15 } },
  'Alert':      { specialRule: 'dodge_chance_bonus', value: 0.10 },
  'Sneaky':     { specialRule: 'first_hit_bonus', value: 0.20 },
  'Mysterious': { specialRule: 'random_minor_buff' },
  'Cold':       { specialRule: 'reduced_damage_taken_lower_healing' },
  'Wanderer':   { specialRule: 'stat_ramp_over_time' },
  'Anxious':    { statMod: { Speed: 0.10 }, specialRule: 'action_delay' },
  'Unstable':   { specialRule: 'random_stat_variance' },
  'Corrupt':    { statMod: { Power: 0.20 }, specialRule: 'self_dot', dotValue: 0.05 }
};

// --- STACKING RULES ---
const STACKING_RULES = {
  same_stat:      'no_stack_highest_applies', // highest value wins
  different_stats: 'can_stack',
  buff_vs_debuff: 'net_calculation'           // finalModifier = buff - debuff
};

// --- EFFECT LIMITS ---
const EFFECT_LIMITS = {
  maxActiveEffects: 3,
  maxActiveStatus:  1,
  buffDuration:     { default: 8, ult: 12 }
};

// --- EDGE CASE RESOLUTION ORDER ---
const EDGE_CASES = {
  cleanse_vs_apply_same_tick: 'cleanse_first',
  death_vs_heal_same_tick:    'heal_first',
  dot_vs_death:               'dot_can_kill'
};

// --- UNIFIED EXPORT ---
const EFFECTS_REGISTRY = {
  ...BUFFS,
  ...DEBUFFS,
  ...STATUSES,
  PASSIVES,
  STACKING_RULES,
  EFFECT_LIMITS,
  EDGE_CASES
};

/**
 * Retrieve an effect definition by ID.
 * Throws if the effect does not exist — prevents silent undefined references.
 */
function getEffect(id) {
  const effect = EFFECTS_REGISTRY[id];
  if (!effect) throw new Error(`[EffectsRegistry] Unknown effect: "${id}"`);
  return effect;
}

function isValidEffect(id) {
  return id in EFFECTS_REGISTRY;
}

/**
 * Get a temperament's passive effect definition.
 * Temperaments are keys in PASSIVES; returns the full passive definition.
 */
function getTemperamentPassive(temperamentName) {
  const passive = PASSIVES[temperamentName];
  if (!passive) throw new Error(`[EffectsRegistry] Unknown temperament: "${temperamentName}"`);
  return passive;
}

/**
 * Check if a temperament name is valid.
 */
function isValidTemperament(name) {
  return name in PASSIVES;
}

module.exports = { EFFECTS_REGISTRY, getEffect, isValidEffect, getTemperamentPassive, isValidTemperament, PASSIVES };
