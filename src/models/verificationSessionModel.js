const mongoose = require('mongoose');

const verificationItemSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [{ type: String }],
  questionNumber: { type: String },
  detectionOrder: { type: Number },
  rawOcrData: { type: Object },
  verified: { type: Boolean, default: false },
  verifiedAt: { type: Date },
  isDeleted: { type: Boolean, default: false }
});

const verificationSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  items: [verificationItemSchema],
  currentIndex: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL Index
  scannedImageUrl: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('VerificationSession', verificationSessionSchema);
