const express = require('express');
const MarketplaceListing = require('../models/MarketplaceListing');
const Player = require('../models/Player');
const InboxMessage = require('../models/InboxMessage');
const { SHOP_ITEMS } = require('../data/shopCatalog');
const { optionalAuth } = require('../middleware/auth');
const { generateMarketplaceEmail } = require('../services/marketplaceEmailFT');

const router = express.Router();
router.use(optionalAuth);

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

async function ensureMarketDelivery({ playerId, listing, acquiredBy, isDemo = false }) {
  if (!playerId || !listing?._id) return false;
  const listingId = String(listing._id);
  const existing = await InboxMessage.findOne({
    playerId,
    kind: 'market_delivery',
    'metadata.listingId': listingId,
  }).select('_id');
  if (existing) return false;

  // Demo: 5 min delivery. Real game: 24 hours. Ratio: 240x multiplier.
  const DELIVERY_MS_REAL = 24 * 60 * 60 * 1000; // 24 hours
  const DELIVERY_MS_DEMO = 5 * 60 * 1000; // 5 minutes
  const deliveryDelayMs = isDemo ? DELIVERY_MS_DEMO : DELIVERY_MS_REAL;
  const deliveryCompletesAt = new Date(Date.now() + deliveryDelayMs);

  const confirmEmail = generateMarketplaceEmail('order_confirmed', listing.itemName);
  const prefix = acquiredBy === 'auction_win' ? '🏆 Auction Won: ' : '🛒 Purchase Complete: ';

  // Confirmation email (sent immediately)
  await InboxMessage.create({
    playerId,
    kind: 'market_delivery',
    subject: prefix + listing.itemName,
    body: confirmEmail.body,
    attachments: [{ type: 'item', itemId: listing.itemId, itemName: listing.itemName, quantity: listing.quantity }],
    metadata: { listingId, acquiredBy, status: 'order_confirmed', deliveryCompletesAt },
  });

  // Delivery completion email (created with future readyAt timestamp)
  const deliveryEmail = generateMarketplaceEmail('delivered', listing.itemName);
  const deliveryPrefix = '✅ Delivery Complete: ';
  await InboxMessage.create({
    playerId,
    kind: 'market_delivery',
    subject: deliveryPrefix + listing.itemName,
    body: deliveryEmail.body,
    attachments: [{ type: 'item', itemId: listing.itemId, itemName: listing.itemName, quantity: listing.quantity }],
    readyAt: deliveryCompletesAt,
    metadata: { listingId, acquiredBy, status: 'delivered' },
  });

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
      startBid: row.startBid,
      currentBid: 0,
      minIncrement: row.minIncrement,
      buyNowPrice: row.buyNowPrice,
      endsAt: new Date(now + (index + 2) * 60 * 60 * 1000),
    };
  });

  await MarketplaceListing.insertMany(docs);
}

async function settleExpiredOpenListings() {
  const now = new Date();
  const expired = await MarketplaceListing.find({ status: 'open', endsAt: { $lte: now } });
  if (expired.length === 0) return;

  for (const listing of expired) {
    listing.status = listing.highestBidder ? 'sold' : 'expired';
    if (listing.highestBidder) {
      listing.soldToPlayer = listing.highestBidder;
      const isDemo = req.headers['x-is-demo'] === 'true';
      await ensureMarketDelivery({ playerId: listing.highestBidder, listing, acquiredBy: 'auction_win', isDemo });
    }
    await listing.save();
  }
}

router.get('/listings', async (req, res) => {
  try {
    await ensureSeedListings();
    await settleExpiredOpenListings();

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

    const currentBid = Number(listing.currentBid || 0);
    const currentLeaderId = listing.highestBidder ? String(listing.highestBidder) : null;