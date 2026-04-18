const express = require('express');
const MarketplaceListing = require('../models/MarketplaceListing');
const Player = require('../models/Player');
const InboxMessage = require('../models/InboxMessage');
const { SHOP_ITEMS } = require('../data/shopCatalog');
const { DECOR_CATALOG } = require('../data/decorCatalog');
const { optionalAuth } = require('../middleware/auth');
const { generateMarketplaceEmail } = require('../services/marketplaceEmailFT');

const router = express.Router();
router.use(optionalAuth);

// Dual-stage marketplace delivery timers
const DELIVERY_DELAY_MS_DEMO = 5 * 60 * 1000;          // 5 minutes
const DELIVERY_DELAY_MS_REAL = 24 * 60 * 60 * 1000;    // 24 hours

function isDemoReq(req) {
  return String(req?.headers?.['x-demo-mode'] || '') === '1';
}

function listingPayload(listing) {
  const now = Date.now();
  const endsAtMs = new Date(listing.endsAt).getTime();
  const expired = listing.status === 'open' && endsAtMs <= now;
  const currentBid = Number(listing.currentBid || 0);
  const startBid = Number(listing.startBid || 0);
  const minIncrement = Number(listing.minIncrement || 1);
  const nextMinBid = currentBid > 0 ? currentBid + minIncrement : startBid;

  return {
    id: String(listing._id),
    title: listing.title,
    description: listing.description,
    itemId: listing.itemId,
    itemName: listing.itemName,
    quantity: listing.quantity,
    sellerTag: listing.sellerTag,
    category: listing.category,
    status: expired ? 'expired' : listing.status,
    startBid,
    currentBid,
    minIncrement,
    nextMinBid,
    buyNowPrice: Number(listing.buyNowPrice || 0),
    highestBidderId: listing.highestBidder ? String(listing.highestBidder) : null,
    bidCount: Array.isArray(listing.bidHistory) ? listing.bidHistory.length : 0,
    recentBids: Array.isArray(listing.bidHistory)
      ? listing.bidHistory.slice(-3).reverse().map((b) => ({
          bidderId: String(b.bidderId),
          amount: Number(b.amount || 0),
          placedAt: b.placedAt,
        }))
      : [],
    endsAt: listing.endsAt,
    createdAt: listing.createdAt,
  };
}

/**
 * Dual-stage marketplace delivery:
 *   1. Immediate "order_confirmed" email (no readyAt, no attachment — notification only).
 *   2. Delayed "delivered" email with readyAt = now + DELAY (5min demo / 24h real) carrying the item.
 * Deduped per stage via `kind` + `metadata.listingId`.
 */
async function ensureMarketDelivery({ playerId, listing, acquiredBy, demoMode = false }) {
  if (!playerId || !listing?._id) return false;
  const listingId = String(listing._id);

  const [hasConfirmation, hasDelivery] = await Promise.all([
    InboxMessage.findOne({ playerId, kind: 'market_confirmation', 'metadata.listingId': listingId }).select('_id'),
    InboxMessage.findOne({ playerId, kind: 'market_delivery',     'metadata.listingId': listingId }).select('_id'),
  ]);
  if (hasConfirmation && hasDelivery) return false;

  const subjectPrefix = acquiredBy === 'auction_win' ? 'Auction won' : 'Order';
  const now = Date.now();
  const delayMs = demoMode ? DELIVERY_DELAY_MS_DEMO : DELIVERY_DELAY_MS_REAL;

  const writes = [];

  // Stage 1: immediate confirmation (no attachment — it's a notification)
  if (!hasConfirmation) {
    const confirmFt = generateMarketplaceEmail('order_confirmed', listing.itemName);
    writes.push(InboxMessage.create({
      playerId,
      kind: 'market_confirmation',
      subject: `${subjectPrefix}: ${listing.itemName} — confirmed`,
      body: confirmFt.body,
      attachments: [],
      metadata: { listingId, acquiredBy, stage: 'confirmation' },
      readyAt: null,
    }));
  }

  // Stage 2: delayed delivery (carries the item)
  if (!hasDelivery) {
    const deliveryFt = generateMarketplaceEmail('delivered', listing.itemName);
    writes.push(InboxMessage.create({
      playerId,
      kind: 'market_delivery',
      subject: `${subjectPrefix}: ${listing.itemName} — delivery`,
      body: deliveryFt.body,
      attachments: [{ type: 'item', itemId: listing.itemId, itemName: listing.itemName, quantity: listing.quantity }],
      metadata: { listingId, acquiredBy, stage: 'delivered' },
      readyAt: new Date(now + delayMs),
    }));
  }

  await Promise.all(writes);
  return true;
}

