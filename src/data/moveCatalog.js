const MOVE_CATALOG = [
  // Normal
  { id: 'basic_ping.py', name: 'Basic Ping', element: 'Normal', function: 'Damage', power: 16, accuracy: 0.96, energyCost: 8, description: 'Stable baseline attack packet.' },
  { id: 'bite.exe', name: 'Bite', element: 'Normal', function: 'Damage', power: 22, accuracy: 0.92, energyCost: 10, description: 'Direct close-range strike.' },
  { id: 'focus_stance.sys', name: 'Focus Stance', element: 'Normal', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 9, appliesEffect: 'accuracy_up.sys', description: 'Raises targeting precision.' },
  { id: 'stagger_hit.exe', name: 'Stagger Hit', element: 'Normal', function: 'Status', power: 14, accuracy: 0.86, energyCost: 11, appliesStatus: 'stun.status', description: 'Interrupt chance on hit.' },
  { id: 'guard_break.dll', name: 'Guard Break', element: 'Normal', function: 'Debuff', power: 12, accuracy: 0.9, energyCost: 11, appliesEffect: 'defense_down.sys', description: 'Weakens enemy guard routines.' },
  { id: 'quick_patch.bin', name: 'Quick Patch', element: 'Normal', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 8, appliesEffect: 'regen.sys', description: 'Short self-repair routine.' },

  // Fire
  { id: 'fireball.py', name: 'Fireball', element: 'Fire', function: 'Damage', power: 24, accuracy: 0.9, energyCost: 12, appliesStatus: 'burn.status', description: 'Projectile burn attack.' },
  { id: 'flame_wall.sys', name: 'Flame Wall', element: 'Fire', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 11, appliesEffect: 'defense_up.sys', description: 'Thermal shield hardens defense.' },
  { id: 'burn_stack.exe', name: 'Burn Stack', element: 'Fire', function: 'Status', power: 10, accuracy: 0.88, energyCost: 12, appliesStatus: 'burn.status', description: 'Applies persistent burn.' },
  { id: 'heat_drain.dll', name: 'Heat Drain', element: 'Fire', function: 'Debuff', power: 12, accuracy: 0.9, energyCost: 11, appliesEffect: 'power_down.sys', description: 'Drains enemy power stability.' },
  { id: 'ember_restore.bin', name: 'Ember Restore', element: 'Fire', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 10, appliesEffect: 'regen.sys', description: 'Low-intensity self restore.' },

  // Water
  { id: 'aqua_blast.py', name: 'Aqua Blast', element: 'Water', function: 'Damage', power: 22, accuracy: 0.92, energyCost: 11, description: 'High-pressure water burst.' },
  { id: 'flow_state.sys', name: 'Flow State', element: 'Water', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 10, appliesEffect: 'regen.sys', description: 'Starts recovery stream.' },
  { id: 'soak_leak.exe', name: 'Soak Leak', element: 'Water', function: 'Debuff', power: 10, accuracy: 0.91, energyCost: 10, appliesEffect: 'speed_down.sys', description: 'Slows enemy execution cycle.' },
  { id: 'pressure_sink.dll', name: 'Pressure Sink', element: 'Water', function: 'Debuff', power: 0, accuracy: 0.9, energyCost: 12, appliesEffect: 'fragile.sys', description: 'Makes target take more damage.' },
  { id: 'refresh_stream.bin', name: 'Refresh Stream', element: 'Water', function: 'Utility', power: 0, accuracy: 1.0, energyCost: 10, appliesEffect: 'cleanse.sys', description: 'Cleanses negative states.' },

  // Earth
  { id: 'rock_crash.py', name: 'Rock Crash', element: 'Earth', function: 'Damage', power: 26, accuracy: 0.86, energyCost: 13, description: 'Heavy earth impact strike.' },
  { id: 'fortify_shell.sys', name: 'Fortify Shell', element: 'Earth', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 11, appliesEffect: 'defense_up.sys', description: 'Dense shell defensive buff.' },
  { id: 'dust_blind.exe', name: 'Dust Blind', element: 'Earth', function: 'Status', power: 8, accuracy: 0.87, energyCost: 11, appliesStatus: 'blind.status', description: 'Reduces hit chance.' },
  { id: 'weight_lock.dll', name: 'Weight Lock', element: 'Earth', function: 'Debuff', power: 0, accuracy: 0.9, energyCost: 12, appliesEffect: 'slow.sys', description: 'Reduces enemy action rate.' },
  { id: 'root_regen.bin', name: 'Root Regen', element: 'Earth', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 10, appliesEffect: 'regen.sys', description: 'Grounded regeneration routine.' },

  // Air
  { id: 'air_slash.py', name: 'Air Slash', element: 'Air', function: 'Damage', power: 20, accuracy: 0.95, energyCost: 10, description: 'Fast cutting wind arc.' },
  { id: 'haste_wind.sys', name: 'Haste Wind', element: 'Air', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 9, appliesEffect: 'haste.sys', description: 'Boosts attack cycle speed.' },
  { id: 'turbulence.exe', name: 'Turbulence', element: 'Air', function: 'Debuff', power: 12, accuracy: 0.9, energyCost: 10, appliesEffect: 'accuracy_down.sys', description: 'Destabilizes target aim.' },
  { id: 'vacuum_drag.dll', name: 'Vacuum Drag', element: 'Air', function: 'Debuff', power: 0, accuracy: 0.9, energyCost: 11, appliesEffect: 'slow.sys', description: 'Pulls down enemy speed.' },
  { id: 'breath_cycle.bin', name: 'Breath Cycle', element: 'Air', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 9, appliesEffect: 'speed_up.sys', description: 'Improves movement cadence.' },

  // Electric
  { id: 'shock_burst.py', name: 'Shock Burst', element: 'Electric', function: 'Damage', power: 23, accuracy: 0.9, energyCost: 12, appliesStatus: 'shock.status', description: 'Chance to interrupt actions.' },
  { id: 'overclock.sys', name: 'Overclock', element: 'Electric', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 10, appliesEffect: 'speed_up.sys', description: 'Raises speed throughput.' },
  { id: 'paralyze_ping.exe', name: 'Paralyze Ping', element: 'Electric', function: 'Status', power: 11, accuracy: 0.86, energyCost: 12, appliesStatus: 'stun.status', description: 'Attempts to lock actions.' },
  { id: 'circuit_break.dll', name: 'Circuit Break', element: 'Electric', function: 'Debuff', power: 0, accuracy: 0.9, energyCost: 11, appliesEffect: 'weaken.sys', description: 'Cuts outgoing damage routines.' },
  { id: 'battery_charge.bin', name: 'Battery Charge', element: 'Electric', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 9, appliesEffect: 'special_up.sys', description: 'Charges special throughput.' },

  // Nature
  { id: 'vine_whip.py', name: 'Vine Whip', element: 'Nature', function: 'Damage', power: 21, accuracy: 0.93, energyCost: 10, description: 'Constrictive strike.' },
  { id: 'growth_bloom.sys', name: 'Growth Bloom', element: 'Nature', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 10, appliesEffect: 'regen.sys', description: 'Slow regenerative bloom.' },
  { id: 'poison_spores.exe', name: 'Poison Spores', element: 'Nature', function: 'Status', power: 9, accuracy: 0.88, energyCost: 12, appliesStatus: 'poison.status', description: 'Applies poison over time.' },
  { id: 'entangle_root.dll', name: 'Entangle Root', element: 'Nature', function: 'Debuff', power: 0, accuracy: 0.9, energyCost: 11, appliesEffect: 'slow.sys', description: 'Entangles target routines.' },
  { id: 'healing_sap.bin', name: 'Healing Sap', element: 'Nature', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 10, appliesEffect: 'regen.sys', description: 'Strong natural recovery.' },

  // Shadow
  { id: 'shadow_strike.py', name: 'Shadow Strike', element: 'Shadow', function: 'Damage', power: 25, accuracy: 0.9, energyCost: 12, description: 'Void burst strike.' },
  { id: 'cloak_void.sys', name: 'Cloak Void', element: 'Shadow', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 10, appliesEffect: 'defense_up.sys', description: 'Temporary shadow shielding.' },
  { id: 'fear_glitch.exe', name: 'Fear Glitch', element: 'Shadow', function: 'Status', power: 10, accuracy: 0.87, energyCost: 12, appliesStatus: 'fear.status', description: 'Reduces enemy output via fear.' },
  { id: 'weaken_signal.dll', name: 'Weaken Signal', element: 'Shadow', function: 'Debuff', power: 0, accuracy: 0.95, energyCost: 10, appliesEffect: 'weaken.sys', description: 'Reduces enemy output.' },
  { id: 'life_drain.bin', name: 'Life Drain', element: 'Shadow', function: 'Debuff', power: 16, accuracy: 0.88, energyCost: 13, appliesEffect: 'anti_heal.sys', description: 'Damage payload with anti-heal.' },

  // Holy
  { id: 'light_beam.py', name: 'Light Beam', element: 'Holy', function: 'Damage', power: 22, accuracy: 0.94, energyCost: 11, description: 'Focused radiant beam.' },
  { id: 'bless_up.sys', name: 'Bless Up', element: 'Holy', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 10, appliesEffect: 'special_up.sys', description: 'Raises special potency.' },
  { id: 'stun_flash.exe', name: 'Stun Flash', element: 'Holy', function: 'Status', power: 10, accuracy: 0.87, energyCost: 12, appliesStatus: 'stun.status', description: 'Bright flash interruption.' },
  { id: 'smite_break.dll', name: 'Smite Break', element: 'Holy', function: 'Debuff', power: 12, accuracy: 0.9, energyCost: 11, appliesEffect: 'defense_down.sys', description: 'Breaks enemy defenses.' },
  { id: 'calm_pulse.wav', name: 'Calm Pulse', element: 'Holy', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 9, appliesEffect: 'accuracy_up.sys', description: 'Stabilizes targeting and focus.' },

  // Hybrid
  { id: 'inferno_chain.py', name: 'Inferno Chain', element: 'Fire', function: 'Damage', power: 30, accuracy: 0.86, energyCost: 16, appliesStatus: 'burn.status', description: 'High-risk hybrid finisher.' },
  { id: 'thunder_lock.exe', name: 'Thunder Lock', element: 'Electric', function: 'Status', power: 0, accuracy: 0.82, energyCost: 15, appliesStatus: 'stun.status', description: 'Lock target action cycle.' },
  { id: 'shadow_feast.bin', name: 'Shadow Feast', element: 'Shadow', function: 'Debuff', power: 18, accuracy: 0.88, energyCost: 15, appliesEffect: 'anti_heal.sys', description: 'Damage with anti-heal payload.' },
  { id: 'nature_embrace.sys', name: 'Nature Embrace', element: 'Nature', function: 'Buff', power: 0, accuracy: 1.0, energyCost: 14, appliesEffect: 'regen.sys', description: 'Major sustain protocol.' },
  { id: 'holy_judgment.dll', name: 'Holy Judgment', element: 'Holy', function: 'Damage', power: 32, accuracy: 0.84, energyCost: 16, description: 'Hybrid holy finisher.' },

  // Ults
  { id: 'Inferno.exe', name: 'Inferno', element: 'Fire', function: 'Damage', isUlt: true, power: 46, accuracy: 0.86, energyCost: 24, appliesStatus: 'burn.status', description: 'Fire-element ultimate burst.' },
  { id: 'Tsunami.sys', name: 'Tsunami', element: 'Water', function: 'Damage', isUlt: true, power: 44, accuracy: 0.9, energyCost: 24, description: 'Water-element sweeping ultimate.' },
  { id: 'Cataclysm.dll', name: 'Cataclysm', element: 'Earth', function: 'Damage', isUlt: true, power: 50, accuracy: 0.82, energyCost: 24, description: 'Earth-element heavy ultimate.' },
  { id: 'Cyclone.py', name: 'Cyclone', element: 'Air', function: 'Damage', isUlt: true, power: 42, accuracy: 0.92, energyCost: 24, description: 'Air-element multi-hit surge.' },
  { id: 'Overload.exe', name: 'Overload', element: 'Electric', function: 'Damage', isUlt: true, power: 45, accuracy: 0.88, energyCost: 24, appliesStatus: 'shock.status', description: 'Electric-element overload strike.' },
  { id: 'WorldTree.bin', name: 'WorldTree', element: 'Nature', function: 'Buff', isUlt: true, power: 0, accuracy: 1.0, energyCost: 24, appliesEffect: 'regen.sys', description: 'Nature ultimate recovery burst.' },
  { id: 'VoidCollapse.sys', name: 'Void Collapse', element: 'Shadow', function: 'Damage', isUlt: true, power: 48, accuracy: 0.84, energyCost: 24, appliesEffect: 'weaken.sys', description: 'Shadow-element collapse finisher.' },
  { id: 'Judgment.exe', name: 'Judgment', element: 'Holy', function: 'Damage', isUlt: true, power: 46, accuracy: 0.88, energyCost: 24, description: 'Holy-element decisive execution.' },
  { id: 'CoreBreak.dat', name: 'Core Break', element: 'Normal', function: 'Damage', isUlt: true, power: 44, accuracy: 0.9, energyCost: 24, description: 'Neutral core-rupture finisher.' },
];

const MOVE_CATALOG_MAP = Object.fromEntries(MOVE_CATALOG.map((move) => [move.id, move]));

function findMoveInCatalog(moveId) {
  return MOVE_CATALOG_MAP[moveId] || null;
}

function resolveMoveRecord(moveDocOrPlain) {
  if (!moveDocOrPlain) return null;
  if (typeof moveDocOrPlain.toObject === 'function') return moveDocOrPlain.toObject();
  return moveDocOrPlain;
}

module.exports = {
  MOVE_CATALOG,
  MOVE_CATALOG_MAP,
  findMoveInCatalog,
  resolveMoveRecord,
};
