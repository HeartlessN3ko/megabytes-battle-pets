/**
 * BATTLE ENGINE
 * 60-second auto-battle. Tick rate: 1 tick/second.
 * Resolution order per tick: DoT → HoT → energy → actions → new effects → deaths → decrement durations.
 * Source: gamesystems.md
 */

const { calcDamage, calcAttackRate, calcHitChance, calcMaxHP, calcStatusDuration } = require('./statEngine');
const { getEffect, EFFECTS_REGISTRY } = require('../data/effectsRegistry');
const aiDecision = require('./aiDecision');

const BATTLE_DURATION = 60;  // seconds
const TICK_RATE       = 1.0; // 1 tick per second
const BASE_ATTACK_RATE = 1.0; // attacks per second baseline
const MERCY_PROC_CHANCE = 0.05; // 5% per cheer at 1 HP

// Ult formula weights (abilities.md)
const ULT_POWER_WEIGHT   = 0.6;
const ULT_SPECIAL_WEIGHT = 0.4;

// Element % bonus multipliers applied on top of ult formula (abilities.md)
const ULT_ELEMENT_BONUS = {
  Fire:     { Power: 0.10 },
  Water:    { Stamina: 0.10 },
  Earth:    { Defense: 0.10 },
  Air:      { Speed: 0.10 },
  Electric: { Speed: 0.05, Accuracy: 0.05 },
  Nature:   { Stamina: 0.05, Special: 0.05 },
  Shadow:   { Power: 0.05, Special: 0.05 },
  Holy:     { Defense: 0.05, Special: 0.05 },
  Normal:   {},
};

// Feature % bonus for ults (abilities.md)
const ULT_FEATURE_BONUS = {
  wings:        { Speed: 0.05 },
  horns:        { Power: 0.05 },
  spikes:       { Power: 0.03, Defense: 0.02 },
  armor_plates: { Defense: 0.05 },
  tail_variant: { Power: 0.03, Speed: 0.02 },
  claws:        { Power: 0.05 },
  fins:         { Speed: 0.03, Special: 0.02 },
  frill:        { Special: 0.05 },
  shell:        { Defense: 0.05 },
  aura_core:    { Special: 0.05 },
};

const ULT_ANIMAL_BONUS_PCT = 0.10; // +10% to that animal's primary stat (statEngine.ANIMAL_BIAS top stat)

// ---------------------------------------------------------------------------
// Passive helpers
// ---------------------------------------------------------------------------

/**
 * Return the passive name for a combatant.
 * equippedPassive takes precedence if explicitly set, else falls back to temperament.
 */
function getActivePassive(combatant) {
  return combatant.equippedPassive || combatant.temperament || null;
}

/**
 * Apply unconditional passive stat modifications to a base stat object.
 * Conditional passives (Proud "above 75% HP") are checked at damage time instead.
 */
function applyPassiveStatMods(stats, passiveName) {
  const passive = EFFECTS_REGISTRY.PASSIVES?.[passiveName];
  if (!passive || !passive.statMod) return stats;
  // Skip conditional passives — resolved dynamically in tick
  if (passive.condition) return stats;
  const out = { ...stats };
  for (const [stat, pct] of Object.entries(passive.statMod)) {
    const base = out[stat] ?? 0;
    out[stat] = Math.max(0, Math.min(100, Math.round(base * (1 + pct))));
  }
  return out;
}

/**
 * Build a combatant state object from a Byte document + computed stats.
 * Applies unconditional passive stat mods at battle start.
 */
function buildCombatant(byte, computedStats) {
  // Resolve passive (equippedPassive falls back to temperament)
  const passiveName = byte.equippedPassive || byte.temperament || null;
  const statsWithPassive = applyPassiveStatMods(computedStats, passiveName);

  const maxHP = calcMaxHP(50, statsWithPassive.Stamina);
  return {
    byteId:       byte._id.toString(),
    name:         byte.name,
    temperament:  byte.temperament,
    element:      byte.element,
    animal:       byte.animal || null,
    feature:      byte.feature || null,
    hp:           maxHP,
    maxHP,
    baseStats:    computedStats,       // preserved for conditional passive checks
    stats:        statsWithPassive,    // passive-modified stats used in battle
    equippedMoves: byte.equippedMoves || ['basic_ping.py'],
    equippedUlt:  byte.equippedUlt || null,
    equippedPassive: passiveName,
    status:       null,
    effects:      [],       // max 3 active
    nextAttackIn: 1 / calcAttackRate(BASE_ATTACK_RATE, statsWithPassive.Speed),
    ultReady:     true,
    ultSilenced:  false,
    alive:        true,
    // Passive runtime flags
    _firstHitUsed: false,
    _rampTicks:    0,
    _nextRandomBuffTick: 5,
  };
}

