const mongoose = require('mongoose');

const testConfigSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: [true, "Date is required"],
    },
    time: {
      type: String,
      required: [true, "Time is required"],
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, "Class is required"],
    },
    language: {
      type: String,
      enum: ["Bengali", "English", "Both"],
      required: [true, "Preferred language is required"],
    },
    totalMarks: {
      type: Number,
      required: [true, "Total marks is required"],
      min: [1, "Total marks must be greater than 0"],
    },
    marksPQ: {
      type: Number,
      required: [true, "Marks per question is required"],
      min: [0, "Marks per question cannot be negative"],
    },
    timePQ: {
      type: Number,
      required: [true, "Time per question is required"],
      min: [1, "Time per question must be at least 1 second"],
    },
    negativeMarksPQ: {
      type: Number,
      required: [true, "Negative marks per question is required"],
      min: [0, "Negative marks cannot be negative"],
    },
    chapterIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chapter',
    }],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' }
  },
  { 
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        const { getClassNoFromId } = require('../utils/classCache');
        if (doc.classId) {
          ret.classNo = getClassNoFromId(doc.classId) || doc._tempClassNo;
        }
        delete ret.__v;
        if (ret.chapterIds) {
          ret.chapters = ret.chapterIds.map(ch => {
            if (ch && typeof ch === 'object' && ch.chapterName) {
              return ch.chapterName;
            }
            return ch.toString();
          });
        } else {
          ret.chapters = ret.chapters || [];
        }
        return ret;
      }
    },
    toObject: {
      virtuals: true
    }
  }
);

// Virtual getter/setter for chapters
testConfigSchema.virtual('chapters')
  .get(function() {
    if (this.chapterIds && this.chapterIds.length > 0) {
      return this.chapterIds.map(ch => {
        if (ch && typeof ch === 'object' && ch.chapterName) {
          return ch.chapterName;
        }
        return ch.toString();
      });
    }
    return this._tempChapters || [];
  })
  .set(function(val) {
    this._tempChapters = val;
  });

testConfigSchema.virtual('classNo')
  .get(function() {
    const { getClassNoFromId } = require('../utils/classCache');
    return getClassNoFromId(this.classId) || this._tempClassNo;
  })
  .set(function(val) {
    const { getClassIdFromNo } = require('../utils/classCache');
    this._tempClassNo = Number(val);
    const resolved = getClassIdFromNo(val);
    if (resolved) {
      this.classId = resolved;
    }
  });

// Pre-validate hook to resolve chapters array of strings to chapterIds
testConfigSchema.pre('validate', async function (next) {
  const { getClassIdFromNo } = require('../utils/classCache');
  
  const classVal = this._tempClassNo || this.classNo;
  if (classVal !== undefined && !this.classId) {
    const resolved = getClassIdFromNo(classVal);
    if (resolved) {
      this.classId = resolved;
    }
  }

  if (this._tempChapters && Array.isArray(this._tempChapters) && this._tempChapters.length > 0) {
    try {
      const { resolveChapterIds } = require('../utils/chapterNormalization');
      const resolved = await resolveChapterIds(this.classNo || 10, this._tempChapters);
      this.chapterIds = resolved;
    } catch (err) {
      if (typeof next === 'function') {
        return next(err);
      }
      throw err;
    }
  }
  if (typeof next === 'function') {
    next();
  }
});

// Pre-find hook to automatically filter out soft-deleted test configs
testConfigSchema.pre(/^find/, function() {
  this.where({ isDeleted: { $ne: true } });
});

// Auto-populate helper middlewares
testConfigSchema.pre('find', function() {
  this.populate('chapterIds');
});

testConfigSchema.pre('findOne', function() {
  this.populate('chapterIds');
});

module.exports = mongoose.model('TestConfig', testConfigSchema);
