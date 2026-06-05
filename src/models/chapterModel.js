const mongoose = require('mongoose');
const { normalizeChapterName } = require('../utils/chapterNormalization');

const chapterSchema = new mongoose.Schema({
  classId: {
    type: Number,
    required: true,
    index: true,
  },
  chapterName: {
    type: String,
    required: true,
    trim: true,
  },
  normalizedChapterName: {
    type: String,
    required: true,
    index: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Composite unique index to ensure no duplicate chapters exist in the same class
chapterSchema.index({ classId: 1, normalizedChapterName: 1 }, { unique: true });

// Auto-populate normalizedChapterName before validation
chapterSchema.pre('validate', function(next) {
  if (this.chapterName) {
    this.normalizedChapterName = normalizeChapterName(this.chapterName);
  }
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model('Chapter', chapterSchema);