/**
 * Apply an item's effect in battle.
 * Items can heal, apply buffs, apply debuffs, or cleanse.
 */
function applyItemEffect(actor, target, item, entry) {
  if (item.function === 'Buff' && item.appliesEffect) {
    applyEffect(actor, item.appliesEffect);
    entry.events.push({ type: 'item_used', actor: actor.byteId, item: item.id, effect: item.appliesEffect });
  } else if (item.function === 'Debuff' && item.appliesEffect) {
    applyEffect(target, item.appliesEffect);
    entry.events.push({ type: 'item_used', actor: actor.byteId, target: target.byteId, item: item.id, effect: item.appliesEffect });
  } else if (item.function === 'Utility' && item.appliesEffect === 'cleanse.sys') {
    actor.effects = actor.effects.filter(e => getEffect(e.id).type !== 'debuff');
    if (actor.status && getEffect(actor.status.id).type === 'status') actor.status = null;
    entry.events.push({ type: 'item_used', actor: actor.byteId, item: item.id, effect: 'cleanse' });
  }
  // Healing items: restore HP (simple recovery)
  else if (item.type === 'recovery' || item.function === 'Recovery') {
    const healAmt = actor.maxHP * 0.30; // items heal 30% of max HP
    actor.hp = Math.min(actor.maxHP, actor.hp + healAmt);
    entry.events.push({ type: 'item_used', actor: actor.byteId, item: item.id, heal: healAmt });
  }
}

/**
 * Resolve one battle tick.
 * Mutates combatant state objects in place. Returns tick log entry.
 */
