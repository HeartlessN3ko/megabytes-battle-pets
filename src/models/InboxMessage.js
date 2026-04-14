const mongoose = require('mongoose');

const InboxAttachmentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['item', 'currency'], required: true },
    itemId: { type: String, default: null },
    itemName: { type: String, default: null },
    quantity: { type: Number, default: 0, min: 0 },
    byteBits: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const InboxMessageSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, index: true },
    kind: {
      type: String,
      enum: ['market_delivery', 'system', 'reward'],
      default: 'system',
      index: true,
    },
    subject: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    attachments: { type: [InboxAttachmentSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
    claimed: { type: Boolean, default: false, index: true },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InboxMessage', InboxMessageSchema);
