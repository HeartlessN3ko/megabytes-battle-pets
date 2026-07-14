'use strict';

/**
 * marketplaceSettlement.js
 * Settles expired open listings and queues the two-stage delivery emails.
 *
 * Extracted from routes/marketplace.js: settlement used to run only inside
 * GET /listings, so auction winners whose listing expired were never paid
 * out unless *someone* happened to browse the marketplace. It now also runs
 * on a server interval (started from server.js) so wins/refunds settle on
 * time regardless of traffic.
 */

const MarketplaceListing = require('../models/MarketplaceListing');
const InboxMessage = require('../models/InboxMessage');
const { generateMarketplaceEmail } = require('./marketplaceEmailFT');

// Marketplace delivery timer (24 hours after purchase/auction win)
const DELIVERY_DELAY_MS = 24 * 60 * 60 * 1000;

// How often the background settle job runs.
const SETTLE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Dual-stage marketplace delivery:
 *   1. Immediate "order_confirmed" email (no readyAt, no attachment — notification only).
 *   2. Delayed "delivered" email with readyAt = now + 24h carrying the item.
 * Deduped per stage via `kind` + `metadata.listingId`.
 */
async function ensureMarketDelivery({ playerId, listing, acquiredBy }) {
  if (!playerId || !listing?._id) return false;
  const listingId = String(listing._id);

  const [hasConfirmation, hasDelivery] = await Promise.all([
    InboxMessage.findOne({ playerId, kind: 'market_confirmation', 'metadata.listingId': listingId }).select('_id'),
    InboxMessage.findOne({ playerId, kind: 'market_delivery',     'metadata.listingId': listingId }).select('_id'),
  ]);
  if (hasConfirmation && hasDelivery) return false;

  const subjectPrefix = acquiredBy === 'auction_win' ? 'Auction won' : 'Order';
  const now = Date.now();

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
      readyAt: new Date(now + DELIVERY_DELAY_MS),
    }));
  }

  await Promise.all(writes);
  return true;
}

async function settleExpiredOpenListings() {
  const now = new Date();
  const expired = await MarketplaceListing.find({ status: 'open', endsAt: { $lte: now } });
  if (expired.length === 0) return;

  for (const listing of expired) {
    listing.status = listing.highestBidder ? 'sold' : 'expired';
    if (listing.highestBidder) {
      listing.soldToPlayer = listing.highestBidder;
      await ensureMarketDelivery({ playerId: listing.highestBidder, listing, acquiredBy: 'auction_win' });
    }
    await listing.save();
  }
}

let timer = null;

function start() {
  if (timer) return;
  timer = setInterval(() => {
    settleExpiredOpenListings().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[marketplaceSettlement] settle failed:', err?.message || err);
    });
  }, SETTLE_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  ensureMarketDelivery,
  settleExpiredOpenListings,
  start,
  stop,
  DELIVERY_DELAY_MS,
  SETTLE_INTERVAL_MS,
};
