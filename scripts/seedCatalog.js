require('dotenv').config();
const mongoose = require('mongoose');
const Item = require('../src/models/Item');
const Room = require('../src/models/Room');
const { SHOP_ITEMS, SHOP_ROOMS } = require('../src/data/shopCatalog');

function asMap(value) {
  if (!value || typeof value !== 'object') return {};
  return value;
}

async function seedItems() {
  let inserted = 0;
  let updated = 0;

  for (const raw of SHOP_ITEMS) {
    const payload = {
      id: raw.id,
      name: raw.name,
      type: raw.type || 'utility',
      cost: Number(raw.cost || 0),
      appliesEffect: raw.appliesEffect || null,
      restoreNeeds: asMap(raw.restoreNeeds),
      teachesMove: Array.isArray(raw.teachesMove) ? raw.teachesMove : [],
      unlocksStage: raw.unlocksStage || null,
      useType: raw.useType || 'instant',
      durationSeconds: Number(raw.durationSeconds || 0),
      description: raw.description || '',
      isSystemItem: false,
    };

    const exists = await Item.findOne({ id: payload.id }).select('_id');
    if (exists) {
      await Item.updateOne({ id: payload.id }, { $set: payload });
      updated += 1;
    } else {
      await Item.create(payload);
      inserted += 1;
    }
  }

  return { inserted, updated };
}

async function seedRooms() {
  let inserted = 0;
  let updated = 0;

  for (const raw of SHOP_ROOMS) {
    const payload = {
      id: raw.id,
      name: raw.name,
      category: raw.category || 'active',
      passiveEffect: {
        stat: raw.passiveEffect?.stat || null,
        modifier: Number(raw.passiveEffect?.modifier || 0),
      },
      availableActions: Array.isArray(raw.availableActions) ? raw.availableActions : [],
      unlockCost: Number(raw.unlockCost || 0),
      unlockLevel: Number(raw.unlockLevel || 1),
      description: raw.description || '',
    };

    const exists = await Room.findOne({ id: payload.id }).select('_id');
    if (exists) {
      await Room.updateOne({ id: payload.id }, { $set: payload });
      updated += 1;
    } else {
      await Room.create(payload);
      inserted += 1;
    }
  }

  return { inserted, updated };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add it to your environment before seeding.');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const itemResult = await seedItems();
  const roomResult = await seedRooms();

  console.log('Catalog seeding complete.');
  console.log(`Items: inserted ${itemResult.inserted}, updated ${itemResult.updated}`);
  console.log(`Rooms: inserted ${roomResult.inserted}, updated ${roomResult.updated}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
