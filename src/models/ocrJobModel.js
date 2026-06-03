const mongoose = require('mongoose');

const OCRJobSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending','processing','done','failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  availableAt: { type: Date, default: Date.now },
  lockedAt: { type: Date },
  sourceType: { type: String },
  filename: { type: String },
  mimetype: { type: String },
  buffer: { type: Buffer },
  filePath: { type: String },
  rawText: { type: String },
  latex: { type: String },
  result: { type: Object },
  error: { type: String },
  attempts: { type: Number, default: 0 }
}, { timestamps: true, minimize: false });

OCRJobSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
OCRJobSchema.index({ status: 1, updatedAt: 1 });

module.exports = mongoose.model('OCRJob', OCRJobSchema);
