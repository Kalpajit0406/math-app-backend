const mongoose = require('mongoose');

const OCRJobSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending','processing','done','failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  sourceType: { type: String },
  filename: { type: String },
  mimetype: { type: String },
  buffer: { type: Buffer },
  rawText: { type: String },
  latex: { type: String },
  result: { type: Object },
  error: { type: String },
  attempts: { type: Number, default: 0 }
}, { timestamps: true, minimize: false });

OCRJobSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('OCRJob', OCRJobSchema);
