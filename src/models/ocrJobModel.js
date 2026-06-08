const mongoose = require('mongoose');

const OCRJobSchema = new mongoose.Schema({
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'done', 'failed'], 
    default: 'pending' 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  availableAt: { type: Date, default: Date.now },
  lockedAt: { type: Date },
  sourceType: { type: String },
  filename: { type: String },
  mimetype: { type: String },
  filePath: { type: String }, // Store file path ONLY
  rawText: { type: String },
  latex: { type: String },
  result: { type: Object },
  error: { type: String },
  attempts: { type: Number, default: 0 },
  expiresAt: { 
    type: Date, 
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expirable in 7 days
    index: true
  }
}, { timestamps: true, minimize: false });

// TTL index to automatically clean up old OCR jobs after expiresAt
OCRJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Indexes for queue operations
OCRJobSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
OCRJobSchema.index({ status: 1, updatedAt: 1 });

// Pre-save hook to compress/truncate extremely large raw text dumps to protect RAM
OCRJobSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  if (this.rawText && this.rawText.length > 50000) {
    // Truncate giant OCR dumps to protect 512MB RAM VPS
    this.rawText = this.rawText.substring(0, 50000) + '\n... [TRUNCATED FOR DATABASE STORAGE AND RAM OPTIMIZATION] ...';
  }
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('OCRJob', OCRJobSchema);
