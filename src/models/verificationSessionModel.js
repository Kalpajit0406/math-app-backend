const mongoose = require('mongoose');



const verificationSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },

  currentIndex: { type: Number, default: 0 },
  expiresAt:    { type: Date, required: true, index: { expires: 0 } }, // MongoDB TTL index

  scannedImageUrl: { type: String, default: null },
  
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'completed' },
  progress: { type: Number, default: 100 },

  // Pipeline metadata for the session
  pipelineMetadata: {
    pageType:        { type: String, default: 'UNKNOWN_PAGE' },
    sectionsFound:   { type: Number, default: 0 },
    totalExtracted:  { type: Number, default: 0 },
    totalRejected:   { type: Number, default: 0 },
    sourceUsed:      { type: String, default: 'unknown' },
    processingTimeMs:{ type: Number, default: 0 },
  },
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual populate of items from VerificationSessionItem collection
verificationSessionSchema.virtual('items', {
  ref: 'VerificationSessionItem',
  localField: 'sessionId',
  foreignField: 'sessionId',
  options: { sort: { detectionOrder: 1 } }
});

module.exports = mongoose.model('VerificationSession', verificationSessionSchema);