async function ensureSeedListings() {
  const count = await MarketplaceListing.countDocuments({});
  if (count > 0) return;

  const lookup = new Map(SHOP_ITEMS.map((item) => [item.id, item]));
  const placeholder = [
    { itemId: 'null_field.pkg', title: 'Null Field Prototype', category: 'prototype', startBid: 120, buyNowPrice: 240, minIncrement: 12 },
    { itemId: 'fire_core.pkg', title: 'Fire Core (Auction Lot)', category: 'rare', startBid: 60, buyNowPrice: 130, minIncrement: 8 },
    { itemId: 'wing_module.pkg', title: 'Wing Module (Factory Sealed)', category: 'rare', startBid: 95, buyNowPrice: 200, minIncrement: 10 },
    { itemId: 'comfort_pack.pkg', title: 'Comfort Pack Bundle x2', category: 'bundle', startBid: 30, buyNowPrice: 75, minIncrement: 5, quantity: 2 },
  ];

  const now = Date.now();
  const docs = placeholder.map((row, index) => {
    const item = lookup.get(row.itemId);
    return {
      title: row.title,
      description: item?.description || 'Marketplace listing.',
      itemId: row.itemId,
      itemName: item?.name || row.itemId,
      quantity: row.quantity || 1,
      sellerTag: 'BYTE_EXCHANGE',
      category: row.category,
      status: 'open',
      startBid: row.startBid,
      currentBid: 0,
      minIncrement: row.minIncrement,
      buyNowPrice: row.buyNowPrice,
      bidHistory: [],
      endsAt: new Date(now + (index + 2) * 60 * 60 * 1000),
    };
  });

  await MarketplaceListing.insertMany(docs);
}

/**
 * Ensure every catalog decor item has at least one open listing.
 * Idempotent — runs every GET /listings, only creates listings missing from the open pool.
 * Decor listings: buy-now only (startBid: 0, no auction), 48h rotation window.
 */
async function ensureDecorListings() {
  if (!Array.isArray(DECOR_CATALOG) || DECOR_CATALOG.length === 0) return;

  const decorIds = DECOR_CATALOG.map((d) => d.id);
  const existing = await MarketplaceListing.find({
    itemId: { $in: decorIds },
    status: 'open',
  }).select('itemId');
  const haveOpen = new Set(existing.map((l) => l.itemId));

  const now = Date.now();
  const docs = DECOR_CATALOG
    .filter((d) => !haveOpen.has(d.id))
    .map((d) => ({
      title:        `${d.name} (Decor)`,
      description:  d.description,
      itemId:       d.id,
      itemName:     d.name,
      quantity:     1,
      sellerTag:    'BYTE_DECOR',
      category:     'decor',
      status:       'open',
      startBid:     0,
      currentBid:   0,
      minIncrement: Math.max(5, Math.floor(Number(d.cost || 50) / 10)),
      buyNowPrice:  Number(d.cost || 50),
      bidHistory:   [],
      endsAt:       new Date(now + 48 * 60 * 60 * 1000),
    }));

  if (docs.length > 0) await MarketplaceListing.insertMany(docs);
}

async function settleExpiredOpenListings(demoMode = false) {
  const now = new Date();
  const expired = await MarketplaceListing.find({ status: 'open', endsAt: { $lte: now } });
  if (expired.length === 0) return;

  for (const listing of expired) {
    listing.status = listing.highestBidder ? 'sold' : 'expired';
    if (listing.highestBidder) {
      listing.soldToPlayer = listing.highestBidder;
      await ensureMarketDelivery({ playerId: listing.highestBidder, listing, acquiredBy: 'auction_win', demoMode });
    }
    await listing.save();
  }
}