function resolveTick(tick, attacker, defender, moves, log, playerInput = {}) {
  const entry = { tick, events: [] };

  // 1. Apply damage over time (burn, poison)
  for (const side of [attacker, defender]) {
    if (!side.alive) continue;
    if (side.status && ['burn.status', 'poison.status'].includes(side.status.id)) {
      const dotEffect = getEffect(side.status.id);
      const dotDmg = side.maxHP * dotEffect.value;
      side.hp = Math.max(0, side.hp - dotDmg);
      entry.events.push({ type: 'dot', target: side.byteId, damage: dotDmg });
      if (side.hp === 0) { side.alive = false; }
    }
  }

  // 2. Apply healing over time (regen.sys + Kind passive)
  for (const side of [attacker, defender]) {
    if (!side.alive) continue;
    const passive = EFFECTS_REGISTRY.PASSIVES?.[getActivePassive(side)];
    const coldPenalty = passive?.specialRule === 'reduced_damage_taken_lower_healing' ? 0.80 : 1.0;

    const regenEffect = side.effects.find(e => e.id === 'regen.sys');
    if (regenEffect) {
      let healAmt = side.maxHP * regenEffect.value * coldPenalty;
      // Anti-heal debuff: reduce healing received by 50%
      const antiHeal = side.effects.find(e => e.id === 'anti_heal.sys');
      if (antiHeal) {
        healAmt *= (1 - antiHeal.value);
      }
      side.hp = Math.min(side.maxHP, side.hp + healAmt);
      entry.events.push({ type: 'hot', target: side.byteId, heal: healAmt });
    }

    // Kind passive: passive heal_over_time (EFFECTS_REGISTRY.PASSIVES.Kind.value)
    if (passive?.effectType === 'healing_over_time' && passive?.value) {
      let kindHeal = side.maxHP * passive.value * coldPenalty;
      // Anti-heal debuff: reduce healing received by 50%
      const antiHeal = side.effects.find(e => e.id === 'anti_heal.sys');
      if (antiHeal) {
        kindHeal *= (1 - antiHeal.value);
      }
      side.hp = Math.min(side.maxHP, side.hp + kindHeal);
      entry.events.push({ type: 'passive_heal', target: side.byteId, heal: kindHeal, passive: getActivePassive(side) });
    }
  }

  // 3. Energy changes (bandwidth is a need, not spendable in battle — stat modifier only)
  // No energy deduction in battle per gamesystems.md

  // 4. Process actions
  for (const [actor, target] of [[attacker, defender], [defender, attacker]]) {
    if (!actor.alive || !target.alive) continue;

    // Stun / skip
    if (actor.status?.id === 'stun.status') {
      actor.status.duration -= 1;
      if (actor.status.duration <= 0) actor.status = null;
      entry.events.push({ type: 'stunned', actor: actor.byteId });
      continue;
    }

    actor.nextAttackIn -= TICK_RATE;
    if (actor.nextAttackIn > 0) continue;

    // Try to use an item (20% AI chance, if available)
    const availableItems = (actor.equippedItems || []).filter(itemId => !actor.itemsUsed.includes(itemId) && moves[itemId]);
    if (availableItems.length > 0 && Math.random() < 0.20) {
      const itemId = availableItems[Math.floor(Math.random() * availableItems.length)];
      const item = moves[itemId];
      applyItemEffect(actor, target, item, entry);
      actor.itemsUsed.push(itemId);
      // Reset attack rate and continue to next action
      const attackRate = calcAttackRate(BASE_ATTACK_RATE, actor.stats.Speed);
      actor.nextAttackIn = 1 / attackRate;
      continue;
    }


    // AI picks move (silence blocks ult suggestion)
    const isSilenced = actor.status?.id === 'silence.status';
    const chosenMoveId = aiDecision.chooseMove(actor, target, Boolean(playerInput?.ultSuggested && !isSilenced), moves);
    const move = moves[chosenMoveId];
    if (!move) continue;

    // Attack rate reset
    const attackRate = calcAttackRate(BASE_ATTACK_RATE, actor.stats.Speed);
    actor.nextAttackIn = 1 / attackRate;

    // Slow debuff
    const slowEffect = actor.effects.find(e => e.id === 'slow.sys');
    if (slowEffect) actor.nextAttackIn *= (1 + slowEffect.value);

    // Hit check
    const hitChance = calcHitChance(move.accuracy, actor.stats.Accuracy, target.stats.Speed);
    const blind = actor.status?.id === 'blind.status';
    const effectiveHitChance = blind ? hitChance * (1 - getEffect('blind.status').value) : hitChance;
    const hit = Math.random() < effectiveHitChance;

    if (!hit) {
      entry.events.push({ type: 'miss', actor: actor.byteId, move: chosenMoveId });
      continue;
    }

    // Alert passive: dodge chance on target
    const targetPassive = EFFECTS_REGISTRY.PASSIVES?.[getActivePassive(target)];
    if (targetPassive?.specialRule === 'dodge_chance_bonus') {
      if (Math.random() < (targetPassive.value || 0.10)) {
        entry.events.push({ type: 'dodge', actor: actor.byteId, target: target.byteId, passive: getActivePassive(target) });
        continue;
      }
    }

    // Confuse: 30% chance to fail action
    if (actor.status?.id === 'confuse.status' && Math.random() < getEffect('confuse.status').value) {
      entry.events.push({ type: 'confused_fail', actor: actor.byteId });
      continue;
    }

    // Damage move
    if (move.function === 'Damage') {
      // Use ult formula for ult moves, standard formula otherwise
      let dmg;
      const isUlt = move.isUlt === true;
      if (isUlt) {
        const actorEffectiveStats = calcEffectiveStats(actor);
        const targetEffectiveStats = calcEffectiveStats(target);
        dmg = calcUltDamage(move, { ...actor, stats: actorEffectiveStats }, { ...target, stats: targetEffectiveStats });
      } else {
        // Unstable passive: ±10% random stat variance at attack time
        const actorEffectiveStats = calcEffectiveStats(actor);
        let actorPower = actorEffectiveStats.Power;
        if (EFFECTS_REGISTRY.PASSIVES?.[getActivePassive(actor)]?.specialRule === 'random_stat_variance') {
          actorPower = actor.stats.Power * (0.9 + Math.random() * 0.2);
        }
        const targetEffectiveStats = calcEffectiveStats(target);
        dmg = calcDamage(move.power, actorPower, targetEffectiveStats.Defense);
      }

      // Weaken debuff
      const weaken = actor.effects.find(e => e.id === 'weaken.sys');
      if (weaken) dmg *= (1 - weaken.value);

      // Fragile buff on target
      const fragile = target.effects.find(e => e.id === 'fragile.sys');
      if (fragile) dmg *= (1 + fragile.value);

      // Fear status on actor
      if (actor.status?.id === 'fear.status') dmg *= (1 - getEffect('fear.status').value);

      // Passives on actor
      const actorPassive = EFFECTS_REGISTRY.PASSIVES?.[getActivePassive(actor)];

      // Proud: +10% Power above 75% HP
      if (actorPassive?.condition === 'hp_above_75_percent' && (actor.hp / actor.maxHP) > 0.75) {
        const pct = actorPassive.statMod?.Power || 0;
        if (pct) dmg *= (1 + pct);
      }

      // Sneaky: first hit bonus (pulled from PASSIVES.Sneaky.value)
      if (actorPassive?.specialRule === 'first_hit_bonus' && actor._firstHitUsed !== true) {
        dmg *= (1 + (actorPassive.value || 0.20));
        actor._firstHitUsed = true;
      }

      // Wanderer: stat_ramp_over_time — +1% per ramp tick, capped at +20%
      if (actorPassive?.specialRule === 'stat_ramp_over_time') {
        const ramp = Math.min(20, actor._rampTicks) * 0.01;
        dmg *= (1 + ramp);
      }

      // Passives on target (incoming damage reductions)
      const tPassive = EFFECTS_REGISTRY.PASSIVES?.[getActivePassive(target)];

      // Noble: reduced damage at low HP (<25%)
      if (tPassive?.specialRule === 'reduced_damage_at_low_hp' && (target.hp / target.maxHP) < 0.25) {
        dmg *= 0.80;
      }

      // Cold: -10% damage taken
      if (tPassive?.specialRule === 'reduced_damage_taken_lower_healing') {
        dmg *= 0.90;
      }

      // Corrupt: self-dot from PASSIVES registry
      if (actorPassive?.specialRule === 'self_dot') {
        const selfDot = dmg * (actorPassive.dotValue || 0.05);
        actor.hp = Math.max(0, actor.hp - selfDot);
        entry.events.push({ type: 'self_dot', actor: actor.byteId, damage: selfDot });
      }

      target.hp = Math.max(0, target.hp - dmg);
      entry.events.push({ type: 'damage', actor: actor.byteId, target: target.byteId, move: chosenMoveId, damage: dmg, isUlt });

      // Mercy proc: if target reaches 1HP and player cheered this tick
      if (target.hp === 0 && playerInput.cheer && Math.random() < MERCY_PROC_CHANCE) {
        target.hp = 1;
        entry.events.push({ type: 'mercy_proc', target: target.byteId });
      }

      if (target.hp === 0) target.alive = false;

      // Apply move's status effect
      if (move.appliesStatus && !target.status) {
        const statusDef = getEffect(move.appliesStatus);
        let duration = calcStatusDuration(statusDef.duration, actor.stats.Special);
        // Calm passive: reduce_negative_status_duration
        const tCalm = EFFECTS_REGISTRY.PASSIVES?.[getActivePassive(target)];
        if (tCalm?.specialRule === 'reduce_negative_status_duration') {
          duration = Math.max(1, Math.round(duration * (1 - (tCalm.value || 0.25))));
        }
        target.status = { id: move.appliesStatus, duration };
        // Silence blocks ult
        if (move.appliesStatus === 'silence.status') {
          target.ultSilenced = true;
        }
        entry.events.push({ type: 'status_applied', target: target.byteId, status: move.appliesStatus, duration });
      }
    }

    // Buff move
    if (move.function === 'Buff') {
      applyEffect(actor, move.appliesEffect);
      entry.events.push({ type: 'buff', actor: actor.byteId, effect: move.appliesEffect });
    }

    // Debuff move
    if (move.function === 'Debuff') {
      applyEffect(target, move.appliesEffect);
      entry.events.push({ type: 'debuff', actor: actor.byteId, target: target.byteId, effect: move.appliesEffect });
    }

    // Utility (cleanse)
    if (move.function === 'Utility' && move.appliesEffect === 'cleanse.sys') {
      actor.effects = actor.effects.filter(e => getEffect(e.id).type !== 'debuff');
      if (actor.status && getEffect(actor.status.id).type === 'status') actor.status = null;
      entry.events.push({ type: 'cleanse', actor: actor.byteId });
    }

    // Anxious passive: 10% chance to suffer action delay after attacking
    const actingPassive = EFFECTS_REGISTRY.PASSIVES?.[getActivePassive(actor)];
    if (actingPassive?.specialRule === 'action_delay' && Math.random() < 0.10) {
      actor.nextAttackIn += 1;
      entry.events.push({ type: 'action_delay', actor: actor.byteId, passive: getActivePassive(actor) });
    }
  }

  // 5. Shock: intermittent stun
  for (const side of [attacker, defender]) {
    if (side.status?.id === 'shock.status' && Math.random() < getEffect('shock.status').value) {
      entry.events.push({ type: 'shocked', actor: side.byteId });
      side.nextAttackIn = Math.max(side.nextAttackIn, 1);
    }
  }

  // 6. Resolve deaths (heal-first edge case already handled in damage section)

  // 7. Decrement effect durations
  for (const side of [attacker, defender]) {
    side.effects = side.effects
      .map(e => ({ ...e, duration: e.duration - 1 }))
      .filter(e => e.duration > 0);

    if (side.status) {
      side.status.duration -= 1;
      if (side.status.duration <= 0) {
        // Clear silence flag when status expires
        if (side.status.id === 'silence.status') {
          side.ultSilenced = false;
        }
        side.status = null;
      }
    }
  }

  // 8. End-of-tick passive upkeep
  for (const side of [attacker, defender]) {
    if (!side.alive) continue;
    const p = EFFECTS_REGISTRY.PASSIVES?.[getActivePassive(side)];
    if (!p) continue;

    // Wanderer: +1 ramp tick per tick
    if (p.specialRule === 'stat_ramp_over_time') {
      side._rampTicks = Math.min(20, (side._rampTicks || 0) + 1);
    }

    // Mysterious: every ~6 ticks gain a random minor buff
    if (p.specialRule === 'random_minor_buff' && tick >= (side._nextRandomBuffTick || 6)) {
      const pool = ['power_up.sys', 'speed_up.sys', 'defense_up.sys', 'special_up.sys', 'accuracy_up.sys'];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      applyEffect(side, pick);
      entry.events.push({ type: 'passive_buff', actor: side.byteId, effect: pick, passive: getActivePassive(side) });
      side._nextRandomBuffTick = tick + 6;
    }
  }

  log.push(entry);
}

