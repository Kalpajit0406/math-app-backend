const mongoose = require('mongoose');

const phoneRecordSchema = new mongoose.Schema({
  phone: { type: String, trim: true, index: { unique: true, sparse: true } },
  deviceFingerprint: { type: String, trim: true, index: { unique: true, sparse: true } },
  attemptCount: { type: Number, default: 0 },
  blacklisted: { type: Boolean, default: false },
  blacklistedAt: { type: Date },
  lastAttemptAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('PhoneRecord', phoneRecordSchema);

