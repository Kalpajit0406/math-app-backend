const mongoose = require('mongoose');

const rateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  points: { type: Number, default: 1 },
  expireAt: { type: Date, required: true }
}, { 
  timestamps: true,
  strict: true
});

// Auto-expire documents when the expireAt timestamp is reached
rateLimitSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RateLimit', rateLimitSchema);
