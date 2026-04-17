const mongoose = require('mongoose');

const MarketplaceListingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    itemId: { type: String, required: true, trim: true },
    itemName: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    sellerTag: { type: String, default: 'SYSTEM' },
    category: { type: String, default: 'rare' },
    status: {
      type: String,
      enum: ['open', 'sold', 'expired'],
      default: 'open',
      index: true,
    },
    startBid: { type: Number, default: 10, min: 1 },
    currentBid: { type: Number, default: 0, min: 0 },
    minIncrement: { type: Number, default: 5, min: 1 },
    buyNowPrice: { type: Number, default: 0, min: 0 },
    highestBidder: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    soldToPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    bidHistory: {
      type: [{
        bidderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
        amount: { type: Number, required: true, min: 1 },
        placedAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
    endsAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MarketplaceListing', MarketplaceListingSchema);
