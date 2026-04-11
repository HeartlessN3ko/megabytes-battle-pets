/**
 * BATTLE ENGINE
 * 60-second auto-battle. Tick rate: 1 tick/second.
 * Resolution order per tick: DoT → HoT → energy → actions → new effects → deaths → decrement durations.
 * Source: gamesystems.md
 */

const { calcDamage, calcAttackRate, calcHitChance, calcMaxHP, calcEffectStrength, calcStatusDuration, applyNeedModifiers } = require('./statEngine');
const { getEffect, EFFECTS_REGISTRY } = require('../data/effectsRegistry');
const aiDecision = require('./aiDecision');

const BATTLE_DURATION = 60;  // seconds
const TICK_RATE       = 1.0; // 1 tick per second
const BASE_ATTACK_RATE = 1.0; // attacks per second baseline
const MERCY_PROC_CHANCE = 0.05; // 5% per cheer at 1 HP

/**
 * Build a combatant state object from a Byte document + computed stats.
 */
function buildCombatant(byte, computedStats) {
  const maxHP = calcMaxHP(50, computedStats.Stamina);
  return {
    byteId:       byte._id.toString(),
    name:         byte.name,
    temperament:  byte.temperament,
    element:      byte.element,
    hp:           maxHP,
    maxHP,
    stats:        computedStats,
    equippedMoves: byte.equippedMoves || ['basic_ping.py'],
    equippedUlt:  byte.equippedUlt || null,
    equippedPassive: byte.equippedPassive || null,
    status:       null,
    effects:      [],       // max 3 active
    nextAttackIn: 1 / calcAttackRate(BASE_ATTACK_RATE, computedStats.Speed),
    ultReady:     true,
    ultSilenced:  false,
    alive:        true
  };
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

  // 2. Apply healing over time (regen.sys)
  for (const side of [attacker, defender]) {
    if (!side.alive) continue;
    const regenEffect = side.effects.find(e => e.id === 'regen.sys');
    if (regenEffect) {
      const healAmt = side.maxHP * regenEffect.value;
      side.hp = Math.min(side.maxHP, side.hp + healAmt);
      entry.events.push({ type: 'hot', target: side.byteId, heal: healAmt });
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

    // AI picks move
    const chosenMoveId = aiDecision.chooseMove(actor, target);
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

    // Confuse: 30% chance to fail action
    if (actor.status?.id === 'confuse.status' && Math.random() < getEffect('confuse.status').value) {
      entry.events.push({ type: 'confused_fail', actor: actor.byteId });
      continue;
    }

    // Damage move
    if (move.function === 'Damage') {
      let dmg = calcDamage(move.power, actor.stats.Power, target.stats.Defense);

      // Weaken debuff
      const weaken = actor.effects.find(e => e.id === 'weaken.sys');
      if (weaken) dmg *= (1 - weaken.value);

      // Fragile buff on target
      const fragile = target.effects.find(e => e.id === 'fragile.sys');
      if (fragile) dmg *= (1 + fragile.value);

      // Fear status on actor
      if (actor.status?.id === 'fear.status') dmg *= (1 - getEffect('fear.status').value);

      // Anti-heal does not affect damage

      // Sneaky temperament: first hit bonus
      if (actor.temperament === 'Sneaky' && actor._firstHitUsed !== true) {
        dmg *= 1.20;
        actor._firstHitUsed = true;
      }

      // Corrupt self-dot (5% of damage dealt back to self)
      if (actor.temperament === 'Corrupt') {
        const selfDot = dmg * 0.05;
        actor.hp = Math.max(0, actor.hp - selfDot);
        entry.events.push({ type: 'self_dot', actor: actor.byteId, damage: selfDot });
      }

      target.hp = Math.max(0, target.hp - dmg);
      entry.events.push({ type: 'damage', actor: actor.byteId, target: target.byteId, move: chosenMoveId, damage: dmg });

      // Mercy proc: if target reaches 1HP and player cheered this tick
      if (target.hp === 0 && playerInput.cheer && Math.random() < MERCY_PROC_CHANCE) {
        target.hp = 1;
        entry.events.push({ type: 'mercy_proc', target: target.byteId });
      }

      if (target.hp === 0) target.alive = false;

      // Apply move's status effect
      if (move.appliesStatus && !target.status) {
        const statusDef = getEffect(move.appliesStatus);
        const duration = calcStatusDuration(statusDef.duration, actor.stats.Special);
        target.status = { id: move.appliesStatus, duration };
        entry.events.push({ type: 'status_applied', target: target.byteId, status: move.appliesStatus });
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
      if (side.status.duration <= 0) side.status = null;
    }
  }

  log.push(entry);
}

/**
 * Apply an effect to a combatant. Enforces max 3 active effects.
 * Same-stat: highest applies. Different stats: stack. Buff vs debuff: net.
 */
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

  return { winner, log, mercyProc, finalHpA: combatantA.hp, finalHpB: combatantB.hp };
}

module.exports = { runBattle, buildCombatant, resolveTick, applyEffect, BATTLE_DURATION, MERCY_PROC_CHANCE };
