const mongoose = require('mongoose');

const ocrArchiveSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  rawOcrData: { type: Object, required: true }
}, { 
  timestamps: true,
  strict: true
});

// Auto-expire archives after 30 days to match the session lifecycle
ocrArchiveSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('OcrArchive', ocrArchiveSchema);
