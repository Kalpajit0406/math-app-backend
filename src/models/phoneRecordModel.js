const mongoose = require('mongoose');

const phoneRecordSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, trim: true },
  attemptCount: { type: Number, default: 0 },
  blacklisted: { type: Boolean, default: false },
  blacklistedAt: { type: Date },
  lastAttemptAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('PhoneRecord', phoneRecordSchema);