// ---------------------------------------------------------------------------
// Ult damage formula (abilities.md)
// final = (Power * 0.6 + Special * 0.4) * (1 + element% + animal% + feature%)
// ---------------------------------------------------------------------------
function calcUltDamage(move, actor, target) {
  const baseScale = (actor.stats.Power * ULT_POWER_WEIGHT) + (actor.stats.Special * ULT_SPECIAL_WEIGHT);

  // Element bonus: % of ult base, summed across relevant stats (abilities.md)
  let bonusMultiplier = 1.0;
  const elemBonus = ULT_ELEMENT_BONUS[actor.element] || {};
  let elemPct = 0;
  for (const pct of Object.values(elemBonus)) elemPct += pct;
  bonusMultiplier += elemPct;

  // Animal: +10% to its primary stat's contribution (simplified — flat 10% bonus)
  if (actor.animal) bonusMultiplier += ULT_ANIMAL_BONUS_PCT;

  // Feature: sum of feature % bonuses
  const featBonus = ULT_FEATURE_BONUS[actor.feature] || {};
  let featPct = 0;
  for (const pct of Object.values(featBonus)) featPct += pct;
  bonusMultiplier += featPct;

  // Scale by move.power as a coefficient (ult move.power acts as a balance knob)
  const powerCoeff = (move.power || 40) / 40;

  // Apply defense reduction in standard form
  const rawDmg = baseScale * bonusMultiplier * powerCoeff;
  if (actor.stats.Power + target.stats.Defense === 0) return 0;
  return rawDmg * (actor.stats.Power / (actor.stats.Power + target.stats.Defense));
}

