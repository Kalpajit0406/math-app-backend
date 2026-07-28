const mongoose = require('mongoose');
const { normalizeChapterName } = require('../utils/chapterNormalization');

const chapterSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.Mixed,
    ref: 'Class',
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
  },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      const { getClassNoFromId } = require('../utils/classCache');
      if (doc.classId) {
        ret.classId = getClassNoFromId(doc.classId) || doc.classId;
      }
      delete ret.__v;
      return ret;
    }
  }
});

// Composite partial unique index to ensure no duplicate active chapters exist in the same class
chapterSchema.index(
  { classId: 1, normalizedChapterName: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

// Auto-populate normalizedChapterName and normalize classId to ObjectId before validation
chapterSchema.pre('validate', function(next) {
  if (this.chapterName) {
    this.normalizedChapterName = normalizeChapterName(this.chapterName);
  }
  if (this.classId && !mongoose.Types.ObjectId.isValid(this.classId)) {
    const { getClassIdFromNo } = require('../utils/classCache');
    const objId = getClassIdFromNo(this.classId);
    if (objId) {
      this.classId = objId;
    }
  }
  if (typeof next === 'function') {
    next();
  }
});

// Pre-find hook to automatically filter out soft-deleted chapters
chapterSchema.pre(/^find/, function() {
  this.where({ isDeleted: { $ne: true } });
});

module.exports = mongoose.model('Chapter', chapterSchema);