router.get('/listings', async (req, res) => {
  try {
    await ensureSeedListings();
    await ensureDecorListings();
    await settleExpiredOpenListings(isDemoReq(req));

    const status = String(req.query.status || 'open');
    const query = status === 'all' ? {} : { status };
    const listings = await MarketplaceListing.find(query).sort({ endsAt: 1, createdAt: -1 }).limit(60);

    res.json(listings.map((listing) => listingPayload(listing)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bid', async (req, res) => {
  try {
    const { playerId, listingId, amount } = req.body || {};
    const bidAmount = Number(amount || 0);
    if (!playerId || !listingId || !Number.isFinite(bidAmount) || bidAmount <= 0 || !Number.isInteger(bidAmount)) {
      return res.status(400).json({ error: 'playerId, listingId, and valid amount are required' });
    }

    const [player, listing] = await Promise.all([
      Player.findById(playerId),
      MarketplaceListing.findById(listingId),
    ]);

    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.status !== 'open') return res.status(400).json({ error: 'Listing is not open for bidding' });
    if (new Date(listing.endsAt).getTime() <= Date.now()) return res.status(400).json({ error: 'Listing has ended' });

    const currentBid = Number(listing.currentBid || 0);
    const minBid = currentBid > 0 ? currentBid + Number(listing.minIncrement || 1) : Number(listing.startBid || 1);
    if (bidAmount < minBid) return res.status(400).json({ error: `Bid too low. Minimum bid is ${minBid}` });

    const currentLeaderId = listing.highestBidder ? String(listing.highestBidder) : null;
    const bidderId = String(player._id);
    const isSameLeader = currentLeaderId && currentLeaderId === bidderId;

    const additionalCost = isSameLeader ? Math.max(0, bidAmount - currentBid) : bidAmount;
    if (Number(player.byteBits || 0) < additionalCost) {
      return res.status(400).json({ error: 'Insufficient byte.bits for this bid' });
    }

    if (!isSameLeader && listing.highestBidder) {
      await Player.findByIdAndUpdate(listing.highestBidder, { $inc: { byteBits: currentBid } });
    }

    player.byteBits = Number(player.byteBits || 0) - additionalCost;
    listing.currentBid = bidAmount;
    listing.highestBidder = player._id;
    listing.bidHistory.push({ bidderId: player._id, amount: bidAmount, placedAt: new Date() });
    await Promise.all([player.save(), listing.save()]);

    res.json({
      ok: true,
      listing: listingPayload(listing),
      byteBitsRemaining: player.byteBits,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/buy-now', async (req, res) => {
  try {
    const { playerId, listingId } = req.body || {};
    if (!playerId || !listingId) return res.status(400).json({ error: 'playerId and listingId are required' });

    const [player, listing] = await Promise.all([
      Player.findById(playerId),
      MarketplaceListing.findById(listingId),
    ]);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.status !== 'open') return res.status(400).json({ error: 'Listing is not available' });
    if (new Date(listing.endsAt).getTime() <= Date.now()) return res.status(400).json({ error: 'Listing has ended' });

    const buyNowPrice = Number(listing.buyNowPrice || 0);
    if (buyNowPrice <= 0) return res.status(400).json({ error: 'Buy now is not available for this listing' });

    // One-time unlock guard for decor items (player can only own each decor item once)
    const isDecor = DECOR_CATALOG.some((d) => d.id === listing.itemId);
    if (isDecor && Array.isArray(player.unlockedItems) && player.unlockedItems.includes(listing.itemId)) {
      return res.status(400).json({ error: 'You already own this decor item' });
    }

    const currentBid = Number(listing.currentBid || 0);
    const currentLeaderId = listing.highestBidder ? String(listing.highestBidder) : null;
    const buyerId = String(player._id);

    let charge = buyNowPrice;
    if (currentLeaderId === buyerId) charge = Math.max(0, buyNowPrice - currentBid);
    if (Number(player.byteBits || 0) < charge) return res.status(400).json({ error: 'Insufficient byte.bits' });

    if (listing.highestBidder && currentLeaderId !== buyerId) {
      await Player.findByIdAndUpdate(listing.highestBidder, { $inc: { byteBits: currentBid } });
    }

    player.byteBits = Number(player.byteBits || 0) - charge;
    listing.currentBid = buyNowPrice;
    listing.highestBidder = player._id;
    listing.soldToPlayer = player._id;
    listing.status = 'sold';

    await Promise.all([player.save(), listing.save()]);
    const deliveryQueued = await ensureMarketDelivery({ playerId: player._id, listing, acquiredBy: 'buy_now', demoMode: isDemoReq(req) });

    res.json({
      ok: true,
      listing: listingPayload(listing),
      byteBitsRemaining: player.byteBits,
      deliveryQueued,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