/**
 * Apply an effect to a combatant. Enforces max 3 active effects.
 * Same-stat: highest applies. Different stats: stack. Buff vs debuff: net.
 */

/**
 * Calculate effective stats by folding active buff/debuff effects into base stats.
 * Returns a new stats object with effect modifiers applied.
 */
function calcEffectiveStats(combatant) {
  const stats = { ...combatant.stats };
  
  // Apply each active effect's stat modifier
  for (const effect of combatant.effects) {
    const effectDef = getEffect(effect.id);
    if (!effectDef.stat) continue; // skip non-stat effects
    
    // Stat effects are percentage modifiers: +/- value%
    const base = stats[effectDef.stat] ?? 0;
    const modifier = effectDef.type === 'buff' ? effectDef.value : -effectDef.value;
    stats[effectDef.stat] = Math.max(0, Math.round(base * (1 + modifier)));
  }
  
  return stats;
}

function applyEffect(combatant, effectId) {
  const def = getEffect(effectId);
  const { maxActiveEffects } = EFFECTS_REGISTRY.EFFECT_LIMITS;

  // Check for same-stat conflict
  const existing = combatant.effects.find(e => {
    const existDef = getEffect(e.id);
    return existDef.stat && existDef.stat === def.stat;
  });

  if (existing) {
    const existDef = getEffect(existing.id);
    if (def.value > existDef.value) {
      // Replace with higher value
      combatant.effects = combatant.effects.filter(e => e.id !== existing.id);
    } else {
      return; // existing is stronger, discard
    }
  }

  if (combatant.effects.length >= maxActiveEffects) {
    combatant.effects.shift(); // drop oldest to make room
  }

  combatant.effects.push({ id: effectId, duration: def.duration || 8, value: def.value });
}

