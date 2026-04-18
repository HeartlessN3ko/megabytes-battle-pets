'use strict';

/**
 * DECOR CATALOG
 * Source of truth for all purchasable/obtainable room decor items.
 *
 * Layers:
 *   back-wall  — rear wall center (posters, frames, wallpaper accents)
 *   wall-left  — left wall surface
 *   wall-right — right wall surface
 *   floor      — ground plane in front of byte (rugs, beds, furniture)
 *   ceiling    — overhead (lights, mobiles, hanging items)
 *
 * Each item:
 *   id                — unique string key
 *   name              — display name
 *   description       — flavor text (1 sentence)
 *   layer             — one of the 5 layer slots above
 *   value             — room score contribution (0–100 total cap)
 *   cost              — DataBits purchase price
 *   asset             — relative path from assets/decor/
 *   effects           — passive stat modifiers applied while item is equipped
 *
 * Effect keys:
 *   restRecoveryBonus     — flat bonus added to Bandwidth restored per sleep/rest action
 *   moodDecayReduction    — multiplier reduction on Mood decay rate (0.15 = 15% slower)
 */

const DECOR_CATALOG = [
  {
    id:          'sunset_painting_01',
    name:        'Sunset Painting',
    description: 'A warm-toned painting that makes the room feel less like a server rack.',
    layer:       'back-wall',
    value:       10,
    cost:        120,
    asset:       'decor_sunsetpainting.png',
    effects: {
      moodDecayReduction: 0.15,  // Mood decays 15% slower while equipped
    },
  },
  {
    id:          'pet_bed_01',
    name:        'Softcore Pad',
    description: 'A cushioned floor mat that emits a faint hum. Your byte refuses to explain why it likes it.',
    layer:       'floor',
    value:       15,
    cost:        200,
    asset:       'decor_pet_bed.png',
    effects: {
      restRecoveryBonus: 2,  // +2 flat Bandwidth restored per sleep/rest action
    },
  },
];

/**
 * Look up a single item by id.
 * @param {string} id
 * @returns {Object|null}
 */
function getDecorItem(id) {
  return DECOR_CATALOG.find(item => item.id === id) || null;
}

/**
 * Aggregate all active effects from a list of equipped decor item IDs.
 * Returns a merged effects object with summed/combined values.
 * @param {string[]} equippedIds
 * @returns {Object} merged effects
 */
function getActiveDecorEffects(equippedIds = []) {
  const merged = {
    restRecoveryBonus:  0,
    moodDecayReduction: 0,
  };
  for (const id of equippedIds) {
    const item = getDecorItem(id);
    if (!item?.effects) continue;
    if (item.effects.restRecoveryBonus)   merged.restRecoveryBonus   += item.effects.restRecoveryBonus;
    if (item.effects.moodDecayReduction)  merged.moodDecayReduction  += item.effects.moodDecayReduction;
  }
  // Cap mood decay reduction at 50% so it can't trivialize the system
  merged.moodDecayReduction = Math.min(0.5, merged.moodDecayReduction);
  return merged;
}

module.exports = { DECOR_CATALOG, getDecorItem, getActiveDecorEffects };