/**
 * Run a full 60-second battle.
 *
 * @param {Object} byteA       — Mongoose Byte doc
 * @param {Object} byteB       — Mongoose Byte doc
 * @param {Object} moves       — { [moveId]: Move doc } lookup
 * @param {Object} playerInput — { cheer: bool, ultSuggested: bool }
 * @returns {{ winner: 'A'|'B'|'draw', log: Array, mercyProc: bool }}
 */
function runBattle(byteA, byteB, moves, playerInput = {}) {
  const statsA = byteA._computedStats || byteA.stats.toObject();
  const statsB = byteB._computedStats || byteB.stats.toObject();

  const combatantA = buildCombatant(byteA, statsA);
  const combatantB = buildCombatant(byteB, statsB);

  const log = [];
  let mercyProc = false;

  for (let tick = 1; tick <= BATTLE_DURATION; tick++) {
    if (!combatantA.alive || !combatantB.alive) break;
    resolveTick(tick, combatantA, combatantB, moves, log, playerInput);
    if (log[log.length - 1]?.events?.some(e => e.type === 'mercy_proc')) mercyProc = true;
  }

  let winner;
  if (!combatantA.alive && !combatantB.alive) winner = 'draw';
  else if (!combatantB.alive) winner = 'A';
  else if (!combatantA.alive) winner = 'B';
  else {
    // Time expired — higher HP % wins
    const pctA = combatantA.hp / combatantA.maxHP;
    const pctB = combatantB.hp / combatantB.maxHP;
    winner = pctA >= pctB ? 'A' : 'B';
  }

  return {
    winner,
    log,
    mercyProc,
    finalHpA: combatantA.hp,
    finalHpB: combatantB.hp,
    maxHpA: combatantA.maxHP,
    maxHpB: combatantB.maxHP,
    itemsUsedA: combatantA.itemsUsed || [],
    itemsUsedB: combatantB.itemsUsed || [],
  };
}

module.exports = { runBattle, buildCombatant, resolveTick, applyEffect, BATTLE_DURATION, MERCY_PROC_CHANCE };
